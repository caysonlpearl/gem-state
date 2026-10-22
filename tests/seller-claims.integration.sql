-- Run after the managed seller migration. Everything is rolled back.
BEGIN;
DO $$
DECLARE
 legacy public.managed_import_sellers; legacy_item uuid; staged_item uuid;
 actor uuid; owner uuid:=gen_random_uuid(); buyer uuid:=gen_random_uuid(); claimant uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 seller public.managed_import_sellers; token text:=repeat('a',64); item uuid; batch uuid; listing uuid; category uuid;
 c uuid; msg uuid; transfer jsonb; snapshot jsonb; before_count integer; result uuid; failed boolean; path text;
BEGIN
 SELECT user_id INTO actor FROM public.user_roles WHERE role='admin' LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'Admin fixture unavailable'; END IF;
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data,banned_until,email_confirmed_at)
 VALUES(owner,'qa-managed-'||owner||'@import.invalid','{"managed_import":true}','{"display_name":"QA managed seller"}',now()+interval '100 years',NULL),
 (claimant,'qa-claimant-'||claimant||'@import.invalid','{}','{}','1970-01-01',now()),
 (buyer,'qa-buyer-'||buyer||'@import.invalid','{}','{}','1970-01-01',now()),
 (outsider,'qa-outsider-'||outsider||'@import.invalid','{}','{}','1970-01-01',now());
 INSERT INTO public.seller_profiles(user_id,slug,status) VALUES(owner,'qa-'||substr(replace(owner::text,'-',''),1,20),'active');
 SELECT * INTO seller FROM public.register_managed_import_seller('https://www.facebook.com/marketplace/profile/qa-'||owner||'/','QA managed seller',owner,actor);
 IF seller.required_claimant_id IS NOT NULL THEN RAISE EXCEPTION 'Managed claimant unexpectedly restricted'; END IF;
 IF (SELECT terms_accepted_at FROM public.seller_profiles WHERE user_id=owner) IS NOT NULL THEN RAISE EXCEPTION 'Seller agreement fabricated'; END IF;
 -- Admin denial, even through the service endpoint.
 failed:=false;BEGIN PERFORM public.rotate_seller_claim(seller.id,token,outsider);EXCEPTION WHEN OTHERS THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Non-admin token creation succeeded';END IF;
 PERFORM public.rotate_seller_claim(seller.id,token,actor);
 PERFORM public.rotate_seller_claim(seller.id,repeat('b',64),actor);
 IF NOT EXISTS(SELECT 1 FROM public.seller_claim_tokens WHERE token_hash=token AND revoked_at IS NOT NULL) THEN RAISE EXCEPTION 'Replacement failed to revoke previous link';END IF;
 failed:=false;BEGIN PERFORM public.prepare_seller_claim(token,claimant);EXCEPTION WHEN OTHERS THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Revoked link claim succeeded';END IF;
 token:=repeat('b',64);
 SELECT id INTO category FROM public.categories WHERE slug='jewelry-watches';
 INSERT INTO public.fb_marketplace_import_batches(imported_by,source_profile_url,seller_name) VALUES(actor,seller.source_profile_url,'QA managed seller') RETURNING id INTO batch;
 path:=owner::text||'/qa.jpg';
 INSERT INTO public.fb_marketplace_import_items(batch_id,seller_id,source_profile_url,source_url,title,description,price_cents,condition,category_slug,city,state,region,evidence_paths,public_paths)
 VALUES(batch,owner,seller.source_profile_url,'https://www.facebook.com/marketplace/item/qa-'||owner||'/','QA ring for claim test','A clearly labeled disposable test ring for claim integration testing.',4000,'used_excellent','jewelry-watches','Boise','ID','',ARRAY[path],ARRAY[path]) RETURNING id INTO item;
 -- Location failures leave the staged row intact, and non-admins cannot publish.
 failed:=false;BEGIN PERFORM public.apply_managed_import_item(item,outsider,ARRAY[path]);EXCEPTION WHEN OTHERS THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Non-admin publication succeeded';END IF;
 UPDATE public.fb_marketplace_import_items SET city='' WHERE id=item;
 failed:=false;BEGIN PERFORM public.apply_managed_import_item(item,actor,ARRAY[path]);EXCEPTION WHEN OTHERS THEN failed:=true;END;
 IF NOT failed OR (SELECT listing_id FROM public.fb_marketplace_import_items WHERE id=item) IS NOT NULL THEN RAISE EXCEPTION 'Missing-city validation created a listing';END IF;
 UPDATE public.fb_marketplace_import_items SET city='Boise',state='' WHERE id=item;
 failed:=false;BEGIN PERFORM public.apply_managed_import_item(item,actor,ARRAY[path]);EXCEPTION WHEN OTHERS THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Missing-state validation passed';END IF;
 UPDATE public.fb_marketplace_import_items SET state='ID' WHERE id=item;
 listing:=public.apply_managed_import_item(item,actor,ARRAY[path]);
 IF NOT EXISTS(SELECT 1 FROM public.asks a JOIN public.products p ON p.id=a.product_id WHERE a.id=listing AND a.approved_at IS NOT NULL AND a.approved_by=actor AND p.status='published') THEN RAISE EXCEPTION 'Admin publication did not go live';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.classified_listing_details WHERE listing_id=listing AND city='Boise' AND state='ID' AND region='ID') THEN RAISE EXCEPTION 'Optional region lost city/state';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.import_seller_audit WHERE target_id=listing AND action='item_approved' AND actor_id=actor) THEN RAISE EXCEPTION 'Admin approval audit missing';END IF;
 IF (SELECT seller_id FROM public.asks WHERE id=listing)<>owner THEN RAISE EXCEPTION 'Incorrect provisional owner';END IF;
 result:=public.apply_managed_import_item(item,actor,ARRAY[path]);IF result<>listing THEN RAISE EXCEPTION 'Repeated apply duplicated listing';END IF;
 -- Normal seller gate still applies to the provisional identity.
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner)::text,true);
 failed:=false;BEGIN PERFORM public.create_classified_listing('QA unauthorized ring','A sufficiently long description for validation.',category,4000,'used_excellent',NULL,'Treasure Valley','Boise',NULL,'local_pickup',NULL,NULL,NULL,NULL,ARRAY[path],ARRAY[path],'{}');EXCEPTION WHEN OTHERS THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Managed identity bypassed normal seller agreement gate';END IF;
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 -- Storefront/public metadata and inquiries before claim.
 IF NOT (public.managed_seller_public_status(owner)->>'managed')::boolean THEN RAISE EXCEPTION 'Managed identity not labeled';END IF;
 IF NOT (public.managed_seller_public_status(owner,listing)->>'managed')::boolean THEN RAISE EXCEPTION 'Imported listing not labeled';END IF;
 IF (public.managed_seller_public_status(owner,gen_random_uuid())->>'managed')::boolean THEN RAISE EXCEPTION 'Unrelated listing labeled as imported';END IF;
 INSERT INTO public.conversations(listing_id,buyer_id,seller_id) VALUES(listing,buyer,owner) RETURNING id INTO c;
 INSERT INTO public.conversation_participants(conversation_id,user_id,role) VALUES(c,buyer,'buyer'),(c,owner,'seller');
 INSERT INTO public.conversation_messages(conversation_id,sender_id,body) VALUES(c,buyer,'Buyer asks about the test ring.');
 msg:=public.reply_managed_import_conversation(c,actor,'Admin reply for integration testing.');
 IF NOT EXISTS(SELECT 1 FROM public.conversation_messages WHERE id=msg AND sender_id=actor AND sender_label='Bluebird on behalf of QA managed seller') THEN RAISE EXCEPTION 'Delegated reply lost true actor';END IF;
 -- Claim and retry the same transfer. Missing objects keep ownership intact.
 UPDATE auth.users SET email_confirmed_at=NULL WHERE id=outsider;
 failed:=false;BEGIN PERFORM public.prepare_seller_claim(token,outsider);EXCEPTION WHEN OTHERS THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Unverified email claimed listings';END IF;
 UPDATE auth.users SET email_confirmed_at=now() WHERE id=outsider;
 INSERT INTO public.fb_marketplace_import_items(batch_id,seller_id,source_profile_url,source_url,title,price_cents,category_slug,evidence_paths,public_paths)
 VALUES(batch,owner,seller.source_profile_url,'https://www.facebook.com/marketplace/item/staged-'||owner||'/','QA staged claim item',1000,'general',ARRAY['_staging/'||owner||'/qa.jpg'],ARRAY['_staging/'||owner||'/qa.jpg']) RETURNING id INTO staged_item;
 PERFORM public.set_import_source_archived(seller.source_profile_url,actor,true);
 transfer:=public.prepare_seller_claim(token,claimant);
 failed:=false;BEGIN INSERT INTO public.fb_marketplace_import_batches(imported_by,source_profile_url) VALUES(actor,seller.source_profile_url);EXCEPTION WHEN OTHERS THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Staging bypassed claim lease';END IF;
 failed:=false;BEGIN PERFORM public.finish_seller_claim((transfer->>'transferId')::uuid,claimant,true,true);EXCEPTION WHEN OTHERS THEN failed:=true;END;
 IF NOT failed OR (SELECT seller_id FROM public.asks WHERE id=listing)<>owner THEN RAISE EXCEPTION 'Incomplete storage transfer changed ownership';END IF;
 FOR snapshot IN SELECT value FROM jsonb_array_elements(transfer->'manifest') LOOP
 INSERT INTO storage.objects(bucket_id,name) VALUES(snapshot->>'bucket',snapshot->>'new');
 END LOOP;
 -- Another claimant cannot claim while this transfer is leased.
 failed:=false;BEGIN PERFORM public.prepare_seller_claim(token,outsider);EXCEPTION WHEN OTHERS THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Concurrent competing claim accepted';END IF;
 failed:=false;BEGIN PERFORM public.finish_seller_claim((transfer->>'transferId')::uuid,claimant,false,true);EXCEPTION WHEN OTHERS THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Claim accepted without agreement';END IF;
 PERFORM public.finish_seller_claim((transfer->>'transferId')::uuid,claimant,true,true);
 PERFORM public.finish_seller_claim((transfer->>'transferId')::uuid,claimant,true,true);
 IF (SELECT seller_id FROM public.asks WHERE id=listing)<>claimant OR (SELECT seller_id FROM public.conversations WHERE id=c)<>claimant THEN RAISE EXCEPTION 'Ownership transfer incomplete';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.conversation_participants WHERE conversation_id=c AND user_id=claimant AND role='seller') THEN RAISE EXCEPTION 'Seller missing from conversation';END IF;
 IF (SELECT sender_id FROM public.conversation_messages WHERE id=msg)<>actor THEN RAISE EXCEPTION 'Historical sender rewritten';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.seller_profiles WHERE user_id=claimant AND terms_version='seller-v1' AND terms_accepted_at IS NOT NULL) THEN RAISE EXCEPTION 'Actual agreement not recorded';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=claimant AND display_name='QA managed seller') THEN RAISE EXCEPTION 'Claim did not create public seller identity';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.fb_marketplace_import_items WHERE id=staged_item AND seller_id=claimant AND split_part(evidence_paths[1],'/',1)=claimant::text AND split_part(public_paths[1],'/',1)=claimant::text) THEN RAISE EXCEPTION 'Staged photo ownership did not transfer';END IF;
 failed:=false;BEGIN PERFORM public.reply_managed_import_conversation(c,actor,'Must not be allowed after claim');EXCEPTION WHEN OTHERS THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Routine admin inbox retained after claim';END IF;
 failed:=false;BEGIN PERFORM public.prepare_seller_claim(token,outsider);EXCEPTION WHEN OTHERS THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Consumed token reused by another account';END IF;
 PERFORM public.set_import_source_archived(seller.source_profile_url,actor,false);
 -- Seller sync pause is effective for already-previewed items.
 UPDATE public.fb_marketplace_import_items SET status='needs_update',price_cents=4100 WHERE id=item;
 PERFORM public.set_import_sync(seller.id,claimant,false);
 failed:=false;BEGIN PERFORM public.apply_managed_import_item(item,actor);EXCEPTION WHEN OTHERS THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Apply ignored seller pause';END IF;
 PERFORM public.set_import_sync(seller.id,claimant,true);
 -- Simulate seller editing the imported listing while an update is queued.
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',claimant)::text,true);
 PERFORM set_config('parkvault.trusted_operation','on',true);
 UPDATE public.asks SET price_cents=4300 WHERE id=listing;
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 result:=public.apply_managed_import_item(item,actor);
 IF result IS NOT NULL OR (SELECT price_cents FROM public.asks WHERE id=listing)<>4300 OR NOT EXISTS(SELECT 1 FROM public.fb_marketplace_import_items WHERE id=item AND sync_conflict IS NOT NULL) THEN RAISE EXCEPTION 'Seller edit was overwritten';END IF;
 PERFORM public.keep_bluebird_import_version(item,actor);
 IF (SELECT price_cents FROM public.asks WHERE id=listing)<>4300 THEN RAISE EXCEPTION 'Keeping Bluebird changed listing';END IF;
 UPDATE public.asks SET status='cancelled' WHERE id=listing;
 UPDATE public.fb_marketplace_import_items SET status='needs_update',price_cents=4400 WHERE id=item;
 result:=public.apply_managed_import_item(item,actor);
 IF result IS NOT NULL OR (SELECT status FROM public.asks WHERE id=listing)<>'cancelled' THEN RAISE EXCEPTION 'Sync revived a removed listing';END IF;
 IF has_function_privilege('authenticated','public.finish_seller_claim(uuid,uuid,boolean,boolean)','EXECUTE') OR has_function_privilege('anon','public.rotate_seller_claim(uuid,text,uuid,boolean)','EXECUTE') THEN RAISE EXCEPTION 'Claim RPC is publicly accessible';END IF;
 IF EXISTS(SELECT 1 FROM pg_class WHERE relname IN ('managed_import_sellers','seller_claim_tokens','seller_claim_transfers','import_seller_audit') AND NOT relrowsecurity) THEN RAISE EXCEPTION 'Missing RLS';END IF;
 -- Existing linked profiles can only be claimed by the existing owner.
 INSERT INTO public.fb_marketplace_import_batches(imported_by,source_profile_url) VALUES(actor,'https://www.facebook.com/marketplace/profile/legacy-'||owner||'/') RETURNING id INTO batch;
 INSERT INTO public.fb_marketplace_import_items(batch_id,seller_id,source_profile_url,source_url,title,price_cents,category_slug)
 VALUES(batch,claimant,'https://www.facebook.com/marketplace/profile/legacy-'||owner||'/','https://www.facebook.com/marketplace/item/legacy-'||owner||'/','QA legacy item',4000,'general') RETURNING id INTO legacy_item;
 SELECT * INTO legacy FROM public.register_managed_import_seller('https://www.facebook.com/marketplace/profile/legacy-'||owner||'/','QA existing seller',claimant,actor);
 IF legacy.required_claimant_id<>claimant THEN RAISE EXCEPTION 'Legacy owner not protected';END IF;
 IF (public.managed_seller_public_status(claimant)->>'managed')::boolean THEN RAISE EXCEPTION 'Legacy preparation relabeled a real storefront';END IF;
 PERFORM public.rotate_seller_claim(legacy.id,repeat('c',64),actor);
 failed:=false;BEGIN PERFORM public.prepare_seller_claim(repeat('c',64),outsider);EXCEPTION WHEN OTHERS THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Different account claimed existing seller';END IF;
 UPDATE public.seller_claim_tokens SET expires_at=now()-interval '1 second' WHERE token_hash=repeat('c',64);
 failed:=false;BEGIN PERFORM public.prepare_seller_claim(repeat('c',64),claimant);EXCEPTION WHEN OTHERS THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Expired token was accepted';END IF;
 UPDATE public.profiles SET display_name='Existing professional name' WHERE id=claimant;
 PERFORM public.rotate_seller_claim(legacy.id,repeat('d',64),actor);
 transfer:=public.prepare_seller_claim(repeat('d',64),claimant);
 PERFORM public.finish_seller_claim((transfer->>'transferId')::uuid,claimant,true,true);
 IF (SELECT display_name FROM public.profiles WHERE id=claimant)<>'Existing professional name' THEN RAISE EXCEPTION 'Claim overwrote an existing account name';END IF;
 RAISE NOTICE 'Managed seller integration checks passed; fixtures will be rolled back.';
END $$;
ROLLBACK;
SELECT 'Managed seller integration checks passed. All fixtures rolled back.' AS result;
