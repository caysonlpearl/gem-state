-- Bounded, read-only R2 discovery. No provider/account/object is deleted.
BEGIN;
DO $$ BEGIN
 PERFORM 1 FROM public.account_deletion_controls WHERE id AND NOT worker_enabled FOR UPDATE;
 IF NOT FOUND OR to_regprocedure('public.account_deletion_storage_generation(uuid,uuid,uuid)') IS NULL
 OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Review disabled worker and inventory prerequisites'; END IF;
END $$;

-- Empty until the database owner pins the independently verified deployment
-- account/bucket fingerprints. Runtime credentials cannot select another store.
CREATE TABLE public.account_deletion_r2_stores (
 bucket text PRIMARY KEY CHECK(bucket IN ('listing-media','ask-evidence')),
 store_fingerprint text NOT NULL CHECK(store_fingerprint ~ '^[a-f0-9]{64}$')
);
CREATE TABLE public.account_deletion_r2_scans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 job_id uuid NOT NULL REFERENCES public.account_deletion_inventory_runs(job_id),
 generation integer NOT NULL CHECK(generation>0),
 bucket text NOT NULL REFERENCES public.account_deletion_r2_stores(bucket),
 path text NOT NULL CHECK(octet_length(path) BETWEEN 1 AND 1024),
 path_hash text NOT NULL CHECK(path_hash ~ '^[a-f0-9]{64}$'),
 variant text NOT NULL CHECK(variant IN ('original','thumbnail') AND (variant='original' OR bucket='listing-media')),
 store_fingerprint text NOT NULL CHECK(store_fingerprint ~ '^[a-f0-9]{64}$'),
 page_number integer NOT NULL DEFAULT 0 CHECK(page_number>=0),
 cursor text CHECK(cursor IS NULL OR (octet_length(cursor) BETWEEN 1 AND 4096 AND cursor !~ '[[:cntrl:]]')),
 last_key text NOT NULL DEFAULT '',
 done boolean NOT NULL DEFAULT false,
 UNIQUE(job_id,generation,bucket,path,variant,path_hash)
);
CREATE TABLE public.account_deletion_r2_pages (
 scan_id uuid NOT NULL REFERENCES public.account_deletion_r2_scans(id),
 page_number integer NOT NULL CHECK(page_number>=0),
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 next_cursor_sha256 text CHECK(next_cursor_sha256 ~ '^[a-f0-9]{64}$'),
 object_count integer NOT NULL CHECK(object_count BETWEEN 0 AND 100),
 PRIMARY KEY(scan_id,page_number)
);
CREATE UNIQUE INDEX account_deletion_r2_cursor_progress
 ON public.account_deletion_r2_pages(scan_id,next_cursor_sha256) WHERE next_cursor_sha256 IS NOT NULL;
CREATE TABLE public.account_deletion_r2_objects (
 scan_id uuid NOT NULL REFERENCES public.account_deletion_r2_scans(id),
 key text NOT NULL,
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 bytes bigint NOT NULL CHECK(bytes BETWEEN 0 AND 9007199254740991),
 etag text NOT NULL,
 modified_at timestamptz NOT NULL,
 PRIMARY KEY(scan_id,key)
);
ALTER TABLE public.account_deletion_r2_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_r2_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_r2_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_r2_objects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_r2_stores,public.account_deletion_r2_scans,
 public.account_deletion_r2_pages,public.account_deletion_r2_objects FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.account_deletion_r2_stores,public.account_deletion_r2_scans,
 public.account_deletion_r2_pages,public.account_deletion_r2_objects TO service_role;

-- A transferred receipt can alias an older path's physical key. Keep the
-- logical reference and the physical prefix separate; neither proves ownership.
CREATE FUNCTION public.account_deletion_r2_candidates(_id uuid,_user uuid)
RETURNS TABLE(bucket text,path text,variant text,path_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH refs AS (
  SELECT o.snapshot->'reference'->>'bucket' bucket,o.snapshot->'reference'->>'path' path
   FROM public.account_deletion_media_observations o
   WHERE o.job_id=_id AND o.snapshot->'reference'->>'state'='resolved'
  UNION SELECT s.bucket,s.path FROM public.account_deletion_storage_scans s WHERE s.job_id=_id
  UNION SELECT r.bucket,r.path FROM public.photo_object_receipts r WHERE split_part(r.path,'/',1)=_user::text
   OR public.account_deletion_inventory_linked(_id,r.bucket,r.path)
 ), candidates AS (
  SELECT r.bucket,r.path,v.variant,encode(sha256(convert_to(r.path,'UTF8')),'hex') path_hash
   FROM refs r CROSS JOIN (VALUES('original'),('thumbnail')) v(variant)
  UNION SELECT o.snapshot->'reference'->>'bucket',o.snapshot->'reference'->>'path',v.variant,
   split_part(o.snapshot->v.variant->>'key','/',3) FROM public.account_deletion_media_observations o
   CROSS JOIN (VALUES('original'),('thumbnail')) v(variant)
   WHERE o.job_id=_id AND o.snapshot->'reference'->>'state'='resolved'
    AND o.snapshot->v.variant->>'key' ~ ('^'||v.variant||'/v1/[a-f0-9]{64}/[a-f0-9]{64}$')
  UNION SELECT r.bucket,r.path,v.variant,split_part(v.key,'/',3) FROM public.photo_object_receipts r
   CROSS JOIN LATERAL (VALUES('original',r.r2_key),('thumbnail',r.thumbnail_key)) v(variant,key)
   WHERE (split_part(r.path,'/',1)=_user::text OR public.account_deletion_inventory_linked(_id,r.bucket,r.path))
    AND v.key ~ ('^'||v.variant||'/v1/[a-f0-9]{64}/[a-f0-9]{64}$')
  UNION SELECT s.bucket,s.path,s.variant,s.path_hash FROM public.account_deletion_r2_scans s WHERE s.job_id=_id
 ) SELECT DISTINCT c.bucket,c.path,c.variant,c.path_hash FROM candidates c
 JOIN public.account_deletion_r2_stores p USING(bucket)
 WHERE c.path IS NOT NULL AND (c.variant='original' OR c.bucket='listing-media');
$$;

CREATE FUNCTION public.prepare_account_deletion_r2_inventory(_id uuid,_user uuid,_lease uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE scan_generation integer; prepared integer; target public.account_deletion_r2_scans; missing boolean;
BEGIN
 scan_generation:=public.account_deletion_storage_generation(_id,_user,_lease);
 IF (SELECT count(*) FROM public.account_deletion_r2_stores)<>2 OR EXISTS(
  SELECT 1 FROM public.account_deletion_r2_scans s JOIN public.account_deletion_r2_stores p USING(bucket)
  WHERE s.job_id=_id AND s.store_fingerprint<>p.store_fingerprint)
 THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
 INSERT INTO public.account_deletion_r2_scans(job_id,generation,bucket,path,variant,path_hash,store_fingerprint)
 SELECT _id,scan_generation,v.bucket,v.path,v.variant,v.path_hash,p.store_fingerprint
 FROM public.account_deletion_r2_candidates(_id,_user) v JOIN public.account_deletion_r2_stores p USING(bucket)
 WHERE NOT EXISTS(
  SELECT 1 FROM public.account_deletion_r2_scans s WHERE s.job_id=_id AND s.generation=scan_generation
   AND s.bucket=v.bucket AND s.path=v.path AND s.variant=v.variant AND s.path_hash=v.path_hash)
 ORDER BY v.bucket COLLATE "C",v.path COLLATE "C",v.variant COLLATE "C",v.path_hash COLLATE "C" LIMIT 50 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS prepared=ROW_COUNT;
 SELECT * INTO target FROM public.account_deletion_r2_scans s WHERE s.job_id=_id AND s.generation=scan_generation AND NOT s.done
 ORDER BY s.bucket COLLATE "C",s.path COLLATE "C",s.variant COLLATE "C",s.path_hash COLLATE "C" LIMIT 1;
 SELECT EXISTS(SELECT 1 FROM public.account_deletion_r2_candidates(_id,_user) v WHERE NOT EXISTS(
  SELECT 1 FROM public.account_deletion_r2_scans s WHERE s.job_id=_id AND s.generation=scan_generation
   AND s.bucket=v.bucket AND s.path=v.path AND s.variant=v.variant AND s.path_hash=v.path_hash)) INTO missing;
 IF NOT public.account_deletion_lease_current(_id,_user,_lease,'inventory')
 THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
 RETURN jsonb_build_object('prepared',prepared,'pass_done',target.id IS NULL AND NOT missing,
  'target',CASE WHEN target.id IS NULL THEN NULL ELSE jsonb_build_object('id',target.id,'generation',target.generation,
   'bucket',target.bucket,'path',target.path,'variant',target.variant,'path_hash',target.path_hash,'store_fingerprint',target.store_fingerprint,
   'page',target.page_number,'cursor',target.cursor) END);
END $$;

CREATE FUNCTION public.account_deletion_r2_task_current(_id uuid,_user uuid,_lease uuid,_task uuid,_generation integer,_page integer)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.account_deletion_lease_current(_id,_user,_lease,'inventory')
 AND public.account_access_coverage()=jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 AND EXISTS(SELECT 1 FROM public.account_deletion_r2_scans s JOIN public.account_deletion_inventory_runs r ON r.job_id=s.job_id
  JOIN public.account_deletion_r2_stores p USING(bucket)
  WHERE s.id=_task AND s.job_id=_id AND s.generation=_generation AND r.generation=_generation
   AND p.store_fingerprint=s.store_fingerprint AND s.page_number=_page AND NOT s.done)
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_inventory_cursors WHERE job_id=_id AND NOT done);
$$;

CREATE FUNCTION public.commit_account_deletion_r2_page(
 _id uuid,_user uuid,_lease uuid,_task uuid,_generation integer,_page integer,_cursor text,
 _objects jsonb,_next_cursor text,_done boolean
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE scan_generation integer; scan public.account_deletion_r2_scans; request_hash text; prior text; next_hash text;
 item jsonb; snapshot jsonb; snapshot_hash text; object_key text; prefix text; observed_last_key text;
BEGIN
 scan_generation:=public.account_deletion_storage_generation(_id,_user,_lease);
 SELECT * INTO scan FROM public.account_deletion_r2_scans WHERE id=_task AND job_id=_id FOR UPDATE;
 IF NOT FOUND OR scan_generation IS DISTINCT FROM _generation OR scan.generation<>scan_generation
 OR NOT EXISTS(SELECT 1 FROM public.account_deletion_r2_stores p WHERE p.bucket=scan.bucket AND p.store_fingerprint=scan.store_fingerprint)
 OR _page IS NULL OR _page<0 OR _done IS NULL OR jsonb_typeof(_objects) IS DISTINCT FROM 'array'
 OR jsonb_array_length(_objects)>100 OR octet_length(_objects::text)>1048576
 OR (_cursor IS NOT NULL AND (octet_length(_cursor) NOT BETWEEN 1 AND 4096 OR _cursor ~ '[[:cntrl:]]'))
 OR (_done AND _next_cursor IS NOT NULL)
 OR (NOT _done AND (_next_cursor IS NULL OR octet_length(_next_cursor) NOT BETWEEN 1 AND 4096
  OR _next_cursor ~ '[[:cntrl:]]' OR _next_cursor IS NOT DISTINCT FROM _cursor OR jsonb_array_length(_objects)=0))
 THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
 request_hash:=encode(sha256(convert_to(jsonb_build_array(_task,_generation,_page,_cursor,_objects,_next_cursor,_done)::text,'UTF8')),'hex');
 SELECT p.request_sha256 INTO prior FROM public.account_deletion_r2_pages p WHERE p.scan_id=_task AND p.page_number=_page;
 IF FOUND THEN
  IF prior<>request_hash THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
  RETURN public.account_deletion_lease_current(_id,_user,_lease,'inventory');
 END IF;
 IF scan.done OR scan.page_number<>_page OR scan.cursor IS DISTINCT FROM _cursor
 THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
 IF _next_cursor IS NOT NULL THEN
  next_hash:=encode(sha256(convert_to(_next_cursor,'UTF8')),'hex');
  IF EXISTS(SELECT 1 FROM public.account_deletion_r2_pages WHERE scan_id=_task AND next_cursor_sha256=next_hash)
  THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
 END IF;
 prefix:=scan.variant||'/v1/'||scan.path_hash||'/';
 observed_last_key:=scan.last_key;
 FOR item IN SELECT value FROM jsonb_array_elements(_objects) LOOP
  IF jsonb_typeof(item)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(item))<>5
  OR NOT item ?& ARRAY['key','sha256','bytes','etag','modifiedAt']
  OR jsonb_typeof(item->'key')<>'string' OR jsonb_typeof(item->'sha256')<>'string'
  OR item->>'sha256' !~ '^[a-f0-9]{64}$' OR item->>'key' IS DISTINCT FROM prefix||(item->>'sha256')
  OR (item->>'key') COLLATE "C"<=observed_last_key COLLATE "C"
  OR jsonb_typeof(item->'bytes')<>'number' OR (item->>'bytes')::numeric NOT BETWEEN 0 AND 9007199254740991
  OR trunc((item->>'bytes')::numeric)<>(item->>'bytes')::numeric
  OR jsonb_typeof(item->'etag')<>'string' OR item->>'etag' !~* '^"[a-f0-9]{32}(-[1-9][0-9]{0,5})?"$'
  OR jsonb_typeof(item->'modifiedAt')<>'string' OR item->>'modifiedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
  THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
  INSERT INTO public.account_deletion_r2_objects(scan_id,key,sha256,bytes,etag,modified_at)
  VALUES(_task,item->>'key',item->>'sha256',(item->>'bytes')::bigint,item->>'etag',(item->>'modifiedAt')::timestamptz);
  observed_last_key:=item->>'key';
  snapshot:=jsonb_build_object('reference',jsonb_build_object('state','resolved','bucket',scan.bucket,'path',scan.path),
   'relationship','r2_provider_candidate','variant',scan.variant,'store_fingerprint',scan.store_fingerprint,'object',item);
  object_key:=encode(sha256(convert_to(jsonb_build_array(scan.store_fingerprint,item->>'key')::text,'UTF8')),'hex');
  snapshot_hash:=encode(sha256(convert_to(snapshot::text,'UTF8')),'hex');
  INSERT INTO public.account_deletion_media_observations(job_id,source,record_key,fingerprint,snapshot,first_generation,last_generation)
  VALUES(_id,'r2_storage_provider',object_key,snapshot_hash,snapshot,scan_generation,scan_generation)
  ON CONFLICT(job_id,source,record_key,fingerprint) DO UPDATE SET last_generation=excluded.last_generation,last_seen_at=clock_timestamp();
 END LOOP;
 -- A known verified receipt missing from this physical store needs explicit
 -- reconciliation. Pending uploads alone do not assert that an object exists.
 IF _done AND EXISTS(SELECT 1 FROM (
  SELECT o.snapshot->scan.variant->>'key' key FROM public.account_deletion_media_observations o
   WHERE o.job_id=_id AND o.source='photo_object_receipts'
    AND o.snapshot->'reference'->>'bucket'=scan.bucket AND o.snapshot->'reference'->>'path'=scan.path
  UNION SELECT CASE WHEN scan.variant='original' THEN r.r2_key ELSE r.thumbnail_key END
   FROM public.photo_object_receipts r WHERE r.bucket=scan.bucket AND r.path=scan.path
 ) expected WHERE left(expected.key,length(prefix))=prefix AND NOT EXISTS(
  SELECT 1 FROM public.account_deletion_r2_objects found WHERE found.scan_id=_task AND found.key=expected.key))
 THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
 INSERT INTO public.account_deletion_r2_pages(scan_id,page_number,request_sha256,next_cursor_sha256,object_count)
 VALUES(_task,_page,request_hash,next_hash,jsonb_array_length(_objects));
 UPDATE public.account_deletion_r2_scans SET page_number=page_number+1,cursor=_next_cursor,last_key=observed_last_key,done=_done WHERE id=_task;
 IF NOT public.account_deletion_lease_current(_id,_user,_lease,'inventory')
 OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.account_deletion_r2_candidates(uuid,uuid),public.prepare_account_deletion_r2_inventory(uuid,uuid,uuid),
 public.account_deletion_r2_task_current(uuid,uuid,uuid,uuid,integer,integer),
 public.commit_account_deletion_r2_page(uuid,uuid,uuid,uuid,integer,integer,text,jsonb,text,boolean)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.prepare_account_deletion_r2_inventory(uuid,uuid,uuid),
 public.account_deletion_r2_task_current(uuid,uuid,uuid,uuid,integer,integer),
 public.commit_account_deletion_r2_page(uuid,uuid,uuid,uuid,integer,integer,text,jsonb,text,boolean) TO service_role;
SELECT public.protect_account_access_boundaries();
DO $$ BEGIN
 IF public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Account access boundary coverage is incomplete'; END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
