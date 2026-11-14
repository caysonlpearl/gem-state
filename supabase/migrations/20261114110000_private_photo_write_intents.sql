-- Prepare durable write planning. Normal writers are connected in a separate
-- schema-first release; this migration activates no worker or provider request.
BEGIN;
DO $$ BEGIN
 PERFORM 1 FROM public.account_deletion_controls WHERE id AND NOT worker_enabled FOR UPDATE;
 IF NOT FOUND OR (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('public.account_deletion_r2_candidates(uuid,uuid)'))
  IS DISTINCT FROM 'c522ed786906cb16c71e63ae47270b7b'
 OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Review disabled worker and current photo inventory definition'; END IF;
END $$;

CREATE TABLE public.private_photo_write_intents (
 bucket text NOT NULL CHECK(bucket IN ('listing-media','ask-evidence')),
 path text NOT NULL CHECK(octet_length(path) BETWEEN 1 AND 1024 AND path !~ '[[:cntrl:]]'
  AND strpos(path,chr(92))=0 AND path !~ '(^|/)[.]{0,2}(/|$)'),
 variant text NOT NULL CHECK(variant IN ('original','thumbnail') AND (variant='original' OR bucket='listing-media')),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 byte_size integer NOT NULL CHECK(byte_size>0 AND byte_size<=CASE WHEN variant='thumbnail' THEN 524288 ELSE 52428800 END),
 store_fingerprint text NOT NULL CHECK(store_fingerprint ~ '^[a-f0-9]{64}$'),
 planned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(store_fingerprint,bucket,path,variant,sha256)
);
CREATE INDEX private_photo_write_intents_reference ON public.private_photo_write_intents(bucket,path);
ALTER TABLE public.private_photo_write_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_photo_write_intents FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.private_photo_write_intents TO service_role;

CREATE FUNCTION public.plan_private_photo_writes(_intents jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE item jsonb; logical_path text; prior_size integer;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' OR jsonb_typeof(_intents) IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'Photo write planning unavailable'; END IF;
 IF jsonb_array_length(_intents) NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'Photo write planning unavailable'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(_intents))<>(SELECT count(DISTINCT jsonb_build_array(value->>'bucket',value->>'variant')) FROM jsonb_array_elements(_intents))
 THEN RAISE EXCEPTION 'Photo write planning unavailable'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(_intents) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Photo write planning unavailable'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(item))<>6 OR NOT item ?& ARRAY['bucket','path','variant','sha256','bytes','storeFingerprint']
  OR jsonb_typeof(item->'bucket')<>'string' OR item->>'bucket' NOT IN ('listing-media','ask-evidence')
  OR jsonb_typeof(item->'path')<>'string' OR octet_length(item->>'path') NOT BETWEEN 1 AND 1024
  OR item->>'path' ~ '[[:cntrl:]]' OR strpos(item->>'path',chr(92))>0 OR item->>'path' ~ '(^|/)[.]{0,2}(/|$)'
  OR jsonb_typeof(item->'variant')<>'string' OR item->>'variant' NOT IN ('original','thumbnail')
  OR (item->>'variant'='thumbnail' AND item->>'bucket'<>'listing-media')
  OR jsonb_typeof(item->'sha256')<>'string' OR item->>'sha256' !~ '^[a-f0-9]{64}$'
  OR jsonb_typeof(item->'storeFingerprint')<>'string' OR item->>'storeFingerprint' !~ '^[a-f0-9]{64}$'
  OR jsonb_typeof(item->'bytes')<>'number' OR (item->>'bytes')::numeric<1
  OR trunc((item->>'bytes')::numeric)<>(item->>'bytes')::numeric
  OR (item->>'bytes')::numeric>(CASE WHEN item->>'variant'='thumbnail' THEN 524288 ELSE 52428800 END)
  THEN RAISE EXCEPTION 'Photo write planning unavailable'; END IF;
  IF logical_path IS NOT NULL AND logical_path<>item->>'path' THEN RAISE EXCEPTION 'Photo write planning unavailable'; END IF;
  logical_path:=item->>'path';
  PERFORM public.assert_member_photo_path(logical_path);
  -- Legacy/shared paths are not ownership evidence. Once a pending deletion
  -- has discovered a reference, do not register a new physical copy for it.
  IF EXISTS(SELECT 1 FROM public.account_deletion_media_observations o JOIN public.account_deletion_jobs j ON j.id=o.job_id
   WHERE j.status<>'completed' AND o.snapshot->'reference'->>'state'='resolved'
    AND o.snapshot->'reference'->>'bucket'=item->>'bucket' AND o.snapshot->'reference'->>'path'=logical_path)
  THEN RAISE EXCEPTION 'Photo write planning unavailable'; END IF;
  PERFORM 1 FROM public.account_deletion_r2_stores p WHERE p.bucket=item->>'bucket'
   AND p.store_fingerprint=item->>'storeFingerprint' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Photo write planning unavailable'; END IF;
  INSERT INTO public.private_photo_write_intents(bucket,path,variant,sha256,byte_size,store_fingerprint)
  VALUES(item->>'bucket',logical_path,item->>'variant',item->>'sha256',(item->>'bytes')::integer,item->>'storeFingerprint')
  ON CONFLICT DO NOTHING;
  SELECT byte_size INTO prior_size FROM public.private_photo_write_intents WHERE bucket=item->>'bucket' AND path=logical_path
   AND variant=item->>'variant' AND sha256=item->>'sha256' AND store_fingerprint=item->>'storeFingerprint';
  IF prior_size IS DISTINCT FROM (item->>'bytes')::integer THEN RAISE EXCEPTION 'Photo write planning unavailable'; END IF;
 END LOOP;
 RETURN true;
END $$;

CREATE FUNCTION public.account_deletion_photo_intents_pinned(_id uuid,_user uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.private_photo_write_intents i LEFT JOIN public.account_deletion_r2_stores p ON p.bucket=i.bucket
  WHERE (split_part(i.path,'/',1)=_user::text OR public.account_deletion_inventory_linked(_id,i.bucket,i.path))
  AND p.store_fingerprint IS DISTINCT FROM i.store_fingerprint)
 THEN RAISE EXCEPTION 'Photo write stores require reconciliation'; END IF;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.account_deletion_r2_candidates(_id uuid,_user uuid)
RETURNS TABLE(bucket text,path text,variant text,path_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH checked AS MATERIALIZED (SELECT public.account_deletion_photo_intents_pinned(_id,_user) permitted), intents AS (
  SELECT i.bucket,i.path FROM public.private_photo_write_intents i WHERE split_part(i.path,'/',1)=_user::text
   OR public.account_deletion_inventory_linked(_id,i.bucket,i.path)
 ), refs AS (
  SELECT o.snapshot->'reference'->>'bucket' bucket,o.snapshot->'reference'->>'path' path
   FROM public.account_deletion_media_observations o
   WHERE o.job_id=_id AND o.snapshot->'reference'->>'state'='resolved'
  UNION SELECT s.bucket,s.path FROM public.account_deletion_storage_scans s WHERE s.job_id=_id
  UNION SELECT r.bucket,r.path FROM public.photo_object_receipts r WHERE split_part(r.path,'/',1)=_user::text
   OR public.account_deletion_inventory_linked(_id,r.bucket,r.path)
  UNION SELECT i.bucket,i.path FROM intents i
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
 ) SELECT DISTINCT c.bucket,c.path,c.variant,c.path_hash FROM candidates c JOIN public.account_deletion_r2_stores p USING(bucket)
 CROSS JOIN checked WHERE checked.permitted AND c.path IS NOT NULL AND (c.variant='original' OR c.bucket='listing-media');
$$;

CREATE FUNCTION public.guard_photo_intent_deletion_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status='completed' AND OLD.user_id IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.private_photo_write_intents i WHERE split_part(i.path,'/',1)=OLD.user_id::text
   OR public.account_deletion_inventory_linked(OLD.id,i.bucket,i.path))
 THEN RAISE EXCEPTION 'Photo write evidence still needs verified cleanup'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_photo_intent_deletion_completion BEFORE UPDATE ON public.account_deletion_jobs
 FOR EACH ROW EXECUTE FUNCTION public.guard_photo_intent_deletion_completion();

REVOKE ALL ON FUNCTION public.plan_private_photo_writes(jsonb),public.guard_photo_intent_deletion_completion(),
 public.account_deletion_r2_candidates(uuid,uuid),public.account_deletion_photo_intents_pinned(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.plan_private_photo_writes(jsonb) TO service_role;
SELECT public.protect_account_access_boundaries();
DO $$ BEGIN
 IF public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Account access boundary coverage is incomplete'; END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
