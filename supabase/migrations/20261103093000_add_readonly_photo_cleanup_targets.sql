-- Bounded read-only current source/reference/receipt evidence for the approved
-- cleanup workflow. No storage removal, table mutation, or public access.
BEGIN;
CREATE OR REPLACE FUNCTION public.photo_source_cleanup_targets(_targets jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE result jsonb;
BEGIN
 IF jsonb_typeof(_targets) IS DISTINCT FROM 'array' OR jsonb_array_length(_targets) NOT BETWEEN 1 AND 8 THEN
  RAISE EXCEPTION 'Invalid cleanup target scope';
 END IF;
 IF EXISTS (SELECT 1 FROM jsonb_to_recordset(_targets) AS t(bucket text,path text)
   WHERE bucket IS NULL OR bucket NOT IN ('listing-media','ask-evidence') OR path IS NULL OR
     octet_length(path) NOT BETWEEN 1 AND 1024 OR path ~ '[[:cntrl:]]' OR
     path LIKE '/%' OR path LIKE '%/' OR path LIKE '%//%' OR
     path ~ '(^|/)\.\.?(/|$)' OR position(E'\\' in path)>0) OR
   (SELECT count(*) FROM jsonb_to_recordset(_targets) AS t(bucket text,path text)) <>
   (SELECT count(DISTINCT (bucket,path)) FROM jsonb_to_recordset(_targets) AS t(bucket text,path text)) THEN
  RAISE EXCEPTION 'Invalid cleanup target scope';
 END IF;
WITH requested AS MATERIALIZED (
 SELECT t.bucket,t.path FROM jsonb_to_recordset(_targets) AS t(bucket text,path text)
), scope AS (
 SELECT 'udxxfuticbxwiehoepeg'::text project_ref,
 ARRAY['dd2be1fa-2c6d-4fad-b861-f25b3907b1f5',
       '20a1e9c0-5bef-43c7-a172-64bf8c62cddc']::uuid[] run_ids
), sources AS MATERIALIZED (
 SELECT bucket_id bucket, name path,
 jsonb_build_object('bucket',bucket_id,'path',name,
   'bytes',(metadata->>'size')::bigint,
   'etag',coalesce(metadata->>'eTag',metadata->>'etag'),
   'contentType',metadata->>'mimetype','updatedAt',updated_at) source
 FROM storage.objects s JOIN requested t ON t.bucket=s.bucket_id AND t.path=s.name
), approved AS MATERIALIZED (
 SELECT e->>'bucket' bucket,e->>'path' path,
 jsonb_agg(jsonb_build_object('runId',i.run_id,'ordinal',i.ordinal,
   'status',i.status,'metadata',e) ORDER BY i.run_id,i.ordinal) approvals
 FROM public.photo_migration_items i CROSS JOIN scope
 CROSS JOIN LATERAL jsonb_array_elements(i.entries) e
 JOIN requested t ON t.bucket=e->>'bucket' AND t.path=e->>'path'
 WHERE i.run_id=ANY(scope.run_ids) GROUP BY e->>'bucket',e->>'path'
), reference_rows AS (
 SELECT 'ask-evidence'::text bucket,storage_path path,'ask_media'::text kind FROM public.ask_media
 UNION ALL SELECT 'listing-media',storage_path,'listing_media' FROM public.listing_media
 UNION ALL SELECT 'ask-evidence',unnest(evidence_paths),'import_evidence' FROM public.fb_marketplace_import_items
 UNION ALL SELECT 'listing-media',unnest(public_paths),'import_public' FROM public.fb_marketplace_import_items
), reference_counts AS (
 SELECT bucket,path,kind,count(*) n FROM reference_rows GROUP BY bucket,path,kind
), refs AS MATERIALIZED (
 SELECT bucket,path,jsonb_agg(jsonb_build_object('kind',kind,'count',n) ORDER BY kind) refs
 FROM reference_counts JOIN requested USING(bucket,path) GROUP BY bucket,path
), pending_rows AS (
 -- Expired but unfinished journals/tickets remain conservative exclusions.
 SELECT m->>'bucket' bucket,m->>'old' path,'claim-incomplete'::text reason
 FROM public.seller_claim_transfers j CROSS JOIN LATERAL jsonb_array_elements(j.manifest) m
 WHERE j.status<>'complete'
 UNION ALL
 SELECT m->>'bucket',m->>'new','claim-incomplete'
 FROM public.seller_claim_transfers j CROSS JOIN LATERAL jsonb_array_elements(j.manifest) m
 WHERE j.status<>'complete'
 UNION ALL SELECT 'listing-media',path,'upload-incomplete'
 FROM public.photo_upload_tickets WHERE verified_at IS NULL
 UNION ALL SELECT 'ask-evidence',path,'upload-incomplete'
 FROM public.photo_upload_tickets WHERE verified_at IS NULL AND payload->>'evidence'='true'
 UNION ALL SELECT e->>'bucket',e->>'path','migration-incomplete'
 FROM public.photo_migration_items i CROSS JOIN LATERAL jsonb_array_elements(i.entries) e
 WHERE i.status<>'complete'
), pending AS MATERIALIZED (
 SELECT bucket,path,jsonb_agg(DISTINCT reason ORDER BY reason) reasons
 FROM pending_rows JOIN requested USING(bucket,path) GROUP BY bucket,path
), objects AS (
 SELECT t.bucket,t.path,s.source IS NOT NULL has_source,jsonb_build_object('target',jsonb_build_object('bucket',t.bucket,'path',t.path),'source',s.source,
   'approvals',coalesce(a.approvals,'[]'::jsonb),
   'receipt',CASE WHEN r.path IS NULL THEN NULL ELSE jsonb_build_object(
      'bucket',r.bucket,'path',r.path,'key',r.r2_key,'sha256',r.sha256,
      'bytes',r.byte_size,'contentType',r.content_type,
      'sourceEtag',r.source_etag,'sourceUpdatedAt',r.source_updated_at,'verifiedAt',r.verified_at,
      'thumbnail',CASE WHEN r.thumbnail_key IS NULL THEN NULL ELSE jsonb_build_object(
        'key',r.thumbnail_key,'sha256',r.thumbnail_sha256,'bytes',r.thumbnail_bytes,
        'contentType',r.thumbnail_content_type) END) END,
   'references',coalesce(refs.refs,'[]'::jsonb),
   'pendingOperations',coalesce(p.reasons,'[]'::jsonb)) object
 FROM requested t LEFT JOIN sources s USING(bucket,path) LEFT JOIN approved a USING(bucket,path)
 LEFT JOIN public.photo_object_receipts r USING(bucket,path)
 LEFT JOIN refs USING(bucket,path) LEFT JOIN pending p USING(bucket,path)
)
SELECT jsonb_build_object('schemaVersion',1,'kind','photo-source-cleanup-snapshot',
 'projectRef',scope.project_ref,'capturedAt',current_timestamp,'scopeRunIds',scope.run_ids,
 'referenceRelations',jsonb_build_array('ask_media','listing_media','import_evidence','import_public',
   'claim_transfers','upload_tickets','migration_items'),
 'runs',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'totalGroups',r.total_groups,
   'completedGroups',r.completed_groups,'runningGroups',r.running_groups,'failedGroups',r.failed_groups)
   ORDER BY r.id),'[]'::jsonb) FROM public.photo_migration_runs r WHERE r.id=ANY(scope.run_ids)),
 'objects',(SELECT coalesce(jsonb_agg(object ORDER BY bucket,path),'[]'::jsonb) FROM objects WHERE has_source),
 'retainedRecords',(SELECT coalesce(jsonb_agg(object ORDER BY bucket,path),'[]'::jsonb) FROM objects)
) INTO result FROM scope;

 RETURN result;
END;
$function$;
REVOKE ALL ON FUNCTION public.photo_source_cleanup_targets(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.photo_source_cleanup_targets(jsonb) TO service_role;

COMMIT;
