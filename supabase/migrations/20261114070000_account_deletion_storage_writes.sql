-- Serialize authenticated Storage metadata writes with account deletion requests.
-- Existing read/ownership policies remain authoritative. No object is erased.
BEGIN;
SET LOCAL lock_timeout='2s';
DO $$ BEGIN
 PERFORM 1 FROM public.account_deletion_controls WHERE id AND NOT worker_enabled FOR UPDATE;
 IF NOT FOUND OR to_regprocedure('public.lock_member_photo_deletion()') IS NULL
 THEN RAISE EXCEPTION 'Review disabled worker and member photo write prerequisite'; END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.protect_account_access_boundaries()'::regprocedure)
 IS DISTINCT FROM '90cd59798715cb4f928139929dca1a45'
 THEN RAISE EXCEPTION 'Review changed account boundary installer'; END IF;
 IF public.account_access_coverage() IS DISTINCT FROM jsonb_build_object(
  'unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='storage.objects'::regclass AND relrowsecurity)
 THEN RAISE EXCEPTION 'Review account storage access coverage'; END IF;
END $$;

CREATE FUNCTION public.account_storage_writer_allowed()
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid();
BEGIN
 IF actor IS NULL OR current_setting('transaction_isolation')<>'read committed' THEN RETURN false; END IF;
 -- The matching exclusive lock is taken by request/job insertion. A previously
 -- authorized metadata write commits before the request, or waits and rechecks.
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('bluebird-account-photo:'||actor::text,0));
 RETURN public.account_current_session_active();
END $$;
REVOKE ALL ON FUNCTION public.account_storage_writer_allowed() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.account_storage_writer_allowed() TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_account_access_boundaries() returns jsonb
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
   -- PostgreSQL's one-argument rtrim removes spaces only. Typical stored
   -- bodies end in newlines; trim all SQL whitespace before deciding whether
   -- the original inner block needs its optional terminal semicolon.
   body:=case when f.lanname='sql' then prefix||f.prosrc
    else prefix||rtrim(f.prosrc,E' \t\n\r\f')||case when right(rtrim(f.prosrc,E' \t\n\r\f'),1)=';' then '' else ';' end||E'\nEND;' end;
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
   execute format('create policy bluebird_account_session_boundary on %I.%I as restrictive for all to authenticated using ((select public.account_current_session_active())) with check ((select public.%I()))',r.nspname,r.relname,
    case when r.nspname='storage' and r.relname='objects' then 'account_storage_writer_allowed' else 'account_current_session_active' end);
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

-- Preserve the already-protected USING expression and the existing permissive
-- bucket/folder policies. INSERT/UPDATE acquire a short per-account writer lock.
ALTER POLICY bluebird_account_session_boundary ON storage.objects
 WITH CHECK ((SELECT public.account_storage_writer_allowed()));
UPDATE public.account_access_protected_policies g SET
 policy_md5=md5(p.polqual::text||p.polwithcheck::text||p.polroles::text||p.polcmd::text||p.polpermissive::text),
 protected_at=clock_timestamp()
FROM pg_policy p WHERE g.table_oid=p.polrelid AND p.polrelid='storage.objects'::regclass
 AND p.polname='bluebird_account_session_boundary';
SELECT public.protect_account_access_boundaries();
DO $$ BEGIN
 IF public.account_access_coverage() IS DISTINCT FROM jsonb_build_object(
  'unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Account storage coverage is incomplete'; END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
