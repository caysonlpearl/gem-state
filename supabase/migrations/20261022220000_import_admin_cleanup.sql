-- Reversible source removal never deletes listings, users, claims, or conversations.
BEGIN;
CREATE TABLE public.import_source_archives (
 source_profile_url text PRIMARY KEY,
 archived_at timestamptz,
 changed_at timestamptz NOT NULL DEFAULT now(),
 changed_by uuid NOT NULL REFERENCES auth.users(id)
);
ALTER TABLE public.import_source_archives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.import_source_archives FROM anon,authenticated;
GRANT ALL ON public.import_source_archives TO service_role;
CREATE FUNCTION public.set_import_source_archived(_profile text,_actor uuid,_archived boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.assert_import_operator(_actor);
 PERFORM pg_advisory_xact_lock(hashtextextended(_profile,0));
 IF NOT EXISTS(SELECT 1 FROM public.fb_marketplace_import_batches WHERE source_profile_url=_profile)
 AND NOT EXISTS(SELECT 1 FROM public.managed_import_sellers WHERE source_profile_url=_profile)
 THEN RAISE EXCEPTION 'Imported seller not found'; END IF;
 INSERT INTO public.import_source_archives(source_profile_url,archived_at,changed_by)
 VALUES(_profile,CASE WHEN _archived THEN now() END,_actor)
 ON CONFLICT(source_profile_url) DO UPDATE SET archived_at=excluded.archived_at,changed_at=now(),changed_by=_actor;
 INSERT INTO public.import_seller_audit(managed_seller_id,actor_id,action,details)
 SELECT id,_actor,CASE WHEN _archived THEN 'import_removed' ELSE 'import_restored' END,jsonb_build_object('profile',_profile)
 FROM public.managed_import_sellers WHERE source_profile_url=_profile;
END $$;
REVOKE ALL ON FUNCTION public.set_import_source_archived(text,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_import_source_archived(text,uuid,boolean) TO service_role;
-- A source removed while a scan is in flight cannot be staged or applied.
CREATE FUNCTION public.guard_archived_import_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 -- Claim transfer may still update only ownership and photo paths on a removed source.
 IF TG_OP='UPDATE' AND TG_TABLE_NAME IN ('fb_marketplace_import_items','fb_marketplace_import_batches') THEN
   IF (to_jsonb(NEW) - ARRAY['seller_id','evidence_paths','public_paths','updated_at']) IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['seller_id','evidence_paths','public_paths','updated_at']) THEN RETURN NEW; END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.source_profile_url,0));
 IF EXISTS(SELECT 1 FROM public.import_source_archives WHERE source_profile_url=NEW.source_profile_url AND archived_at IS NOT NULL)
 THEN RAISE EXCEPTION 'This import was removed. Restore it before importing or refreshing'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_archived_import_source() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_archived_import_batch BEFORE INSERT OR UPDATE ON public.fb_marketplace_import_batches FOR EACH ROW EXECUTE FUNCTION public.guard_archived_import_source();
CREATE TRIGGER guard_archived_import_item BEFORE INSERT OR UPDATE ON public.fb_marketplace_import_items FOR EACH ROW EXECUTE FUNCTION public.guard_archived_import_source();
-- Apply the same minimum-length treatment on create and refresh, leaving source text intact.
CREATE FUNCTION public.import_listing_description(_description text,_title text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN length(btrim(coalesce(_description,'')))>=20 THEN btrim(_description)
 ELSE concat_ws(E'\n\n',nullif(btrim(_description),''),CASE WHEN nullif(btrim(_description),'') IS NULL THEN btrim(_title) END,'Contact seller for more details.') END;
$$;
REVOKE ALL ON FUNCTION public.import_listing_description(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_listing_description(text,text) TO service_role;
-- Price/description sync preserves independently edited titles, categories and conditions.
-- Ownership, inactive listings, explicit seller edits, pause and detail conflict guards remain.
CREATE OR REPLACE FUNCTION public.apply_managed_import_item_core_20261020(_item uuid,_actor uuid,_paths text[] DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE i public.fb_marketplace_import_items; s public.managed_import_sellers; a public.asks;
 p public.products; category uuid; result uuid; snap jsonb; applied_description text; BEGIN
 PERFORM public.assert_import_operator(_actor);
 SELECT * INTO i FROM public.fb_marketplace_import_items WHERE id=_item;
 PERFORM pg_advisory_xact_lock(hashtextextended(i.source_profile_url,0));
 IF EXISTS(SELECT 1 FROM public.import_source_archives WHERE source_profile_url=i.source_profile_url AND archived_at IS NOT NULL) THEN RAISE EXCEPTION 'This import was removed. Restore it before applying changes'; END IF;
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
 IF a.status<>'active' OR i.seller_edited OR i.last_applied_snapshot IS NULL OR (snap - ARRAY['category','condition','title']) IS DISTINCT FROM (i.last_applied_snapshot - ARRAY['category','condition','title']) THEN
 UPDATE public.fb_marketplace_import_items SET sync_conflict='Bluebird listing changed or was removed. Review on Bluebird before syncing.' WHERE id=i.id;
 RETURN NULL;
 END IF;
 PERFORM set_config('parkvault.trusted_operation','on',true);
 IF i.status='possibly_removed' THEN
 UPDATE public.asks SET status='cancelled',sold_at=CASE WHEN i.removed_reason='sold' THEN now() ELSE sold_at END WHERE id=a.id;
 ELSE
 applied_description:=public.import_listing_description(i.description,i.title);
 IF length(applied_description) NOT BETWEEN 20 AND 5000 OR length(btrim(i.title)) NOT BETWEEN 3 AND 120 OR i.price_cents NOT BETWEEN 0 AND 1000000000 THEN RAISE EXCEPTION 'Invalid imported listing fields'; END IF;
 -- Refresh only changes the fields Facebook sync promises to change.
 UPDATE public.products SET description=applied_description,retail_price_cents=i.price_cents,status='published' WHERE id=p.id;
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
 result:=public.create_import_listing(s.owner_user_id,_actor,i.title,public.import_listing_description(i.description,i.title),category,i.price_cents,i.condition::public.item_condition,NULL,coalesce(nullif(btrim(i.region),''),upper(btrim(i.state))),i.city,NULL,'local_pickup',NULL,NULL,NULL,NULL,_paths,_paths,'{}');
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
