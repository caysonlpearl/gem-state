-- Durable Supabase Storage discovery only; no object or account is erased.
BEGIN;
DO $$ BEGIN
 PERFORM 1 FROM public.account_deletion_controls WHERE id AND NOT worker_enabled FOR UPDATE;
 IF NOT FOUND OR to_regprocedure('public.account_storage_writer_allowed()') IS NULL
 OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Review disabled worker and Storage boundary prerequisites'; END IF;
END $$;
CREATE TABLE public.account_deletion_storage_scans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 job_id uuid NOT NULL REFERENCES public.account_deletion_inventory_runs(job_id),
 generation integer NOT NULL CHECK(generation>0),
 bucket text NOT NULL,
 path text NOT NULL CHECK(octet_length(path) BETWEEN 1 AND 1024),
 store_fingerprint text NOT NULL CHECK(store_fingerprint ~ '^[a-f0-9]{64}$'),
 page_number integer NOT NULL DEFAULT 0 CHECK(page_number>=0),
 cursor text CHECK(cursor IS NULL OR (octet_length(cursor) BETWEEN 1 AND 4096 AND cursor !~ '[[:cntrl:]]')),
 done boolean NOT NULL DEFAULT false,
 UNIQUE(job_id,generation,bucket,path)
);
CREATE TABLE public.account_deletion_storage_pages (
 scan_id uuid NOT NULL REFERENCES public.account_deletion_storage_scans(id),
 page_number integer NOT NULL CHECK(page_number>=0),
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 next_cursor_sha256 text CHECK(next_cursor_sha256 ~ '^[a-f0-9]{64}$'),
 object_count integer NOT NULL CHECK(object_count BETWEEN 0 AND 100),
 PRIMARY KEY(scan_id,page_number)
);
CREATE UNIQUE INDEX account_deletion_storage_cursor_progress
 ON public.account_deletion_storage_pages(scan_id,next_cursor_sha256) WHERE next_cursor_sha256 IS NOT NULL;
ALTER TABLE public.account_deletion_storage_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_storage_pages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_storage_scans,public.account_deletion_storage_pages FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.account_deletion_storage_scans,public.account_deletion_storage_pages TO service_role;

CREATE FUNCTION public.account_deletion_storage_generation(_id uuid,_user uuid,_lease uuid)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE job public.account_deletion_jobs; scan_generation integer;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
 PERFORM 1 FROM public.account_deletion_controls WHERE id AND worker_enabled FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
 SELECT * INTO job FROM public.account_deletion_jobs WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR job.user_id IS DISTINCT FROM _user OR job.lease_token IS DISTINCT FROM _lease
 OR job.phase<>'inventory' OR job.status<>'processing' OR job.lease_until<=clock_timestamp()
 THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
 SELECT r.generation INTO scan_generation FROM public.account_deletion_inventory_runs r WHERE r.job_id=_id;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM public.account_deletion_inventory_cursors WHERE job_id=_id AND NOT done)
 OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
 RETURN scan_generation;
END $$;

CREATE FUNCTION public.prepare_account_deletion_storage_inventory(_id uuid,_user uuid,_lease uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE scan_generation integer; prepared integer; target public.account_deletion_storage_scans; missing boolean;
BEGIN
 scan_generation:=public.account_deletion_storage_generation(_id,_user,_lease);
 INSERT INTO public.account_deletion_storage_scans(job_id,generation,bucket,path,store_fingerprint)
 SELECT _id,scan_generation,v.bucket,v.path,
 encode(sha256(convert_to('supabase-inventory-v1'||chr(10)||'https://udxxfuticbxwiehoepeg.supabase.co'||chr(10)||v.bucket,'UTF8')),'hex')
 FROM (
  SELECT o.snapshot->'reference'->>'bucket' bucket,o.snapshot->'reference'->>'path' path
  FROM public.account_deletion_media_observations o
  WHERE o.job_id=_id AND o.snapshot->'reference'->>'state'='resolved'
  UNION
  SELECT o.bucket_id,o.name FROM storage.objects o
  WHERE o.bucket_id IN ('listing-media','ask-evidence','catalog-media','request-media','order-evidence',
   'profile-avatars','seller-avatars','shopper-avatars','shopper-documents','job-application-resumes','conversation-attachments')
  AND (o.owner=_user OR o.owner_id=_user::text OR split_part(o.name,'/',1)=_user::text
   OR public.account_deletion_inventory_linked(_id,o.bucket_id,o.name)) ) v WHERE NOT EXISTS(SELECT 1 FROM public.account_deletion_storage_scans s
  WHERE s.job_id=_id AND s.generation=scan_generation AND s.bucket=v.bucket AND s.path=v.path)
 ORDER BY v.bucket COLLATE "C",v.path COLLATE "C" LIMIT 50 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS prepared=ROW_COUNT;
 SELECT * INTO target FROM public.account_deletion_storage_scans s WHERE s.job_id=_id AND s.generation=scan_generation AND NOT s.done
 ORDER BY s.bucket COLLATE "C",s.path COLLATE "C" LIMIT 1;
 SELECT EXISTS(SELECT 1 FROM (
  SELECT o.snapshot->'reference'->>'bucket' bucket,o.snapshot->'reference'->>'path' path
  FROM public.account_deletion_media_observations o
  WHERE o.job_id=_id AND o.snapshot->'reference'->>'state'='resolved'
  UNION
  SELECT o.bucket_id,o.name FROM storage.objects o
  WHERE o.bucket_id IN ('listing-media','ask-evidence','catalog-media','request-media','order-evidence',
   'profile-avatars','seller-avatars','shopper-avatars','shopper-documents','job-application-resumes','conversation-attachments')
  AND (o.owner=_user OR o.owner_id=_user::text OR split_part(o.name,'/',1)=_user::text
   OR public.account_deletion_inventory_linked(_id,o.bucket_id,o.name))
 ) v WHERE NOT EXISTS(SELECT 1 FROM public.account_deletion_storage_scans s WHERE s.job_id=_id AND s.generation=scan_generation
   AND s.bucket=v.bucket AND s.path=v.path)) INTO missing;
 IF NOT public.account_deletion_lease_current(_id,_user,_lease,'inventory') THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
 RETURN jsonb_build_object('prepared',prepared,'pass_done',target.id IS NULL AND NOT missing,
  'target',CASE WHEN target.id IS NULL THEN NULL ELSE jsonb_build_object('id',target.id,'generation',target.generation,
   'bucket',target.bucket,'path',target.path,'store_fingerprint',target.store_fingerprint,'page',target.page_number,'cursor',target.cursor) END);
END $$;

-- A provider read never holds a database lock across HTTP. Recheck its scope
-- before/after that read, then lock and validate it again in the page commit.
CREATE FUNCTION public.account_deletion_storage_task_current(_id uuid,_user uuid,_lease uuid,_task uuid,_generation integer,_page integer)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.account_deletion_lease_current(_id,_user,_lease,'inventory')
 AND public.account_access_coverage()=jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 AND EXISTS(SELECT 1 FROM public.account_deletion_storage_scans s JOIN public.account_deletion_inventory_runs r ON r.job_id=s.job_id
 WHERE s.id=_task AND s.job_id=_id AND s.generation=_generation AND r.generation=_generation AND s.page_number=_page AND NOT s.done)
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_inventory_cursors WHERE job_id=_id AND NOT done);
$$;

CREATE FUNCTION public.commit_account_deletion_storage_page(
 _id uuid,_user uuid,_lease uuid,_task uuid,_generation integer,_page integer,_cursor text,
 _objects jsonb,_next_cursor text,_done boolean
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE scan_generation integer; scan public.account_deletion_storage_scans; request_hash text; prior text; next_hash text;
 item jsonb; snapshot jsonb; object_key text; snapshot_hash text;
BEGIN
 scan_generation:=public.account_deletion_storage_generation(_id,_user,_lease);
 SELECT * INTO scan FROM public.account_deletion_storage_scans WHERE id=_task AND job_id=_id FOR UPDATE;
 IF NOT FOUND OR scan_generation IS DISTINCT FROM _generation OR scan.generation<>scan_generation
 OR _page IS NULL OR _page<0 OR _done IS NULL OR jsonb_typeof(_objects) IS DISTINCT FROM 'array'
 OR jsonb_array_length(_objects)>100 OR octet_length(_objects::text)>1048576
 OR (_cursor IS NOT NULL AND (octet_length(_cursor) NOT BETWEEN 1 AND 4096 OR _cursor ~ '[[:cntrl:]]'))
 OR (_done AND _next_cursor IS NOT NULL)
 OR (NOT _done AND (_next_cursor IS NULL OR octet_length(_next_cursor) NOT BETWEEN 1 AND 4096
  OR _next_cursor ~ '[[:cntrl:]]' OR _next_cursor IS NOT DISTINCT FROM _cursor))
 THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
 request_hash:=encode(sha256(convert_to(jsonb_build_array(_task,_generation,_page,_cursor,_objects,_next_cursor,_done)::text,'UTF8')),'hex');
 SELECT p.request_sha256 INTO prior FROM public.account_deletion_storage_pages p WHERE p.scan_id=_task AND p.page_number=_page;
 IF FOUND THEN
  IF prior<>request_hash THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
  RETURN public.account_deletion_lease_current(_id,_user,_lease,'inventory');
 END IF;
 IF scan.done OR scan.page_number<>_page OR scan.cursor IS DISTINCT FROM _cursor
 THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
 IF _next_cursor IS NOT NULL THEN
  next_hash:=encode(sha256(convert_to(_next_cursor,'UTF8')),'hex');
  IF EXISTS(SELECT 1 FROM public.account_deletion_storage_pages WHERE scan_id=_task AND next_cursor_sha256=next_hash)
  THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(_objects) LOOP
  IF jsonb_typeof(item)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(item))<>7
  OR NOT item ?& ARRAY['objectId','key','versionId','bytes','archivedAt','deleteMarker','versioned']
  OR item->>'key' IS DISTINCT FROM scan.path OR jsonb_typeof(item->'key')<>'string'
  OR jsonb_typeof(item->'objectId')<>'string' OR item->>'objectId' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR (item->'versionId'<>'null'::jsonb AND (jsonb_typeof(item->'versionId')<>'string' OR length(item->>'versionId') NOT BETWEEN 1 AND 256 OR item->>'versionId' !~ '^[A-Za-z0-9._-]+$'))
  OR jsonb_typeof(item->'bytes') NOT IN ('number','null')
  OR (item->'bytes'<>'null'::jsonb AND ((item->>'bytes')::numeric NOT BETWEEN 0 AND 9007199254740991 OR trunc((item->>'bytes')::numeric)<>(item->>'bytes')::numeric))
  OR (item->'archivedAt'<>'null'::jsonb AND (jsonb_typeof(item->'archivedAt')<>'string' OR item->>'archivedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'))
  OR jsonb_typeof(item->'deleteMarker') NOT IN ('boolean','null') OR jsonb_typeof(item->'versioned') NOT IN ('boolean','null')
  THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
  IF item->'archivedAt'<>'null'::jsonb THEN PERFORM (item->>'archivedAt')::timestamptz; END IF;
 END LOOP;
 IF (SELECT count(*) FROM jsonb_array_elements(_objects))<>(SELECT count(DISTINCT jsonb_build_array(value->>'objectId',value->'versionId')) FROM jsonb_array_elements(_objects))
 THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(_objects) LOOP
  snapshot:=jsonb_build_object('reference',jsonb_build_object('state','resolved','bucket',scan.bucket,'path',scan.path),
   'relationship','provider_version_candidate','object_id',(item->>'objectId')::uuid,'version',item->'versionId',
   'bytes',item->'bytes','archived_at',item->'archivedAt','is_delete_marker',item->'deleteMarker','is_versioned',item->'versioned');
  object_key:=encode(sha256(convert_to(jsonb_build_array(scan.bucket,scan.path,(item->>'objectId')::uuid,item->'versionId')::text,'UTF8')),'hex');
  snapshot_hash:=encode(sha256(convert_to(snapshot::text,'UTF8')),'hex');
  INSERT INTO public.account_deletion_media_observations(job_id,source,record_key,fingerprint,snapshot,first_generation,last_generation)
  VALUES(_id,'supabase_storage_provider',object_key,snapshot_hash,snapshot,scan_generation,scan_generation)
  ON CONFLICT(job_id,source,record_key,fingerprint) DO UPDATE SET last_generation=excluded.last_generation,last_seen_at=clock_timestamp();
 END LOOP;
 -- A server which ignores the version flags cannot silently report success.
 -- Missing known versions require reference/provider reconciliation, not erasure.
 IF _done AND EXISTS(SELECT 1 FROM storage.objects expected
  WHERE expected.bucket_id=scan.bucket AND expected.name=scan.path
   AND NOT EXISTS(SELECT 1 FROM public.account_deletion_media_observations observed
    WHERE observed.job_id=_id AND observed.source='supabase_storage_provider' AND observed.last_generation=scan_generation
     AND observed.snapshot->'reference'->>'bucket'=scan.bucket AND observed.snapshot->'reference'->>'path'=scan.path
     AND observed.snapshot->>'object_id'=expected.id::text
     AND observed.snapshot->>'version' IS NOT DISTINCT FROM expected.version))
 THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
 INSERT INTO public.account_deletion_storage_pages(scan_id,page_number,request_sha256,next_cursor_sha256,object_count)
 VALUES(_task,_page,request_hash,next_hash,jsonb_array_length(_objects));
 UPDATE public.account_deletion_storage_scans SET page_number=page_number+1,cursor=_next_cursor,done=_done WHERE id=_task;
 IF NOT public.account_deletion_lease_current(_id,_user,_lease,'inventory')
 OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
 RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.account_deletion_storage_generation(uuid,uuid,uuid),
 public.prepare_account_deletion_storage_inventory(uuid,uuid,uuid),
 public.account_deletion_storage_task_current(uuid,uuid,uuid,uuid,integer,integer),
 public.commit_account_deletion_storage_page(uuid,uuid,uuid,uuid,integer,integer,text,jsonb,text,boolean)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.prepare_account_deletion_storage_inventory(uuid,uuid,uuid),
 public.account_deletion_storage_task_current(uuid,uuid,uuid,uuid,integer,integer),
 public.commit_account_deletion_storage_page(uuid,uuid,uuid,uuid,integer,integer,text,jsonb,text,boolean) TO service_role;
SELECT public.protect_account_access_boundaries();
DO $$ BEGIN
 IF public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Account access boundary coverage is incomplete'; END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
