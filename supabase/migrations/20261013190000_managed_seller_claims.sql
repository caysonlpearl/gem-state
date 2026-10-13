-- Separate delegated import permission from seller agreement acceptance.
BEGIN;
CREATE TABLE public.managed_import_sellers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_profile_url text NOT NULL UNIQUE,
 display_name text NOT NULL,
 owner_user_id uuid NOT NULL REFERENCES auth.users(id),
 original_user_id uuid NOT NULL REFERENCES auth.users(id),
 required_claimant_id uuid REFERENCES auth.users(id),
 claimed_at timestamptz,
 imported_by uuid NOT NULL REFERENCES auth.users(id),
 authorized_at timestamptz NOT NULL DEFAULT now(),
 sync_enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.seller_claim_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 managed_seller_id uuid NOT NULL REFERENCES public.managed_import_sellers(id),
 token_hash text NOT NULL UNIQUE CHECK (length(token_hash)=64),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 revoked_at timestamptz,
 consumed_at timestamptz,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.seller_claim_transfers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 claim_token_id uuid NOT NULL REFERENCES public.seller_claim_tokens(id),
 claimant_id uuid NOT NULL REFERENCES auth.users(id),
 status text NOT NULL DEFAULT 'preparing' CHECK(status IN ('preparing','complete')),
 manifest jsonb NOT NULL DEFAULT '[]',
 lease_until timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
 completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(claim_token_id,claimant_id)
);
CREATE TABLE public.import_seller_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 managed_seller_id uuid NOT NULL REFERENCES public.managed_import_sellers(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 action text NOT NULL,
 target_id uuid,
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fb_marketplace_import_items ADD COLUMN last_applied_snapshot jsonb,
 ADD COLUMN sync_conflict text, ADD COLUMN seller_edited boolean NOT NULL DEFAULT false;
ALTER TABLE public.conversation_messages ADD COLUMN managed_seller_id uuid REFERENCES public.managed_import_sellers(id),
 ADD COLUMN sender_label text;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['managed_import_sellers','seller_claim_tokens','seller_claim_transfers','import_seller_audit'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',t);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
END $$;
CREATE INDEX managed_import_owner_idx ON public.managed_import_sellers(owner_user_id);
CREATE INDEX seller_claim_profile_idx ON public.seller_claim_tokens(managed_seller_id,created_at DESC);

CREATE FUNCTION public.assert_import_operator(_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF coalesce(auth.role(),'') <> 'service_role' OR NOT public.has_role(_actor,'admin') THEN
 RAISE EXCEPTION 'Administrator access required'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_import_operator(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_import_operator(uuid) TO service_role;

CREATE FUNCTION public.register_managed_import_seller(_profile text,_name text,_candidate uuid,_actor uuid,_linked boolean DEFAULT false)
RETURNS public.managed_import_sellers LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.managed_import_sellers; existing_owner uuid; BEGIN
 PERFORM public.assert_import_operator(_actor);
 PERFORM pg_advisory_xact_lock(hashtextextended(_profile,0));
 SELECT * INTO r FROM public.managed_import_sellers WHERE source_profile_url=_profile FOR UPDATE;
 IF r.id IS NOT NULL THEN RETURN r; END IF;
 SELECT seller_id INTO existing_owner FROM public.fb_marketplace_import_items
 WHERE source_profile_url=_profile AND seller_id IS NOT NULL LIMIT 1;
 IF EXISTS(SELECT 1 FROM public.fb_marketplace_import_items WHERE source_profile_url=_profile AND seller_id IS NOT NULL AND seller_id<>existing_owner) THEN RAISE EXCEPTION 'Imported profile has conflicting owners'; END IF;
 IF existing_owner IS NULL THEN
 IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE id=_candidate AND ((raw_app_meta_data->>'managed_import'='true' AND banned_until>now()) OR (email_confirmed_at IS NOT NULL AND EXISTS(SELECT 1 FROM public.seller_profiles p WHERE p.user_id=u.id AND p.terms_accepted_at IS NOT NULL AND p.status='active')))) THEN RAISE EXCEPTION 'A locked managed identity or verified existing seller is required'; END IF;
 existing_owner:=_candidate;
 END IF;
 INSERT INTO public.managed_import_sellers(source_profile_url,display_name,owner_user_id,original_user_id,required_claimant_id,imported_by,claimed_at)
 VALUES(_profile,left(_name,120),existing_owner,existing_owner,CASE WHEN NOT EXISTS(SELECT 1 FROM auth.users WHERE id=existing_owner AND raw_app_meta_data->>'managed_import'='true') THEN existing_owner ELSE NULL END,_actor,CASE WHEN _linked AND EXISTS(SELECT 1 FROM auth.users u JOIN public.seller_profiles p ON p.user_id=u.id WHERE u.id=existing_owner AND u.email_confirmed_at IS NOT NULL AND p.terms_accepted_at IS NOT NULL AND coalesce(u.raw_app_meta_data->>'managed_import','false')<>'true') THEN now() ELSE NULL END) RETURNING * INTO r;
 UPDATE public.fb_marketplace_import_items SET seller_id=existing_owner WHERE source_profile_url=_profile AND seller_id IS NULL;
 UPDATE public.fb_marketplace_import_batches SET seller_id=existing_owner WHERE source_profile_url=_profile AND seller_id IS NULL;
 INSERT INTO public.import_seller_audit(managed_seller_id,actor_id,action) VALUES(r.id,_actor,'managed_profile_prepared');
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.register_managed_import_seller(text,text,uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_managed_import_seller(text,text,uuid,uuid,boolean) TO service_role;

CREATE FUNCTION public.rotate_seller_claim(_seller uuid,_hash text,_actor uuid,_revoke boolean DEFAULT false)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.managed_import_sellers; until_at timestamptz:=now()+interval '30 days'; BEGIN
 PERFORM public.assert_import_operator(_actor);
 SELECT * INTO r FROM public.managed_import_sellers WHERE id=_seller FOR UPDATE;
 IF r.id IS NULL OR r.claimed_at IS NOT NULL THEN RAISE EXCEPTION 'Seller is missing or already claimed'; END IF;
 IF EXISTS(SELECT 1 FROM public.seller_claim_transfers j JOIN public.seller_claim_tokens t ON t.id=j.claim_token_id WHERE t.managed_seller_id=r.id AND j.status='preparing' AND j.lease_until>now()) THEN RAISE EXCEPTION 'A claim is in progress; try again after it finishes'; END IF;
 UPDATE public.seller_claim_tokens SET revoked_at=now() WHERE managed_seller_id=_seller AND consumed_at IS NULL AND revoked_at IS NULL;
 IF NOT _revoke THEN
 INSERT INTO public.seller_claim_tokens(managed_seller_id,token_hash,expires_at,created_by) VALUES(_seller,_hash,until_at,_actor);
 END IF;
 INSERT INTO public.import_seller_audit(managed_seller_id,actor_id,action) VALUES(_seller,_actor,CASE WHEN _revoke THEN 'claim_revoked' ELSE 'claim_link_generated' END);
 RETURN until_at;
END $$;
REVOKE ALL ON FUNCTION public.rotate_seller_claim(uuid,text,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_seller_claim(uuid,text,uuid,boolean) TO service_role;

-- Clone the currently deployed, validated create implementation. The ordinary
-- seller function is unchanged; only this service-only delegate skips terms.
DO $$ DECLARE definition text; signature text; BEGIN
 SELECT pg_get_functiondef('public.create_classified_listing(text,text,uuid,integer,public.item_condition,text,text,text,text,text,numeric,numeric,numeric,numeric,text[],text[],jsonb)'::regprocedure) INTO definition;
 definition:=replace(definition,'public.create_classified_listing(','public.create_import_listing(_import_owner uuid, _import_actor uuid, ');
 definition:=replace(definition,'uid uuid := auth.uid();','uid uuid := _import_owner;');
 IF position('uid uuid := _import_owner;' in definition)=0 THEN RAISE EXCEPTION 'Unexpected listing implementation; inspect before deploying'; END IF;
 definition:=regexp_replace(definition,'IF seller.user_id IS NULL OR seller.status <> ''active'' OR seller.terms_accepted_at IS NULL THEN[\s\S]*?END IF;',
 'PERFORM public.assert_import_operator(_import_actor); IF NOT EXISTS(SELECT 1 FROM public.managed_import_sellers WHERE owner_user_id=uid) THEN RAISE EXCEPTION ''Not an imported seller''; END IF;');
 IF position('Complete seller setup before listing' in definition)>0 THEN RAISE EXCEPTION 'Unexpected seller gate; inspect before deploying'; END IF;
 definition:=replace(definition,'VALUES (listing_id, uid, ''created''','VALUES (listing_id, _import_actor, ''created''');
 EXECUTE definition;
 signature:='public.create_import_listing(uuid,uuid,text,text,uuid,integer,public.item_condition,text,text,text,text,text,numeric,numeric,numeric,numeric,text[],text[],jsonb)';
 EXECUTE 'REVOKE ALL ON FUNCTION '||signature||' FROM PUBLIC, anon, authenticated';
 EXECUTE 'GRANT EXECUTE ON FUNCTION '||signature||' TO service_role';
END $$;

-- Each item apply takes the same managed-seller row lock as claiming and pause.
CREATE FUNCTION public.apply_managed_import_item(_item uuid,_actor uuid,_paths text[] DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE i public.fb_marketplace_import_items; s public.managed_import_sellers; a public.asks;
 p public.products; category uuid; result uuid; snap jsonb; BEGIN
 PERFORM public.assert_import_operator(_actor);
 SELECT * INTO i FROM public.fb_marketplace_import_items WHERE id=_item;
 SELECT * INTO s FROM public.managed_import_sellers WHERE source_profile_url=i.source_profile_url FOR UPDATE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'Prepare a managed seller first'; END IF;
 SELECT * INTO i FROM public.fb_marketplace_import_items WHERE id=_item FOR UPDATE;
 IF NOT s.sync_enabled THEN RAISE EXCEPTION 'Seller paused Facebook sync'; END IF;
 IF EXISTS(SELECT 1 FROM public.seller_profiles WHERE user_id=s.owner_user_id AND status<>'active') THEN RAISE EXCEPTION 'Seller account is restricted'; END IF;
 IF EXISTS(SELECT 1 FROM public.seller_claim_transfers j JOIN public.seller_claim_tokens t ON t.id=j.claim_token_id WHERE t.managed_seller_id=s.id AND j.status='preparing' AND j.lease_until>now()) THEN RAISE EXCEPTION 'Claim in progress; retry afterward'; END IF;
 IF i.listing_id IS NOT NULL THEN
 SELECT * INTO a FROM public.asks WHERE id=i.listing_id FOR UPDATE;
 IF a.seller_id<>s.owner_user_id THEN RAISE EXCEPTION 'Listing owner has changed'; END IF;
 SELECT * INTO p FROM public.products WHERE id=a.product_id;
 snap:=jsonb_build_object('price',a.price_cents,'title',p.name,'description',p.description,'condition',a.item_condition,'category',p.category_id,'status',a.status);
 IF i.status='published' THEN RETURN i.listing_id; END IF;
 IF a.status<>'active' OR i.seller_edited OR i.last_applied_snapshot IS NULL OR snap IS DISTINCT FROM i.last_applied_snapshot THEN
 UPDATE public.fb_marketplace_import_items SET sync_conflict='Bluebird listing changed or was removed. Review on Bluebird before syncing.' WHERE id=i.id;
 RETURN NULL;
 END IF;
 PERFORM set_config('parkvault.trusted_operation','on',true);
 IF i.status='possibly_removed' THEN
 UPDATE public.asks SET status='cancelled',sold_at=CASE WHEN i.removed_reason='sold' THEN now() ELSE sold_at END WHERE id=a.id;
 ELSE
 IF length(btrim(i.description)) NOT BETWEEN 20 AND 5000 OR length(btrim(i.title)) NOT BETWEEN 3 AND 120 OR i.price_cents NOT BETWEEN 0 AND 1000000000 THEN RAISE EXCEPTION 'Invalid imported listing fields'; END IF;
 -- Refresh only changes the fields Facebook sync promises to change.
 UPDATE public.products SET description=i.description,retail_price_cents=i.price_cents,status='pending_review' WHERE id=p.id;
 UPDATE public.asks SET price_cents=i.price_cents,approved_at=NULL,approved_by=NULL,review_note=NULL WHERE id=a.id;
 END IF;
 INSERT INTO public.ask_events(ask_id,actor_id,event_type,from_status,to_status,price_cents,note)
 SELECT id,_actor,CASE WHEN status='cancelled' THEN 'cancelled'::public.listing_event_type ELSE 'price_changed'::public.listing_event_type END,a.status,status,price_cents,'Admin applied authorized Facebook sync' FROM public.asks WHERE id=a.id;
 result:=a.id;
 ELSE
 IF i.status<>'draft' THEN RAISE EXCEPTION 'This item cannot be created'; END IF;
 IF _paths IS NULL THEN RAISE EXCEPTION 'Photos required'; END IF;
 SELECT id INTO category FROM public.categories WHERE slug=i.category_slug;
 result:=public.create_import_listing(s.owner_user_id,_actor,i.title,i.description,category,i.price_cents,i.condition::public.item_condition,NULL,i.region,i.city,NULL,'local_pickup',NULL,NULL,NULL,NULL,_paths,_paths,'{}');
 UPDATE public.classified_listing_details SET state=i.state WHERE listing_id=result;
 END IF;
 SELECT * INTO a FROM public.asks WHERE id=result;
 SELECT * INTO p FROM public.products WHERE id=a.product_id;
 snap:=jsonb_build_object('price',a.price_cents,'title',p.name,'description',p.description,'condition',a.item_condition,'category',p.category_id,'status',a.status);
 UPDATE public.fb_marketplace_import_items SET status='published',listing_id=result,seller_id=s.owner_user_id,last_applied_snapshot=snap,sync_conflict=NULL WHERE id=i.id;
 INSERT INTO public.import_seller_audit(managed_seller_id,actor_id,action,target_id) VALUES(s.id,_actor,'item_applied',result);
 PERFORM set_config('parkvault.trusted_operation','off',true);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.apply_managed_import_item(uuid,uuid,text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_managed_import_item(uuid,uuid,text[]) TO service_role;

CREATE FUNCTION public.prepare_seller_claim(_hash text,_claimant uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t public.seller_claim_tokens; s public.managed_import_sellers; j public.seller_claim_transfers; assets jsonb; BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Server access required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_claimant AND email_confirmed_at IS NOT NULL AND coalesce(banned_until,'1970-01-01')<now() AND coalesce(raw_app_meta_data->>'managed_import','false')<>'true') THEN RAISE EXCEPTION 'Verify your email before claiming'; END IF;
 SELECT * INTO t FROM public.seller_claim_tokens WHERE token_hash=_hash;
 SELECT * INTO s FROM public.managed_import_sellers WHERE id=t.managed_seller_id FOR UPDATE;
 SELECT * INTO t FROM public.seller_claim_tokens WHERE id=t.id FOR UPDATE;
 IF s.claimed_at IS NOT NULL AND s.owner_user_id=_claimant AND t.consumed_at IS NOT NULL THEN RETURN jsonb_build_object('complete',true); END IF;
 IF t.id IS NULL OR t.revoked_at IS NOT NULL OR t.consumed_at IS NOT NULL OR t.expires_at<=now() OR s.claimed_at IS NOT NULL THEN RAISE EXCEPTION 'This claim link is no longer available'; END IF;
 IF s.required_claimant_id IS NOT NULL AND s.required_claimant_id<>_claimant THEN RAISE EXCEPTION 'Sign in to the account already associated with these listings'; END IF;
 IF EXISTS(SELECT 1 FROM public.conversations WHERE seller_id=s.owner_user_id AND buyer_id=_claimant AND listing_id IN (SELECT listing_id FROM public.fb_marketplace_import_items WHERE source_profile_url=s.source_profile_url)) THEN RAISE EXCEPTION 'This account has buyer conversations on these listings. Contact Bluebird to confirm ownership'; END IF;
 IF EXISTS(SELECT 1 FROM public.seller_claim_transfers x JOIN public.seller_claim_tokens c ON c.id=x.claim_token_id WHERE c.managed_seller_id=s.id AND x.status='preparing' AND x.lease_until>now() AND x.claimant_id<>_claimant) THEN RAISE EXCEPTION 'Another claim is in progress'; END IF;
 SELECT jsonb_agg(jsonb_build_object('bucket',bucket,'old',path,'new',_claimant::text||'/claim-'||s.id::text||'/'||md5(path)||'.'||coalesce(nullif(substring(path from '\.([^./]+)$'),''),'jpg'))) INTO assets FROM (
 SELECT 'ask-evidence' bucket,m.storage_path path FROM public.ask_media m JOIN public.fb_marketplace_import_items i ON i.listing_id=m.ask_id WHERE i.source_profile_url=s.source_profile_url
 UNION SELECT 'listing-media',m.storage_path FROM public.listing_media m JOIN public.fb_marketplace_import_items i ON i.listing_id=m.ask_id WHERE i.source_profile_url=s.source_profile_url
 ) a WHERE split_part(path,'/',1)<>_claimant::text;
 INSERT INTO public.seller_claim_transfers(claim_token_id,claimant_id,manifest) VALUES(t.id,_claimant,coalesce(assets,'[]'))
 ON CONFLICT(claim_token_id,claimant_id) DO UPDATE SET manifest=EXCLUDED.manifest,lease_until=now()+interval '10 minutes' RETURNING * INTO j;
 RETURN jsonb_build_object('transferId',j.id,'manifest',j.manifest,'complete',false);
END $$;
REVOKE ALL ON FUNCTION public.prepare_seller_claim(text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_seller_claim(text,uuid) TO service_role;

CREATE FUNCTION public.finish_seller_claim(_transfer uuid,_claimant uuid,_accept_terms boolean,_sync boolean)
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
 UPDATE public.conversation_participants cp SET user_id=_claimant,last_read_at=NULL WHERE cp.user_id=s.owner_user_id AND cp.role='seller' AND EXISTS(SELECT 1 FROM public.conversations c WHERE c.id=cp.conversation_id AND c.listing_id=ANY(coalesce(ids,'{}')));
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
REVOKE ALL ON FUNCTION public.finish_seller_claim(uuid,uuid,boolean,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_seller_claim(uuid,uuid,boolean,boolean) TO service_role;

CREATE FUNCTION public.set_import_sync(_seller uuid,_user uuid,_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.managed_import_sellers; BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Server access required'; END IF;
 SELECT * INTO s FROM public.managed_import_sellers WHERE id=_seller FOR UPDATE;
 IF s.owner_user_id<>_user OR s.claimed_at IS NULL THEN RAISE EXCEPTION 'Only the claimed seller can change sync'; END IF;
 UPDATE public.managed_import_sellers SET sync_enabled=_enabled WHERE id=_seller;
 INSERT INTO public.import_seller_audit(managed_seller_id,actor_id,action,details) VALUES(_seller,_user,'sync_changed',jsonb_build_object('enabled',_enabled));
END $$;
REVOKE ALL ON FUNCTION public.set_import_sync(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_import_sync(uuid,uuid,boolean) TO service_role;

CREATE FUNCTION public.reply_managed_import_conversation(_conversation uuid,_actor uuid,_body text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.conversations; s public.managed_import_sellers; result uuid; BEGIN
 PERFORM public.assert_import_operator(_actor);
 SELECT m.* INTO s FROM public.managed_import_sellers m JOIN public.fb_marketplace_import_items i ON i.source_profile_url=m.source_profile_url JOIN public.conversations x ON x.listing_id=i.listing_id WHERE x.id=_conversation FOR UPDATE OF m;
 IF s.id IS NULL OR s.claimed_at IS NOT NULL THEN RAISE EXCEPTION 'This inbox is no longer admin managed'; END IF;
 SELECT * INTO c FROM public.conversations WHERE id=_conversation FOR UPDATE;
 IF c.seller_id<>s.owner_user_id OR c.closed_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.conversation_participants WHERE conversation_id=c.id AND blocked_at IS NOT NULL) THEN RAISE EXCEPTION 'Messaging is unavailable for this conversation'; END IF;
 IF length(btrim(_body)) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Enter a message between 1 and 5000 characters'; END IF;
 IF (SELECT count(*) FROM public.conversation_messages WHERE sender_id=_actor AND created_at>now()-interval '1 minute')>=30 THEN RAISE EXCEPTION 'Too many messages; try again shortly'; END IF;
 INSERT INTO public.conversation_messages(conversation_id,sender_id,body,managed_seller_id,sender_label) VALUES(c.id,_actor,btrim(_body),s.id,'Bluebird on behalf of '||s.display_name) RETURNING id INTO result;
 UPDATE public.conversations SET last_message_at=now() WHERE id=c.id;
 INSERT INTO public.notifications(user_id,kind,title,body,entity_type,entity_id,destination_url) VALUES(c.buyer_id,'message','New marketplace message','Bluebird on behalf of '||s.display_name||': '||left(_body,180),'conversation',c.id,'/account?section=messages&conversation='||c.id);
 INSERT INTO public.import_seller_audit(managed_seller_id,actor_id,action,target_id) VALUES(s.id,_actor,'managed_inbox_reply',result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.reply_managed_import_conversation(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reply_managed_import_conversation(uuid,uuid,text) TO service_role;

CREATE FUNCTION public.managed_seller_public_status(_user uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('managed',EXISTS(SELECT 1 FROM public.managed_import_sellers WHERE owner_user_id=_user AND claimed_at IS NULL));
$$;
REVOKE ALL ON FUNCTION public.managed_seller_public_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.managed_seller_public_status(uuid) TO anon,authenticated,service_role;

CREATE FUNCTION public.flag_import_seller_edit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NOT NULL THEN
 UPDATE public.fb_marketplace_import_items i SET seller_edited=true
 FROM public.asks a WHERE i.listing_id=a.id AND a.seller_id=auth.uid()
 AND ((TG_TABLE_NAME='asks' AND a.id=(to_jsonb(NEW)->>'id')::uuid) OR (TG_TABLE_NAME='products' AND a.product_id=(to_jsonb(NEW)->>'id')::uuid) OR (TG_TABLE_NAME='classified_listing_details' AND a.id=(to_jsonb(NEW)->>'listing_id')::uuid));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER managed_ask_edit AFTER UPDATE ON public.asks FOR EACH ROW EXECUTE FUNCTION public.flag_import_seller_edit();
CREATE TRIGGER managed_product_edit AFTER UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.flag_import_seller_edit();
CREATE TRIGGER managed_details_edit AFTER UPDATE ON public.classified_listing_details FOR EACH ROW EXECUTE FUNCTION public.flag_import_seller_edit();

CREATE FUNCTION public.keep_bluebird_import_version(_item uuid,_actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE i public.fb_marketplace_import_items; s public.managed_import_sellers; a public.asks; p public.products; BEGIN
 PERFORM public.assert_import_operator(_actor);
 SELECT * INTO i FROM public.fb_marketplace_import_items WHERE id=_item;
 SELECT * INTO s FROM public.managed_import_sellers WHERE source_profile_url=i.source_profile_url FOR UPDATE;
 IF s.id IS NULL OR i.listing_id IS NULL THEN RAISE EXCEPTION 'Linked import not found'; END IF;
 SELECT * INTO a FROM public.asks WHERE id=i.listing_id;
 SELECT * INTO p FROM public.products WHERE id=a.product_id;
 UPDATE public.fb_marketplace_import_items SET status='published',sync_conflict=NULL,seller_edited=false,
 last_applied_snapshot=jsonb_build_object('price',a.price_cents,'title',p.name,'description',p.description,'condition',a.item_condition,'category',p.category_id,'status',a.status)
 WHERE id=i.id;
 INSERT INTO public.import_seller_audit(managed_seller_id,actor_id,action,target_id) VALUES(s.id,_actor,'kept_bluebird_version',i.listing_id);
END $$;
REVOKE ALL ON FUNCTION public.keep_bluebird_import_version(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.keep_bluebird_import_version(uuid,uuid) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
