-- A valid JWT is not enough after logout or deletion. All current user-bound
-- database paths must also have a live Auth identity/session and no deletion job.
create table public.account_access_protected_functions (
 function_oid oid primary key, signature text not null,
 original_definition text not null, protected_body_md5 text not null,
 protected_at timestamptz not null default now()
);
alter table public.account_access_protected_functions enable row level security;
revoke all on public.account_access_protected_functions from public,anon,authenticated;
grant all on public.account_access_protected_functions to service_role;

create table public.account_access_protected_policies (
 table_oid oid primary key, policy_md5 text not null, protected_at timestamptz not null default now()
);
alter table public.account_access_protected_policies enable row level security;
revoke all on public.account_access_protected_policies from public,anon,authenticated;
grant all on public.account_access_protected_policies to service_role;

create function public.account_session_state(_user uuid,_session uuid) returns text
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if _user is null or _session is null then return 'unavailable'; end if;
 if not exists(select 1 from auth.users where id=_user and deleted_at is null) then return 'unavailable'; end if;
 if exists(select 1 from public.mobile_account_deletions where user_id=_user)
 or exists(select 1 from public.account_deletion_jobs where user_id=_user and status<>'completed') then return 'deletion_pending'; end if;
 if exists(select 1 from auth.users where id=_user and banned_until>now())
 or not exists(select 1 from auth.sessions where id=_session and user_id=_user and (not_after is null or not_after>now())) then return 'unavailable'; end if;
 return 'active';
end $$;

create function public.account_current_session_active() returns boolean
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 return public.account_session_state(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid)='active';
exception when invalid_text_representation then return false;
end $$;

create function public.assert_current_account_access() returns void
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 -- Public catalog RPCs retain anonymous access. Privileged scheduled/server
 -- work has no member JWT and continues to use its existing authorization.
 if coalesce(current_setting('role',true),'')='authenticated'
 or coalesce(auth.jwt()->>'role','')='authenticated'
 or (coalesce(auth.jwt()->>'role','') not in ('anon','service_role') and nullif(auth.jwt()->>'sub','') is not null) then
  if not public.account_current_session_active() then
   raise exception using errcode='42501',message='Account access is unavailable';
  end if;
 end if;
end $$;

create function public.protect_account_access_boundaries() returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $protect$
declare f record; r record; definition text; body text; tag text; prefix text; body_start integer; reverse_at integer; changed integer:=0; policies integer:=0;
begin
 if (public.account_access_coverage()->>'helper_privilege_gaps')::int<>0 then raise exception 'Account boundary helper permissions require review'; end if;
 -- These helpers must not acquire their own guard or expose arbitrary identity checks.
 for f in
  select p.oid,p.proname,p.prosrc,p.prosqlbody,l.lanname
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
  where n.nspname='public' and p.prosecdef and p.prokind='f'
  and p.prorettype not in ('trigger'::regtype,'event_trigger'::regtype)
  and p.oid not in (to_regprocedure('public.account_session_state(uuid,uuid)'),to_regprocedure('public.account_current_session_active()'),
  to_regprocedure('public.assert_current_account_access()'),to_regprocedure('public.protect_account_access_boundaries()'),to_regprocedure('public.account_access_coverage()'))
  and has_function_privilege('authenticated',p.oid,'EXECUTE')
  and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
  order by p.oid
 loop
  if f.lanname not in ('sql','plpgsql') or f.prosqlbody is not null then
   raise exception 'Unsupported account boundary function: %',f.proname;
  end if;
  prefix:=case when f.lanname='sql' then E'SELECT public.assert_current_account_access(); -- bluebird-account-boundary-v1\n'
   else E'BEGIN\n PERFORM public.assert_current_account_access(); -- bluebird-account-boundary-v1\n' end;
  if left(ltrim(f.prosrc),length(prefix))<>prefix then
   if f.lanname='plpgsql' and f.prosrc ~ '(?m)^\s*#' then
    raise exception 'Unsupported account boundary directive: %',f.proname;
   end if;
   definition:=pg_get_functiondef(f.oid);
   tag:=null;
   for tag in select (regexp_matches(definition,'AS (\$[^$]+\$)','g'))[1] loop
    reverse_at:=strpos(reverse(definition),reverse(tag||f.prosrc||tag));
    if reverse_at>0 then
     body_start:=length(definition)-reverse_at-length(tag||f.prosrc||tag)+2;
     if btrim(substring(definition from body_start+length(tag||f.prosrc||tag)),E';\n\r\t ')='' then exit; end if;
    end if;
    tag:=null;
   end loop;
   if tag is null then
    raise exception 'Unsupported account boundary definition: %',f.proname;
   end if;
   body:=case when f.lanname='sql' then prefix||f.prosrc
    else prefix||rtrim(f.prosrc)||case when right(rtrim(f.prosrc),1)=';' then '' else ';' end||E'\nEND;' end;
   -- Replace only the body. Signature, defaults, volatility, permissions,
   -- return shape, search path and all other existing attributes are retained.
   execute overlay(definition placing tag||body||tag from body_start for length(tag||f.prosrc||tag));
   insert into public.account_access_protected_functions(function_oid,signature,original_definition,protected_body_md5)
   values(f.oid,f.oid::regprocedure::text,definition,md5(body))
   on conflict(function_oid) do update set signature=excluded.signature,original_definition=excluded.original_definition,
    protected_body_md5=excluded.protected_body_md5,protected_at=now();
   changed:=changed+1;
  end if;
 end loop;
 for r in
  select c.oid,n.nspname,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind in ('r','p')
  and (n.nspname='public' or (n.nspname='storage' and c.relname in ('objects','buckets')))
  and (c.relrowsecurity or has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')
   or exists(select 1 from public.account_access_protected_policies g where g.table_oid=c.oid))
  and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')
 loop
  if not r.relrowsecurity then raise exception 'Account boundary requires row security: %.%',r.nspname,r.relname; end if;
  if not exists(select 1 from pg_policy where polrelid=r.oid and polname='bluebird_account_session_boundary') then
   execute format('create policy bluebird_account_session_boundary on %I.%I as restrictive for all to authenticated using ((select public.account_current_session_active())) with check ((select public.account_current_session_active()))',r.nspname,r.relname);
   insert into public.account_access_protected_policies(table_oid,policy_md5)
   select r.oid,md5(polqual::text||polwithcheck::text||polroles::text||polcmd::text||polpermissive::text)
   from pg_policy where polrelid=r.oid and polname='bluebird_account_session_boundary'
   on conflict(table_oid) do update set policy_md5=excluded.policy_md5,protected_at=now();
   policies:=policies+1;
  elsif not exists(select 1 from pg_policy p join public.account_access_protected_policies g on g.table_oid=p.polrelid
    where p.polrelid=r.oid and p.polname='bluebird_account_session_boundary'
    and g.policy_md5=md5(p.polqual::text||p.polwithcheck::text||p.polroles::text||p.polcmd::text||p.polpermissive::text)) then
   raise exception 'Account boundary policy requires review: %.%',r.nspname,r.relname;
  end if;
 end loop;
 return jsonb_build_object('functions_added',changed,'policies_added',policies);
end $protect$;

create function public.account_access_coverage() returns jsonb
language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select jsonb_build_object(
 'unguarded_functions',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prosecdef and p.prokind='f' and p.prorettype not in ('trigger'::regtype,'event_trigger'::regtype)
 and p.oid not in (to_regprocedure('public.account_session_state(uuid,uuid)'),to_regprocedure('public.account_current_session_active()'),
  to_regprocedure('public.assert_current_account_access()'),to_regprocedure('public.protect_account_access_boundaries()'),to_regprocedure('public.account_access_coverage()'))
 and has_function_privilege('authenticated',p.oid,'EXECUTE')
 and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
 and not exists(select 1 from public.account_access_protected_functions g where g.function_oid=p.oid and g.protected_body_md5=md5(p.prosrc))),
 'unguarded_tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where c.relkind in ('r','p')
 and (n.nspname='public' or (n.nspname='storage' and c.relname in ('objects','buckets')))
 and (c.relrowsecurity or has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')
  or exists(select 1 from public.account_access_protected_policies g where g.table_oid=c.oid))
 and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')
 and (not c.relrowsecurity or not exists(select 1 from pg_policy p join public.account_access_protected_policies g on g.table_oid=p.polrelid
 where p.polrelid=c.oid and p.polname='bluebird_account_session_boundary' and not p.polpermissive
 and g.policy_md5=md5(p.polqual::text||p.polwithcheck::text||p.polroles::text||p.polcmd::text||p.polpermissive::text)))),
 'helper_privilege_gaps',(
  select count(*) from unnest(array[to_regprocedure('public.account_session_state(uuid,uuid)'),to_regprocedure('public.assert_current_account_access()'),
   to_regprocedure('public.protect_account_access_boundaries()'),to_regprocedure('public.account_access_coverage()')]) f(oid)
  where has_function_privilege('authenticated',f.oid,'EXECUTE') or has_function_privilege('anon',f.oid,'EXECUTE')
 )+case when not has_function_privilege('authenticated',to_regprocedure('public.account_current_session_active()'),'EXECUTE')
 or has_function_privilege('anon',to_regprocedure('public.account_current_session_active()'),'EXECUTE') then 1 else 0 end
 );
$$;
revoke all on function public.account_session_state(uuid,uuid),public.account_current_session_active(),
 public.assert_current_account_access(),public.protect_account_access_boundaries(),public.account_access_coverage() from public,anon,authenticated;
grant execute on function public.account_session_state(uuid,uuid),public.account_access_coverage(),public.protect_account_access_boundaries() to service_role;
grant execute on function public.account_current_session_active() to authenticated;
select public.protect_account_access_boundaries();
do $$ declare coverage jsonb; begin
 coverage:=public.account_access_coverage();
 if (coverage->>'unguarded_functions')::int<>0 or (coverage->>'unguarded_tables')::int<>0 or (coverage->>'helper_privilege_gaps')::int<>0 then
  raise exception 'Account access boundary coverage is incomplete';
 end if;
end $$;
-- A new request protects any newly introduced member RPC/table before the
-- pending account becomes visible, then revokes every refresh/session atomically.
create or replace function public.queue_account_deletion() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare coverage jsonb;
begin
 perform public.protect_account_access_boundaries();
 coverage:=public.account_access_coverage();
 if (coverage->>'unguarded_functions')::int<>0 or (coverage->>'unguarded_tables')::int<>0 or (coverage->>'helper_privilege_gaps')::int<>0 then
  raise exception 'Account access boundary coverage is incomplete';
 end if;
 insert into public.account_deletion_jobs(user_id,requested_at) values(new.user_id,new.requested_at)
 on conflict(user_id) do nothing;
 perform public.suppress_account_deletion(new.user_id);
 delete from auth.sessions where user_id=new.user_id;
 return new;
end $$;
create or replace function public.mobile_request_deletion(_user uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare coverage jsonb;
begin
 insert into public.mobile_account_deletions(user_id) values(_user) on conflict(user_id) do nothing;
 if not found then
  perform public.protect_account_access_boundaries();
  coverage:=public.account_access_coverage();
  if (coverage->>'unguarded_functions')::int<>0 or (coverage->>'unguarded_tables')::int<>0 or (coverage->>'helper_privilege_gaps')::int<>0 then
   raise exception 'Account access boundary coverage is incomplete';
  end if;
  insert into public.account_deletion_jobs(user_id,requested_at)
   select user_id,requested_at from public.mobile_account_deletions where user_id=_user
   on conflict(user_id) do nothing;
  perform public.suppress_account_deletion(_user);
  delete from auth.sessions where user_id=_user;
 end if;
end $$;
revoke all on function public.mobile_request_deletion(uuid) from public,anon,authenticated;
grant execute on function public.mobile_request_deletion(uuid) to service_role;
delete from auth.sessions s using public.mobile_account_deletions d where s.user_id=d.user_id;
-- Future relevant schema/RPC migrations must rerun protect_account_access_boundaries
-- and require zero coverage gaps before release or enabling the erasure worker.
