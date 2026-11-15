-- Source-only owned listing cleanup. No provider erasure, Auth removal or
-- whole-phase authority; install only with the reviewed full composition inactive.
BEGIN;
SET LOCAL search_path='';
SET LOCAL lock_timeout='5s';
DO $$ DECLARE expected_columns jsonb:=$columns${"asks":{"id":["uuid",-1,true,""],"status":["listing_status",-1,true,""],"in_hand":["boolean",-1,true,""],"is_demo":["boolean",-1,true,""],"sold_at":["timestamp with time zone",-1,false,""],"currency":["character",7,true,""],"dealer_id":["uuid",-1,false,""],"seller_id":["uuid",-1,true,""],"created_at":["timestamp with time zone",-1,true,""],"expires_at":["timestamp with time zone",-1,true,""],"product_id":["uuid",-1,true,""],"ranking_at":["timestamp with time zone",-1,true,""],"updated_at":["timestamp with time zone",-1,true,""],"variant_id":["uuid",-1,true,""],"approved_at":["timestamp with time zone",-1,false,""],"approved_by":["uuid",-1,false,""],"price_cents":["integer",-1,true,""],"promoted_at":["timestamp with time zone",-1,false,""],"review_note":["text",-1,false,""],"seller_note":["text",-1,false,""],"ship_by_days":["smallint",-1,true,""],"evidence_count":["integer",-1,true,""],"featured_until":["timestamp with time zone",-1,false,""],"item_condition":["item_condition",-1,true,""],"parcel_width_in":["numeric",393222,false,""],"matched_order_id":["uuid",-1,false,""],"parcel_height_in":["numeric",393222,false,""],"parcel_length_in":["numeric",393222,false,""],"parcel_weight_lb":["numeric",458758,false,""],"public_media_count":["integer",-1,true,""],"acquired_location_id":["uuid",-1,false,""],"fulfillment_window_days":["integer",-1,false,""]},"ask_media":{"id":["uuid",-1,true,""],"ask_id":["uuid",-1,true,""],"caption":["text",-1,false,""],"position":["integer",-1,true,""],"created_at":["timestamp with time zone",-1,true,""],"storage_path":["text",-1,true,""]},"ask_events":{"id":["uuid",-1,true,""],"note":["text",-1,false,""],"ask_id":["uuid",-1,true,""],"actor_id":["uuid",-1,false,""],"to_status":["listing_status",-1,false,""],"created_at":["timestamp with time zone",-1,true,""],"event_type":["listing_event_type",-1,true,""],"from_status":["listing_status",-1,false,""],"price_cents":["integer",-1,false,""]},"listing_media":{"id":["uuid",-1,true,""],"ask_id":["uuid",-1,true,""],"alt_text":["text",-1,false,""],"position":["integer",-1,true,""],"created_at":["timestamp with time zone",-1,true,""],"storage_path":["text",-1,true,""],"rights_attested_at":["timestamp with time zone",-1,true,""]},"shopping_inventory":{"card":["jsonb",-1,true,""],"category":["text",-1,true,""],"listing_id":["text",-1,true,""],"price_cents":["bigint",-1,true,""],"valid_until":["timestamp with time zone",-1,true,""],"content_hash":["text",-1,true,""],"last_seen_at":["timestamp with time zone",-1,true,""],"first_seen_at":["timestamp with time zone",-1,true,""],"price_version":["uuid",-1,true,""],"price_changed_at":["timestamp with time zone",-1,false,""],"previous_price_cents":["bigint",-1,false,""]},"listing_thumbnail_links":{"url":["text",-1,true,""],"path":["text",-1,true,""],"updated_at":["timestamp with time zone",-1,true,""],"reuse_until":["timestamp with time zone",-1,true,""]},"checkout_shipping_quotes":{"id":["uuid",-1,true,""],"rates":["jsonb",-1,true,""],"ask_id":["uuid",-1,false,""],"address":["jsonb",-1,true,""],"buyer_id":["uuid",-1,true,""],"provider":["text",-1,true,""],"created_at":["timestamp with time zone",-1,true,""],"expires_at":["timestamp with time zone",-1,true,""],"option_ref":["text",-1,false,""],"variant_id":["uuid",-1,false,""],"provider_shipment_id":["text",-1,false,""]},"classified_listing_details":{"vin":["text",-1,false,""],"city":["text",-1,true,""],"state":["text",-1,true,""],"region":["text",-1,true,""],"pet_age":["text",-1,false,""],"pet_sex":["text",-1,false,""],"pet_name":["text",-1,false,""],"home_mode":["text",-1,false,""],"home_yard":["text",-1,false,""],"pet_breed":["text",-1,false,""],"created_at":["timestamp with time zone",-1,true,""],"home_acres":["numeric",-1,false,""],"listing_id":["uuid",-1,true,""],"updated_at":["timestamp with time zone",-1,true,""],"job_pay_max":["numeric",-1,false,""],"job_pay_min":["numeric",-1,false,""],"pet_species":["text",-1,false,""],"postal_code":["text",-1,false,""],"home_acreage":["text",-1,false,""],"home_cooling":["text",-1,false,""],"home_heating":["text",-1,false,""],"item_details":["jsonb",-1,true,""],"job_category":["text",-1,false,""],"job_pay_type":["text",-1,false,""],"service_area":["text",-1,false,""],"vehicle_make":["text",-1,false,""],"vehicle_trim":["text",-1,false,""],"vehicle_year":["smallint",-1,false,""],"home_bedrooms":["numeric",262149,false,""],"home_hoa_fees":["text",-1,false,""],"vehicle_model":["text",-1,false,""],"home_available":["text",-1,false,""],"home_bathrooms":["numeric",262149,false,""],"pet_offered_by":["text",-1,false,""],"pet_vaccinated":["text",-1,false,""],"home_open_house":["text",-1,false,""],"home_year_built":["smallint",-1,false,""],"pet_subcategory":["text",-1,false,""],"vehicle_mileage":["integer",-1,false,""],"fulfillment_mode":["text",-1,true,""],"home_pets_policy":["text",-1,false,""],"home_square_feet":["integer",-1,false,""],"pet_microchipped":["text",-1,false,""],"home_lease_length":["text",-1,false,""],"job_employer_name":["text",-1,false,""],"pet_special_needs":["text",-1,false,""],"service_offerings":["text[]",-1,false,""],"vehicle_fuel_type":["text",-1,false,""],"home_basement_type":["text",-1,false,""],"home_property_type":["text",-1,false,""],"job_qualifications":["text[]",-1,false,""],"pet_breeding_terms":["text",-1,false,""],"pet_good_with_cats":["text",-1,false,""],"pet_good_with_dogs":["text",-1,false,""],"pet_good_with_kids":["text",-1,false,""],"pet_hypoallergenic":["text",-1,false,""],"pet_indoor_outdoor":["text",-1,false,""],"pet_placement_type":["text",-1,false,""],"vehicle_body_style":["text",-1,false,""],"vehicle_drivetrain":["text",-1,false,""],"home_garage_parking":["text",-1,false,""],"home_smoking_policy":["text",-1,false,""],"job_education_level":["text",-1,false,""],"job_employment_type":["text",-1,false,""],"pet_spayed_neutered":["text",-1,false,""],"service_subcategory":["text",-1,false,""],"home_floor_coverings":["text",-1,false,""],"home_school_district":["text",-1,false,""],"job_employer_address":["text",-1,false,""],"job_responsibilities":["text[]",-1,false,""],"service_availability":["text",-1,false,""],"service_pricing_type":["text",-1,false,""],"vehicle_title_status":["text",-1,false,""],"vehicle_transmission":["text",-1,false,""],"home_special_features":["text",-1,false,""],"pet_records_available":["text",-1,false,""],"home_exterior_material":["text",-1,false,""],"job_application_method":["text",-1,true,""],"service_license_number":["text",-1,false,""],"vehicle_exterior_color":["text",-1,false,""],"job_experience_required":["text",-1,false,""],"service_price_max_cents":["integer",-1,false,""],"home_appliances_included":["text",-1,false,""],"service_business_address":["text",-1,false,""],"service_license_lookup_url":["text",-1,false,""],"job_application_external_contact":["text",-1,false,""]},"classified_listing_metrics":{"views":["bigint",-1,true,""],"created_at":["timestamp with time zone",-1,true,""],"listing_id":["uuid",-1,true,""],"updated_at":["timestamp with time zone",-1,true,""],"impressions":["bigint",-1,true,""]}}$columns$::jsonb;
 expected_hooks jsonb:=$hooks${"asks.asks_touch":[19,"O","9b1889f56258bf9d6554213c05019c76",false,null,"",0,null,false,false],"asks.managed_ask_edit":[17,"O","8c5604dae1b6a79e06b7b0d5ee1397ce",true,["search_path=public, pg_temp"],"",0,null,false,false],"asks.notify_on_new_ask":[5,"O","6ca6c922f3a673852433ed09fae151fb",true,["search_path=public, pg_temp"],"",0,null,false,false],"ask_media.ask_media_count":[13,"O","8a48cc9c5b327a72d93ce72ee9c1840a",true,["search_path=public, pg_temp"],"",0,null,false,false],"asks.asks_guard_user_updates":[19,"O","df9dac308d44f1b7b1f8c7981f29166c",false,["search_path=public, pg_temp"],"",0,null,false,false],"asks.asks_clear_sold_at_on_relist":[19,"O","4df71e55bf6140a3673cf7a048323a36",false,["search_path=public"],"4",0,null,false,false],"listing_media.listing_media_count":[13,"O","9dca2f42ffedc3fa54dd55d6ecaca363",true,["search_path=public, pg_temp"],"",0,null,false,false],"asks.require_verified_seller_for_ask":[7,"O","47fa85f9167ad3b449b0cd188f2db5ea",true,["search_path=public, pg_temp"],"",0,null,false,false],"ask_media.guard_member_photo_reference":[23,"O","634d442cb95409d34b468e10b31c9300",true,["search_path=\"\""],"2",0,null,false,false],"asks.asks_apply_seller_shipping_defaults":[7,"O","0a7ec94716326131eecfae8f6132e09d",true,["search_path=public, pg_temp"],"",0,null,false,false],"listing_media.guard_member_photo_reference":[23,"O","634d442cb95409d34b468e10b31c9300",true,["search_path=\"\""],"2",0,null,false,false],"asks.publish_classified_product_after_approval":[17,"O","cac88d63c5cbc2573512065b248fa174",true,["search_path=public, pg_temp"],"4 5",0,null,false,false],"classified_listing_details.managed_details_edit":[17,"O","8c5604dae1b6a79e06b7b0d5ee1397ce",true,["search_path=public, pg_temp"],"",0,null,false,false],"classified_listing_details.classified_listing_details_touch":[19,"O","9b1889f56258bf9d6554213c05019c76",false,null,"",0,null,false,false],"classified_listing_metrics.classified_listing_metrics_touch":[19,"O","9b1889f56258bf9d6554213c05019c76",false,null,"",0,null,false,false]}$hooks$::jsonb; expected_fks jsonb:=$fks${"public.asks.asks_dealer_id_fkey":["public.dealer_profiles",["dealer_id"],["id"],"n","a",true,false,false],"public.asks.asks_seller_id_fkey":["auth.users",["seller_id"],["id"],"c","a",true,false,false],"public.asks.asks_product_id_fkey":["public.products",["product_id"],["id"],"c","a",true,false,false],"public.asks.asks_variant_id_fkey":["public.product_variants",["variant_id"],["id"],"c","a",true,false,false],"public.orders.orders_ask_id_fkey":["public.asks",["ask_id"],["id"],"n","a",true,false,false],"public.asks.asks_matched_order_fk":["public.orders",["matched_order_id"],["id"],"n","a",true,false,false],"public.ask_media.ask_media_ask_id_fkey":["public.asks",["ask_id"],["id"],"c","a",true,false,false],"public.ask_events.ask_events_ask_id_fkey":["public.asks",["ask_id"],["id"],"c","a",true,false,false],"public.ask_events.ask_events_actor_id_fkey":["auth.users",["actor_id"],["id"],"n","a",true,false,false],"public.asks.asks_acquired_location_id_fkey":["public.locations",["acquired_location_id"],["id"],"n","a",true,false,false],"public.listing_media.listing_media_ask_id_fkey":["public.asks",["ask_id"],["id"],"c","a",true,false,false],"public.listing_offers.listing_offers_ask_id_fkey":["public.asks",["ask_id"],["id"],"c","a",true,false,false],"public.market_matches.market_matches_ask_id_fkey":["public.asks",["ask_id"],["id"],"n","a",true,false,false],"public.conversations.conversations_listing_id_fkey":["public.asks",["listing_id"],["id"],"n","a",true,false,false],"public.job_applications.job_applications_listing_id_fkey":["public.asks",["listing_id"],["id"],"n","a",true,false,false],"public.listing_inquiries.listing_inquiries_listing_id_fkey":["public.asks",["listing_id"],["id"],"n","a",true,false,false],"public.shopping_embeddings.shopping_embeddings_listing_id_fkey":["public.shopping_inventory",["listing_id"],["listing_id"],"c","a",true,false,false],"public.saved_search_matches.saved_search_matches_listing_id_fkey":["public.asks",["listing_id"],["id"],"c","a",true,false,false],"public.checkout_shipping_quotes.checkout_shipping_quotes_ask_id_fkey":["public.asks",["ask_id"],["id"],"c","a",true,false,false],"public.checkout_shipping_quotes.checkout_shipping_quotes_buyer_id_fkey":["auth.users",["buyer_id"],["id"],"c","a",true,false,false],"public.checkout_shipping_quotes.checkout_shipping_quotes_variant_id_fkey":["public.product_variants",["variant_id"],["id"],"c","a",true,false,false],"public.listing_upgrade_purchases.listing_upgrade_purchases_listing_id_fkey":["public.asks",["listing_id"],["id"],"c","a",true,false,false],"public.classified_listing_details.classified_listing_details_listing_id_fkey":["public.asks",["listing_id"],["id"],"c","a",true,false,false],"public.classified_listing_metrics.classified_listing_metrics_listing_id_fkey":["public.asks",["listing_id"],["id"],"c","a",true,false,false],"public.classified_listing_reports.classified_listing_reports_listing_id_fkey":["public.asks",["listing_id"],["id"],"c","a",true,false,false],"public.seller_listing_requests.seller_listing_requests_converted_ask_id_fkey":["public.asks",["converted_ask_id"],["id"],"n","a",true,false,false],"public.fb_marketplace_import_items.fb_marketplace_import_items_listing_id_fkey":["public.asks",["listing_id"],["id"],"n","a",true,false,false],"public.dealer_inventory_listing_links.dealer_inventory_listing_links_listing_id_fkey":["public.asks",["listing_id"],["id"],"c","a",true,false,false]}$fks$::jsonb;
 sources text[]:=ARRAY['asks','ask_events','listing_media','ask_media','classified_listing_details','classified_listing_metrics','listing_thumbnail_links','checkout_shipping_quotes','shopping_inventory','shopping_embeddings']; relation text; actual jsonb;
BEGIN
 PERFORM 1 FROM public.account_deletion_controls WHERE id AND NOT worker_enabled FOR SHARE;
 IF NOT FOUND OR NOT public.account_deletion_application_barrier_current()
 OR NOT public.account_deletion_profile_barrier_current()
 OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Review disabled listing-erasure prerequisites'; END IF;
 FOREACH relation IN ARRAY sources LOOP
  EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE',relation);
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=format('public.%I',relation)::regclass AND relkind='r' AND NOT relispartition)
  OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhparent=format('public.%I',relation)::regclass OR inhrelid=format('public.%I',relation)::regclass)
  OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class=format('public.%I',relation)::regclass)
  THEN RAISE EXCEPTION 'Review listing relation layout'; END IF;
 END LOOP;
 SELECT jsonb_object_agg(relname,cols) INTO actual FROM(
 SELECT c.relname,jsonb_object_agg(a.attname,jsonb_build_array(replace(a.atttypid::regtype::text,'public.',''),a.atttypmod,a.attnotnull,a.attgenerated))cols
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
 WHERE n.nspname='public' AND c.relname=ANY(sources) AND c.relname<>'shopping_embeddings' AND a.attnum>0 AND NOT a.attisdropped GROUP BY c.relname)r;
 IF actual IS DISTINCT FROM expected_columns THEN RAISE EXCEPTION 'Review listing columns'; END IF;
 SELECT coalesce(jsonb_object_agg(c.relname||'.'||t.tgname,jsonb_build_array(t.tgtype,t.tgenabled,md5(p.prosrc),p.prosecdef,p.proconfig,t.tgattr::text,t.tgnargs,t.tgqual::text,t.tgdeferrable,t.tginitdeferred)),'{}') INTO actual
 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname=ANY(sources) AND NOT t.tgisinternal;
 IF actual IS DISTINCT FROM expected_hooks THEN RAISE EXCEPTION 'Review listing hooks'; END IF;
 SELECT jsonb_object_agg(n.nspname||'.'||r.relname||'.'||k.conname,jsonb_build_array(np.nspname||'.'||p.relname,
 (SELECT jsonb_agg(a.attname ORDER BY x.o) FROM unnest(k.conkey)WITH ORDINALITY x(i,o)JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=x.i),
 (SELECT jsonb_agg(a.attname ORDER BY x.o) FROM unnest(k.confkey)WITH ORDINALITY x(i,o)JOIN pg_attribute a ON a.attrelid=k.confrelid AND a.attnum=x.i),k.confdeltype,k.confupdtype,k.convalidated,k.condeferrable,k.condeferred)) INTO actual
 FROM pg_constraint k JOIN pg_class r ON r.oid=k.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace JOIN pg_class p ON p.oid=k.confrelid JOIN pg_namespace np ON np.oid=p.relnamespace
 WHERE k.contype='f' AND ((n.nspname='public' AND r.relname=ANY(sources))OR(np.nspname='public' AND p.relname=ANY(sources)));
 IF actual IS DISTINCT FROM expected_fks THEN RAISE EXCEPTION 'Review listing parent and child relationships'; END IF;
 -- One embedding row per cache key bounds its deletion; payload math is never
 -- used by this component. No unknown embedding child or hook is accepted.
 IF (SELECT count(*) FROM pg_constraint WHERE conrelid='public.shopping_embeddings'::regclass AND contype='p' AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.shopping_embeddings'::regclass AND attname='listing_id')]::smallint[])<>1
 THEN RAISE EXCEPTION 'Review embedding identity'; END IF;
END $$;

ALTER TABLE public.asks DROP CONSTRAINT asks_seller_id_fkey,
 ADD CONSTRAINT asks_seller_id_fkey FOREIGN KEY(seller_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.ask_events DROP CONSTRAINT ask_events_actor_id_fkey,
 ADD CONSTRAINT ask_events_actor_id_fkey FOREIGN KEY(actor_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.checkout_shipping_quotes DROP CONSTRAINT checkout_shipping_quotes_buyer_id_fkey,DROP CONSTRAINT checkout_shipping_quotes_ask_id_fkey,
 ADD CONSTRAINT checkout_shipping_quotes_buyer_id_fkey FOREIGN KEY(buyer_id) REFERENCES auth.users(id) ON DELETE RESTRICT,
 ADD CONSTRAINT checkout_shipping_quotes_ask_id_fkey FOREIGN KEY(ask_id) REFERENCES public.asks(id) ON DELETE SET NULL;
-- Private provenance survives ordinary listing removal. No title, message or
-- visitor/device identifier is copied; only the actual account owner is kept.
CREATE TABLE public.account_deletion_native_cache_owners(
 listing_id text PRIMARY KEY REFERENCES public.shopping_inventory(listing_id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT
);
CREATE INDEX account_deletion_native_cache_user ON public.account_deletion_native_cache_owners(user_id,listing_id);
ALTER TABLE public.account_deletion_native_cache_owners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_native_cache_owners FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.account_deletion_native_cache_owners TO service_role;
CREATE INDEX account_deletion_listing_owner ON public.asks(seller_id,id);
CREATE INDEX account_deletion_listing_approver ON public.asks(approved_by,id);
CREATE INDEX account_deletion_listing_actor ON public.ask_events(actor_id,id);
CREATE INDEX account_deletion_quote_buyer ON public.checkout_shipping_quotes(buyer_id,id);
CREATE INDEX account_deletion_native_cache ON public.shopping_inventory((CASE WHEN listing_id~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN listing_id::uuid END));
CREATE FUNCTION public.account_deletion_listing_member_context(_user uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE context jsonb; BEGIN
 context:=nullif(current_setting('bluebird.listing_cleanup',true),'')::jsonb;
 IF context IS NULL OR context->>'user' IS DISTINCT FROM _user::text THEN RETURN false; END IF;
 RETURN public.account_deletion_lease_current((context->>'id')::uuid,_user,(context->>'lease')::uuid,'records') AND public.account_deletion_listing_barrier_current();
EXCEPTION WHEN OTHERS THEN RETURN false; END $$;
CREATE FUNCTION public.account_deletion_owned_listing_context(_listing uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$ SELECT coalesce((SELECT public.account_deletion_listing_member_context(seller_id) FROM public.asks WHERE id=_listing),false); $$;

CREATE OR REPLACE FUNCTION public.guard_account_deletion_inquiry_writer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$ DECLARE member uuid; BEGIN
 IF TG_OP='DELETE' THEN
  IF public.account_deletion_inquiry_context(OLD.buyer_id) THEN RETURN OLD; END IF;
  FOR member IN SELECT DISTINCT u FROM unnest(ARRAY[OLD.buyer_id,OLD.seller_id]) u WHERE u IS NOT NULL ORDER BY u LOOP PERFORM public.assert_member_private_record_writer(member); END LOOP;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
  OR NEW.buyer_name IS DISTINCT FROM OLD.buyer_name OR NEW.buyer_email IS DISTINCT FROM OLD.buyer_email
  OR NEW.message IS DISTINCT FROM OLD.message OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN RAISE EXCEPTION 'Inquiry authorship is immutable'; END IF;
  IF NEW.seller_id IS NULL AND OLD.seller_id IS NOT NULL AND NEW.listing_id IS NOT DISTINCT FROM OLD.listing_id
  AND NEW.status='closed' AND public.account_deletion_inquiry_context(OLD.seller_id) THEN RETURN NEW; END IF;
  -- SET NULL from a deleted Ask closes the inquiry, keeping the buyer's text.
  -- It is never permission to move an inquiry to a different listing.
  IF NEW.listing_id IS NULL AND OLD.listing_id IS NOT NULL AND NEW.seller_id IS NOT DISTINCT FROM OLD.seller_id
  AND (NOT EXISTS(SELECT 1 FROM public.asks WHERE id=OLD.listing_id) OR (OLD.seller_id IS NULL AND NEW.status='closed' AND public.account_deletion_owned_listing_context(OLD.listing_id))) THEN NEW.status:='closed'; RETURN NEW; END IF;
  IF NEW.listing_id IS DISTINCT FROM OLD.listing_id THEN RAISE EXCEPTION 'Inquiry listing is immutable'; END IF;
  IF NEW.seller_id IS DISTINCT FROM OLD.seller_id THEN
   IF public.account_deletion_inquiry_claim(OLD.listing_id,OLD.buyer_id,OLD.seller_id,NEW.seller_id) THEN RETURN NEW; END IF;
   RAISE EXCEPTION 'Inquiry seller is immutable';
  END IF;
 END IF;
 IF NEW.seller_id IS NULL OR NEW.listing_id IS NULL THEN RAISE EXCEPTION 'Inquiry is read-only'; END IF;
 FOR member IN SELECT DISTINCT u FROM unnest(ARRAY[NEW.buyer_id,NEW.seller_id]) u ORDER BY u LOOP PERFORM public.assert_member_private_record_writer(member); END LOOP;
 IF TG_OP='INSERT' AND (NEW.buyer_id=NEW.seller_id OR NOT EXISTS(SELECT 1 FROM public.asks WHERE id=NEW.listing_id AND seller_id=NEW.seller_id))
 THEN RAISE EXCEPTION 'Inquiry ownership is unavailable'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.account_deletion_inquiry_functions() RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_object_agg(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid))) FROM pg_proc p WHERE p.oid IN(
 'public.account_deletion_inquiry_context(uuid)'::regprocedure,'public.account_deletion_listing_member_context(uuid)'::regprocedure,'public.account_deletion_owned_listing_context(uuid)'::regprocedure,'public.account_deletion_inquiry_claim(uuid,uuid,uuid,uuid)'::regprocedure,
 'public.guard_account_deletion_inquiry_writer()'::regprocedure,'public.account_deletion_inquiry_catalog()'::regprocedure,
 'public.account_deletion_inquiry_remaining(uuid)'::regprocedure,'public.account_deletion_inquiry_scope(uuid,uuid,uuid,text)'::regprocedure,
 'public.purge_account_deletion_inquiries(uuid,uuid,uuid,integer)'::regprocedure,'public.verify_account_deletion_inquiries(uuid,uuid,uuid)'::regprocedure,
 'public.guard_account_deletion_inquiry_completion()'::regprocedure,'public.account_deletion_inquiry_functions()'::regprocedure,to_regprocedure('public.account_deletion_inquiry_barrier_current()'));
$$;

CREATE FUNCTION public.guard_account_deletion_listing_writer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE parent uuid; seller uuid; member uuid;
BEGIN
 IF TG_TABLE_NAME='asks' THEN
  IF TG_OP='DELETE' AND public.account_deletion_owned_listing_context(OLD.id) THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND public.account_deletion_owned_listing_context(OLD.id)
   AND NEW.id=OLD.id AND NEW.seller_id=OLD.seller_id AND NEW.status::text IN(OLD.status::text,'cancelled')
   AND (to_jsonb(NEW)-ARRAY['status','evidence_count','public_media_count','updated_at'])=(to_jsonb(OLD)-ARRAY['status','evidence_count','public_media_count','updated_at'])
   AND NEW.evidence_count=(SELECT count(*) FROM public.ask_media WHERE ask_id=OLD.id)
   AND NEW.public_media_count=(SELECT count(*) FROM public.listing_media WHERE ask_id=OLD.id) THEN RETURN NEW; END IF;
  IF TG_OP='DELETE' THEN PERFORM public.assert_member_private_record_writer(OLD.seller_id); RETURN OLD; END IF;
  FOR member IN SELECT DISTINCT u FROM unnest(CASE WHEN TG_OP='UPDATE' THEN ARRAY[OLD.seller_id,NEW.seller_id] ELSE ARRAY[NEW.seller_id] END)u ORDER BY u LOOP PERFORM public.assert_member_private_record_writer(member); END LOOP;
  IF NEW.approved_by IS NOT NULL AND (TG_OP='INSERT' OR NEW.approved_by IS DISTINCT FROM OLD.approved_by) THEN PERFORM public.assert_member_private_record_writer(NEW.approved_by); END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='checkout_shipping_quotes' AND TG_OP='UPDATE' THEN
  IF OLD.ask_id IS NOT NULL AND NEW.ask_id IS NULL AND (to_jsonb(NEW)-'ask_id')=(to_jsonb(OLD)-'ask_id')
  AND NOT EXISTS(SELECT 1 FROM public.asks WHERE id=OLD.ask_id) THEN RETURN NEW; END IF;
 END IF;
 IF TG_TABLE_NAME='ask_events' THEN
  IF TG_OP='UPDATE' AND OLD.actor_id IS NOT NULL AND NEW.actor_id IS NULL AND NEW.note IS NULL
  AND (to_jsonb(NEW)-ARRAY['actor_id','note'])=(to_jsonb(OLD)-ARRAY['actor_id','note'])
  AND public.account_deletion_listing_member_context(OLD.actor_id) THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.actor_id IS DISTINCT FROM OLD.actor_id THEN RAISE EXCEPTION 'Listing event authorship is immutable'; END IF;
 END IF;
 parent:=CASE WHEN TG_OP='DELETE' THEN coalesce(to_jsonb(OLD)->>'ask_id',to_jsonb(OLD)->>'listing_id')::uuid ELSE coalesce(to_jsonb(NEW)->>'ask_id',to_jsonb(NEW)->>'listing_id')::uuid END;
 IF TG_OP='UPDATE' AND coalesce(to_jsonb(NEW)->>'ask_id',to_jsonb(NEW)->>'listing_id') IS DISTINCT FROM coalesce(to_jsonb(OLD)->>'ask_id',to_jsonb(OLD)->>'listing_id') THEN RAISE EXCEPTION 'Listing parent is immutable'; END IF;
 IF TG_OP='DELETE' AND TG_TABLE_NAME<>'checkout_shipping_quotes' AND public.account_deletion_owned_listing_context(parent) THEN RETURN OLD; END IF;
 IF TG_TABLE_NAME='checkout_shipping_quotes' AND parent IS NULL THEN
  IF TG_OP='DELETE' THEN PERFORM public.assert_member_private_record_writer(OLD.buyer_id); RETURN OLD; END IF;
  PERFORM public.assert_member_private_record_writer(NEW.buyer_id);
  IF TG_OP='UPDATE' AND NEW.buyer_id IS DISTINCT FROM OLD.buyer_id THEN RAISE EXCEPTION 'Quote ownership is immutable'; END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='classified_listing_metrics' AND TG_OP<>'DELETE' THEN
  BEGIN
   SELECT seller_id INTO seller FROM public.asks WHERE id=parent;
   IF NOT FOUND THEN RETURN NULL; END IF;
   PERFORM public.assert_member_private_record_writer(seller);
   RETURN NEW;
  EXCEPTION WHEN OTHERS THEN RETURN NULL;
  END;
 END IF;
 SELECT seller_id INTO seller FROM public.asks WHERE id=parent;
 IF NOT FOUND THEN
  -- The owner-authorized ordinary parent DELETE has already happened. Its
  -- nonfinancial child cascades retain their existing behavior; job cleanup
  -- explicitly drains these children first and therefore counts no cascades.
  IF TG_OP='DELETE' AND TG_TABLE_NAME<>'checkout_shipping_quotes' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Listing is unavailable';
 END IF;
 PERFORM public.assert_member_private_record_writer(seller);
 IF TG_TABLE_NAME='ask_events' THEN
  IF TG_OP='DELETE' THEN member:=OLD.actor_id; ELSE member:=NEW.actor_id; END IF;
  IF member IS NOT NULL THEN PERFORM public.assert_member_private_record_writer(member); END IF;
 ELSIF TG_TABLE_NAME='checkout_shipping_quotes' THEN
  IF TG_OP='DELETE' THEN member:=OLD.buyer_id; ELSE member:=NEW.buyer_id; END IF;
  PERFORM public.assert_member_private_record_writer(member);
  IF TG_OP='UPDATE' AND NEW.buyer_id IS DISTINCT FROM OLD.buyer_id THEN RAISE EXCEPTION 'Quote ownership is immutable'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
DO $$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['asks','ask_events','listing_media','ask_media','classified_listing_details','classified_listing_metrics','checkout_shipping_quotes'] LOOP
  EXECUTE format('CREATE TRIGGER account_deletion_listing_writer BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_listing_writer()',relation);
 END LOOP;
END $$;

-- An in-flight refresh cannot reintroduce a deleting member's native card.
-- External/provider inventory is independent and retains its existing path.
CREATE FUNCTION public.guard_account_deletion_native_cache() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$ DECLARE owner uuid; BEGIN
 IF TG_OP='UPDATE' AND NEW.listing_id IS DISTINCT FROM OLD.listing_id THEN RAISE EXCEPTION 'Cache identity is immutable'; END IF;
 IF NEW.listing_id !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN RETURN NEW; END IF;
 SELECT a.seller_id INTO owner FROM public.asks a JOIN public.products p ON p.id=a.product_id
 WHERE a.id=NEW.listing_id::uuid AND a.status='active' AND a.approved_at IS NOT NULL AND a.expires_at>clock_timestamp() AND NOT a.is_demo AND p.status='published' FOR KEY SHARE OF a;
 IF NOT FOUND THEN RETURN NULL; END IF;
 PERFORM public.assert_member_private_record_writer(owner);
 IF TG_TABLE_NAME='shopping_inventory' THEN
  IF NEW.card->>'id' IS DISTINCT FROM NEW.listing_id THEN RETURN NULL; END IF;
 END IF;
 RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;
CREATE TRIGGER account_deletion_native_cache BEFORE INSERT OR UPDATE ON public.shopping_inventory FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_native_cache();
CREATE TRIGGER account_deletion_native_embedding BEFORE INSERT OR UPDATE ON public.shopping_embeddings FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_native_cache();
CREATE FUNCTION public.record_account_deletion_native_cache_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$ DECLARE owner uuid; BEGIN
 IF NEW.listing_id !~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN RETURN NEW; END IF;
 SELECT seller_id INTO owner FROM public.asks WHERE id=NEW.listing_id::uuid FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Native cache parent is unavailable'; END IF;
 PERFORM public.assert_member_private_record_writer(owner);
 INSERT INTO public.account_deletion_native_cache_owners(listing_id,user_id) VALUES(NEW.listing_id,owner)
 ON CONFLICT(listing_id) DO UPDATE SET user_id=excluded.user_id WHERE account_deletion_native_cache_owners.user_id IS DISTINCT FROM excluded.user_id;
 RETURN NEW;
END $$;
CREATE TRIGGER account_deletion_native_cache_owner AFTER INSERT OR UPDATE ON public.shopping_inventory FOR EACH ROW EXECUTE FUNCTION public.record_account_deletion_native_cache_owner();
CREATE FUNCTION public.account_deletion_native_cache_ready() RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT NOT EXISTS(SELECT 1 FROM public.shopping_inventory i LEFT JOIN public.account_deletion_native_cache_owners o USING(listing_id)
 WHERE i.listing_id~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' AND o.listing_id IS NULL);
$$;
-- One bounded, worker-disabled preparation pass. Existing native cards get
-- exact ownership from their live parent; already unavailable cards are pruned.
-- This never touches a listing, account, provider object or external feed.
CREATE FUNCTION public.prepare_account_deletion_native_cache(_limit integer DEFAULT 100) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE target record; owner uuid; affected integer; changed integer:=0; BEGIN
 IF _limit IS NULL OR _limit NOT BETWEEN 3 AND 100 OR auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Native cache preparation unavailable'; END IF;
 PERFORM 1 FROM public.account_deletion_controls WHERE id AND NOT worker_enabled FOR SHARE;
 IF NOT FOUND OR NOT public.account_deletion_listing_barrier_current() THEN RAISE EXCEPTION 'Review disabled native cache preparation'; END IF;
 LOCK TABLE public.shopping_inventory,public.shopping_embeddings,public.account_deletion_native_cache_owners IN ROW EXCLUSIVE MODE;
 FOR target IN SELECT i.listing_id FROM public.shopping_inventory i LEFT JOIN public.account_deletion_native_cache_owners o USING(listing_id)
 WHERE i.listing_id~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' AND o.listing_id IS NULL ORDER BY i.listing_id LIMIT (_limit/2) FOR UPDATE OF i LOOP
  SELECT seller_id INTO owner FROM public.asks WHERE id=target.listing_id::uuid FOR KEY SHARE;
  IF FOUND THEN
   INSERT INTO public.account_deletion_native_cache_owners(listing_id,user_id) VALUES(target.listing_id,owner) ON CONFLICT DO NOTHING;
   GET DIAGNOSTICS affected=ROW_COUNT; changed:=changed+affected;
  ELSE
   DELETE FROM public.shopping_embeddings WHERE listing_id=target.listing_id; GET DIAGNOSTICS affected=ROW_COUNT; changed:=changed+affected;
   DELETE FROM public.shopping_inventory WHERE listing_id=target.listing_id; GET DIAGNOSTICS affected=ROW_COUNT; changed:=changed+affected;
  END IF;
 END LOOP;
 IF NOT public.account_deletion_listing_barrier_current() THEN RAISE EXCEPTION 'Native cache preparation requires review'; END IF;
 RETURN jsonb_build_object('changed',changed,'ready',public.account_deletion_native_cache_ready());
END $$;
CREATE FUNCTION public.guard_account_deletion_listing_activation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NEW.worker_enabled AND (NOT public.account_deletion_listing_barrier_current() OR NOT public.account_deletion_native_cache_ready()) THEN RAISE EXCEPTION 'Finish native cache provenance before activation'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_account_deletion_listing_activation BEFORE UPDATE OF worker_enabled ON public.account_deletion_controls FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_listing_activation();
CREATE FUNCTION public.guard_account_deletion_thumbnail_cache() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$ DECLARE owner text; BEGIN
 IF TG_OP='UPDATE' AND NEW.path IS DISTINCT FROM OLD.path THEN RAISE EXCEPTION 'Cache identity is immutable'; END IF;
 owner:=split_part(NEW.path,'/',1);
 IF owner~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN PERFORM public.assert_member_private_record_writer(owner::uuid); END IF;
 RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;
CREATE TRIGGER account_deletion_thumbnail_cache BEFORE INSERT OR UPDATE ON public.listing_thumbnail_links FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_thumbnail_cache();

CREATE FUNCTION public.account_deletion_listing_retention(_listing uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.asks WHERE id=_listing AND (dealer_id IS NOT NULL OR status='matched' OR matched_order_id IS NOT NULL))
 OR EXISTS(SELECT 1 FROM public.orders WHERE ask_id=_listing)
 OR EXISTS(SELECT 1 FROM public.checkout_shipping_quotes WHERE ask_id=_listing)
 OR EXISTS(SELECT 1 FROM public.listing_offers WHERE ask_id=_listing)
 OR EXISTS(SELECT 1 FROM public.market_matches WHERE ask_id=_listing)
 OR EXISTS(SELECT 1 FROM public.listing_upgrade_purchases WHERE listing_id=_listing)
 OR EXISTS(SELECT 1 FROM public.classified_listing_reports WHERE listing_id=_listing)
 OR EXISTS(SELECT 1 FROM public.dealer_inventory_listing_links WHERE listing_id=_listing)
 OR EXISTS(SELECT 1 FROM public.fb_marketplace_import_items WHERE listing_id=_listing)
 OR EXISTS(SELECT 1 FROM public.seller_listing_requests WHERE converted_ask_id=_listing);
$$;
CREATE FUNCTION public.account_deletion_listing_media_ready(_id uuid,_source text,_key text,_bucket text,_value text) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.account_deletion_media_observations o JOIN public.account_deletion_inventory_runs r ON r.job_id=o.job_id
 JOIN public.account_deletion_inventory_cursors c ON c.job_id=o.job_id AND c.source=o.source AND c.done
 WHERE o.job_id=_id AND o.source=_source AND o.record_key=_key AND o.last_generation=r.generation
 AND o.snapshot->'reference'->>'state'='resolved' AND o.snapshot->'reference'=public.account_deletion_media_reference(_bucket,_value));
$$;
CREATE FUNCTION public.account_deletion_listing_remaining(_user uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.asks WHERE seller_id=_user OR approved_by=_user)
 OR EXISTS(SELECT 1 FROM public.ask_events WHERE actor_id=_user)
 OR EXISTS(SELECT 1 FROM public.checkout_shipping_quotes WHERE buyer_id=_user)
 OR EXISTS(SELECT 1 FROM public.account_deletion_native_cache_owners WHERE user_id=_user)
 OR EXISTS(SELECT 1 FROM public.listing_thumbnail_links WHERE path LIKE _user::text||'/%');
$$;
CREATE FUNCTION public.account_deletion_listing_catalog() RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 WITH sources AS(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY(ARRAY['asks','ask_events','listing_media','ask_media','classified_listing_details','classified_listing_metrics','listing_thumbnail_links','checkout_shipping_quotes','shopping_inventory','shopping_embeddings','account_deletion_native_cache_owners','account_deletion_controls']))
 SELECT jsonb_build_object(
 'relations',(SELECT jsonb_agg(jsonb_build_array(oid::regclass::text,relkind,relispartition,relrowsecurity) ORDER BY oid) FROM pg_class WHERE oid IN(SELECT oid FROM sources)),
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attrelid::regclass::text,a.attname,a.atttypid::regtype::text,a.atttypmod,a.attnotnull,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid IN(SELECT oid FROM sources) AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conrelid::regclass::text,conname,pg_get_constraintdef(oid,true),convalidated,condeferrable,condeferred) ORDER BY conrelid,conname) FROM pg_constraint WHERE conrelid IN(SELECT oid FROM sources) OR confrelid IN(SELECT oid FROM sources)),
 'hooks',(SELECT jsonb_object_agg(tgrelid::regclass::text||'.'||tgname,jsonb_build_array(pg_get_triggerdef(oid,true),md5(pg_get_functiondef(tgfoid)),tgenabled)) FROM pg_trigger WHERE tgrelid IN(SELECT oid FROM sources) AND NOT tgisinternal),
 'indexes',(SELECT jsonb_agg(pg_get_indexdef(indexrelid) ORDER BY indexrelid) FROM pg_index WHERE indrelid IN(SELECT oid FROM sources)),
 'policies',(SELECT jsonb_agg(jsonb_build_array(polrelid::regclass::text,polname,polcmd,polpermissive,polroles::text,pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid)) ORDER BY polrelid,polname) FROM pg_policy WHERE polrelid IN(SELECT oid FROM sources)),
 'rules',(SELECT coalesce(jsonb_agg(pg_get_ruledef(oid,true) ORDER BY oid),'[]') FROM pg_rewrite WHERE ev_class IN(SELECT oid FROM sources)),
 'inheritance',(SELECT count(*) FROM pg_inherits WHERE inhparent IN(SELECT oid FROM sources) OR inhrelid IN(SELECT oid FROM sources)));
$$;
CREATE TABLE public.account_deletion_listing_contract(id boolean PRIMARY KEY DEFAULT true CHECK(id),catalog jsonb NOT NULL,functions jsonb NOT NULL);
ALTER TABLE public.account_deletion_listing_contract ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_listing_contract FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.account_deletion_listing_contract TO service_role;
CREATE FUNCTION public.account_deletion_listing_scope(_id uuid,_user uuid,_lease uuid,_phase text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$ BEGIN
 PERFORM public.account_deletion_application_scope(_id,_user,_lease,_phase);
 IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Listing erasure requires a background identity'; END IF;
 LOCK TABLE public.asks,public.ask_events,public.listing_media,public.ask_media,public.classified_listing_details,public.classified_listing_metrics,public.listing_thumbnail_links,public.checkout_shipping_quotes,public.shopping_inventory,public.shopping_embeddings,public.account_deletion_native_cache_owners IN ROW EXCLUSIVE MODE;
 IF NOT public.account_deletion_listing_barrier_current() OR NOT public.account_deletion_native_cache_ready() THEN RAISE EXCEPTION 'Listing erasure requires schema and provenance review'; END IF;
 IF _phase='records' THEN
  PERFORM 1 FROM auth.users WHERE id=_user FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Listing identity is unavailable'; END IF;
  IF public.account_deletion_conversation_remaining(_user) OR public.account_deletion_inquiry_remaining(_user) OR public.account_deletion_application_remaining(_user)
  THEN RAISE EXCEPTION 'Complete shared contribution cleanup before listing erasure'; END IF;
 END IF;
END $$;
CREATE FUNCTION public.purge_account_deletion_listings(_id uuid,_user uuid,_lease uuid,_limit integer DEFAULT 100) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE changed integer:=0; affected integer; ids uuid[]; paths text[]; cache_ids text[]; selected text; listing public.asks; media record; source text;
 previous_context text:=coalesce(current_setting('bluebird.listing_cleanup',true),''); previous_trust text:=coalesce(current_setting('parkvault.trusted_operation',true),'');
BEGIN
 IF _limit IS NULL OR _limit NOT BETWEEN 3 AND 100 THEN RAISE EXCEPTION 'Listing erasure unavailable'; END IF;
 PERFORM public.account_deletion_listing_scope(_id,_user,_lease,'records');
 IF EXISTS(SELECT 1 FROM public.asks WHERE approved_by=_user) THEN RAISE EXCEPTION 'Listing moderation retention requires explicit handling'; END IF;
 PERFORM set_config('bluebird.listing_cleanup',jsonb_build_object('id',_id,'user',_user,'lease',_lease)::text,true);
 PERFORM set_config('parkvault.trusted_operation','on',true);
 IF EXISTS(SELECT 1 FROM public.checkout_shipping_quotes WHERE buyer_id=_user) THEN RAISE EXCEPTION 'Checkout financial retention requires explicit handling'; END IF;
 IF changed=0 THEN
  SELECT array_agg(id) INTO ids FROM(SELECT id FROM public.ask_events WHERE actor_id=_user AND NOT EXISTS(SELECT 1 FROM public.asks WHERE id=ask_id AND seller_id=_user) ORDER BY id LIMIT _limit FOR UPDATE)targets;
  IF ids IS NOT NULL THEN
   IF EXISTS(SELECT 1 FROM public.ask_events WHERE id=ANY(ids) AND public.account_deletion_listing_retention(ask_id)) THEN RAISE EXCEPTION 'Listing audit retention requires explicit handling'; END IF;
   UPDATE public.ask_events SET actor_id=NULL,note=NULL WHERE id=ANY(ids) AND actor_id=_user; GET DIAGNOSTICS changed=ROW_COUNT; selected:='events';
  END IF;
 END IF;
 IF changed=0 THEN
  SELECT array_agg(path) INTO paths FROM(SELECT path FROM public.listing_thumbnail_links WHERE path LIKE _user::text||'/%' ORDER BY path LIMIT _limit FOR UPDATE)targets;
  IF paths IS NOT NULL THEN DELETE FROM public.listing_thumbnail_links WHERE path=ANY(paths); GET DIAGNOSTICS changed=ROW_COUNT; selected:='thumbnails'; END IF;
 END IF;
 IF changed=0 THEN
  SELECT array_agg(listing_id) INTO cache_ids FROM(SELECT i.listing_id FROM public.shopping_inventory i JOIN public.account_deletion_native_cache_owners o USING(listing_id) WHERE o.user_id=_user ORDER BY i.listing_id LIMIT (_limit/3) FOR UPDATE OF i)targets;
  IF cache_ids IS NOT NULL THEN
   DELETE FROM public.shopping_embeddings WHERE listing_id=ANY(cache_ids); GET DIAGNOSTICS changed=ROW_COUNT;
   DELETE FROM public.account_deletion_native_cache_owners WHERE listing_id=ANY(cache_ids); GET DIAGNOSTICS affected=ROW_COUNT; changed:=changed+affected;
   DELETE FROM public.shopping_inventory WHERE listing_id=ANY(cache_ids); GET DIAGNOSTICS affected=ROW_COUNT; changed:=changed+affected; selected:='inventory';
  END IF;
 END IF;
 IF changed=0 THEN
  SELECT * INTO listing FROM public.asks WHERE seller_id=_user ORDER BY id LIMIT 1 FOR UPDATE;
  IF FOUND THEN
   IF public.account_deletion_listing_retention(listing.id) THEN RAISE EXCEPTION 'Listing retention requires explicit handling'; END IF;
   IF listing.status<>'cancelled' OR listing.evidence_count<>(SELECT count(*) FROM public.ask_media WHERE ask_id=listing.id) OR listing.public_media_count<>(SELECT count(*) FROM public.listing_media WHERE ask_id=listing.id) THEN
    UPDATE public.asks SET status='cancelled',evidence_count=(SELECT count(*) FROM public.ask_media WHERE ask_id=listing.id),public_media_count=(SELECT count(*) FROM public.listing_media WHERE ask_id=listing.id) WHERE id=listing.id AND seller_id=_user;
    GET DIAGNOSTICS changed=ROW_COUNT; selected:='paused';
   ELSE
    FOREACH source IN ARRAY ARRAY['listing_media','ask_media'] LOOP
     IF changed=0 THEN
      EXECUTE format('SELECT id,storage_path FROM public.%I WHERE ask_id=$1 ORDER BY id LIMIT 1 FOR UPDATE',source)INTO media USING listing.id;
      IF media.id IS NOT NULL THEN
       IF NOT public.account_deletion_listing_media_ready(_id,source,media.id::text,CASE WHEN source='listing_media' THEN 'listing-media' ELSE 'ask-evidence' END,media.storage_path) THEN RAISE EXCEPTION 'Listing media inventory is incomplete'; END IF;
       IF source='listing_media' THEN DELETE FROM public.listing_thumbnail_links WHERE path=media.storage_path; GET DIAGNOSTICS affected=ROW_COUNT; changed:=changed+affected; END IF;
       EXECUTE format('DELETE FROM public.%I WHERE id=$1 AND ask_id=$2',source)USING media.id,listing.id;
       GET DIAGNOSTICS affected=ROW_COUNT; changed:=changed+affected+1; -- one real parent counter update
       selected:=CASE WHEN source='listing_media' THEN 'media' ELSE 'evidence' END;
      END IF;
     END IF;
    END LOOP;
    IF changed=0 THEN
     SELECT array_agg(e.listing_id) INTO cache_ids FROM(SELECT i.listing_id FROM public.shopping_inventory i WHERE (CASE WHEN i.listing_id~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN i.listing_id::uuid END)=listing.id ORDER BY i.listing_id LIMIT _limit FOR UPDATE)i JOIN public.shopping_embeddings e USING(listing_id);
     IF cache_ids IS NOT NULL THEN DELETE FROM public.shopping_embeddings WHERE listing_id=ANY(cache_ids); GET DIAGNOSTICS changed=ROW_COUNT; selected:='embeddings'; END IF;
    END IF;
    IF changed=0 THEN
     SELECT array_agg(listing_id) INTO cache_ids FROM(SELECT listing_id FROM public.shopping_inventory WHERE (CASE WHEN listing_id~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN listing_id::uuid END)=listing.id ORDER BY listing_id LIMIT (_limit/3) FOR UPDATE)targets;
     IF cache_ids IS NOT NULL THEN
      DELETE FROM public.shopping_embeddings WHERE listing_id=ANY(cache_ids); GET DIAGNOSTICS changed=ROW_COUNT;
      DELETE FROM public.account_deletion_native_cache_owners WHERE listing_id=ANY(cache_ids); GET DIAGNOSTICS affected=ROW_COUNT; changed:=changed+affected;
      DELETE FROM public.shopping_inventory WHERE listing_id=ANY(cache_ids); GET DIAGNOSTICS affected=ROW_COUNT; changed:=changed+affected; selected:='inventory';
      -- An embedding arriving concurrently is protected by the locked cache
      -- parent. No new native card can arrive after member withdrawal.
     END IF;
    END IF;
    IF changed=0 THEN
     SELECT array_agg(id) INTO ids FROM(SELECT id FROM public.listing_inquiries WHERE listing_id=listing.id ORDER BY id LIMIT _limit FOR UPDATE)targets;
     IF ids IS NOT NULL THEN UPDATE public.listing_inquiries SET listing_id=NULL,status='closed' WHERE id=ANY(ids); GET DIAGNOSTICS changed=ROW_COUNT; selected:='inquiries'; END IF;
    END IF;
    IF changed=0 THEN
     SELECT array_agg(id) INTO ids FROM(SELECT id FROM public.conversations WHERE listing_id=listing.id ORDER BY id LIMIT _limit FOR UPDATE)targets;
     IF ids IS NOT NULL THEN
      IF EXISTS(SELECT 1 FROM public.conversations WHERE id=ANY(ids) AND buyer_id IS NOT NULL AND seller_id IS NOT NULL) THEN RAISE EXCEPTION 'Shared listing history requires review'; END IF;
      UPDATE public.conversations SET listing_id=NULL WHERE id=ANY(ids); GET DIAGNOSTICS changed=ROW_COUNT; selected:='conversations';
     END IF;
    END IF;
    FOREACH source IN ARRAY ARRAY['saved_search_matches','ask_events','classified_listing_details','classified_listing_metrics'] LOOP
     IF changed=0 THEN
      IF source IN('classified_listing_details','classified_listing_metrics') THEN
       EXECUTE format('DELETE FROM public.%I WHERE listing_id=$1',source)USING listing.id;
      ELSE
       EXECUTE format('WITH targets AS MATERIALIZED(SELECT id FROM public.%I WHERE %I=$1 ORDER BY id LIMIT $2 FOR UPDATE)DELETE FROM public.%I r USING targets t WHERE r.id=t.id',source,CASE WHEN source='saved_search_matches' THEN 'listing_id' ELSE 'ask_id' END,source)USING listing.id,_limit;
      END IF;
      GET DIAGNOSTICS changed=ROW_COUNT;
      IF changed>0 THEN selected:=CASE WHEN source='saved_search_matches' THEN 'matches' WHEN source='ask_events' THEN 'events' WHEN source='classified_listing_details' THEN 'details' ELSE 'metrics' END; END IF;
     END IF;
    END LOOP;
    IF changed=0 THEN
     IF EXISTS(SELECT 1 FROM public.job_applications WHERE listing_id=listing.id) OR public.account_deletion_listing_retention(listing.id) THEN RAISE EXCEPTION 'Listing relationships require explicit handling'; END IF;
     DELETE FROM public.asks WHERE id=listing.id AND seller_id=_user; GET DIAGNOSTICS changed=ROW_COUNT; selected:='listings';
    END IF;
   END IF;
  END IF;
 END IF;
 PERFORM set_config('bluebird.listing_cleanup',previous_context,true); PERFORM set_config('parkvault.trusted_operation',previous_trust,true);
 IF NOT public.account_deletion_lease_current(_id,_user,_lease,'records') OR NOT public.account_deletion_listing_barrier_current()
 OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Listing erasure unavailable'; END IF;
 IF changed=0 AND public.account_deletion_listing_remaining(_user) THEN RAISE EXCEPTION 'Listing retention requires explicit handling'; END IF;
 RETURN jsonb_build_object('source',selected,'changed',changed,'pass_done',NOT public.account_deletion_listing_remaining(_user));
EXCEPTION WHEN OTHERS THEN PERFORM set_config('bluebird.listing_cleanup',previous_context,true); PERFORM set_config('parkvault.trusted_operation',previous_trust,true); RAISE;
END $$;
CREATE FUNCTION public.verify_account_deletion_listings(_id uuid,_user uuid,_lease uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$ BEGIN
 PERFORM public.account_deletion_listing_scope(_id,_user,_lease,'verification');
 RETURN NOT public.account_deletion_listing_remaining(_user) AND public.account_deletion_lease_current(_id,_user,_lease,'verification');
END $$;
CREATE FUNCTION public.guard_account_deletion_listing_completion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NEW.status='completed' AND (NOT public.account_deletion_listing_barrier_current() OR public.account_deletion_listing_remaining(OLD.user_id)) THEN RAISE EXCEPTION 'Listing erasure verification required'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER guard_account_deletion_listing_completion AFTER UPDATE OF status,user_id ON public.account_deletion_jobs FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_listing_completion();
CREATE FUNCTION public.account_deletion_listing_functions() RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_object_agg(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid))) FROM pg_proc p WHERE p.oid IN(
 'public.account_deletion_listing_member_context(uuid)'::regprocedure,'public.account_deletion_owned_listing_context(uuid)'::regprocedure,'public.guard_account_deletion_listing_writer()'::regprocedure,
 'public.guard_account_deletion_native_cache()'::regprocedure,'public.record_account_deletion_native_cache_owner()'::regprocedure,'public.account_deletion_native_cache_ready()'::regprocedure,'public.prepare_account_deletion_native_cache(integer)'::regprocedure,'public.guard_account_deletion_listing_activation()'::regprocedure,'public.guard_account_deletion_thumbnail_cache()'::regprocedure,'public.account_deletion_listing_retention(uuid)'::regprocedure,
 'public.account_deletion_listing_media_ready(uuid,text,text,text,text)'::regprocedure,'public.account_deletion_listing_remaining(uuid)'::regprocedure,'public.account_deletion_listing_catalog()'::regprocedure,
 'public.account_deletion_listing_scope(uuid,uuid,uuid,text)'::regprocedure,'public.purge_account_deletion_listings(uuid,uuid,uuid,integer)'::regprocedure,'public.verify_account_deletion_listings(uuid,uuid,uuid)'::regprocedure,
 'public.guard_account_deletion_listing_completion()'::regprocedure,'public.account_deletion_listing_functions()'::regprocedure,to_regprocedure('public.account_deletion_listing_barrier_current()'));
$$;
CREATE FUNCTION public.account_deletion_listing_barrier_current() RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.account_deletion_listing_contract WHERE id AND catalog=public.account_deletion_listing_catalog() AND functions=public.account_deletion_listing_functions()); $$;
-- Explicitly compose only the reviewed new hooks/helpers after all old contracts
-- passed. No general-purpose contract refresh or permission bypass is exposed.
REVOKE ALL ON FUNCTION public.account_deletion_listing_member_context(uuid),public.account_deletion_owned_listing_context(uuid),public.guard_account_deletion_listing_writer(),public.guard_account_deletion_native_cache(),public.record_account_deletion_native_cache_owner(),public.account_deletion_native_cache_ready(),public.prepare_account_deletion_native_cache(integer),public.guard_account_deletion_listing_activation(),public.guard_account_deletion_thumbnail_cache(),public.account_deletion_listing_retention(uuid),public.account_deletion_listing_media_ready(uuid,text,text,text,text),public.account_deletion_listing_remaining(uuid),public.account_deletion_listing_catalog(),public.account_deletion_listing_scope(uuid,uuid,uuid,text),public.purge_account_deletion_listings(uuid,uuid,uuid,integer),public.verify_account_deletion_listings(uuid,uuid,uuid),public.guard_account_deletion_listing_completion(),public.account_deletion_listing_functions(),public.account_deletion_listing_barrier_current() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.purge_account_deletion_listings(uuid,uuid,uuid,integer),public.verify_account_deletion_listings(uuid,uuid,uuid),public.prepare_account_deletion_native_cache(integer) TO service_role;
SELECT public.protect_account_access_boundaries();
UPDATE public.account_deletion_private_contract SET hooks=public.account_deletion_private_hooks() WHERE id;
UPDATE public.account_deletion_inquiry_contract SET catalog=public.account_deletion_inquiry_catalog(),functions=public.account_deletion_inquiry_functions() WHERE id;
INSERT INTO public.account_deletion_listing_contract SELECT true,public.account_deletion_listing_catalog(),public.account_deletion_listing_functions();
DO $$ BEGIN
 IF NOT public.account_deletion_listing_barrier_current() OR NOT public.account_deletion_application_barrier_current() OR NOT public.account_deletion_inquiry_barrier_current() OR NOT public.account_deletion_profile_barrier_current() OR NOT public.account_deletion_private_barrier_current()
 THEN RAISE EXCEPTION 'Listing erasure boundaries require review'; END IF;
END $$;
COMMIT;
