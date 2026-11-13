-- Private, resumable deletion work. No worker is enabled by this migration.
-- The original request table remains the backwards-compatible account interface.
create table public.account_deletion_controls (
 id boolean primary key default true check(id),
 worker_enabled boolean not null default false
);
insert into public.account_deletion_controls(id) values(true);
create table public.account_deletion_jobs (
 id uuid primary key default gen_random_uuid(),
 -- Keep the target until verification, including across an Auth deletion/crash.
 -- Completion removes it; no FK cascade may erase an unfinished job or receipt.
 user_id uuid unique,
 status text not null default 'requested' check(status in ('requested','processing','retry','completed')),
 phase text not null default 'inventory' check(phase in ('inventory','authorization','media','records','identity','verification','completed')),
 requested_at timestamptz not null default now(),
 available_at timestamptz not null default now(),
 attempts integer not null default 0 check(attempts>=0),
 failures integer not null default 0 check(failures>=0),
 lease_token uuid, lease_until timestamptz,
 last_error_code text check(last_error_code in ('inventory_unavailable','authorization_unavailable','media_unavailable','records_unavailable','identity_unavailable','verification_failed','worker_failed')),
 completed_at timestamptz,
 check((status='processing' and lease_token is not null and lease_until is not null)
    or (status<>'processing' and lease_token is null and lease_until is null)),
 check((status='completed' and phase='completed' and user_id is null and completed_at is not null and lease_token is null and lease_until is null)
    or (status<>'completed' and phase<>'completed' and user_id is not null and completed_at is null))
);
create index account_deletion_jobs_due on public.account_deletion_jobs(available_at) where status<>'completed';
alter table public.account_deletion_controls enable row level security;
alter table public.account_deletion_jobs enable row level security;
revoke all on public.account_deletion_controls,public.account_deletion_jobs from public,anon,authenticated;
grant all on public.account_deletion_controls,public.account_deletion_jobs to service_role;

create function public.suppress_account_deletion(_user uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 -- An account deletion withdraws optional collection/export across web AND apps.
 insert into shopping_privacy(subject,personalization,advertising,history_after,updated_at)
 values('u:'||_user,false,false,now(),now())
 on conflict(subject) do update set personalization=false,advertising=false,history_after=now(),updated_at=now();
 update shopping_accounts set shopping_alerts=false,delivery_blocked=true,suppressed_at=now(),updated_at=now() where user_id=_user;
 update shopping_queue set status='suppressed',lease_until=null where user_id=_user and status in ('pending','processing');
 update shopping_deliveries set status='suppressed',lease_until=null where user_id=_user and status in ('pending','processing');
 update shopping_ad_outbox set status='suppressed' where (user_id=_user or subject='u:'||_user) and status='pending';
 update mobile_ad_consents set advertising=false,updated_at=now() where user_id=_user;
 delete from mobile_push_devices where user_id=_user;
 insert into shopping_consents(user_id,subject,purpose,allowed,version,source)
 select _user,'u:'||_user,purpose,false,'2026-11-12','account_deletion'
 from unnest(array['shopping_alerts','personalization','advertising']) as purpose;
end $$;

create function public.queue_account_deletion() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into account_deletion_jobs(user_id,requested_at) values(new.user_id,new.requested_at)
 on conflict(user_id) do nothing;
 perform suppress_account_deletion(new.user_id);
 return new;
end $$;
create trigger queue_account_deletion after insert on public.mobile_account_deletions
for each row execute function public.queue_account_deletion();
-- Existing unprocessed requests must not disappear when deployment precedes a worker.
insert into public.account_deletion_jobs(user_id,requested_at)
select user_id,requested_at from public.mobile_account_deletions
on conflict(user_id) do nothing;
do $$ declare target record; begin
 for target in select user_id from public.mobile_account_deletions loop
  perform public.suppress_account_deletion(target.user_id);
 end loop;
end $$;

create function public.claim_account_deletion() returns setof public.account_deletion_jobs
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from account_deletion_controls where id and worker_enabled) then return; end if;
 return query with candidate as (
  select j.id from account_deletion_jobs j where j.status<>'completed'
  and j.available_at<=now() and (j.status<>'processing' or j.lease_until<now())
  order by j.available_at,j.requested_at,j.id for update skip locked limit 1
 ) update account_deletion_jobs j set status='processing',attempts=j.attempts+1,
 lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',last_error_code=null
 from candidate where j.id=candidate.id returning j.*;
end $$;

create function public.advance_account_deletion(_id uuid,_lease uuid,_phase text,_done boolean)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare job account_deletion_jobs; next_phase text;
begin
 select * into job from account_deletion_jobs where id=_id for update;
 if not found or job.status<>'processing' or job.lease_token is distinct from _lease
 or job.lease_until<=clock_timestamp() or job.phase is distinct from _phase then return false; end if;
 next_phase:=case _phase when 'inventory' then 'authorization' when 'authorization' then 'media'
 when 'media' then 'records' when 'records' then 'identity' when 'identity' then 'verification'
 when 'verification' then 'completed' else null end;
 if next_phase is null then raise exception 'Invalid deletion phase'; end if;
 if _done is null then raise exception 'Invalid deletion checkpoint'; end if;
 if not _done then next_phase:=_phase; end if;
 if next_phase='completed' then
  if exists(select 1 from auth.users where id=job.user_id) then raise exception 'Account identity still exists'; end if;
  update account_deletion_jobs set user_id=null,status='completed',phase='completed',completed_at=now(),
   lease_token=null,lease_until=null,last_error_code=null,failures=0 where id=job.id;
 else
  update account_deletion_jobs set status='requested',phase=next_phase,available_at=now(),
   lease_token=null,lease_until=null,last_error_code=null,failures=0 where id=job.id;
 end if;
 return true;
end $$;

create function public.retry_account_deletion(_id uuid,_lease uuid,_phase text,_code text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare job account_deletion_jobs;
begin
 if _code is null or _code not in ('inventory_unavailable','authorization_unavailable','media_unavailable','records_unavailable','identity_unavailable','verification_failed','worker_failed') then
  raise exception 'Invalid deletion failure code';
 end if;
 select * into job from account_deletion_jobs where id=_id for update;
 if not found or job.status<>'processing' or job.lease_token is distinct from _lease
 or job.lease_until<=clock_timestamp() or job.phase is distinct from _phase then return false; end if;
 update account_deletion_jobs set status='retry',last_error_code=_code,failures=job.failures+1,
 available_at=now()+make_interval(secs=>least(21600,60*power(2,least(job.failures,9)))::int),
 lease_token=null,lease_until=null where id=job.id;
 return true;
end $$;
revoke all on function public.suppress_account_deletion(uuid),public.queue_account_deletion(),public.claim_account_deletion(),
 public.advance_account_deletion(uuid,uuid,text,boolean),public.retry_account_deletion(uuid,uuid,text,text)
 from public,anon,authenticated;
grant execute on function public.claim_account_deletion(),public.advance_account_deletion(uuid,uuid,text,boolean),
 public.retry_account_deletion(uuid,uuid,text,text) to service_role;
