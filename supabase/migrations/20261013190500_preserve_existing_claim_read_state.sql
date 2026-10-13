CREATE OR REPLACE FUNCTION public.finish_seller_claim(_transfer uuid,_claimant uuid,_accept_terms boolean,_sync boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.seller_claim_transfers; t public.seller_claim_tokens; s public.managed_import_sellers; m jsonb; ids uuid[]; slug text; BEGIN
 IF coalesce(auth.role(),'')<>'service_role' OR NOT _accept_terms THEN RAISE EXCEPTION 'Accept the seller agreement'; END IF;
 SELECT * INTO j FROM public.seller_claim_transfers WHERE id=_transfer;
 SELECT * INTO t FROM public.seller_claim_tokens WHERE id=j.claim_token_id;
 SELECT * INTO s FROM public.managed_import_sellers WHERE id=t.managed_seller_id FOR UPDATE;
 SELECT * INTO t FROM public.seller_claim_tokens WHERE id=t.id FOR UPDATE;
 SELECT * INTO j FROM public.seller_claim_transfers WHERE id=_transfer FOR UPDATE;
 IF j.claimant_id<>_claimant OR j.id IS NULL THEN RAISE EXCEPTION 'Claim not found'; END IF;
 IF j.status='complete' AND s.owner_user_id=_claimant THEN RETURN; END IF;
 IF j.lease_until<=now() OR t.revoked_at IS NOT NULL OR t.consumed_at IS NOT NULL OR t.expires_at<=now() OR s.claimed_at IS NOT NULL THEN RAISE EXCEPTION 'Claim expired or already used; retry with an available link'; END IF;
 IF EXISTS(SELECT 1 FROM public.seller_profiles WHERE user_id=_claimant AND status<>'active') THEN RAISE EXCEPTION 'Seller account is restricted'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_claimant AND email_confirmed_at IS NOT NULL AND coalesce(banned_until,'1970-01-01')<now()) THEN RAISE EXCEPTION 'Verify your email first'; END IF;
 IF s.required_claimant_id IS NOT NULL AND s.required_claimant_id<>_claimant THEN RAISE EXCEPTION 'Wrong account'; END IF;
 SELECT array_agg(listing_id) INTO ids FROM public.fb_marketplace_import_items WHERE source_profile_url=s.source_profile_url AND listing_id IS NOT NULL;
 PERFORM 1 FROM public.asks WHERE id=ANY(coalesce(ids,'{}')) FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.asks WHERE id=ANY(coalesce(ids,'{}')) AND seller_id<>s.owner_user_id) THEN RAISE EXCEPTION 'Listing ownership changed; contact Bluebird'; END IF;
 -- Reject images added while storage was copying; a retry rebuilds the manifest.
 IF EXISTS(SELECT 1 FROM public.ask_media a WHERE ask_id=ANY(coalesce(ids,'{}')) AND split_part(storage_path,'/',1)<>_claimant::text AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j.manifest) x WHERE x->>'old'=a.storage_path AND x->>'bucket'='ask-evidence')) OR EXISTS(SELECT 1 FROM public.listing_media a WHERE ask_id=ANY(coalesce(ids,'{}')) AND split_part(storage_path,'/',1)<>_claimant::text AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j.manifest) x WHERE x->>'old'=a.storage_path AND x->>'bucket'='listing-media')) THEN RAISE EXCEPTION 'Listing photos changed. Retry claiming'; END IF;
 FOR m IN SELECT value FROM jsonb_array_elements(j.manifest) LOOP
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id=m->>'bucket' AND name=m->>'new') THEN RAISE EXCEPTION 'Photo transfer incomplete; retry claiming'; END IF;
 END LOOP;
 PERFORM set_config('parkvault.trusted_operation','on',true);
 FOR m IN SELECT value FROM jsonb_array_elements(j.manifest) LOOP
 IF m->>'bucket'='ask-evidence' THEN UPDATE public.ask_media SET storage_path=m->>'new' WHERE ask_id=ANY(coalesce(ids,'{}')) AND storage_path=m->>'old';
 ELSE UPDATE public.listing_media SET storage_path=m->>'new' WHERE ask_id=ANY(coalesce(ids,'{}')) AND storage_path=m->>'old'; END IF;
 END LOOP;
 slug:='seller-'||substr(replace(_claimant::text,'-',''),1,20);
 INSERT INTO public.seller_profiles(user_id,slug,status,terms_version,terms_accepted_at)
 VALUES(_claimant,slug,'active','seller-v1',now()) ON CONFLICT(user_id) DO UPDATE SET terms_version='seller-v1',terms_accepted_at=now();
 UPDATE public.asks SET seller_id=_claimant WHERE id=ANY(coalesce(ids,'{}'));
 -- Preserve created_by, message sender_id and historical audit actors.
 UPDATE public.conversation_participants cp SET user_id=_claimant,last_read_at=CASE WHEN s.owner_user_id=_claimant THEN cp.last_read_at ELSE NULL END WHERE cp.user_id=s.owner_user_id AND cp.role='seller' AND EXISTS(SELECT 1 FROM public.conversations c WHERE c.id=cp.conversation_id AND c.listing_id=ANY(coalesce(ids,'{}')));
 UPDATE public.conversations SET seller_id=_claimant WHERE listing_id=ANY(coalesce(ids,'{}')) AND seller_id=s.owner_user_id;
 UPDATE public.listing_inquiries SET seller_id=_claimant WHERE listing_id=ANY(coalesce(ids,'{}')) AND seller_id=s.owner_user_id;
 UPDATE public.notifications SET user_id=_claimant,read_at=NULL WHERE user_id=s.owner_user_id AND s.owner_user_id<>_claimant AND ((entity_type='conversation' AND entity_id IN (SELECT id FROM public.conversations WHERE listing_id=ANY(coalesce(ids,'{}')))) OR entity_id=ANY(coalesce(ids,'{}')));
 UPDATE public.managed_import_sellers SET owner_user_id=_claimant,claimed_at=now(),sync_enabled=_sync WHERE id=s.id;
 UPDATE public.fb_marketplace_import_items SET seller_id=_claimant WHERE source_profile_url=s.source_profile_url;
 UPDATE public.fb_marketplace_import_batches SET seller_id=_claimant WHERE source_profile_url=s.source_profile_url;
 UPDATE public.seller_claim_tokens SET consumed_at=now() WHERE id=t.id;
 UPDATE public.seller_claim_transfers SET status='complete',completed_at=now() WHERE id=j.id;
 INSERT INTO public.import_seller_audit(managed_seller_id,actor_id,action,target_id,details) VALUES(s.id,_claimant,'seller_claimed',_transfer,jsonb_build_object('sync_enabled',_sync,'terms_version','seller-v1'));
 PERFORM set_config('parkvault.trusted_operation','off',true);
END $$;

NOTIFY pgrst,'reload schema';
