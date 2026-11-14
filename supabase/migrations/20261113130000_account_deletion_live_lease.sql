-- Private worker safety only; never enable account erasure in a migration.
BEGIN;

-- A fresh read is also usable inside bounded provider operations. It proves only
-- the lease and operator switch, never media ownership or writer quiescence.
CREATE FUNCTION public.account_deletion_lease_current(
 _id uuid, _user uuid, _lease uuid, _phase text
) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.account_deletion_controls WHERE id AND worker_enabled)
 AND EXISTS(SELECT 1 FROM public.account_deletion_jobs
   WHERE id=_id AND user_id=_user AND status='processing'
     AND lease_token=_lease AND phase=_phase
     AND _phase IN ('inventory','authorization','media','records','identity','verification')
     AND lease_until>clock_timestamp());
$$;

-- The shared control lock makes claims/checkpoints and an operator's disable
-- update serialize. It is held only for the short database operation, never HTTP.
create or replace function public.claim_account_deletion() returns setof public.account_deletion_jobs
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform 1 from account_deletion_controls where id and worker_enabled for share;
 if not found then return; end if;
 return query with candidate as (
  select j.id from account_deletion_jobs j where j.status<>'completed'
  and j.available_at<=now() and (j.status<>'processing' or j.lease_until<now())
  order by j.available_at,j.requested_at,j.id for update skip locked limit 1
 ) update account_deletion_jobs j set status='processing',attempts=j.attempts+1,
 lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',last_error_code=null
 from candidate where j.id=candidate.id returning j.*;
end $$;

create or replace function public.advance_account_deletion(_id uuid,_lease uuid,_phase text,_done boolean)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare job account_deletion_jobs; next_phase text;
begin
 perform 1 from account_deletion_controls where id and worker_enabled for share;
 if not found then return false; end if;
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


REVOKE ALL ON FUNCTION public.account_deletion_lease_current(uuid,uuid,uuid,text),
 public.claim_account_deletion(),public.advance_account_deletion(uuid,uuid,text,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.account_deletion_lease_current(uuid,uuid,uuid,text),
 public.claim_account_deletion(),public.advance_account_deletion(uuid,uuid,text,boolean)
 TO service_role;

SELECT public.protect_account_access_boundaries();
DO $$ BEGIN
 IF public.account_access_coverage() IS DISTINCT FROM jsonb_build_object(
   'unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Account access boundary coverage is incomplete'; END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
