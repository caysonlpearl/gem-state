-- Private discovery only. Observations are NOT permission to erase an object.
-- No worker, provider request, object deletion or account deletion is activated.
BEGIN;

CREATE TABLE public.account_deletion_inventory_runs (
 job_id uuid PRIMARY KEY REFERENCES public.account_deletion_jobs(id),
 generation integer NOT NULL DEFAULT 1 CHECK(generation>0),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.account_deletion_inventory_cursors (
 job_id uuid NOT NULL REFERENCES public.account_deletion_inventory_runs(job_id),
 source text NOT NULL,
 ordinal integer NOT NULL CHECK(ordinal>0),
 after_key text NOT NULL DEFAULT '',
 done boolean NOT NULL DEFAULT false,
 PRIMARY KEY(job_id,source), UNIQUE(job_id,ordinal)
);
CREATE TABLE public.account_deletion_media_observations (
 job_id uuid NOT NULL REFERENCES public.account_deletion_inventory_runs(job_id),
 source text NOT NULL,
 record_key text NOT NULL CHECK(length(record_key) BETWEEN 1 AND 256),
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=16384),
 first_generation integer NOT NULL CHECK(first_generation>0),
 last_generation integer NOT NULL CHECK(last_generation>=first_generation),
 first_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(job_id,source,record_key,fingerprint)
);
CREATE INDEX account_deletion_observed_objects ON public.account_deletion_media_observations
 (job_id,(snapshot->'reference'->>'bucket'),(snapshot->'reference'->>'path'))
 WHERE snapshot->'reference'->>'state'='resolved';

ALTER TABLE public.account_deletion_inventory_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_inventory_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_media_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_inventory_runs,public.account_deletion_inventory_cursors,
 public.account_deletion_media_observations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.account_deletion_inventory_runs,public.account_deletion_inventory_cursors,
 public.account_deletion_media_observations TO service_role;

-- Decode only the path component of an allowlisted URL, never a bare object key.
CREATE FUNCTION public.account_deletion_decode_path(_value text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE decoded bytea:=''::bytea; i integer:=1; c text;
BEGIN
 IF _value IS NULL OR octet_length(_value)>12288 THEN RETURN NULL; END IF;
 WHILE i<=length(_value) LOOP
  c:=substr(_value,i,1);
  IF c='%' THEN
   IF substr(_value,i+1,2) !~ '^[a-fA-F0-9]{2}$' THEN RETURN NULL; END IF;
   decoded:=decoded||decode(substr(_value,i+1,2),'hex'); i:=i+3;
  ELSE decoded:=decoded||convert_to(c,'UTF8'); i:=i+1;
  END IF;
 END LOOP;
 RETURN convert_from(decoded,'UTF8');
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;

CREATE FUNCTION public.account_deletion_media_reference(_bucket text,_value text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE path text:=_value; bucket text:=_bucket; parts text[];
BEGIN
 IF path IS NULL OR path='' OR octet_length(path)>16384
 THEN RETURN jsonb_build_object('state','unresolved'); END IF;
 IF path ~* '^https?://' OR left(path,1)='/' THEN
  -- Query strings/fragments (including signed access tokens) never enter a receipt.
  path:=regexp_replace(path,'[?#].*$','');
  parts:=regexp_match(path,
   '^https://udxxfuticbxwiehoepeg[.]supabase[.]co/storage/v1/object/(public|sign|authenticated)/([^/]+)/(.*)$');
  IF parts IS NOT NULL THEN
   IF bucket IS NOT NULL AND bucket<>parts[2] THEN RETURN jsonb_build_object('state','unresolved'); END IF;
   bucket:=parts[2]; path:=public.account_deletion_decode_path(parts[3]);
  ELSE
   parts:=regexp_match(path,'^(https://(www[.])?onbluebird[.]com)?/api/public/catalog-media/(.*)$');
   IF parts IS NOT NULL AND (bucket IS NULL OR bucket='catalog-media') THEN
    bucket:='catalog-media'; path:=public.account_deletion_decode_path(parts[3]);
   ELSIF path ~ '^https://udxxfuticbxwiehoepeg[.]supabase[.]co/' OR left(path,1)='/' THEN
    RETURN jsonb_build_object('state','unresolved');
   ELSE RETURN jsonb_build_object('state','external');
   END IF;
  END IF;
 END IF;
 IF bucket IS NULL OR bucket NOT IN ('listing-media','ask-evidence','catalog-media',
  'request-media','order-evidence','profile-avatars','seller-avatars','shopper-avatars',
  'shopper-documents','job-application-resumes','conversation-attachments')
 OR path IS NULL OR path='' OR octet_length(path)>1024 OR path ~ '[[:cntrl:]?#]'
 OR strpos(path,chr(92))>0 OR path ~ '(^|/)([.]{1,2})?(/|$)'
 OR path ~ '^[a-zA-Z][a-zA-Z0-9+.-]*:'
 THEN RETURN jsonb_build_object('state','unresolved'); END IF;
 RETURN jsonb_build_object('state','resolved','bucket',bucket,'path',path);
END $$;

CREATE FUNCTION public.account_deletion_inventory_linked(_job uuid,_bucket text,_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.account_deletion_media_observations
  WHERE job_id=_job AND snapshot->'reference'->>'state'='resolved'
   AND snapshot->'reference'->>'bucket'=_bucket AND snapshot->'reference'->>'path'=_path);
$$;

-- A completion receipt must not silently retain this private, target-bearing plan.
CREATE FUNCTION public.guard_account_deletion_inventory_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status='completed' AND EXISTS(SELECT 1 FROM public.account_deletion_inventory_runs WHERE job_id=NEW.id)
 THEN RAISE EXCEPTION 'Private deletion inventory still exists'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_account_deletion_inventory_completion BEFORE UPDATE OF status,user_id
 ON public.account_deletion_jobs FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_inventory_completion();

-- One bounded source page and its append-only observations commit together.
-- The source list covers database references, journals and Storage metadata;
-- it does not attest that provider object versions, caches or ownership are verified.
CREATE FUNCTION public.scan_account_deletion_media_inventory(_id uuid,_user uuid,_lease uuid,_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE sources text[]:=ARRAY['profiles','seller_storefronts','shopper_service_profiles','dealer_profiles','listing_media','ask_media','product_images','product_models','product_models_poster','product_suggestion_media','request_media','order_evidence','conversation_messages','job_applications','shopper_applications','sightings','dealer_inventory_media','fb_marketplace_import_items_evidence_paths','fb_marketplace_import_items_public_paths','seller_listing_requests_evidence_paths','seller_listing_requests_public_media_paths','photo_upload_tickets','photo_upload_ticket_evidence','seller_claim_transfers_old','seller_claim_transfers_new','photo_migration_items','photo_object_receipts','storage_objects'];
 job public.account_deletion_jobs; cursor_row public.account_deletion_inventory_cursors;
 generation integer; query text; row record; read_count integer:=0; added integer:=0; changed integer;
 snapshot_hash text; last_key text;
BEGIN
 IF _limit IS NULL OR _limit<1 OR _limit>100 OR current_setting('transaction_isolation')<>'read committed'
 THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
 PERFORM 1 FROM public.account_deletion_controls WHERE id AND worker_enabled FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
 SELECT * INTO job FROM public.account_deletion_jobs WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR job.user_id IS DISTINCT FROM _user OR job.lease_token IS DISTINCT FROM _lease
 OR job.status<>'processing' OR job.phase<>'inventory' OR job.lease_until<=clock_timestamp()
 THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
 IF public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
 INSERT INTO public.account_deletion_inventory_runs(job_id) VALUES(_id) ON CONFLICT DO NOTHING;
 SELECT r.generation INTO generation FROM public.account_deletion_inventory_runs r WHERE r.job_id=_id;
 INSERT INTO public.account_deletion_inventory_cursors(job_id,source,ordinal)
 SELECT _id,s.name,s.ordinal FROM unnest(sources) WITH ORDINALITY s(name,ordinal) ON CONFLICT DO NOTHING;
 SELECT * INTO cursor_row FROM public.account_deletion_inventory_cursors WHERE job_id=_id AND NOT done ORDER BY ordinal LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN
  IF NOT public.account_deletion_lease_current(_id,_user,_lease,'inventory')
  THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
  RETURN jsonb_build_object('pass_done',true,'read',0,'added',0);
 END IF;
 CASE cursor_row.source
 WHEN 'profiles' THEN query:=$source_query$SELECT r.id::text AS record_key,jsonb_build_object('reference',public.account_deletion_media_reference('profile-avatars',r.avatar_url),'relationship','profile') AS snapshot FROM public.profiles r WHERE (r.id=$1) AND r.avatar_url IS NOT NULL$source_query$;
 WHEN 'seller_storefronts' THEN query:=$source_query$SELECT r.user_id::text AS record_key,jsonb_build_object('reference',public.account_deletion_media_reference('seller-avatars',r.avatar_url),'relationship','profile') AS snapshot FROM public.seller_storefronts r WHERE (r.user_id=$1) AND r.avatar_url IS NOT NULL$source_query$;
 WHEN 'shopper_service_profiles' THEN query:=$source_query$SELECT r.id::text AS record_key,jsonb_build_object('reference',public.account_deletion_media_reference('shopper-avatars',r.avatar_url),'relationship','profile') AS snapshot FROM public.shopper_service_profiles r WHERE (r.shopper_id=$1) AND r.avatar_url IS NOT NULL$source_query$;
 WHEN 'dealer_profiles' THEN query:=$source_query$SELECT r.id::text AS record_key,jsonb_build_object('reference',public.account_deletion_media_reference('profile-avatars',r.logo_url),'relationship','business_shared') AS snapshot FROM public.dealer_profiles r WHERE (r.owner_user_id=$1 OR EXISTS(SELECT 1 FROM public.dealer_members dm WHERE dm.dealer_id=r.id AND dm.user_id=$1)) AND r.logo_url IS NOT NULL$source_query$;
 WHEN 'listing_media' THEN query:=$source_query$SELECT r.id::text AS record_key,jsonb_build_object('reference',public.account_deletion_media_reference('listing-media',r.storage_path),'relationship','listing_or_business','parent_id',r.ask_id) AS snapshot FROM public.listing_media r JOIN public.asks a ON a.id=r.ask_id WHERE (a.seller_id=$1 OR EXISTS(SELECT 1 FROM public.dealer_profiles d WHERE d.id=a.dealer_id AND (d.owner_user_id=$1 OR EXISTS(SELECT 1 FROM public.dealer_members dm WHERE dm.dealer_id=d.id AND dm.user_id=$1)))) AND r.storage_path IS NOT NULL$source_query$;
 WHEN 'ask_media' THEN query:=$source_query$SELECT r.id::text AS record_key,jsonb_build_object('reference',public.account_deletion_media_reference('ask-evidence',r.storage_path),'relationship','listing_or_business','parent_id',r.ask_id) AS snapshot FROM public.ask_media r JOIN public.asks a ON a.id=r.ask_id WHERE (a.seller_id=$1 OR EXISTS(SELECT 1 FROM public.dealer_profiles d WHERE d.id=a.dealer_id AND (d.owner_user_id=$1 OR EXISTS(SELECT 1 FROM public.dealer_members dm WHERE dm.dealer_id=d.id AND dm.user_id=$1)))) AND r.storage_path IS NOT NULL$source_query$;
 WHEN 'product_images' THEN query:=$source_query$SELECT r.id::text AS record_key,jsonb_build_object('reference',public.account_deletion_media_reference('catalog-media',r.storage_path),'relationship','authored_shared_catalog','parent_id',r.product_id) AS snapshot FROM public.product_images r JOIN public.products p ON p.id=r.product_id WHERE (p.created_by=$1) AND r.storage_path IS NOT NULL$source_query$;
 WHEN 'product_models' THEN query:=$source_query$SELECT r.id::text AS record_key,jsonb_build_object('reference',public.account_deletion_media_reference(NULL,r.storage_path),'relationship','authored_shared_catalog','parent_id',r.product_id) AS snapshot FROM public.product_models r JOIN public.products p ON p.id=r.product_id WHERE (p.created_by=$1) AND r.storage_path IS NOT NULL$source_query$;
 WHEN 'product_models_poster' THEN query:=$source_query$SELECT r.id::text AS record_key,jsonb_build_object('reference',public.account_deletion_media_reference(NULL,r.poster_path),'relationship','authored_shared_catalog','parent_id',r.product_id) AS snapshot FROM public.product_models r JOIN public.products p ON p.id=r.product_id WHERE (p.created_by=$1) AND r.poster_path IS NOT NULL$source_query$;
 WHEN 'product_suggestion_media' THEN query:=$source_query$SELECT r.id::text AS record_key,jsonb_build_object('reference',public.account_deletion_media_reference(NULL,r.storage_path),'relationship','suggestion','parent_id',r.suggestion_id) AS snapshot FROM public.product_suggestion_media r JOIN public.product_suggestions p ON p.id=r.suggestion_id WHERE (p.submitted_by=$1) AND r.storage_path IS NOT NULL$source_query$;
 WHEN 'request_media' THEN query:=$source_query$SELECT r.id::text AS record_key,jsonb_build_object('reference',public.account_deletion_media_reference('request-media',r.storage_path),'relationship','request','parent_id',r.request_id) AS snapshot FROM public.request_media r JOIN public.sourcing_requests p ON p.id=r.request_id WHERE (p.buyer_id=$1) AND r.storage_path IS NOT NULL$source_query$;
 WHEN 'order_evidence' THEN query:=$source_query$SELECT r.id::text AS record_key,jsonb_build_object('reference',public.account_deletion_media_reference('order-evidence',r.storage_path),'relationship','financial_shared','parent_id',r.order_id,'uploaded_by',r.uploaded_by) AS snapshot FROM public.order_evidence r JOIN public.orders o ON o.id=r.order_id WHERE (r.uploaded_by=$1 OR o.buyer_id=$1 OR o.seller_id=$1) AND r.storage_path IS NOT NULL$source_query$;
 WHEN 'conversation_messages' THEN query:=$source_query$SELECT r.id::text AS record_key,jsonb_build_object('reference',public.account_deletion_media_reference('conversation-attachments',r.attachment_path),'relationship','message_author','parent_id',r.conversation_id) AS snapshot FROM public.conversation_messages r WHERE (r.sender_id=$1) AND r.attachment_path IS NOT NULL$source_query$;
 WHEN 'job_applications' THEN query:=$source_query$SELECT r.id::text AS record_key,jsonb_build_object('reference',public.account_deletion_media_reference('job-application-resumes',r.resume_path),'relationship','applicant') AS snapshot FROM public.job_applications r WHERE (r.applicant_id=$1) AND r.resume_path IS NOT NULL$source_query$;
 WHEN 'shopper_applications' THEN query:=$source_query$SELECT r.id::text AS record_key,jsonb_build_object('reference',public.account_deletion_media_reference('shopper-documents',r.id_document_path),'relationship','applicant') AS snapshot FROM public.shopper_applications r WHERE (r.user_id=$1) AND r.id_document_path IS NOT NULL$source_query$;
 WHEN 'sightings' THEN query:=$source_query$SELECT r.id::text AS record_key,jsonb_build_object('reference',public.account_deletion_media_reference(NULL,r.evidence_path),'relationship','reporter_unresolved_bucket') AS snapshot FROM public.sightings r WHERE (r.reporter_id=$1) AND r.evidence_path IS NOT NULL$source_query$;
 WHEN 'dealer_inventory_media' THEN query:=$source_query$SELECT r.id::text AS record_key,jsonb_build_object('reference',public.account_deletion_media_reference(NULL,r.media_url),'relationship','business_provider_asset') AS snapshot FROM public.dealer_inventory_media r JOIN public.dealer_inventory_records ir ON ir.id=r.record_id JOIN public.dealer_inventory_sources ds ON ds.id=ir.source_id WHERE (EXISTS(SELECT 1 FROM public.dealer_profiles d WHERE d.id=ds.dealer_id AND (d.owner_user_id=$1 OR EXISTS(SELECT 1 FROM public.dealer_members dm WHERE dm.dealer_id=d.id AND dm.user_id=$1)))) AND r.media_url IS NOT NULL$source_query$;
 WHEN 'fb_marketplace_import_items_evidence_paths' THEN query:=$source_query$SELECT r.id::text||':'||lpad(v.position::text,10,'0') AS record_key,jsonb_build_object('reference',public.account_deletion_media_reference('ask-evidence',v.path),'relationship','seller_import') AS snapshot FROM public.fb_marketplace_import_items r CROSS JOIN LATERAL unnest(r.evidence_paths) WITH ORDINALITY v(path,position) WHERE (r.seller_id=$1) AND v.path IS NOT NULL$source_query$;
 WHEN 'fb_marketplace_import_items_public_paths' THEN query:=$source_query$SELECT r.id::text||':'||lpad(v.position::text,10,'0') AS record_key,jsonb_build_object('reference',public.account_deletion_media_reference('listing-media',v.path),'relationship','seller_import') AS snapshot FROM public.fb_marketplace_import_items r CROSS JOIN LATERAL unnest(r.public_paths) WITH ORDINALITY v(path,position) WHERE (r.seller_id=$1) AND v.path IS NOT NULL$source_query$;
 WHEN 'seller_listing_requests_evidence_paths' THEN query:=$source_query$SELECT r.id::text||':'||lpad(v.position::text,10,'0') AS record_key,jsonb_build_object('reference',public.account_deletion_media_reference('ask-evidence',v.path),'relationship','seller_import') AS snapshot FROM public.seller_listing_requests r CROSS JOIN LATERAL unnest(r.evidence_paths) WITH ORDINALITY v(path,position) WHERE (r.seller_id=$1) AND v.path IS NOT NULL$source_query$;
 WHEN 'seller_listing_requests_public_media_paths' THEN query:=$source_query$SELECT r.id::text||':'||lpad(v.position::text,10,'0') AS record_key,jsonb_build_object('reference',public.account_deletion_media_reference('listing-media',v.path),'relationship','seller_import') AS snapshot FROM public.seller_listing_requests r CROSS JOIN LATERAL unnest(r.public_media_paths) WITH ORDINALITY v(path,position) WHERE (r.seller_id=$1) AND v.path IS NOT NULL$source_query$;
 WHEN 'photo_upload_tickets' THEN query:=$source_query$SELECT r.id::text AS record_key,jsonb_build_object('reference',public.account_deletion_media_reference('listing-media',r.path),'relationship','unfinished_or_verified_upload','mode',CASE WHEN r.mode IN ('r2','mirror','supabase') THEN r.mode ELSE 'unresolved' END,
 'evidence',r.payload->'evidence'='true'::jsonb,
 'original',jsonb_build_object('key',CASE WHEN r.payload->>'key' ~ '^original/v1/[a-f0-9]{64}/[a-f0-9]{64}$' THEN r.payload->>'key' END,
 'sha256',CASE WHEN r.payload->>'sha256' ~ '^[a-f0-9]{64}$' THEN r.payload->>'sha256' END,
 'bytes',CASE WHEN jsonb_typeof(r.payload->'bytes')='number' THEN r.payload->'bytes' END),
 'thumbnail',jsonb_build_object('key',CASE WHEN r.payload->>'thumbnailKey' ~ '^thumbnail/v1/[a-f0-9]{64}/[a-f0-9]{64}$' THEN r.payload->>'thumbnailKey' END,
 'sha256',CASE WHEN r.payload->'thumbnail'->>'sha256' ~ '^[a-f0-9]{64}$' THEN r.payload->'thumbnail'->>'sha256' END,
 'bytes',CASE WHEN jsonb_typeof(r.payload->'thumbnail'->'bytes')='number' THEN r.payload->'thumbnail'->'bytes' END),
 'expires_at',r.expires_at,'verified_at',r.verified_at,'verification_lease_until',r.verification_lease_until) AS snapshot FROM public.photo_upload_tickets r WHERE (r.user_id=$1) AND r.path IS NOT NULL$source_query$;
 WHEN 'photo_upload_ticket_evidence' THEN query:=$source_query$SELECT r.id::text AS record_key,jsonb_build_object('reference',public.account_deletion_media_reference('ask-evidence',r.path),'relationship','unfinished_or_verified_upload','mode',CASE WHEN r.mode IN ('r2','mirror','supabase') THEN r.mode ELSE 'unresolved' END,
 'evidence',r.payload->'evidence'='true'::jsonb,
 'original',jsonb_build_object('key',CASE WHEN r.payload->>'key' ~ '^original/v1/[a-f0-9]{64}/[a-f0-9]{64}$' THEN r.payload->>'key' END,
 'sha256',CASE WHEN r.payload->>'sha256' ~ '^[a-f0-9]{64}$' THEN r.payload->>'sha256' END,
 'bytes',CASE WHEN jsonb_typeof(r.payload->'bytes')='number' THEN r.payload->'bytes' END),
 'expires_at',r.expires_at,'verified_at',r.verified_at,'verification_lease_until',r.verification_lease_until) AS snapshot FROM public.photo_upload_tickets r WHERE (r.user_id=$1 AND r.payload->'evidence'='true'::jsonb) AND r.path IS NOT NULL$source_query$;
 WHEN 'seller_claim_transfers_old' THEN query:=$source_query$SELECT r.id::text||':'||lpad(v.position::text,10,'0') AS record_key,jsonb_build_object('reference',public.account_deletion_media_reference(v.entry->>'bucket',v.entry->>'old'),'relationship','claim_transfer','side','old','status',CASE WHEN r.status IN ('preparing','complete') THEN r.status ELSE 'unresolved' END,'lease_until',r.lease_until) AS snapshot FROM public.seller_claim_transfers r CROSS JOIN LATERAL jsonb_array_elements(r.manifest) WITH ORDINALITY v(entry,position) WHERE r.claimant_id=$1 OR split_part(v.entry->>'old','/',1)=$1::text OR public.account_deletion_inventory_linked($2,v.entry->>'bucket',v.entry->>'old')$source_query$;
 WHEN 'seller_claim_transfers_new' THEN query:=$source_query$SELECT r.id::text||':'||lpad(v.position::text,10,'0') AS record_key,jsonb_build_object('reference',public.account_deletion_media_reference(v.entry->>'bucket',v.entry->>'new'),'relationship','claim_transfer','side','new','status',CASE WHEN r.status IN ('preparing','complete') THEN r.status ELSE 'unresolved' END,'lease_until',r.lease_until) AS snapshot FROM public.seller_claim_transfers r CROSS JOIN LATERAL jsonb_array_elements(r.manifest) WITH ORDINALITY v(entry,position) WHERE r.claimant_id=$1 OR split_part(v.entry->>'new','/',1)=$1::text OR public.account_deletion_inventory_linked($2,v.entry->>'bucket',v.entry->>'new')$source_query$;
 WHEN 'photo_migration_items' THEN query:=$source_query$SELECT r.run_id::text||':'||lpad(r.ordinal::text,10,'0')||':'||lpad(v.position::text,10,'0') AS record_key,
 jsonb_build_object('reference',public.account_deletion_media_reference(v.entry->>'bucket',v.entry->>'path'),
 'relationship','migration_candidate','status',CASE WHEN r.status IN ('pending','running','complete','failed') THEN r.status ELSE 'unresolved' END,
 'lease_until',r.lease_until,'bytes',CASE WHEN jsonb_typeof(v.entry->'bytes')='number' THEN v.entry->'bytes' END) AS snapshot
 FROM public.photo_migration_items r CROSS JOIN LATERAL jsonb_array_elements(r.entries) WITH ORDINALITY v(entry,position)
 WHERE split_part(v.entry->>'path','/',1)=$1::text OR public.account_deletion_inventory_linked($2,v.entry->>'bucket',v.entry->>'path')$source_query$;
 WHEN 'photo_object_receipts' THEN query:=$source_query$SELECT encode(sha256(convert_to(jsonb_build_array(r.bucket,r.path)::text,'UTF8')),'hex') AS record_key,
 jsonb_build_object('reference',public.account_deletion_media_reference(r.bucket,r.path),'relationship','private_photo_receipt',
 'original',jsonb_build_object('key',CASE WHEN r.r2_key ~ '^original/v1/[a-f0-9]{64}/[a-f0-9]{64}$' THEN r.r2_key END,
 'sha256',CASE WHEN r.sha256 ~ '^[a-f0-9]{64}$' THEN r.sha256 END,'bytes',r.byte_size),
 'thumbnail',jsonb_build_object('key',CASE WHEN r.thumbnail_key ~ '^thumbnail/v1/[a-f0-9]{64}/[a-f0-9]{64}$' THEN r.thumbnail_key END,
 'sha256',CASE WHEN r.thumbnail_sha256 ~ '^[a-f0-9]{64}$' THEN r.thumbnail_sha256 END,'bytes',r.thumbnail_bytes)) AS snapshot
 FROM public.photo_object_receipts r WHERE split_part(r.path,'/',1)=$1::text OR public.account_deletion_inventory_linked($2,r.bucket,r.path)$source_query$;
 WHEN 'storage_objects' THEN query:=$source_query$SELECT r.id::text AS record_key,
 jsonb_build_object('reference',public.account_deletion_media_reference(r.bucket_id,r.name),
 'relationship',CASE WHEN r.owner=$1 OR r.owner_id=$1::text THEN 'storage_owner' ELSE 'namespace_or_reference_candidate' END,
 'object_id',r.id,'version',r.version,'archived_at',r.archived_at,'is_delete_marker',r.is_delete_marker,
 'is_versioned',r.is_versioned,'bucket_versioning',b.versioning_status,
 'bucket_lifecycle_generation',b.lifecycle_configuration_generation,
 'bytes',CASE WHEN jsonb_typeof(r.metadata->'size')='number' THEN r.metadata->'size' END) AS snapshot
 FROM storage.objects r JOIN storage.buckets b ON b.id=r.bucket_id
 WHERE r.owner=$1 OR r.owner_id=$1::text OR split_part(r.name,'/',1)=$1::text
 OR public.account_deletion_inventory_linked($2,r.bucket_id,r.name)$source_query$;
 ELSE RAISE EXCEPTION 'Deletion inventory unavailable'; END CASE;
 last_key:=cursor_row.after_key;
 FOR row IN EXECUTE 'SELECT * FROM ('||query||') page WHERE record_key COLLATE "C">$3 COLLATE "C" ORDER BY record_key COLLATE "C" LIMIT $4'
 USING _user,_id,cursor_row.after_key,_limit LOOP
  snapshot_hash:=encode(sha256(convert_to(row.snapshot::text,'UTF8')),'hex');
  INSERT INTO public.account_deletion_media_observations(job_id,source,record_key,fingerprint,snapshot,first_generation,last_generation)
  VALUES(_id,cursor_row.source,row.record_key,snapshot_hash,row.snapshot,generation,generation)
  ON CONFLICT(job_id,source,record_key,fingerprint) DO NOTHING;
  GET DIAGNOSTICS changed=ROW_COUNT; added:=added+changed;
  IF changed=0 THEN
   UPDATE public.account_deletion_media_observations SET last_generation=generation,last_seen_at=clock_timestamp()
   WHERE job_id=_id AND source=cursor_row.source AND record_key=row.record_key
    AND account_deletion_media_observations.fingerprint=snapshot_hash;
  END IF;
  read_count:=read_count+1; last_key:=row.record_key;
 END LOOP;
 UPDATE public.account_deletion_inventory_cursors SET after_key=last_key,done=(read_count<_limit)
 WHERE job_id=_id AND source=cursor_row.source;
 IF NOT public.account_deletion_lease_current(_id,_user,_lease,'inventory')
 OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
 RETURN jsonb_build_object('source',cursor_row.source,'source_done',read_count<_limit,'read',read_count,'added',added,
 'pass_done',NOT EXISTS(SELECT 1 FROM public.account_deletion_inventory_cursors WHERE job_id=_id AND NOT done));
END $$;

-- A rescan retains every older snapshot, including physical keys whose current
-- receipt was replaced or whose source reference has since been removed.
CREATE FUNCTION public.restart_account_deletion_media_inventory(_id uuid,_user uuid,_lease uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE job public.account_deletion_jobs;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RETURN false; END IF;
 PERFORM 1 FROM public.account_deletion_controls WHERE id AND worker_enabled FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO job FROM public.account_deletion_jobs WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR job.user_id IS DISTINCT FROM _user OR job.lease_token IS DISTINCT FROM _lease
 OR job.phase<>'inventory' OR job.status<>'processing' OR job.lease_until<=clock_timestamp()
 THEN RETURN false; END IF;
 IF public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
 UPDATE public.account_deletion_inventory_runs SET generation=generation+1,started_at=clock_timestamp() WHERE job_id=_id;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE public.account_deletion_inventory_cursors SET after_key='',done=false WHERE job_id=_id;
 IF NOT public.account_deletion_lease_current(_id,_user,_lease,'inventory')
 THEN RAISE EXCEPTION 'Deletion inventory unavailable'; END IF;
 RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.account_deletion_decode_path(text),public.account_deletion_media_reference(text,text),
 public.account_deletion_inventory_linked(uuid,text,text),public.guard_account_deletion_inventory_completion(),
 public.scan_account_deletion_media_inventory(uuid,uuid,uuid,integer),
 public.restart_account_deletion_media_inventory(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.scan_account_deletion_media_inventory(uuid,uuid,uuid,integer),
 public.restart_account_deletion_media_inventory(uuid,uuid,uuid) TO service_role;
SELECT public.protect_account_access_boundaries();
DO $$ BEGIN
 IF public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Account access boundary coverage is incomplete'; END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
