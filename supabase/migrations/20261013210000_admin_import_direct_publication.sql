-- Admin publishing is the review decision. Region is optional; city/state remain required.
BEGIN;
CREATE OR REPLACE FUNCTION public.apply_managed_import_item(_item uuid,_actor uuid,_paths text[] DEFAULT NULL)
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
 UPDATE public.products SET description=i.description,retail_price_cents=i.price_cents,status='published' WHERE id=p.id;
 UPDATE public.asks SET price_cents=i.price_cents,approved_at=now(),approved_by=_actor,review_note=NULL WHERE id=a.id;
 END IF;
 INSERT INTO public.ask_events(ask_id,actor_id,event_type,from_status,to_status,price_cents,note)
 SELECT id,_actor,CASE WHEN status='cancelled' THEN 'cancelled'::public.listing_event_type ELSE 'price_changed'::public.listing_event_type END,a.status,status,price_cents,'Admin applied authorized Facebook sync' FROM public.asks WHERE id=a.id;
 result:=a.id;
 ELSE
 IF i.status<>'draft' THEN RAISE EXCEPTION 'This item cannot be created'; END IF;
 IF _paths IS NULL THEN RAISE EXCEPTION 'Photos required'; END IF;
 IF length(btrim(coalesce(i.city,''))) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'Enter a city before publishing'; END IF;
 IF upper(btrim(coalesce(i.state,''))) !~ '^[A-Z]{2}$' THEN RAISE EXCEPTION 'Enter a two-letter state before publishing'; END IF;
 SELECT id INTO category FROM public.categories WHERE slug=i.category_slug;
 result:=public.create_import_listing(s.owner_user_id,_actor,i.title,i.description,category,i.price_cents,i.condition::public.item_condition,NULL,coalesce(nullif(btrim(i.region),''),upper(btrim(i.state))),i.city,NULL,'local_pickup',NULL,NULL,NULL,NULL,_paths,_paths,'{}');
 UPDATE public.classified_listing_details SET state=upper(btrim(i.state)) WHERE listing_id=result;
 -- The operator has already authorized and reviewed this item before Publish.
 UPDATE public.products SET status='published' WHERE id=(SELECT product_id FROM public.asks WHERE id=result);
 UPDATE public.asks SET approved_at=now(),approved_by=_actor,review_note=NULL WHERE id=result;
 UPDATE public.ask_events SET note='Admin published authorized Facebook import' WHERE ask_id=result AND event_type='created';
 END IF;
 SELECT * INTO a FROM public.asks WHERE id=result;
 SELECT * INTO p FROM public.products WHERE id=a.product_id;
 snap:=jsonb_build_object('price',a.price_cents,'title',p.name,'description',p.description,'condition',a.item_condition,'category',p.category_id,'status',a.status);
 UPDATE public.fb_marketplace_import_items SET status='published',listing_id=result,seller_id=s.owner_user_id,last_applied_snapshot=snap,sync_conflict=NULL WHERE id=i.id;
 INSERT INTO public.import_seller_audit(managed_seller_id,actor_id,action,target_id) VALUES(s.id,_actor,'item_applied',result);
 IF i.status IN ('draft','needs_update') THEN
 INSERT INTO public.import_seller_audit(managed_seller_id,actor_id,action,target_id,details) VALUES(s.id,_actor,'item_approved',result,jsonb_build_object('source','admin_publish'));
 END IF;
 PERFORM set_config('parkvault.trusted_operation','off',true);
 RETURN result;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
