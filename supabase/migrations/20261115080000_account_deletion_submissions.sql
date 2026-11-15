-- Source-only private submission cleanup. Run before owned listing/catalog
-- cleanup; no provider erasure, Auth removal or worker activation authority.
BEGIN;SET LOCAL search_path='';SET LOCAL lock_timeout='5s';
DO $$ DECLARE expected_columns jsonb:=$columns${"product_suggestion_media":{"id":["uuid",true,"gen_random_uuid()",""],"suggestion_id":["uuid",true,null,""],"storage_path":["text",true,null,""],"caption":["text",false,null,""],"position":["integer",true,"0",""],"created_at":["timestamp with time zone",true,"now()",""]},"product_suggestions":{"id":["uuid",true,"gen_random_uuid()",""],"submitted_by":["uuid",true,null,""],"name":["text",true,null,""],"brand_text":["text",false,null,""],"collection_text":["text",false,null,""],"category_id":["uuid",false,null,""],"resort_codes":["text[]",true,"'{}'::text[]",""],"release_notes":["text",false,null,""],"proposed_variations":["text",false,null,""],"status":["suggestion_status",true,"'submitted'::suggestion_status",""],"reviewer_id":["uuid",false,null,""],"reviewer_note":["text",false,null,""],"merged_product_id":["uuid",false,null,""],"created_product_id":["uuid",false,null,""],"reviewed_at":["timestamp with time zone",false,null,""],"created_at":["timestamp with time zone",true,"now()",""],"updated_at":["timestamp with time zone",true,"now()",""]},"seller_listing_requests":{"id":["uuid",true,"gen_random_uuid()",""],"suggestion_id":["uuid",true,null,""],"seller_id":["uuid",true,null,""],"price_cents":["integer",true,null,""],"currency":["character(3)",true,"'USD'::bpchar",""],"item_condition":["item_condition",true,null,""],"seller_note":["text",false,null,""],"parcel_length_in":["numeric",false,null,""],"parcel_width_in":["numeric",false,null,""],"parcel_height_in":["numeric",false,null,""],"parcel_weight_lb":["numeric",false,null,""],"evidence_paths":["text[]",true,null,""],"public_media_paths":["text[]",true,null,""],"status":["text",true,"'pending'::text",""],"converted_ask_id":["uuid",false,null,""],"created_at":["timestamp with time zone",true,"now()",""],"updated_at":["timestamp with time zone",true,"now()",""]}}$columns$::jsonb;
 expected_constraints jsonb:=$constraints${"product_suggestion_media.product_suggestion_media_pkey":"PRIMARY KEY (id)","product_suggestion_media.product_suggestion_media_suggestion_id_fkey":"FOREIGN KEY (suggestion_id) REFERENCES product_suggestions(id) ON DELETE CASCADE","product_suggestions.merged_requires_target":"CHECK (status <> 'merged_duplicate'::suggestion_status OR merged_product_id IS NOT NULL)","product_suggestions.product_suggestions_category_id_fkey":"FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL","product_suggestions.product_suggestions_created_product_id_fkey":"FOREIGN KEY (created_product_id) REFERENCES products(id) ON DELETE SET NULL","product_suggestions.product_suggestions_merged_product_id_fkey":"FOREIGN KEY (merged_product_id) REFERENCES products(id) ON DELETE SET NULL","product_suggestions.product_suggestions_name_check":"CHECK (length(btrim(name)) >= 2 AND length(btrim(name)) <= 160)","product_suggestions.product_suggestions_pkey":"PRIMARY KEY (id)","product_suggestions.product_suggestions_reviewer_id_fkey":"FOREIGN KEY (reviewer_id) REFERENCES auth.users(id) ON DELETE SET NULL","product_suggestions.product_suggestions_submitted_by_fkey":"FOREIGN KEY (submitted_by) REFERENCES auth.users(id) ON DELETE CASCADE","product_suggestions.reviewed_requires_reviewer":"CHECK ((status = ANY (ARRAY['submitted'::suggestion_status, 'in_review'::suggestion_status])) OR reviewer_id IS NOT NULL)","seller_listing_requests.seller_listing_requests_suggestion_id_fkey":"FOREIGN KEY (suggestion_id) REFERENCES product_suggestions(id) ON DELETE CASCADE","seller_listing_requests.seller_listing_requests_converted_ask_id_fkey":"FOREIGN KEY (converted_ask_id) REFERENCES asks(id) ON DELETE SET NULL","seller_listing_requests.seller_listing_requests_evidence_paths_check":"CHECK (cardinality(evidence_paths) >= 1 AND cardinality(evidence_paths) <= 8)","seller_listing_requests.seller_listing_requests_parcel_height_in_check":"CHECK (parcel_height_in IS NULL OR parcel_height_in > 0::numeric)","seller_listing_requests.seller_listing_requests_parcel_length_in_check":"CHECK (parcel_length_in IS NULL OR parcel_length_in > 0::numeric)","seller_listing_requests.seller_listing_requests_parcel_weight_lb_check":"CHECK (parcel_weight_lb IS NULL OR parcel_weight_lb > 0::numeric)","seller_listing_requests.seller_listing_requests_parcel_width_in_check":"CHECK (parcel_width_in IS NULL OR parcel_width_in > 0::numeric)","seller_listing_requests.seller_listing_requests_pkey":"PRIMARY KEY (id)","seller_listing_requests.seller_listing_requests_price_cents_check":"CHECK (price_cents >= 100 AND price_cents <= 5000000)","seller_listing_requests.seller_listing_requests_public_media_paths_check":"CHECK (cardinality(public_media_paths) >= 1 AND cardinality(public_media_paths) <= 8)","seller_listing_requests.seller_listing_requests_seller_id_fkey":"FOREIGN KEY (seller_id) REFERENCES auth.users(id) ON DELETE CASCADE","seller_listing_requests.seller_listing_requests_seller_note_check":"CHECK (seller_note IS NULL OR length(seller_note) <= 500)","seller_listing_requests.seller_listing_requests_status_check":"CHECK (status = ANY (ARRAY['pending'::text, 'converted'::text, 'rejected'::text]))","seller_listing_requests.seller_listing_requests_suggestion_id_key":"UNIQUE (suggestion_id)"}$constraints$::jsonb;
 expected_hooks jsonb:=$hooks${"product_suggestion_media.guard_member_photo_reference":["CREATE TRIGGER guard_member_photo_reference BEFORE INSERT OR UPDATE OF storage_path, suggestion_id ON product_suggestion_media FOR EACH ROW EXECUTE FUNCTION guard_member_photo_reference()","634d442cb95409d34b468e10b31c9300",true,["search_path=\"\""],"O"],"product_suggestions.product_suggestion_convert_held_listing":["CREATE TRIGGER product_suggestion_convert_held_listing AFTER UPDATE OF status, created_product_id ON product_suggestions FOR EACH ROW EXECUTE FUNCTION convert_approved_missing_listing()","6fae92aeae63bea6d9ba09c528eb6867",true,["search_path=public, pg_temp"],"O"],"product_suggestions.trg_product_suggestions_touch":["CREATE TRIGGER trg_product_suggestions_touch BEFORE UPDATE ON product_suggestions FOR EACH ROW EXECUTE FUNCTION touch_updated_at()","9baf00d43cdeb2cd0e55c1de045be21b",false,["search_path=public"],"O"]}$hooks$::jsonb;
 sources text[]:=ARRAY['product_suggestions','product_suggestion_media','seller_listing_requests'];target text;actual jsonb;
BEGIN
 PERFORM 1 FROM public.account_deletion_controls WHERE id AND NOT worker_enabled FOR SHARE;
 IF NOT FOUND OR NOT public.account_deletion_private_barrier_current()OR NOT public.account_deletion_catalog_barrier_current()OR NOT public.account_deletion_listing_barrier_current()
 OR public.account_access_coverage()IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)THEN RAISE EXCEPTION 'Review disabled submission prerequisites';END IF;
 FOREACH target IN ARRAY sources LOOP
  EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE',target);
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=format('public.%I',target)::regclass AND relkind='r'AND NOT relispartition)
   OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhparent=format('public.%I',target)::regclass OR inhrelid=format('public.%I',target)::regclass)
   OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class=format('public.%I',target)::regclass)THEN RAISE EXCEPTION 'Review submission layout';END IF;
 END LOOP;
 SELECT jsonb_object_agg(relname,cols)INTO actual FROM(SELECT c.relname,jsonb_object_agg(a.attname,jsonb_build_array(replace(format_type(a.atttypid,a.atttypmod),'public.',''),a.attnotnull,replace(pg_get_expr(d.adbin,d.adrelid),'public.',''),a.attgenerated))cols
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE n.nspname='public'AND c.relname=ANY(sources)AND a.attnum>0 AND NOT a.attisdropped GROUP BY c.relname)r;
 IF actual IS DISTINCT FROM expected_columns THEN RAISE EXCEPTION 'Review submission columns';END IF;
 SELECT jsonb_object_agg(replace(conrelid::regclass::text,'public.','')||'.'||conname,replace(pg_get_constraintdef(oid,true),'public.',''))INTO actual FROM pg_constraint WHERE contype<>'n'AND(conrelid IN(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname=ANY(sources))OR confrelid IN(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname=ANY(sources)));
 IF actual IS DISTINCT FROM expected_constraints THEN RAISE EXCEPTION 'Review submission relationships';END IF;
 SELECT coalesce(jsonb_object_agg(c.relname||'.'||t.tgname,jsonb_build_array(replace(pg_get_triggerdef(t.oid,true),'public.',''),md5(p.prosrc),p.prosecdef,p.proconfig,t.tgenabled)),'{}')INTO actual FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid WHERE n.nspname='public'AND c.relname=ANY(sources)AND NOT t.tgisinternal;
 IF actual IS DISTINCT FROM expected_hooks THEN RAISE EXCEPTION 'Review submission hooks';END IF;
END $$;
ALTER TABLE public.product_suggestions DROP CONSTRAINT product_suggestions_submitted_by_fkey,DROP CONSTRAINT product_suggestions_reviewer_id_fkey,
 ADD CONSTRAINT product_suggestions_submitted_by_fkey FOREIGN KEY(submitted_by)REFERENCES auth.users(id)ON DELETE RESTRICT,
 ADD CONSTRAINT product_suggestions_reviewer_id_fkey FOREIGN KEY(reviewer_id)REFERENCES auth.users(id)ON DELETE RESTRICT;
ALTER TABLE public.seller_listing_requests ALTER COLUMN suggestion_id DROP NOT NULL,ADD COLUMN unavailable_at timestamptz,
 DROP CONSTRAINT seller_listing_requests_suggestion_id_fkey,DROP CONSTRAINT seller_listing_requests_seller_id_fkey,
 ADD CONSTRAINT seller_listing_requests_suggestion_id_fkey FOREIGN KEY(suggestion_id)REFERENCES public.product_suggestions(id)ON DELETE SET NULL,
 ADD CONSTRAINT seller_listing_requests_seller_id_fkey FOREIGN KEY(seller_id)REFERENCES auth.users(id)ON DELETE RESTRICT,
 ADD CONSTRAINT seller_listing_requests_retired_parent CHECK((suggestion_id IS NULL)=(unavailable_at IS NOT NULL));
CREATE INDEX account_deletion_submission_author ON public.product_suggestions(submitted_by,id);
CREATE INDEX account_deletion_submission_reviewer ON public.product_suggestions(reviewer_id,id);
CREATE FUNCTION public.account_deletion_submission_context(_user uuid)RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''AS $$DECLARE context jsonb;BEGIN
 context:=nullif(current_setting('bluebird.submission_cleanup',true),'')::jsonb;
 IF context IS NULL OR context->>'user'IS DISTINCT FROM _user::text THEN RETURN false;END IF;
 RETURN public.account_deletion_lease_current((context->>'id')::uuid,_user,(context->>'lease')::uuid,'records')AND public.account_deletion_submission_barrier_current();
EXCEPTION WHEN OTHERS THEN RETURN false;END $$;
CREATE FUNCTION public.account_deletion_suggestion_context(_id uuid)RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$SELECT coalesce((SELECT public.account_deletion_submission_context(submitted_by)FROM public.product_suggestions WHERE id=_id),false);$$;
CREATE FUNCTION public.guard_account_deletion_submission_writer()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''SET lock_timeout='1s'AS $$
DECLARE author uuid;owner_id uuid;parent uuid;old_parent uuid;BEGIN
 IF TG_TABLE_NAME='product_suggestions'THEN
  IF TG_OP='DELETE'AND public.account_deletion_submission_context(OLD.submitted_by)THEN RETURN OLD;END IF;
  IF TG_OP='UPDATE'AND NEW.submitted_by IS DISTINCT FROM OLD.submitted_by THEN RAISE EXCEPTION 'Submission authorship is immutable';END IF;
  author:=CASE WHEN TG_OP='DELETE'THEN OLD.submitted_by ELSE NEW.submitted_by END;
  PERFORM public.assert_member_private_record_writer(author);
  IF TG_OP<>'DELETE'AND NEW.reviewer_id IS NOT NULL AND(TG_OP='INSERT'OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id)THEN PERFORM public.assert_member_private_record_writer(NEW.reviewer_id);END IF;
 ELSIF TG_TABLE_NAME='seller_listing_requests'THEN
  IF TG_OP='DELETE'AND public.account_deletion_submission_context(OLD.seller_id)THEN RETURN OLD;END IF;
  IF TG_OP='UPDATE'THEN
   IF NEW.seller_id IS DISTINCT FROM OLD.seller_id THEN RAISE EXCEPTION 'Held request ownership is immutable';END IF;
   IF NEW.suggestion_id IS NULL AND OLD.suggestion_id IS NOT NULL
    AND(to_jsonb(NEW)-ARRAY['suggestion_id','unavailable_at'])=(to_jsonb(OLD)-ARRAY['suggestion_id','unavailable_at'])
    AND(public.account_deletion_suggestion_context(OLD.suggestion_id)OR NOT EXISTS(SELECT 1 FROM public.product_suggestions WHERE id=OLD.suggestion_id))
   THEN NEW.unavailable_at:=coalesce(NEW.unavailable_at,clock_timestamp());RETURN NEW;END IF;
   IF NEW.converted_ask_id IS NULL AND OLD.converted_ask_id IS NOT NULL AND(to_jsonb(NEW)-'converted_ask_id')=(to_jsonb(OLD)-'converted_ask_id')
    AND NOT EXISTS(SELECT 1 FROM public.asks WHERE id=OLD.converted_ask_id)THEN RETURN NEW;END IF;
   IF NEW.suggestion_id IS DISTINCT FROM OLD.suggestion_id THEN RAISE EXCEPTION 'Held request parent is immutable';END IF;
   IF OLD.unavailable_at IS NOT NULL OR NEW.unavailable_at IS DISTINCT FROM OLD.unavailable_at THEN RAISE EXCEPTION 'Held request is read-only';END IF;
   IF OLD.converted_ask_id IS NOT NULL AND NEW.converted_ask_id IS DISTINCT FROM OLD.converted_ask_id THEN RAISE EXCEPTION 'Converted listing is immutable';END IF;
  END IF;
  owner_id:=CASE WHEN TG_OP='DELETE'THEN OLD.seller_id ELSE NEW.seller_id END;
  PERFORM public.assert_member_private_record_writer(owner_id);
  parent:=CASE WHEN TG_OP='DELETE'THEN OLD.suggestion_id ELSE NEW.suggestion_id END;
  SELECT submitted_by INTO author FROM public.product_suggestions WHERE id=parent FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Submission is unavailable';END IF;
  PERFORM public.assert_member_private_record_writer(author);
  IF TG_OP<>'DELETE'AND NEW.converted_ask_id IS NOT NULL THEN
   SELECT seller_id INTO author FROM public.asks WHERE id=NEW.converted_ask_id FOR SHARE;
   IF NOT FOUND OR author IS DISTINCT FROM NEW.seller_id THEN RAISE EXCEPTION 'Converted listing ownership requires review';END IF;
  END IF;
 ELSE
  parent:=CASE WHEN TG_OP='DELETE'THEN OLD.suggestion_id ELSE NEW.suggestion_id END;
  IF TG_OP='DELETE'AND(public.account_deletion_suggestion_context(parent)OR NOT EXISTS(SELECT 1 FROM public.product_suggestions WHERE id=parent))THEN RETURN OLD;END IF;
  old_parent:=CASE WHEN TG_OP='UPDATE'THEN OLD.suggestion_id ELSE parent END;
  FOR author IN SELECT submitted_by FROM public.product_suggestions WHERE id IN(parent,old_parent)ORDER BY id FOR SHARE LOOP PERFORM public.assert_member_private_record_writer(author);END LOOP;
 END IF;
 IF TG_OP='DELETE'THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $$;
DO $$DECLARE relation text;BEGIN FOREACH relation IN ARRAY ARRAY['product_suggestions','product_suggestion_media','seller_listing_requests']LOOP EXECUTE format('CREATE TRIGGER account_deletion_submission_writer BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_submission_writer()',relation);END LOOP;END $$;

-- Same retained listing dependencies as the reviewed listing component, with
-- held-request links omitted only because this component removes those first.
CREATE FUNCTION public.account_deletion_submission_listing_retention(_listing uuid)RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$
 SELECT EXISTS(SELECT 1 FROM public.asks WHERE id=_listing AND(dealer_id IS NOT NULL OR status='matched'OR matched_order_id IS NOT NULL))
 OR EXISTS(SELECT 1 FROM public.orders WHERE ask_id=_listing)OR EXISTS(SELECT 1 FROM public.checkout_shipping_quotes WHERE ask_id=_listing)
 OR EXISTS(SELECT 1 FROM public.listing_offers WHERE ask_id=_listing)OR EXISTS(SELECT 1 FROM public.market_matches WHERE ask_id=_listing)
 OR EXISTS(SELECT 1 FROM public.listing_upgrade_purchases WHERE listing_id=_listing)OR EXISTS(SELECT 1 FROM public.classified_listing_reports WHERE listing_id=_listing)
 OR EXISTS(SELECT 1 FROM public.dealer_inventory_listing_links WHERE listing_id=_listing)OR EXISTS(SELECT 1 FROM public.fb_marketplace_import_items WHERE listing_id=_listing);
$$;
CREATE FUNCTION public.account_deletion_submission_product_retention(_product uuid)RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$
 SELECT EXISTS(SELECT 1 FROM public.asks WHERE(product_id=_product OR variant_id IN(SELECT id FROM public.product_variants WHERE product_id=_product))AND public.account_deletion_submission_listing_retention(id))
 OR EXISTS(SELECT 1 FROM public.orders WHERE product_id=_product OR variant_id IN(SELECT id FROM public.product_variants WHERE product_id=_product))
 OR EXISTS(SELECT 1 FROM public.bids WHERE product_id=_product OR variant_id IN(SELECT id FROM public.product_variants WHERE product_id=_product))
 OR EXISTS(SELECT 1 FROM public.verified_sales WHERE product_id=_product OR variant_id IN(SELECT id FROM public.product_variants WHERE product_id=_product))
 OR EXISTS(SELECT 1 FROM public.checkout_shipping_quotes WHERE variant_id IN(SELECT id FROM public.product_variants WHERE product_id=_product))
 OR EXISTS(SELECT 1 FROM public.market_matches WHERE variant_id IN(SELECT id FROM public.product_variants WHERE product_id=_product))
 OR EXISTS(SELECT 1 FROM public.sourcing_requests WHERE product_id=_product OR variant_id IN(SELECT id FROM public.product_variants WHERE product_id=_product))
 OR EXISTS(SELECT 1 FROM public.sourcing_assignments WHERE variant_id IN(SELECT id FROM public.product_variants WHERE product_id=_product));
$$;
CREATE FUNCTION public.account_deletion_submission_remaining(_user uuid)RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$
 SELECT EXISTS(SELECT 1 FROM public.product_suggestions WHERE submitted_by=_user OR reviewer_id=_user)
 OR EXISTS(SELECT 1 FROM public.seller_listing_requests WHERE seller_id=_user);
$$;
CREATE FUNCTION public.account_deletion_submission_catalog()RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$
 WITH sources AS(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname=ANY(ARRAY['product_suggestions','product_suggestion_media','seller_listing_requests']))
 SELECT jsonb_build_object(
 'relations',(SELECT jsonb_agg(jsonb_build_array(oid::regclass::text,relkind,relispartition,relrowsecurity)ORDER BY oid)FROM pg_class WHERE oid IN(SELECT oid FROM sources)),
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attrelid::regclass::text,a.attname,a.atttypid::regtype::text,a.atttypmod,a.attnotnull,a.attgenerated,pg_get_expr(d.adbin,d.adrelid))ORDER BY a.attrelid,a.attnum)FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid IN(SELECT oid FROM sources)AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conrelid::regclass::text,conname,pg_get_constraintdef(oid,true),convalidated,condeferrable,condeferred)ORDER BY conrelid,conname)FROM pg_constraint WHERE conrelid IN(SELECT oid FROM sources)OR confrelid IN(SELECT oid FROM sources)),
 'hooks',(SELECT jsonb_object_agg(tgrelid::regclass::text||'.'||tgname,jsonb_build_array(pg_get_triggerdef(oid,true),md5(pg_get_functiondef(tgfoid)),tgenabled))FROM pg_trigger WHERE tgrelid IN(SELECT oid FROM sources)AND NOT tgisinternal),
 'indexes',(SELECT jsonb_agg(pg_get_indexdef(indexrelid)ORDER BY indexrelid)FROM pg_index WHERE indrelid IN(SELECT oid FROM sources)),
 'policies',(SELECT jsonb_agg(jsonb_build_array(polrelid::regclass::text,polname,polcmd,polpermissive,polroles::text,pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid))ORDER BY polrelid,polname)FROM pg_policy WHERE polrelid IN(SELECT oid FROM sources)),
 'rules',(SELECT coalesce(jsonb_agg(pg_get_ruledef(oid,true)ORDER BY oid),'[]')FROM pg_rewrite WHERE ev_class IN(SELECT oid FROM sources)),
 'inheritance',(SELECT count(*)FROM pg_inherits WHERE inhparent IN(SELECT oid FROM sources)OR inhrelid IN(SELECT oid FROM sources)));
$$;
CREATE TABLE public.account_deletion_submission_contract(id boolean PRIMARY KEY DEFAULT true CHECK(id),catalog jsonb NOT NULL,functions jsonb NOT NULL);
ALTER TABLE public.account_deletion_submission_contract ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_submission_contract FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.account_deletion_submission_contract TO service_role;
CREATE FUNCTION public.account_deletion_submission_scope(_id uuid,_user uuid,_lease uuid,_phase text)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''SET lock_timeout='1s'AS $$BEGIN
 PERFORM public.account_deletion_application_scope(_id,_user,_lease,_phase);
 IF auth.uid()IS NOT NULL THEN RAISE EXCEPTION 'Submission erasure requires a background identity';END IF;
 LOCK TABLE public.product_suggestions,public.product_suggestion_media,public.seller_listing_requests IN ROW EXCLUSIVE MODE;
 IF NOT public.account_deletion_submission_barrier_current()OR NOT public.account_deletion_listing_barrier_current()OR NOT public.account_deletion_catalog_barrier_current()THEN RAISE EXCEPTION 'Submission erasure requires schema review';END IF;
 IF _phase='records'AND(public.account_deletion_conversation_remaining(_user)OR public.account_deletion_inquiry_remaining(_user)OR public.account_deletion_application_remaining(_user))THEN RAISE EXCEPTION 'Complete shared contributions before submission erasure';END IF;
END $$;
CREATE FUNCTION public.purge_account_deletion_submissions(_id uuid,_user uuid,_lease uuid,_limit integer DEFAULT 100)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''SET lock_timeout='1s'AS $$
DECLARE req public.seller_listing_requests;proposal public.product_suggestions;media record;item record;linked_owner uuid;ids uuid[];changed integer:=0;affected integer;selected text;
 previous_context text:=coalesce(current_setting('bluebird.submission_cleanup',true),'');
BEGIN
 IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Submission erasure unavailable';END IF;
 PERFORM public.account_deletion_submission_scope(_id,_user,_lease,'records');
 IF EXISTS(SELECT 1 FROM public.product_suggestions WHERE reviewer_id=_user AND submitted_by<>_user)THEN RAISE EXCEPTION 'Submission moderation retention requires explicit handling';END IF;
 PERFORM set_config('bluebird.submission_cleanup',jsonb_build_object('id',_id,'user',_user,'lease',_lease)::text,true);
 -- Each captured request has at most eight paths in each of two arrays.
 -- Six rows cap each pass at 96 media reference checks, without modifying arrays.
 FOR req IN SELECT * FROM public.seller_listing_requests WHERE seller_id=_user ORDER BY id LIMIT least(_limit,6)FOR UPDATE LOOP
  IF req.converted_ask_id IS NOT NULL THEN
   SELECT seller_id INTO linked_owner FROM public.asks WHERE id=req.converted_ask_id FOR UPDATE;
   IF NOT FOUND OR linked_owner IS DISTINCT FROM _user OR public.account_deletion_submission_listing_retention(req.converted_ask_id)THEN RAISE EXCEPTION 'Converted submission retention requires explicit handling';END IF;
  END IF;
  FOR item IN SELECT 'seller_listing_requests_evidence_paths'::text source,'ask-evidence'::text bucket,v.path,v.position FROM unnest(req.evidence_paths)WITH ORDINALITY v(path,position)
   UNION ALL SELECT 'seller_listing_requests_public_media_paths','listing-media',v.path,v.position FROM unnest(req.public_media_paths)WITH ORDINALITY v(path,position)LOOP
   IF item.path IS NOT NULL AND NOT public.account_deletion_listing_media_ready(_id,item.source,req.id::text||':'||lpad(item.position::text,10,'0'),item.bucket,item.path)THEN RAISE EXCEPTION 'Held request media inventory is incomplete';END IF;
  END LOOP;
  DELETE FROM public.seller_listing_requests WHERE id=req.id AND seller_id=_user;GET DIAGNOSTICS affected=ROW_COUNT;changed:=changed+affected;selected:='requests';
 END LOOP;
 IF changed=0 THEN
  SELECT * INTO proposal FROM public.product_suggestions WHERE submitted_by=_user ORDER BY id LIMIT 1 FOR UPDATE;
  IF proposal.id IS NOT NULL THEN
   -- Serialize the retention decision with incoming product/variant references.
   -- FOR UPDATE also prevents new variants from appearing after this snapshot.
   PERFORM 1 FROM public.products WHERE id IN(proposal.created_product_id,proposal.merged_product_id)ORDER BY id FOR UPDATE;
   PERFORM 1 FROM public.product_variants WHERE product_id IN(proposal.created_product_id,proposal.merged_product_id)ORDER BY id FOR UPDATE;
   IF public.account_deletion_submission_product_retention(proposal.created_product_id)OR public.account_deletion_submission_product_retention(proposal.merged_product_id)THEN RAISE EXCEPTION 'Submission financial retention requires explicit handling';END IF;
   SELECT array_agg(id)INTO ids FROM(SELECT id FROM public.seller_listing_requests WHERE suggestion_id=proposal.id ORDER BY id LIMIT _limit FOR UPDATE)r;
   IF ids IS NOT NULL THEN UPDATE public.seller_listing_requests SET suggestion_id=NULL,unavailable_at=clock_timestamp()WHERE id=ANY(ids);GET DIAGNOSTICS changed=ROW_COUNT;selected:='retired';END IF;
   IF changed=0 THEN
    FOR media IN SELECT id,storage_path FROM public.product_suggestion_media WHERE suggestion_id=proposal.id ORDER BY id LIMIT _limit FOR UPDATE LOOP
     IF NOT public.account_deletion_listing_media_ready(_id,'product_suggestion_media',media.id::text,NULL,media.storage_path)THEN RAISE EXCEPTION 'Suggestion media inventory requires resolution';END IF;
     DELETE FROM public.product_suggestion_media WHERE id=media.id AND suggestion_id=proposal.id;GET DIAGNOSTICS affected=ROW_COUNT;changed:=changed+affected;selected:='media';
    END LOOP;
   END IF;
   IF changed=0 THEN DELETE FROM public.product_suggestions WHERE id=proposal.id AND submitted_by=_user;GET DIAGNOSTICS changed=ROW_COUNT;selected:='suggestions';END IF;
  END IF;
 END IF;
 PERFORM set_config('bluebird.submission_cleanup',previous_context,true);
 IF NOT public.account_deletion_lease_current(_id,_user,_lease,'records')OR NOT public.account_deletion_submission_barrier_current()
 OR public.account_access_coverage()IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)THEN RAISE EXCEPTION 'Submission erasure unavailable';END IF;
 IF changed=0 AND public.account_deletion_submission_remaining(_user)THEN RAISE EXCEPTION 'Submission retention requires explicit handling';END IF;
 RETURN jsonb_build_object('source',selected,'changed',changed,'pass_done',NOT public.account_deletion_submission_remaining(_user));
EXCEPTION WHEN OTHERS THEN PERFORM set_config('bluebird.submission_cleanup',previous_context,true);RAISE;
END $$;
CREATE FUNCTION public.verify_account_deletion_submissions(_id uuid,_user uuid,_lease uuid)RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''SET lock_timeout='1s'AS $$BEGIN
 PERFORM public.account_deletion_submission_scope(_id,_user,_lease,'verification');RETURN NOT public.account_deletion_submission_remaining(_user)AND public.account_deletion_lease_current(_id,_user,_lease,'verification');
END $$;
CREATE FUNCTION public.guard_account_deletion_submission_completion()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''AS $$BEGIN IF NEW.status='completed'AND(NOT public.account_deletion_submission_barrier_current()OR public.account_deletion_submission_remaining(OLD.user_id))THEN RAISE EXCEPTION 'Submission erasure verification required';END IF;RETURN NEW;END $$;
CREATE TRIGGER guard_account_deletion_submission_completion AFTER UPDATE OF status,user_id ON public.account_deletion_jobs FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_submission_completion();
CREATE FUNCTION public.account_deletion_submission_functions()RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$SELECT jsonb_object_agg(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid)))FROM pg_proc p WHERE p.oid IN(
 'public.account_deletion_submission_context(uuid)'::regprocedure,'public.account_deletion_suggestion_context(uuid)'::regprocedure,'public.guard_account_deletion_submission_writer()'::regprocedure,
 'public.account_deletion_submission_listing_retention(uuid)'::regprocedure,'public.account_deletion_submission_product_retention(uuid)'::regprocedure,'public.account_deletion_submission_remaining(uuid)'::regprocedure,
 'public.account_deletion_submission_catalog()'::regprocedure,'public.account_deletion_submission_scope(uuid,uuid,uuid,text)'::regprocedure,'public.purge_account_deletion_submissions(uuid,uuid,uuid,integer)'::regprocedure,
 'public.verify_account_deletion_submissions(uuid,uuid,uuid)'::regprocedure,'public.guard_account_deletion_submission_completion()'::regprocedure,'public.account_deletion_submission_functions()'::regprocedure,
 'public.account_deletion_listing_retention(uuid)'::regprocedure,'public.account_deletion_listing_media_ready(uuid,text,text,text,text)'::regprocedure,'public.account_deletion_media_reference(text,text)'::regprocedure,to_regprocedure('public.account_deletion_submission_barrier_current()'));$$;
CREATE FUNCTION public.account_deletion_submission_barrier_current()RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$SELECT EXISTS(SELECT 1 FROM public.account_deletion_submission_contract WHERE id AND catalog=public.account_deletion_submission_catalog()AND functions=public.account_deletion_submission_functions());$$;
REVOKE ALL ON FUNCTION public.account_deletion_submission_context(uuid),public.account_deletion_suggestion_context(uuid),public.guard_account_deletion_submission_writer(),public.account_deletion_submission_listing_retention(uuid),public.account_deletion_submission_product_retention(uuid),public.account_deletion_submission_remaining(uuid),public.account_deletion_submission_catalog(),public.account_deletion_submission_scope(uuid,uuid,uuid,text),public.purge_account_deletion_submissions(uuid,uuid,uuid,integer),public.verify_account_deletion_submissions(uuid,uuid,uuid),public.guard_account_deletion_submission_completion(),public.account_deletion_submission_functions(),public.account_deletion_submission_barrier_current()FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.purge_account_deletion_submissions(uuid,uuid,uuid,integer),public.verify_account_deletion_submissions(uuid,uuid,uuid)TO service_role;
SELECT public.protect_account_access_boundaries();
UPDATE public.account_deletion_private_contract SET hooks=public.account_deletion_private_hooks()WHERE id;
INSERT INTO public.account_deletion_submission_contract SELECT true,public.account_deletion_submission_catalog(),public.account_deletion_submission_functions();
DO $$BEGIN IF NOT public.account_deletion_submission_barrier_current()OR NOT public.account_deletion_catalog_barrier_current()OR NOT public.account_deletion_listing_barrier_current()OR NOT public.account_deletion_private_barrier_current()THEN RAISE EXCEPTION 'Submission boundaries require review';END IF;END $$;
COMMIT;
