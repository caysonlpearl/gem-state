-- Preparation only. No photo copies, read cutover, source deletion or permits.
BEGIN;
CREATE TABLE public.photo_migration_runs (
 id uuid PRIMARY KEY,
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 project_ref text NOT NULL CHECK(project_ref ~ '^[a-z0-9]{20}$'),
 inventory_sha256 text NOT NULL CHECK(inventory_sha256 ~ '^[a-f0-9]{64}$'),
 captured_at timestamptz NOT NULL,
 total_groups integer NOT NULL CHECK(total_groups BETWEEN 1 AND 20000),
 total_source_bytes bigint NOT NULL CHECK(total_source_bytes>0),
 source_bytes_reserved bigint NOT NULL DEFAULT 0 CHECK(source_bytes_reserved>=0),
 confirmed_download_bytes bigint NOT NULL DEFAULT 0 CHECK(confirmed_download_bytes>=0),
 completed_groups integer NOT NULL DEFAULT 0 CHECK(completed_groups>=0),
 failed_groups integer NOT NULL DEFAULT 0 CHECK(failed_groups>=0),
 running_groups integer NOT NULL DEFAULT 0 CHECK(running_groups BETWEEN 0 AND 1),
 last_failure text,
 UNIQUE(project_ref,inventory_sha256)
);
CREATE TABLE public.photo_migration_items (
 run_id uuid NOT NULL REFERENCES public.photo_migration_runs(id),
 ordinal integer NOT NULL CHECK(ordinal>=0),
 entries jsonb NOT NULL CHECK(jsonb_typeof(entries)='array' AND jsonb_array_length(entries) BETWEEN 1 AND 2),
 source_bytes bigint NOT NULL CHECK(source_bytes BETWEEN 1 AND 52428800),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','failed','complete')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 lease_token uuid,
 lease_until timestamptz,
 lease_source_reserved boolean NOT NULL DEFAULT false,
 confirmed_download_bytes bigint NOT NULL DEFAULT 0,
 last_failure text,
 PRIMARY KEY(run_id,ordinal)
);
CREATE INDEX photo_migration_items_pending ON public.photo_migration_items(run_id,status,ordinal);
CREATE INDEX photo_migration_items_running ON public.photo_migration_items(lease_until) WHERE status='running';
ALTER TABLE public.photo_migration_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_migration_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.photo_migration_runs,public.photo_migration_items FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.photo_migration_runs,public.photo_migration_items TO service_role;

CREATE FUNCTION public.require_photo_migration_admin(_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' OR NOT coalesce(public.has_role(_actor,'admin'),false)
   OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_actor AND coalesce(banned_until,'1970-01-01')<now())
 THEN RAISE EXCEPTION 'Administrator server access required'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.require_photo_migration_admin(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.require_photo_migration_admin(uuid) TO service_role;

CREATE FUNCTION public.prepare_photo_migration(_id uuid,_actor uuid,_project text,_digest text,_captured timestamptz,_groups jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE existing uuid; total_bytes bigint;
BEGIN
 PERFORM public.require_photo_migration_admin(_actor);
 IF jsonb_typeof(_groups)<>'array' OR jsonb_array_length(_groups) NOT BETWEEN 1 AND 20000
 THEN RAISE EXCEPTION 'Invalid migration review'; END IF;
 SELECT sum((value->'source'->>'bytes')::bigint) INTO total_bytes FROM jsonb_array_elements(_groups);
 INSERT INTO public.photo_migration_runs(id,created_by,project_ref,inventory_sha256,captured_at,total_groups,total_source_bytes)
 VALUES(_id,_actor,_project,_digest,_captured,jsonb_array_length(_groups),total_bytes)
 ON CONFLICT(project_ref,inventory_sha256) DO NOTHING RETURNING id INTO existing;
 IF existing IS NULL THEN
  SELECT id INTO existing FROM public.photo_migration_runs WHERE project_ref=_project AND inventory_sha256=_digest;
  RETURN existing;
 END IF;
 INSERT INTO public.photo_migration_items(run_id,ordinal,entries,source_bytes)
  SELECT existing,(position-1)::integer,value->'expectedSourceMetadata',(value->'source'->>'bytes')::bigint
  FROM jsonb_array_elements(_groups) WITH ORDINALITY AS item(value,position);
 RETURN existing;
END $$;
REVOKE ALL ON FUNCTION public.prepare_photo_migration(uuid,uuid,text,text,timestamptz,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_photo_migration(uuid,uuid,text,text,timestamptz,jsonb) TO service_role;

CREATE FUNCTION public.lease_photo_migration_item(_run uuid,_actor uuid,_lease uuid,_digest text,_max_groups integer,_max_bytes bigint,_expires timestamptz,_retry boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.photo_migration_runs; item public.photo_migration_items;
BEGIN
 PERFORM public.require_photo_migration_admin(_actor);
 PERFORM pg_advisory_xact_lock(hashtext('bluebird_photo_migration_runner'));
 SELECT * INTO r FROM public.photo_migration_runs WHERE id=_run FOR UPDATE;
 IF NOT FOUND OR _lease IS NULL OR r.inventory_sha256 IS DISTINCT FROM _digest OR coalesce(_expires,'-infinity')<=now()
   OR _max_groups IS NULL OR _max_groups NOT BETWEEN 1 AND r.total_groups OR _max_bytes IS NULL
   OR _max_bytes NOT BETWEEN 1 AND 5000000000 THEN RAISE EXCEPTION 'Migration permit is invalid or expired'; END IF;
 IF EXISTS(SELECT 1 FROM public.photo_migration_items WHERE status='running' AND lease_until>now())
 THEN RETURN jsonb_build_object('state','busy'); END IF;
 -- An interrupted attempt remains charged for any reserved source transfer.
 SELECT * INTO item FROM public.photo_migration_items WHERE run_id=_run AND status='running' LIMIT 1 FOR UPDATE;
 IF FOUND THEN
  UPDATE public.photo_migration_items SET status='failed',last_failure='interrupted' WHERE run_id=_run AND ordinal=item.ordinal;
  UPDATE public.photo_migration_runs SET running_groups=0,failed_groups=failed_groups+1,last_failure='interrupted' WHERE id=_run;
  r.failed_groups:=r.failed_groups+1;
 END IF;
 IF r.failed_groups>0 AND NOT _retry THEN RETURN jsonb_build_object('state','stopped','reason','review-failed-item'); END IF;
 SELECT * INTO item FROM public.photo_migration_items WHERE run_id=_run AND ordinal<_max_groups
  AND status=CASE WHEN r.failed_groups>0 THEN 'failed' ELSE 'pending' END ORDER BY ordinal LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','complete'); END IF;
 IF item.attempts>=3 THEN RETURN jsonb_build_object('state','stopped','reason','retry-limit'); END IF;
 UPDATE public.photo_migration_items SET status='running',attempts=attempts+1,lease_token=_lease,
  lease_until=now()+interval '120 seconds',lease_source_reserved=false,last_failure=NULL WHERE run_id=_run AND ordinal=item.ordinal RETURNING * INTO item;
 UPDATE public.photo_migration_runs SET running_groups=1,failed_groups=failed_groups-CASE WHEN r.failed_groups>0 THEN 1 ELSE 0 END WHERE id=_run;
 RETURN jsonb_build_object('state','leased','item',to_jsonb(item));
END $$;
REVOKE ALL ON FUNCTION public.lease_photo_migration_item(uuid,uuid,uuid,text,integer,bigint,timestamptz,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lease_photo_migration_item(uuid,uuid,uuid,text,integer,bigint,timestamptz,boolean) TO service_role;

CREATE FUNCTION public.reserve_photo_migration_download(_run uuid,_ordinal integer,_lease uuid,_actor uuid,_digest text,_max_bytes bigint,_expires timestamptz,_bytes bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.photo_migration_runs; item public.photo_migration_items;
BEGIN
 PERFORM public.require_photo_migration_admin(_actor);
 SELECT * INTO r FROM public.photo_migration_runs WHERE id=_run FOR UPDATE;
 SELECT * INTO item FROM public.photo_migration_items WHERE run_id=_run AND ordinal=_ordinal FOR UPDATE;
 IF r.id IS NULL OR item.run_id IS NULL OR r.inventory_sha256 IS DISTINCT FROM _digest OR coalesce(_expires,'-infinity')<=now()
  OR _max_bytes IS NULL OR _max_bytes NOT BETWEEN 1 AND 5000000000 OR item.status<>'running' OR item.lease_token IS DISTINCT FROM _lease
  OR coalesce(item.lease_until,'-infinity')<=now() OR item.lease_source_reserved OR _bytes IS DISTINCT FROM item.source_bytes
 THEN RAISE EXCEPTION 'Source download reservation rejected'; END IF;
 IF r.source_bytes_reserved+_bytes>_max_bytes THEN RAISE EXCEPTION 'Approved source download budget reached'; END IF;
 UPDATE public.photo_migration_runs SET source_bytes_reserved=source_bytes_reserved+_bytes WHERE id=_run;
 UPDATE public.photo_migration_items SET lease_source_reserved=true WHERE run_id=_run AND ordinal=_ordinal;
END $$;
REVOKE ALL ON FUNCTION public.reserve_photo_migration_download(uuid,integer,uuid,uuid,text,bigint,timestamptz,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_photo_migration_download(uuid,integer,uuid,uuid,text,bigint,timestamptz,bigint) TO service_role;

CREATE FUNCTION public.finish_photo_migration_item(_run uuid,_ordinal integer,_lease uuid,_actor uuid,_downloaded bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item public.photo_migration_items;
BEGIN
 PERFORM public.require_photo_migration_admin(_actor);
 PERFORM 1 FROM public.photo_migration_runs WHERE id=_run FOR UPDATE;
 SELECT * INTO item FROM public.photo_migration_items WHERE run_id=_run AND ordinal=_ordinal FOR UPDATE;
 IF NOT FOUND OR item.status<>'running' OR item.lease_token IS DISTINCT FROM _lease OR coalesce(item.lease_until,'-infinity')<=now()
  OR _downloaded IS DISTINCT FROM (CASE WHEN item.lease_source_reserved THEN item.source_bytes ELSE 0 END)
 THEN RAISE EXCEPTION 'Migration completion lease changed'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(item.entries) e WHERE NOT EXISTS(
  SELECT 1 FROM public.photo_object_receipts p WHERE p.bucket=e->>'bucket' AND p.path=e->>'path'
  AND p.byte_size=(e->>'bytes')::bigint AND p.content_type=e->>'contentType'
  AND trim(both '"' from p.source_etag)=trim(both '"' from e->>'etag')
  AND p.source_updated_at=(e->>'updatedAt')::timestamptz AND p.verified_at IS NOT NULL))
 THEN RAISE EXCEPTION 'Verified photo receipts are incomplete'; END IF;
 UPDATE public.photo_migration_items SET status='complete',confirmed_download_bytes=_downloaded,lease_until=NULL WHERE run_id=_run AND ordinal=_ordinal;
 UPDATE public.photo_migration_runs SET completed_groups=completed_groups+1,running_groups=0,
  confirmed_download_bytes=confirmed_download_bytes+_downloaded,last_failure=NULL WHERE id=_run;
END $$;
REVOKE ALL ON FUNCTION public.finish_photo_migration_item(uuid,integer,uuid,uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_photo_migration_item(uuid,integer,uuid,uuid,bigint) TO service_role;

CREATE FUNCTION public.fail_photo_migration_item(_run uuid,_ordinal integer,_lease uuid,_actor uuid,_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.require_photo_migration_admin(_actor);
 PERFORM 1 FROM public.photo_migration_runs WHERE id=_run FOR UPDATE;
 IF _reason IS NULL OR _reason NOT IN ('source-changed','source-budget','photo-budget','processing','copy-failed') THEN RAISE EXCEPTION 'Invalid failure code'; END IF;
 UPDATE public.photo_migration_items SET status='failed',last_failure=_reason,lease_until=NULL
  WHERE run_id=_run AND ordinal=_ordinal AND status='running' AND lease_token=_lease;
 IF FOUND THEN UPDATE public.photo_migration_runs SET running_groups=0,failed_groups=failed_groups+1,last_failure=_reason WHERE id=_run; END IF;
END $$;
REVOKE ALL ON FUNCTION public.fail_photo_migration_item(uuid,integer,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fail_photo_migration_item(uuid,integer,uuid,uuid,text) TO service_role;
COMMIT;
