-- Source-only request, quote and event cleanup. No worker activation, Auth or provider erasure.
BEGIN;SET LOCAL search_path='';SET LOCAL lock_timeout='5s';
DO $$ DECLARE expected_columns jsonb:=$columns${"request_media":{"id":["uuid",true,"gen_random_uuid()",""],"request_id":["uuid",true,null,""],"storage_path":["text",true,null,""],"caption":["text",false,null,""],"position":["integer",true,"0",""],"created_at":["timestamp with time zone",true,"now()",""]},"shopper_quotes":{"id":["uuid",true,"gen_random_uuid()",""],"request_id":["uuid",true,null,""],"shopper_id":["uuid",true,null,""],"merch_cost_cents":["integer",true,null,""],"shopper_comp_cents":["integer",true,null,""],"shipping_estimate_cents":["integer",true,null,""],"buyer_fee_estimate_cents":["integer",true,null,""],"delivered_estimate_cents":["integer",true,null,""],"currency":["character(3)",true,"'USD'::bpchar",""],"availability_note":["text",false,null,""],"fulfillment_window_days":["integer",true,null,""],"expires_at":["timestamp with time zone",true,null,""],"status":["shopper_quote_status",true,"'submitted'::shopper_quote_status",""],"matched_order_id":["uuid",false,null,""],"is_demo":["boolean",true,"false",""],"created_at":["timestamp with time zone",true,"now()",""],"updated_at":["timestamp with time zone",true,"now()",""]},"sourcing_events":{"id":["uuid",true,"gen_random_uuid()",""],"request_id":["uuid",true,null,""],"quote_id":["uuid",false,null,""],"actor_id":["uuid",false,null,""],"event_type":["text",true,null,""],"note":["text",false,null,""],"created_at":["timestamp with time zone",true,"now()",""]},"sourcing_requests":{"id":["uuid",true,"gen_random_uuid()",""],"buyer_id":["uuid",true,null,""],"product_id":["uuid",true,null,""],"variant_id":["uuid",true,null,""],"target_location_id":["uuid",false,null,""],"max_budget_cents":["integer",false,null,""],"currency":["character(3)",true,"'USD'::bpchar",""],"buyer_note":["text",false,null,""],"needed_by":["date",false,null,""],"status":["sourcing_request_status",true,"'open'::sourcing_request_status",""],"accepted_quote_id":["uuid",false,null,""],"matched_order_id":["uuid",false,null,""],"quote_count":["integer",true,"0",""],"media_count":["integer",true,"0",""],"is_demo":["boolean",true,"false",""],"expires_at":["timestamp with time zone",true,"(now() + '21 days'::interval)",""],"created_at":["timestamp with time zone",true,"now()",""],"updated_at":["timestamp with time zone",true,"now()",""]}}$columns$::jsonb;
 expected_constraints jsonb:=$constraints${"request_media.request_media_caption_check":"CHECK (caption IS NULL OR length(caption) <= 200)","request_media.request_media_pkey":"PRIMARY KEY (id)","request_media.request_media_request_id_fkey":"FOREIGN KEY (request_id) REFERENCES sourcing_requests(id) ON DELETE CASCADE","shopper_quotes.shopper_quotes_availability_note_check":"CHECK (availability_note IS NULL OR length(availability_note) <= 500)","shopper_quotes.shopper_quotes_buyer_fee_estimate_cents_check":"CHECK (buyer_fee_estimate_cents >= 0)","shopper_quotes.shopper_quotes_delivered_estimate_cents_check":"CHECK (delivered_estimate_cents >= 0)","shopper_quotes.shopper_quotes_delivered_total":"CHECK (delivered_estimate_cents = (merch_cost_cents + shopper_comp_cents + buyer_fee_estimate_cents + shipping_estimate_cents))","shopper_quotes.shopper_quotes_fulfillment_window_days_check":"CHECK (fulfillment_window_days >= 1 AND fulfillment_window_days <= 60)","shopper_quotes.shopper_quotes_matched_order_id_fkey":"FOREIGN KEY (matched_order_id) REFERENCES orders(id) ON DELETE SET NULL","shopper_quotes.shopper_quotes_merch_cost_cents_check":"CHECK (merch_cost_cents >= 100 AND merch_cost_cents <= 5000000)","shopper_quotes.shopper_quotes_pkey":"PRIMARY KEY (id)","shopper_quotes.shopper_quotes_request_id_fkey":"FOREIGN KEY (request_id) REFERENCES sourcing_requests(id) ON DELETE CASCADE","shopper_quotes.shopper_quotes_shipping_estimate_cents_check":"CHECK (shipping_estimate_cents >= 0 AND shipping_estimate_cents <= 100000)","shopper_quotes.shopper_quotes_shopper_comp_cents_check":"CHECK (shopper_comp_cents >= 0 AND shopper_comp_cents <= 500000)","shopper_quotes.shopper_quotes_shopper_id_fkey":"FOREIGN KEY (shopper_id) REFERENCES auth.users(id) ON DELETE CASCADE","sourcing_events.sourcing_events_quote_id_fkey":"FOREIGN KEY (quote_id) REFERENCES shopper_quotes(id) ON DELETE SET NULL","sourcing_requests.sourcing_requests_accepted_quote_fk":"FOREIGN KEY (accepted_quote_id) REFERENCES shopper_quotes(id) ON DELETE SET NULL","sourcing_events.sourcing_events_actor_id_fkey":"FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL","sourcing_events.sourcing_events_pkey":"PRIMARY KEY (id)","sourcing_events.sourcing_events_request_id_fkey":"FOREIGN KEY (request_id) REFERENCES sourcing_requests(id) ON DELETE CASCADE","sourcing_requests.sourcing_requests_buyer_id_fkey":"FOREIGN KEY (buyer_id) REFERENCES auth.users(id) ON DELETE CASCADE","sourcing_requests.sourcing_requests_buyer_note_check":"CHECK (buyer_note IS NULL OR length(buyer_note) <= 500)","sourcing_requests.sourcing_requests_matched_order_id_fkey":"FOREIGN KEY (matched_order_id) REFERENCES orders(id) ON DELETE SET NULL","sourcing_requests.sourcing_requests_max_budget_cents_check":"CHECK (max_budget_cents IS NULL OR max_budget_cents >= 100 AND max_budget_cents <= 5000000)","sourcing_requests.sourcing_requests_pkey":"PRIMARY KEY (id)","sourcing_requests.sourcing_requests_product_id_fkey":"FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE","sourcing_requests.sourcing_requests_target_location_id_fkey":"FOREIGN KEY (target_location_id) REFERENCES locations(id) ON DELETE SET NULL","sourcing_requests.sourcing_requests_variant_id_fkey":"FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE"}$constraints$::jsonb;
 expected_hooks jsonb:=$hooks${"shopper_quotes.guard_shopper_quote_acceptance_flag":["CREATE TRIGGER guard_shopper_quote_acceptance_flag BEFORE UPDATE ON shopper_quotes FOR EACH ROW WHEN (new.status = 'accepted'::shopper_quote_status AND old.status IS DISTINCT FROM 'accepted'::shopper_quote_status) EXECUTE FUNCTION guard_shopper_quotes_enabled()","60c151c6f570f897142b47e6b8e36503",false,["search_path=public"],"O"],"shopper_quotes.guard_shopper_quotes_flag":["CREATE TRIGGER guard_shopper_quotes_flag BEFORE INSERT ON shopper_quotes FOR EACH ROW EXECUTE FUNCTION guard_shopper_quotes_enabled()","60c151c6f570f897142b47e6b8e36503",false,["search_path=public"],"O"],"shopper_quotes.shopper_quotes_touch":["CREATE TRIGGER shopper_quotes_touch BEFORE UPDATE ON shopper_quotes FOR EACH ROW EXECUTE FUNCTION set_updated_at()","9b1889f56258bf9d6554213c05019c76",false,null,"O"],"sourcing_requests.guard_sourcing_requests_flag":["CREATE TRIGGER guard_sourcing_requests_flag BEFORE INSERT ON sourcing_requests FOR EACH ROW EXECUTE FUNCTION guard_custom_sourcing_requests_enabled()","2927a003f45542556b2cad8594407969",false,["search_path=public"],"O"],"sourcing_requests.sourcing_requests_touch":["CREATE TRIGGER sourcing_requests_touch BEFORE UPDATE ON sourcing_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at()","9b1889f56258bf9d6554213c05019c76",false,null,"O"],"request_media.guard_member_photo_reference":["CREATE TRIGGER guard_member_photo_reference BEFORE INSERT OR UPDATE OF storage_path, request_id ON request_media FOR EACH ROW EXECUTE FUNCTION guard_member_photo_reference()","634d442cb95409d34b468e10b31c9300",true,["search_path=\"\""],"O"]}$hooks$::jsonb;
 sources text[]:=ARRAY['sourcing_requests','request_media','shopper_quotes','sourcing_events'];target text;actual jsonb;
BEGIN
 PERFORM 1 FROM public.account_deletion_controls WHERE id AND NOT worker_enabled FOR SHARE;
 IF NOT FOUND OR NOT public.account_deletion_private_barrier_current()OR NOT public.account_deletion_sighting_barrier_current()OR NOT public.account_deletion_submission_barrier_current()OR NOT public.account_deletion_catalog_barrier_current()OR NOT public.account_deletion_listing_barrier_current()
 OR public.account_access_coverage()IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)THEN RAISE EXCEPTION 'Review disabled sourcing prerequisites';END IF;
 FOREACH target IN ARRAY sources LOOP
  EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE',target);
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=format('public.%I',target)::regclass AND relkind='r'AND NOT relispartition)
   OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhparent=format('public.%I',target)::regclass OR inhrelid=format('public.%I',target)::regclass)
   OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class=format('public.%I',target)::regclass)THEN RAISE EXCEPTION 'Review sourcing layout';END IF;
 END LOOP;
 SELECT jsonb_object_agg(relname,cols)INTO actual FROM(SELECT c.relname,jsonb_object_agg(a.attname,jsonb_build_array(replace(format_type(a.atttypid,a.atttypmod),'public.',''),a.attnotnull,replace(pg_get_expr(d.adbin,d.adrelid),'public.',''),a.attgenerated))cols
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE n.nspname='public'AND c.relname=ANY(sources)AND a.attnum>0 AND NOT a.attisdropped GROUP BY c.relname)r;
 IF actual IS DISTINCT FROM expected_columns THEN RAISE EXCEPTION 'Review sourcing columns';END IF;
 SELECT jsonb_object_agg(replace(conrelid::regclass::text,'public.','')||'.'||conname,replace(pg_get_constraintdef(oid,true),'public.',''))INTO actual FROM pg_constraint WHERE contype<>'n'AND(conrelid IN(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname=ANY(sources))OR confrelid IN(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname=ANY(sources)));
 IF actual IS DISTINCT FROM expected_constraints THEN RAISE EXCEPTION 'Review sourcing relationships';END IF;
 SELECT coalesce(jsonb_object_agg(c.relname||'.'||t.tgname,jsonb_build_array(replace(pg_get_triggerdef(t.oid,true),'public.',''),md5(p.prosrc),p.prosecdef,p.proconfig,t.tgenabled)),'{}')INTO actual FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid WHERE n.nspname='public'AND c.relname=ANY(sources)AND NOT t.tgisinternal;
 IF actual IS DISTINCT FROM expected_hooks THEN RAISE EXCEPTION 'Review sourcing hooks';END IF;
 IF(SELECT md5(prosrc)FROM pg_proc WHERE oid='public.accept_shopper_quote(uuid)'::regprocedure)IS DISTINCT FROM 'b0e4af5c805b8ff43946f54ac412d550'THEN RAISE EXCEPTION 'Review sourcing member functions';END IF;
 IF(SELECT md5(prosrc)FROM pg_proc WHERE oid='public.cancel_sourcing_request(uuid)'::regprocedure)IS DISTINCT FROM 'fed2a960474c2cbf43da6418c53ceaca'THEN RAISE EXCEPTION 'Review sourcing member functions';END IF;
 IF(SELECT md5(prosrc)FROM pg_proc WHERE oid='public.create_sourcing_request(uuid,integer,text,date,uuid,text[])'::regprocedure)IS DISTINCT FROM '0af2714739638731e1dfd0034e4a9ba9'THEN RAISE EXCEPTION 'Review sourcing member functions';END IF;
 IF(SELECT md5(prosrc)FROM pg_proc WHERE oid='public.sourcing_board()'::regprocedure)IS DISTINCT FROM 'f97419ab339a4b78e8058941c1fae1ae'THEN RAISE EXCEPTION 'Review sourcing member functions';END IF;
 IF(SELECT md5(prosrc)FROM pg_proc WHERE oid='public.sourcing_request_media(uuid,uuid)'::regprocedure)IS DISTINCT FROM '51dae1114f14e9e65ff69d4408a851f8'THEN RAISE EXCEPTION 'Review sourcing member functions';END IF;
 IF(SELECT md5(prosrc)FROM pg_proc WHERE oid='public.submit_shopper_quote(uuid,integer,integer,integer,integer,text,integer)'::regprocedure)IS DISTINCT FROM '39772b62ad1981941068665a7bea4b54'THEN RAISE EXCEPTION 'Review sourcing member functions';END IF;
 IF(SELECT md5(prosrc)FROM pg_proc WHERE oid='public.withdraw_shopper_quote(uuid)'::regprocedure)IS DISTINCT FROM '44277304b63d219ab7fb74090ec2f535'THEN RAISE EXCEPTION 'Review sourcing member functions';END IF;
 IF(SELECT md5(prosrc)FROM pg_proc WHERE oid='public.quotes_for_my_requests()'::regprocedure)IS DISTINCT FROM 'ffe58727228ef7be7ffd3ba7399332bb'THEN RAISE EXCEPTION 'Review sourcing member functions';END IF;
END $$;

ALTER TABLE public.sourcing_requests DROP CONSTRAINT sourcing_requests_buyer_id_fkey,
 ADD CONSTRAINT sourcing_requests_buyer_id_fkey FOREIGN KEY(buyer_id)REFERENCES auth.users(id)ON DELETE RESTRICT;
ALTER TABLE public.shopper_quotes ALTER COLUMN request_id DROP NOT NULL,ADD COLUMN unavailable_at timestamptz,
 DROP CONSTRAINT shopper_quotes_request_id_fkey,DROP CONSTRAINT shopper_quotes_shopper_id_fkey,
 ADD CONSTRAINT shopper_quotes_request_id_fkey FOREIGN KEY(request_id)REFERENCES public.sourcing_requests(id)ON DELETE SET NULL,
 ADD CONSTRAINT shopper_quotes_shopper_id_fkey FOREIGN KEY(shopper_id)REFERENCES auth.users(id)ON DELETE RESTRICT,
 ADD CONSTRAINT shopper_quotes_retired_parent CHECK((request_id IS NULL)=(unavailable_at IS NOT NULL));
ALTER TABLE public.sourcing_events ALTER COLUMN request_id DROP NOT NULL,ADD COLUMN request_unavailable_at timestamptz,ADD COLUMN quote_unavailable_at timestamptz,
 DROP CONSTRAINT sourcing_events_request_id_fkey,DROP CONSTRAINT sourcing_events_actor_id_fkey,
 ADD CONSTRAINT sourcing_events_request_id_fkey FOREIGN KEY(request_id)REFERENCES public.sourcing_requests(id)ON DELETE SET NULL,
 ADD CONSTRAINT sourcing_events_actor_id_fkey FOREIGN KEY(actor_id)REFERENCES auth.users(id)ON DELETE RESTRICT,
 ADD CONSTRAINT sourcing_events_retired_request CHECK((request_id IS NULL)=(request_unavailable_at IS NOT NULL)),
 ADD CONSTRAINT sourcing_events_retired_quote CHECK(quote_id IS NULL OR quote_unavailable_at IS NULL);
CREATE INDEX account_deletion_sourcing_shopper ON public.shopper_quotes(shopper_id,id);
CREATE INDEX account_deletion_sourcing_actor ON public.sourcing_events(actor_id,id);
CREATE INDEX account_deletion_sourcing_quote_events ON public.sourcing_events(quote_id,id);
CREATE POLICY "Members read their own retired sourcing history"ON public.sourcing_events FOR SELECT TO authenticated USING(actor_id=auth.uid()AND request_id IS NULL);
CREATE FUNCTION public.account_deletion_sourcing_context(_user uuid)RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''AS $$DECLARE context jsonb;actor uuid;BEGIN
 context:=nullif(current_setting('bluebird.sourcing_cleanup',true),'')::jsonb;IF context IS NULL THEN RETURN false;END IF;actor:=(context->>'user')::uuid;
 IF _user IS NOT NULL AND actor IS DISTINCT FROM _user THEN RETURN false;END IF;
 RETURN public.account_deletion_lease_current((context->>'id')::uuid,actor,(context->>'lease')::uuid,'records')AND public.account_deletion_sourcing_barrier_current();
EXCEPTION WHEN OTHERS THEN RETURN false;END $$;
CREATE FUNCTION public.account_deletion_sourcing_request_context(_id uuid)RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$SELECT coalesce((SELECT public.account_deletion_sourcing_context(buyer_id)FROM public.sourcing_requests WHERE id=_id),false);$$;
CREATE FUNCTION public.account_deletion_sourcing_quote_context(_id uuid)RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$SELECT coalesce((SELECT public.account_deletion_sourcing_context(shopper_id)FROM public.shopper_quotes WHERE id=_id),false);$$;
CREATE FUNCTION public.account_deletion_sourcing_quote_retained(_id uuid)RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$
 SELECT EXISTS(SELECT 1 FROM public.shopper_quotes WHERE id=_id AND(status NOT IN('submitted','declined','expired','withdrawn')OR matched_order_id IS NOT NULL))
 OR EXISTS(SELECT 1 FROM public.sourcing_requests WHERE accepted_quote_id=_id)
 OR EXISTS(SELECT 1 FROM public.orders WHERE fee_snapshot->>'quote_id'=_id::text)
 OR EXISTS(SELECT 1 FROM public.sourcing_events WHERE quote_id=_id AND(actor_id IS NULL OR event_type NOT IN('request_created','request_cancelled','quote_submitted','quote_withdrawn')));
$$;
CREATE FUNCTION public.account_deletion_sourcing_request_retained(_id uuid)RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$
 SELECT EXISTS(SELECT 1 FROM public.sourcing_requests WHERE id=_id AND(status NOT IN('open','cancelled','expired')OR matched_order_id IS NOT NULL OR accepted_quote_id IS NOT NULL))
 OR EXISTS(SELECT 1 FROM public.shopper_quotes WHERE request_id=_id AND public.account_deletion_sourcing_quote_retained(id))
 OR EXISTS(SELECT 1 FROM public.sourcing_events WHERE request_id=_id AND(actor_id IS NULL OR event_type NOT IN('request_created','request_cancelled','quote_submitted','quote_withdrawn')));
$$;
CREATE FUNCTION public.guard_account_deletion_sourcing_writer()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''SET lock_timeout='1s'AS $$
DECLARE actor uuid;parent uuid;old_parent uuid;linked_parent uuid;request public.sourcing_requests;quote public.shopper_quotes;BEGIN
 IF TG_TABLE_NAME='sourcing_requests'THEN
  IF TG_OP='DELETE'AND public.account_deletion_sourcing_context(OLD.buyer_id)THEN RETURN OLD;END IF;
  IF TG_OP='UPDATE'THEN
   IF NEW.buyer_id IS DISTINCT FROM OLD.buyer_id THEN RAISE EXCEPTION 'Sourcing request ownership is immutable';END IF;
   IF public.account_deletion_sourcing_context(NULL)
    AND(to_jsonb(NEW)-ARRAY['quote_count','media_count','updated_at'])=(to_jsonb(OLD)-ARRAY['quote_count','media_count','updated_at'])
    AND(NEW.quote_count IS NOT DISTINCT FROM OLD.quote_count OR NEW.quote_count=(SELECT count(*)FROM public.shopper_quotes WHERE request_id=OLD.id AND status='submitted'))
    AND(NEW.media_count IS NOT DISTINCT FROM OLD.media_count OR NEW.media_count=(SELECT count(*)FROM public.request_media WHERE request_id=OLD.id))THEN RETURN NEW;END IF;
   IF NEW.accepted_quote_id IS NULL AND OLD.accepted_quote_id IS NOT NULL
    AND(to_jsonb(NEW)-'accepted_quote_id')=(to_jsonb(OLD)-'accepted_quote_id')AND NOT EXISTS(SELECT 1 FROM public.shopper_quotes WHERE id=OLD.accepted_quote_id)THEN RETURN NEW;END IF;
   IF NEW.matched_order_id IS NULL AND OLD.matched_order_id IS NOT NULL
    AND(to_jsonb(NEW)-'matched_order_id')=(to_jsonb(OLD)-'matched_order_id')AND NOT EXISTS(SELECT 1 FROM public.orders WHERE id=OLD.matched_order_id)THEN RETURN NEW;END IF;
  END IF;
  actor:=CASE WHEN TG_OP='DELETE'THEN OLD.buyer_id ELSE NEW.buyer_id END;PERFORM public.assert_member_private_record_writer(actor);
  IF TG_OP='DELETE'AND public.account_deletion_sourcing_request_retained(OLD.id)THEN RAISE EXCEPTION 'Sourcing financial retention requires explicit handling';END IF;
  IF TG_OP<>'DELETE'AND NEW.accepted_quote_id IS NOT NULL THEN
   SELECT * INTO quote FROM public.shopper_quotes WHERE id=NEW.accepted_quote_id FOR SHARE;
   IF NOT FOUND OR quote.request_id IS DISTINCT FROM NEW.id OR quote.status<>'accepted'OR quote.matched_order_id IS DISTINCT FROM NEW.matched_order_id THEN RAISE EXCEPTION 'Accepted quote ownership requires review';END IF;
  END IF;
 ELSIF TG_TABLE_NAME='shopper_quotes'THEN
  IF TG_OP='DELETE'AND public.account_deletion_sourcing_context(OLD.shopper_id)THEN RETURN OLD;END IF;
  IF TG_OP='UPDATE'THEN
   IF NEW.shopper_id IS DISTINCT FROM OLD.shopper_id THEN RAISE EXCEPTION 'Shopper quote ownership is immutable';END IF;
   IF NEW.request_id IS NULL AND OLD.request_id IS NOT NULL
    AND(to_jsonb(NEW)-ARRAY['request_id','unavailable_at','updated_at'])=(to_jsonb(OLD)-ARRAY['request_id','unavailable_at','updated_at'])
    AND(public.account_deletion_sourcing_request_context(OLD.request_id)OR NOT EXISTS(SELECT 1 FROM public.sourcing_requests WHERE id=OLD.request_id))
   THEN NEW.unavailable_at:=coalesce(NEW.unavailable_at,clock_timestamp());RETURN NEW;END IF;
   IF NEW.request_id IS DISTINCT FROM OLD.request_id THEN RAISE EXCEPTION 'Shopper quote parent is immutable';END IF;
   IF OLD.unavailable_at IS NOT NULL OR NEW.unavailable_at IS DISTINCT FROM OLD.unavailable_at THEN RAISE EXCEPTION 'Shopper quote is read-only';END IF;
   IF NEW.matched_order_id IS NULL AND OLD.matched_order_id IS NOT NULL
    AND(to_jsonb(NEW)-ARRAY['matched_order_id','updated_at'])=(to_jsonb(OLD)-ARRAY['matched_order_id','updated_at'])AND NOT EXISTS(SELECT 1 FROM public.orders WHERE id=OLD.matched_order_id)THEN RETURN NEW;END IF;
   -- Existing business closure can decline a losing/pending member's quote.
   -- This cannot add content or accept a quote; its actual parent is closed.
   IF OLD.status='submitted'AND NEW.status='declined'
    AND(to_jsonb(NEW)-ARRAY['status','updated_at'])=(to_jsonb(OLD)-ARRAY['status','updated_at'])THEN
    SELECT * INTO request FROM public.sourcing_requests WHERE id=OLD.request_id;
    IF FOUND AND(request.status='cancelled'OR(request.status='quote_accepted'AND request.accepted_quote_id IS NOT NULL AND request.matched_order_id IS NOT NULL))
     AND(auth.uid()=request.buyer_id OR(auth.uid()IS NULL AND auth.role()='service_role'))THEN
     PERFORM public.assert_member_private_record_writer(request.buyer_id);RETURN NEW;
    END IF;
   END IF;
  END IF;
  actor:=CASE WHEN TG_OP='DELETE'THEN OLD.shopper_id ELSE NEW.shopper_id END;PERFORM public.assert_member_private_record_writer(actor);
  parent:=CASE WHEN TG_OP='DELETE'THEN OLD.request_id ELSE NEW.request_id END;
  IF parent IS NULL AND TG_OP<>'DELETE'THEN RAISE EXCEPTION 'Sourcing request unavailable';END IF;
  IF parent IS NOT NULL THEN
   SELECT buyer_id INTO actor FROM public.sourcing_requests WHERE id=parent;PERFORM public.assert_member_private_record_writer(actor);
   SELECT * INTO request FROM public.sourcing_requests WHERE id=parent FOR SHARE;IF NOT FOUND THEN RAISE EXCEPTION 'Sourcing request unavailable';END IF;
   PERFORM public.assert_member_private_record_writer(request.buyer_id);
  END IF;
  IF TG_OP='DELETE'AND(public.account_deletion_sourcing_quote_retained(OLD.id)OR public.account_deletion_sourcing_request_retained(parent))THEN RAISE EXCEPTION 'Sourcing financial retention requires explicit handling';END IF;
 ELSIF TG_TABLE_NAME='sourcing_events'THEN
  IF TG_OP='DELETE'AND public.account_deletion_sourcing_context(OLD.actor_id)AND OLD.actor_id IS NOT NULL THEN RETURN OLD;END IF;
  IF TG_OP='UPDATE'THEN
   IF NEW.actor_id IS DISTINCT FROM OLD.actor_id THEN RAISE EXCEPTION 'Sourcing event authorship is immutable';END IF;
   IF NEW.request_id IS NULL AND OLD.request_id IS NOT NULL
    AND(to_jsonb(NEW)-ARRAY['request_id','request_unavailable_at'])=(to_jsonb(OLD)-ARRAY['request_id','request_unavailable_at'])
    AND(public.account_deletion_sourcing_request_context(OLD.request_id)OR NOT EXISTS(SELECT 1 FROM public.sourcing_requests WHERE id=OLD.request_id))
   THEN NEW.request_unavailable_at:=coalesce(NEW.request_unavailable_at,clock_timestamp());RETURN NEW;END IF;
   IF NEW.quote_id IS NULL AND OLD.quote_id IS NOT NULL
    AND(to_jsonb(NEW)-ARRAY['quote_id','quote_unavailable_at'])=(to_jsonb(OLD)-ARRAY['quote_id','quote_unavailable_at'])
    AND(public.account_deletion_sourcing_quote_context(OLD.quote_id)OR NOT EXISTS(SELECT 1 FROM public.shopper_quotes WHERE id=OLD.quote_id))
   THEN NEW.quote_unavailable_at:=coalesce(NEW.quote_unavailable_at,clock_timestamp());RETURN NEW;END IF;
   IF NEW.request_id IS DISTINCT FROM OLD.request_id OR NEW.quote_id IS DISTINCT FROM OLD.quote_id THEN RAISE EXCEPTION 'Sourcing history parent is immutable';END IF;
   IF OLD.request_unavailable_at IS NOT NULL OR OLD.quote_unavailable_at IS NOT NULL
    OR NEW.request_unavailable_at IS DISTINCT FROM OLD.request_unavailable_at OR NEW.quote_unavailable_at IS DISTINCT FROM OLD.quote_unavailable_at THEN RAISE EXCEPTION 'Sourcing history is read-only';END IF;
  END IF;
  actor:=CASE WHEN TG_OP='DELETE'THEN OLD.actor_id ELSE NEW.actor_id END;IF actor IS NOT NULL THEN PERFORM public.assert_member_private_record_writer(actor);END IF;
  parent:=CASE WHEN TG_OP='DELETE'THEN OLD.request_id ELSE NEW.request_id END;
  IF parent IS NULL AND TG_OP<>'DELETE'THEN RAISE EXCEPTION 'Sourcing history is read-only';END IF;
  IF parent IS NOT NULL THEN
   SELECT buyer_id INTO actor FROM public.sourcing_requests WHERE id=parent;PERFORM public.assert_member_private_record_writer(actor);
   SELECT buyer_id INTO actor FROM public.sourcing_requests WHERE id=parent FOR SHARE;IF NOT FOUND THEN RAISE EXCEPTION 'Sourcing request unavailable';END IF;
   PERFORM public.assert_member_private_record_writer(actor);
  END IF;
  IF TG_OP<>'DELETE'AND NEW.quote_id IS NOT NULL THEN
   SELECT request_id INTO linked_parent FROM public.shopper_quotes WHERE id=NEW.quote_id FOR SHARE;
   IF NOT FOUND OR linked_parent IS DISTINCT FROM parent THEN RAISE EXCEPTION 'Sourcing history ownership requires review';END IF;
  END IF;
  IF TG_OP='DELETE'AND(OLD.event_type NOT IN('request_created','request_cancelled','quote_submitted','quote_withdrawn')OR public.account_deletion_sourcing_request_retained(parent)OR public.account_deletion_sourcing_quote_retained(OLD.quote_id))THEN RAISE EXCEPTION 'Sourcing history retention requires explicit handling';END IF;
 ELSE
  parent:=CASE WHEN TG_OP='DELETE'THEN OLD.request_id ELSE NEW.request_id END;
  IF TG_OP='DELETE'AND public.account_deletion_sourcing_request_context(parent)THEN RETURN OLD;END IF;
  old_parent:=CASE WHEN TG_OP='UPDATE'THEN OLD.request_id ELSE parent END;
  -- Check subjects before parent locks: a writer holding a child row must fail
  -- promptly on a queued deletion instead of inverting the cleaner's lock order.
  FOR actor IN SELECT buyer_id FROM public.sourcing_requests WHERE id IN(parent,old_parent)ORDER BY id LOOP PERFORM public.assert_member_private_record_writer(actor);END LOOP;
  FOR actor IN SELECT buyer_id FROM public.sourcing_requests WHERE id IN(parent,old_parent)ORDER BY id FOR SHARE LOOP PERFORM public.assert_member_private_record_writer(actor);END LOOP;
 END IF;
 IF TG_OP='DELETE'THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $$;
DO $$DECLARE relation text;BEGIN FOREACH relation IN ARRAY ARRAY['sourcing_requests','request_media','shopper_quotes','sourcing_events']LOOP EXECUTE format('CREATE TRIGGER account_deletion_sourcing_writer BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_sourcing_writer()',relation);END LOOP;END $$;
CREATE OR REPLACE FUNCTION public.accept_shopper_quote(_quote_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid(); q public.shopper_quotes; r public.sourcing_requests;
  totals jsonb; snapshot jsonb; merch integer; buyer_fee integer; seller_fee integer;
  payout integer; buyer_total integer; new_order uuid; request_key uuid;
  previous_trust text := coalesce(current_setting('parkvault.trusted_operation',true),'off');
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;

  SELECT request_id INTO request_key FROM public.shopper_quotes WHERE id=_quote_id;
  IF NOT FOUND OR request_key IS NULL THEN RAISE EXCEPTION 'Sourcing request unavailable';END IF;
  SELECT * INTO r FROM public.sourcing_requests WHERE id=request_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sourcing request unavailable';END IF;
  SELECT * INTO q FROM public.shopper_quotes WHERE id=_quote_id AND request_id=r.id FOR UPDATE;
  IF NOT FOUND OR q.unavailable_at IS NOT NULL THEN RAISE EXCEPTION 'Quote unavailable';END IF;
  IF r.buyer_id IS DISTINCT FROM uid THEN RAISE EXCEPTION 'Only the requesting member may accept a quote'; END IF;
  IF r.status <> 'open' THEN RAISE EXCEPTION 'This request is already closed to new quotes'; END IF;
  IF r.accepted_quote_id IS NOT NULL THEN RAISE EXCEPTION 'This request already has an accepted quote'; END IF;
  IF q.status <> 'submitted' THEN RAISE EXCEPTION 'This quote is no longer available'; END IF;
  IF q.expires_at <= now() THEN RAISE EXCEPTION 'This quote has expired'; END IF;
  IF q.currency <> r.currency THEN RAISE EXCEPTION 'Quote currency does not match the request'; END IF;
  IF q.shopper_id = uid THEN RAISE EXCEPTION 'You cannot accept your own quote'; END IF;

  PERFORM public.assert_member_private_record_writer(r.buyer_id);
  PERFORM public.assert_member_private_record_writer(q.shopper_id);
  PERFORM set_config('parkvault.trusted_operation','on',true);
  merch := q.merch_cost_cents + q.shopper_comp_cents;
  totals := public.compute_order_totals(merch, r.currency, NULL);
  buyer_fee := (totals->>'buyer_fee_cents')::int;

  -- Custom sourcing quotes only. During the validation pilot the platform takes
  -- no seller fee against merchandise reimbursement or shipping reimbursement,
  -- so the shopper is made whole on cost and paid the stated compensation in
  -- full. Ordinary in-hand Asks and Bids keep the schedule seller fee.
  seller_fee := 0;
  payout := merch - seller_fee;
  buyer_total := merch + buyer_fee + q.shipping_estimate_cents;

  snapshot := totals || jsonb_build_object(
    'quote_id', q.id,
    'pricing_model', 'custom_sourcing_quote_pilot',
    'merchandise_basis', 'merch_cost_cents + shopper_comp_cents',
    'merch_cost_cents', q.merch_cost_cents,
    'shopper_comp_cents', q.shopper_comp_cents,
    'merchandise_cents', merch,
    'buyer_fee_cents', buyer_fee,
    'seller_fee_cents', seller_fee,
    'seller_fee_waived_for_pilot', true,
    'seller_fee_schedule_bps', (totals->>'seller_fee_bps'),
    'shipping_cents', q.shipping_estimate_cents,
    'shipping_is_estimate', true,
    'shipping_reimbursement_cents', q.shipping_estimate_cents,
    'tax_cents', 0,
    'shipping_and_tax_calculated', false,
    'total_cents', buyer_total,
    'payout_cents', payout,
    'shopper_comp_included_in_payout', true,
    'shopper_total_payable_cents', q.merch_cost_cents + q.shopper_comp_cents + q.shipping_estimate_cents,
    'shopper_profit_cents', q.shopper_comp_cents,
    'platform_revenue_cents', buyer_fee,
    'fulfillment_window_days', q.fulfillment_window_days);

  INSERT INTO public.orders (
    buyer_id, seller_id, product_id, variant_id, origin, status, currency,
    merchandise_cents, buyer_fee_cents, seller_fee_cents, shipping_cents, tax_cents,
    total_cents, payout_cents, fee_schedule_id, fee_snapshot, reservation_expires_at, is_demo
  ) VALUES (
    uid, q.shopper_id, r.product_id, r.variant_id, 'sourcing_quote', 'awaiting_payment', r.currency,
    merch, buyer_fee, seller_fee, q.shipping_estimate_cents, 0,
    buyer_total, payout,
    (totals->>'fee_schedule_id')::uuid, snapshot, now() + public.reservation_window(), r.is_demo
  ) RETURNING id INTO new_order;

  UPDATE public.shopper_quotes SET status = 'accepted', matched_order_id = new_order WHERE id = q.id;
  UPDATE public.sourcing_requests
     SET status = 'quote_accepted', accepted_quote_id = q.id, matched_order_id = new_order, quote_count = 0
   WHERE id = r.id;
  UPDATE public.shopper_quotes SET status = 'declined'
   WHERE request_id = r.id AND id <> q.id AND status = 'submitted';

  INSERT INTO public.sourcing_events (request_id, quote_id, actor_id, event_type, note)
  VALUES (r.id, q.id, uid, 'quote_accepted',
          'The buyer accepted this quote; the request is closed to new quotes and the remaining quotes were declined.');

  INSERT INTO public.order_events (order_id, actor_id, to_status, note)
  VALUES (new_order, uid, 'awaiting_payment',
          'Accepted sourcing quote recorded. No seller fee is taken on a custom sourcing quote during the validation pilot: the shopper is owed merchandise cost, compensation and the shipping reimbursement in full. Shipping is an estimate, nothing has been charged, and live checkout is not enabled.');

  PERFORM set_config('parkvault.trusted_operation',previous_trust,true);
  RETURN new_order;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_sourcing_request(_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$BEGIN
 PERFORM public.assert_current_account_access(); -- bluebird-account-boundary-v1

DECLARE uid uuid := auth.uid(); r public.sourcing_requests;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  SELECT * INTO r FROM public.sourcing_requests WHERE id = _request_id AND buyer_id = uid FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Sourcing request not found'; END IF;
  IF r.status <> 'open' THEN RAISE EXCEPTION 'Only an open sourcing request can be cancelled'; END IF;

  UPDATE public.sourcing_requests SET status = 'cancelled' WHERE id = _request_id;
  UPDATE public.shopper_quotes SET status = 'declined'
   WHERE request_id = _request_id AND status = 'submitted';
  INSERT INTO public.sourcing_events (request_id, actor_id, event_type, note)
  VALUES (_request_id, uid, 'request_cancelled', 'Buyer cancelled the request; open quotes were declined.');
END;
END;$function$;

CREATE OR REPLACE FUNCTION public.create_sourcing_request(_variant_id uuid, _max_budget_cents integer DEFAULT NULL::integer, _buyer_note text DEFAULT NULL::text, _needed_by date DEFAULT NULL::date, _target_location_id uuid DEFAULT NULL::uuid, _media_paths text[] DEFAULT ARRAY[]::text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$BEGIN
 PERFORM public.assert_current_account_access(); -- bluebird-account-boundary-v1

DECLARE uid uuid := auth.uid(); v record; new_id uuid; p text; idx integer := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF _max_budget_cents IS NOT NULL AND (_max_budget_cents < 100 OR _max_budget_cents > 5000000) THEN
    RAISE EXCEPTION 'Budget out of range';
  END IF;
  PERFORM public.enforce_rate_limit('sourcing_request', 10, interval '1 day');

  SELECT pv.id, pv.product_id, p2.status, p2.is_demo, p2.retail_price_currency INTO v
  FROM public.product_variants pv JOIN public.products p2 ON p2.id = pv.product_id
  WHERE pv.id = _variant_id AND pv.active;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Unknown variation'; END IF;
  IF v.status <> 'published' THEN RAISE EXCEPTION 'Variation is not open for sourcing requests'; END IF;

  INSERT INTO public.sourcing_requests (buyer_id, product_id, variant_id, target_location_id,
                                        max_budget_cents, currency, buyer_note, needed_by, is_demo)
  VALUES (uid, v.product_id, _variant_id, _target_location_id, _max_budget_cents,
          v.retail_price_currency, nullif(btrim(_buyer_note),''), _needed_by, v.is_demo)
  RETURNING id INTO new_id;

  FOREACH p IN ARRAY coalesce(_media_paths, ARRAY[]::text[]) LOOP
    IF split_part(p, '/', 1) <> uid::text THEN
      RAISE EXCEPTION 'Reference photo does not belong to the caller';
    END IF;
    INSERT INTO public.request_media (request_id, storage_path, position) VALUES (new_id, p, idx);
    idx := idx + 1;
  END LOOP;
  UPDATE public.sourcing_requests SET media_count = idx WHERE id = new_id;

  INSERT INTO public.sourcing_events (request_id, actor_id, event_type, note)
  VALUES (new_id, uid, 'request_created', idx || ' private reference photo(s) attached');
  RETURN new_id;
END;
END;$function$;

CREATE OR REPLACE FUNCTION public.sourcing_board()
 RETURNS TABLE(request_id uuid, product_slug text, product_name text, variant_id uuid, variant_size text, variant_color text, variant_edition text, max_budget_cents integer, currency character, buyer_note text, needed_by date, quote_count integer, media_count integer, expires_at timestamp with time zone, created_at timestamp with time zone, my_quote_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT r.id, p.slug, p.name, r.variant_id, v.size, v.color, v.edition,
         r.max_budget_cents, r.currency, r.buyer_note, r.needed_by,
         r.quote_count, r.media_count, r.expires_at, r.created_at,
         (SELECT q.id FROM public.shopper_quotes q
           WHERE q.request_id = r.id
             AND q.shopper_id = auth.uid()
             AND q.status IN ('submitted', 'accepted')
           LIMIT 1)
  FROM public.sourcing_requests r
  JOIN public.products p ON p.id = r.product_id
  JOIN public.product_variants v ON v.id = r.variant_id
  WHERE auth.uid() IS NOT NULL
    AND public.has_role(auth.uid(), 'shopper')
    AND r.status = 'open'
    AND NOT EXISTS(SELECT 1 FROM public.mobile_account_deletions d WHERE d.user_id=r.buyer_id)
    AND NOT EXISTS(SELECT 1 FROM public.account_deletion_jobs j WHERE j.user_id=r.buyer_id AND j.status<>'completed')
    AND NOT r.is_demo
    AND r.expires_at > now()
  ORDER BY r.created_at DESC
  LIMIT 100
$function$;

CREATE OR REPLACE FUNCTION public.sourcing_request_media(_request_id uuid, _caller uuid)
 RETURNS TABLE(media_id uuid, storage_path text, caption text, sort_position integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$BEGIN
 PERFORM public.assert_current_account_access(); -- bluebird-account-boundary-v1

DECLARE
  r public.sourcing_requests; is_staff boolean; allowed boolean := false;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  PERFORM public.assert_member_private_record_writer(_caller);
  SELECT * INTO r FROM public.sourcing_requests WHERE id = _request_id FOR SHARE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Sourcing request not found'; END IF;
  PERFORM public.assert_member_private_record_writer(r.buyer_id);

  is_staff := public.has_role(_caller,'moderator') OR public.has_role(_caller,'admin');

  IF r.buyer_id = _caller THEN
    allowed := true;
  ELSIF is_staff THEN
    allowed := true;
    INSERT INTO public.admin_audit_log (actor_id, action, entity, entity_id, note)
    VALUES (_caller, 'sourcing_request_media_accessed', 'sourcing_requests', r.id,
            'Moderator or administrator opened the private reference photos on a sourcing request.');
  ELSIF public.has_role(_caller,'shopper') THEN
    IF r.status = 'open' AND r.expires_at > now() THEN
      allowed := true;
    ELSE
      allowed := EXISTS (
        SELECT 1 FROM public.shopper_quotes q
         WHERE q.id = r.accepted_quote_id AND q.shopper_id = _caller AND q.status = 'accepted');
    END IF;
  END IF;

  IF NOT allowed THEN RAISE EXCEPTION 'You are not permitted to view this reference media'; END IF;

  RETURN QUERY
    SELECT m.id, m.storage_path, m.caption, m."position"
      FROM public.request_media m
     WHERE m.request_id = r.id
     ORDER BY m."position", m.created_at;
END;
END;$function$;

CREATE OR REPLACE FUNCTION public.submit_shopper_quote(_request_id uuid, _merch_cost_cents integer, _shopper_comp_cents integer, _shipping_estimate_cents integer, _fulfillment_window_days integer, _availability_note text DEFAULT NULL::text, _valid_for_days integer DEFAULT 7)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid(); r public.sourcing_requests; totals jsonb;
  buyer_fee integer; delivered integer; new_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF NOT public.has_role(uid,'shopper') THEN
    RAISE EXCEPTION 'Only approved shoppers may quote on a sourcing request';
  END IF;
  IF _merch_cost_cents < 100 OR _merch_cost_cents > 5000000 THEN RAISE EXCEPTION 'Merchandise cost out of range'; END IF;
  IF _shopper_comp_cents < 0 OR _shopper_comp_cents > 500000 THEN RAISE EXCEPTION 'Shopper compensation out of range'; END IF;
  IF _shipping_estimate_cents < 0 OR _shipping_estimate_cents > 100000 THEN RAISE EXCEPTION 'Shipping estimate out of range'; END IF;
  IF _fulfillment_window_days < 1 OR _fulfillment_window_days > 60 THEN RAISE EXCEPTION 'Fulfilment window must be 1 to 60 days'; END IF;
  IF _valid_for_days < 1 OR _valid_for_days > 30 THEN RAISE EXCEPTION 'Quote validity must be 1 to 30 days'; END IF;
  PERFORM public.enforce_rate_limit('shopper_quote', 30, interval '1 day');

  SELECT * INTO r FROM public.sourcing_requests WHERE id = _request_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Sourcing request not found'; END IF;
  PERFORM public.assert_member_private_record_writer(r.buyer_id);
  IF r.status <> 'open' OR r.expires_at <= now() THEN
    RAISE EXCEPTION 'This request is no longer accepting quotes';
  END IF;
  IF r.buyer_id = uid THEN RAISE EXCEPTION 'You cannot quote on your own sourcing request'; END IF;

  -- The marketplace buyer fee is always recalculated from the effective schedule.
  totals := public.compute_order_totals(_merch_cost_cents + _shopper_comp_cents, r.currency, NULL);
  buyer_fee := (totals->>'buyer_fee_cents')::int;
  delivered := _merch_cost_cents + _shopper_comp_cents + buyer_fee + _shipping_estimate_cents;

  INSERT INTO public.shopper_quotes (
    request_id, shopper_id, merch_cost_cents, shopper_comp_cents, shipping_estimate_cents,
    buyer_fee_estimate_cents, delivered_estimate_cents, currency, availability_note,
    fulfillment_window_days, expires_at, is_demo)
  VALUES (_request_id, uid, _merch_cost_cents, _shopper_comp_cents, _shipping_estimate_cents,
          buyer_fee, delivered, r.currency, nullif(btrim(_availability_note),''),
          _fulfillment_window_days, now() + make_interval(days => _valid_for_days), r.is_demo)
  RETURNING id INTO new_id;

  UPDATE public.sourcing_requests
     SET quote_count = (SELECT count(*) FROM public.shopper_quotes q
                         WHERE q.request_id = _request_id AND q.status = 'submitted')
   WHERE id = _request_id;

  INSERT INTO public.sourcing_events (request_id, quote_id, actor_id, event_type, note)
  VALUES (_request_id, new_id, uid, 'quote_submitted', 'A shopper submitted a quote.');
  RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.withdraw_shopper_quote(_quote_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE uid uuid := auth.uid(); q public.shopper_quotes; r public.sourcing_requests; request_key uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  SELECT request_id INTO request_key FROM public.shopper_quotes WHERE id=_quote_id AND shopper_id=uid;
  IF NOT FOUND OR request_key IS NULL THEN RAISE EXCEPTION 'Sourcing request unavailable';END IF;
  SELECT * INTO r FROM public.sourcing_requests WHERE id=request_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sourcing request unavailable';END IF;
  SELECT * INTO q FROM public.shopper_quotes WHERE id=_quote_id AND shopper_id=uid AND request_id=r.id FOR UPDATE;
  IF NOT FOUND OR q.unavailable_at IS NOT NULL THEN RAISE EXCEPTION 'Quote unavailable';END IF;
  PERFORM public.assert_member_private_record_writer(r.buyer_id);
  IF q.status <> 'submitted' THEN RAISE EXCEPTION 'Only a submitted quote can be withdrawn'; END IF;

  UPDATE public.shopper_quotes SET status = 'withdrawn' WHERE id = _quote_id;
  UPDATE public.sourcing_requests
     SET quote_count = (SELECT count(*) FROM public.shopper_quotes q2
                         WHERE q2.request_id = q.request_id AND q2.status = 'submitted')
   WHERE id = q.request_id;
  INSERT INTO public.sourcing_events (request_id, quote_id, actor_id, event_type, note)
  VALUES (q.request_id, _quote_id, uid, 'quote_withdrawn', 'The shopper withdrew this quote.');
END;
$function$;

CREATE OR REPLACE FUNCTION public.quotes_for_my_requests()
 RETURNS TABLE(quote_id uuid, request_id uuid, merch_cost_cents integer, shopper_comp_cents integer, shipping_estimate_cents integer, buyer_fee_estimate_cents integer, delivered_estimate_cents integer, currency character, availability_note text, fulfillment_window_days integer, expires_at timestamp with time zone, status public.shopper_quote_status, matched_order_id uuid, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT q.id, q.request_id, q.merch_cost_cents, q.shopper_comp_cents,
         q.shipping_estimate_cents, q.buyer_fee_estimate_cents,
         q.delivered_estimate_cents, q.currency, q.availability_note,
         q.fulfillment_window_days, q.expires_at, q.status, q.matched_order_id,
         q.created_at
  FROM public.shopper_quotes q
  JOIN public.sourcing_requests r ON r.id = q.request_id
  WHERE auth.uid() IS NOT NULL
    AND r.buyer_id = auth.uid()
    AND NOT EXISTS(SELECT 1 FROM public.mobile_account_deletions d WHERE d.user_id=q.shopper_id)
    AND NOT EXISTS(SELECT 1 FROM public.account_deletion_jobs j WHERE j.user_id=q.shopper_id AND j.status<>'completed')
  ORDER BY q.delivered_estimate_cents ASC
$function$;
CREATE FUNCTION public.account_deletion_sourcing_catalog()RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$
 WITH sources AS(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname=ANY(ARRAY['sourcing_requests','request_media','shopper_quotes','sourcing_events']))
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
CREATE TABLE public.account_deletion_sourcing_contract(id boolean PRIMARY KEY DEFAULT true CHECK(id),catalog jsonb NOT NULL,functions jsonb NOT NULL);
ALTER TABLE public.account_deletion_sourcing_contract ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_sourcing_contract FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.account_deletion_sourcing_contract TO service_role;
CREATE FUNCTION public.account_deletion_sourcing_remaining(_user uuid)RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$
 SELECT EXISTS(SELECT 1 FROM public.sourcing_requests WHERE buyer_id=_user)OR EXISTS(SELECT 1 FROM public.shopper_quotes WHERE shopper_id=_user)OR EXISTS(SELECT 1 FROM public.sourcing_events WHERE actor_id=_user);
$$;
CREATE FUNCTION public.account_deletion_sourcing_scope(_id uuid,_user uuid,_lease uuid,_phase text)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''SET lock_timeout='1s'AS $$BEGIN
 PERFORM public.account_deletion_sighting_scope(_id,_user,_lease,_phase);
 LOCK TABLE public.sourcing_requests,public.request_media,public.shopper_quotes,public.sourcing_events IN ROW EXCLUSIVE MODE;
 IF NOT public.account_deletion_sourcing_barrier_current()THEN RAISE EXCEPTION 'Sourcing erasure requires schema review';END IF;
 IF _phase='records'AND public.account_deletion_sighting_remaining(_user)THEN RAISE EXCEPTION 'Complete community contributions before sourcing';END IF;
END $$;
CREATE FUNCTION public.purge_account_deletion_sourcing(_id uuid,_user uuid,_lease uuid,_limit integer DEFAULT 100)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''SET lock_timeout='1s'AS $$
DECLARE event public.sourcing_events;quote public.shopper_quotes;request public.sourcing_requests;item record;ids uuid[];parent uuid;parent_links uuid[];changed integer:=0;affected integer;selected text;
 previous_context text:=coalesce(current_setting('bluebird.sourcing_cleanup',true),'');BEGIN
 IF _limit IS NULL OR _limit NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'Sourcing erasure unavailable';END IF;
 PERFORM public.account_deletion_sourcing_scope(_id,_user,_lease,'records');
 PERFORM set_config('bluebird.sourcing_cleanup',jsonb_build_object('id',_id,'user',_user,'lease',_lease)::text,true);
 -- Authored ordinary event text goes first. Preserve every other actor's note.
 FOR event IN SELECT * FROM public.sourcing_events WHERE actor_id=_user ORDER BY id LIMIT _limit LOOP
  -- Quote and event request links retire in separate bounded passes. Either
  -- link can already be null during another member's legitimate cleanup.
  parent:=NULL;
  IF event.quote_id IS NOT NULL THEN SELECT request_id INTO parent FROM public.shopper_quotes WHERE id=event.quote_id;END IF;
  PERFORM 1 FROM public.sourcing_requests WHERE id IN(event.request_id,parent)ORDER BY id FOR UPDATE;
  SELECT * INTO event FROM public.sourcing_events WHERE id=event.id AND actor_id=_user FOR UPDATE;
  IF event.id IS NULL THEN RAISE EXCEPTION 'Sourcing history unavailable';END IF;
  parent:=NULL;
  IF event.quote_id IS NOT NULL THEN
   SELECT request_id INTO parent FROM public.shopper_quotes WHERE id=event.quote_id;
   IF NOT FOUND OR(parent IS NOT NULL AND event.request_id IS NOT NULL AND parent IS DISTINCT FROM event.request_id)THEN RAISE EXCEPTION 'Sourcing history ownership requires review';END IF;
  END IF;
  IF event.event_type NOT IN('request_created','request_cancelled','quote_submitted','quote_withdrawn')
   OR public.account_deletion_sourcing_request_retained(event.request_id)
   OR(parent IS DISTINCT FROM event.request_id AND public.account_deletion_sourcing_request_retained(parent))
   OR public.account_deletion_sourcing_quote_retained(event.quote_id)THEN RAISE EXCEPTION 'Sourcing history retention requires explicit handling';END IF;
  DELETE FROM public.sourcing_events WHERE id=event.id AND actor_id=_user;GET DIAGNOSTICS affected=ROW_COUNT;changed:=changed+affected;selected:='events';
 END LOOP;
 IF changed=0 THEN
  SELECT * INTO quote FROM public.shopper_quotes WHERE shopper_id=_user ORDER BY id LIMIT 1;
  IF quote.id IS NOT NULL THEN
   SELECT array_agg(request_id)INTO parent_links FROM(SELECT DISTINCT request_id FROM public.sourcing_events WHERE quote_id=quote.id AND request_id IS NOT NULL ORDER BY request_id LIMIT 2)p;
   -- A retired quote can still have events linked to its original request.
   -- At most one actual parent is supported; refuse legacy cross-request data.
   IF cardinality(parent_links)>1 OR(quote.request_id IS NOT NULL AND parent_links[1]IS NOT NULL AND parent_links[1]IS DISTINCT FROM quote.request_id)THEN RAISE EXCEPTION 'Sourcing history ownership requires review';END IF;
   parent:=coalesce(quote.request_id,parent_links[1]);
   IF parent IS NOT NULL THEN PERFORM 1 FROM public.sourcing_requests WHERE id=parent FOR UPDATE;END IF;
   SELECT * INTO quote FROM public.shopper_quotes WHERE id=quote.id AND shopper_id=_user FOR UPDATE;
   IF quote.id IS NULL THEN RAISE EXCEPTION 'Sourcing quote unavailable';END IF;
   IF public.account_deletion_sourcing_quote_retained(quote.id)OR public.account_deletion_sourcing_request_retained(quote.request_id)
    OR(parent IS DISTINCT FROM quote.request_id AND public.account_deletion_sourcing_request_retained(parent))THEN RAISE EXCEPTION 'Sourcing financial retention requires explicit handling';END IF;
   IF EXISTS(SELECT 1 FROM public.sourcing_events WHERE quote_id=quote.id AND request_id IS NOT NULL AND request_id IS DISTINCT FROM parent)THEN RAISE EXCEPTION 'Sourcing history ownership requires review';END IF;
   SELECT array_agg(id)INTO ids FROM(SELECT id FROM public.sourcing_events WHERE quote_id=quote.id ORDER BY id LIMIT _limit FOR UPDATE)r;
   IF ids IS NOT NULL THEN
    UPDATE public.sourcing_events SET quote_id=NULL,quote_unavailable_at=clock_timestamp()WHERE id=ANY(ids);GET DIAGNOSTICS changed=ROW_COUNT;selected:='quote_links';
   ELSE
    DELETE FROM public.shopper_quotes WHERE id=quote.id AND shopper_id=_user;GET DIAGNOSTICS changed=ROW_COUNT;selected:='quotes';
    IF quote.request_id IS NOT NULL THEN
     UPDATE public.sourcing_requests SET quote_count=(SELECT count(*)FROM public.shopper_quotes WHERE request_id=quote.request_id AND status='submitted')
      WHERE id=quote.request_id AND quote_count IS DISTINCT FROM(SELECT count(*)FROM public.shopper_quotes WHERE request_id=quote.request_id AND status='submitted');GET DIAGNOSTICS affected=ROW_COUNT;changed:=changed+affected;
    END IF;
   END IF;
  END IF;
 END IF;
 IF changed=0 THEN
  SELECT * INTO request FROM public.sourcing_requests WHERE buyer_id=_user ORDER BY id LIMIT 1 FOR UPDATE;
  IF request.id IS NOT NULL THEN
   IF public.account_deletion_sourcing_request_retained(request.id)THEN RAISE EXCEPTION 'Sourcing financial retention requires explicit handling';END IF;
   SELECT array_agg(id)INTO ids FROM(SELECT id FROM public.shopper_quotes WHERE request_id=request.id ORDER BY id LIMIT _limit FOR UPDATE)r;
   IF ids IS NOT NULL THEN
    UPDATE public.shopper_quotes SET request_id=NULL,unavailable_at=clock_timestamp()WHERE id=ANY(ids);GET DIAGNOSTICS changed=ROW_COUNT;selected:='request_quotes';
   END IF;
   IF changed=0 THEN
    SELECT array_agg(id)INTO ids FROM(SELECT id FROM public.sourcing_events WHERE request_id=request.id ORDER BY id LIMIT _limit FOR UPDATE)r;
    IF ids IS NOT NULL THEN
     UPDATE public.sourcing_events SET request_id=NULL,request_unavailable_at=clock_timestamp()WHERE id=ANY(ids);GET DIAGNOSTICS changed=ROW_COUNT;selected:='request_events';
    END IF;
   END IF;
   IF changed=0 THEN
    FOR item IN SELECT id,storage_path FROM public.request_media WHERE request_id=request.id ORDER BY id LIMIT(_limit-1)FOR UPDATE LOOP
     IF NOT public.account_deletion_listing_media_ready(_id,'request_media',item.id::text,'request-media',item.storage_path)THEN RAISE EXCEPTION 'Sourcing media inventory is incomplete';END IF;
     DELETE FROM public.request_media WHERE id=item.id AND request_id=request.id;GET DIAGNOSTICS affected=ROW_COUNT;changed:=changed+affected;selected:='media';
    END LOOP;
    IF changed>0 THEN
     UPDATE public.sourcing_requests SET media_count=(SELECT count(*)FROM public.request_media WHERE request_id=request.id)
      WHERE id=request.id AND media_count IS DISTINCT FROM(SELECT count(*)FROM public.request_media WHERE request_id=request.id);GET DIAGNOSTICS affected=ROW_COUNT;changed:=changed+affected;
    END IF;
   END IF;
   IF changed=0 THEN
    DELETE FROM public.sourcing_requests WHERE id=request.id AND buyer_id=_user;GET DIAGNOSTICS changed=ROW_COUNT;selected:='requests';
   END IF;
  END IF;
 END IF;
 PERFORM set_config('bluebird.sourcing_cleanup',previous_context,true);
 IF NOT public.account_deletion_lease_current(_id,_user,_lease,'records')OR NOT public.account_deletion_sourcing_barrier_current()
 OR public.account_access_coverage()IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)THEN RAISE EXCEPTION 'Sourcing erasure unavailable';END IF;
 IF changed=0 AND public.account_deletion_sourcing_remaining(_user)THEN RAISE EXCEPTION 'Sourcing retention requires explicit handling';END IF;
 RETURN jsonb_build_object('source',selected,'changed',changed,'pass_done',NOT public.account_deletion_sourcing_remaining(_user));
EXCEPTION WHEN OTHERS THEN PERFORM set_config('bluebird.sourcing_cleanup',previous_context,true);RAISE;END $$;
CREATE FUNCTION public.verify_account_deletion_sourcing(_id uuid,_user uuid,_lease uuid)RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''AS $$BEGIN
 PERFORM public.account_deletion_sourcing_scope(_id,_user,_lease,'verification');RETURN NOT public.account_deletion_sourcing_remaining(_user)AND public.account_deletion_lease_current(_id,_user,_lease,'verification');END $$;
CREATE FUNCTION public.guard_account_deletion_sourcing_completion()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''AS $$BEGIN IF NEW.status='completed'AND(NOT public.account_deletion_sourcing_barrier_current()OR public.account_deletion_sourcing_remaining(OLD.user_id))THEN RAISE EXCEPTION 'Sourcing erasure verification required';END IF;RETURN NEW;END $$;
CREATE TRIGGER guard_account_deletion_sourcing_completion AFTER UPDATE OF status,user_id ON public.account_deletion_jobs FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_sourcing_completion();
CREATE FUNCTION public.account_deletion_sourcing_functions()RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_array(md5(pg_get_functiondef(p.oid)),p.prosecdef,p.proconfig,p.proacl::text))FROM pg_proc p WHERE p.oid IN(
 'public.account_deletion_sourcing_context(uuid)'::regprocedure,'public.account_deletion_sourcing_request_context(uuid)'::regprocedure,'public.account_deletion_sourcing_quote_context(uuid)'::regprocedure,
 'public.account_deletion_sourcing_quote_retained(uuid)'::regprocedure,'public.account_deletion_sourcing_request_retained(uuid)'::regprocedure,'public.guard_account_deletion_sourcing_writer()'::regprocedure,
 'public.account_deletion_sourcing_catalog()'::regprocedure,'public.account_deletion_sourcing_remaining(uuid)'::regprocedure,'public.account_deletion_sourcing_scope(uuid,uuid,uuid,text)'::regprocedure,
 'public.purge_account_deletion_sourcing(uuid,uuid,uuid,integer)'::regprocedure,'public.verify_account_deletion_sourcing(uuid,uuid,uuid)'::regprocedure,'public.guard_account_deletion_sourcing_completion()'::regprocedure,
 'public.account_deletion_sourcing_functions()'::regprocedure,'public.account_deletion_listing_media_ready(uuid,text,text,text,text)'::regprocedure,'public.account_deletion_media_reference(text,text)'::regprocedure,
 'public.create_sourcing_request(uuid,integer,text,date,uuid,text[])'::regprocedure,'public.cancel_sourcing_request(uuid)'::regprocedure,'public.submit_shopper_quote(uuid,integer,integer,integer,integer,text,integer)'::regprocedure,
 'public.withdraw_shopper_quote(uuid)'::regprocedure,'public.accept_shopper_quote(uuid)'::regprocedure,'public.sourcing_board()'::regprocedure,'public.sourcing_request_media(uuid,uuid)'::regprocedure,'public.quotes_for_my_requests()'::regprocedure,to_regprocedure('public.account_deletion_sourcing_barrier_current()'));$$;
CREATE FUNCTION public.account_deletion_sourcing_barrier_current()RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$SELECT EXISTS(SELECT 1 FROM public.account_deletion_sourcing_contract WHERE id AND catalog=public.account_deletion_sourcing_catalog()AND functions=public.account_deletion_sourcing_functions());$$;
REVOKE ALL ON FUNCTION public.account_deletion_sourcing_context(uuid),public.account_deletion_sourcing_request_context(uuid),public.account_deletion_sourcing_quote_context(uuid),public.account_deletion_sourcing_quote_retained(uuid),public.account_deletion_sourcing_request_retained(uuid),public.guard_account_deletion_sourcing_writer(),public.account_deletion_sourcing_catalog(),public.account_deletion_sourcing_remaining(uuid),public.account_deletion_sourcing_scope(uuid,uuid,uuid,text),public.purge_account_deletion_sourcing(uuid,uuid,uuid,integer),public.verify_account_deletion_sourcing(uuid,uuid,uuid),public.guard_account_deletion_sourcing_completion(),public.account_deletion_sourcing_functions(),public.account_deletion_sourcing_barrier_current()FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.purge_account_deletion_sourcing(uuid,uuid,uuid,integer),public.verify_account_deletion_sourcing(uuid,uuid,uuid)TO service_role;
REVOKE ALL ON FUNCTION public.sourcing_request_media(uuid,uuid)FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sourcing_request_media(uuid,uuid)TO service_role;
SELECT public.protect_account_access_boundaries();
UPDATE public.account_deletion_private_contract SET hooks=public.account_deletion_private_hooks()WHERE id;
INSERT INTO public.account_deletion_sourcing_contract SELECT true,public.account_deletion_sourcing_catalog(),public.account_deletion_sourcing_functions();
DO $$BEGIN IF NOT public.account_deletion_sourcing_barrier_current()OR NOT public.account_deletion_sighting_barrier_current()OR NOT public.account_deletion_submission_barrier_current()OR NOT public.account_deletion_catalog_barrier_current()OR NOT public.account_deletion_private_barrier_current()OR public.account_access_coverage()IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)THEN RAISE EXCEPTION 'Sourcing boundaries require review';END IF;END $$;
COMMIT;
