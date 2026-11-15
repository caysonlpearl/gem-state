-- Source-only authored catalog cleanup. Full media/retention/identity composition
-- is still required; this migration never activates a worker or erases provider bytes.
BEGIN;
SET LOCAL search_path=''; SET LOCAL lock_timeout='5s';
DO $$ DECLARE expected_columns jsonb:=$columns${"price_snapshots":{"id":["uuid",true,"gen_random_uuid()",""],"variant_id":["uuid",true,null,""],"captured_on":["date",true,"CURRENT_DATE",""],"currency":["character(3)",true,"'USD'::bpchar",""],"lowest_ask_cents":["integer",false,null,""],"highest_bid_cents":["integer",false,null,""],"lowest_sourcing_ask_cents":["integer",false,null,""],"last_sale_cents":["integer",false,null,""],"active_ask_count":["integer",true,"0",""],"active_bid_count":["integer",true,"0",""],"created_at":["timestamp with time zone",true,"now()",""],"last_verified_sale_cents":["integer",false,null,""],"last_verified_sale_at":["timestamp with time zone",false,null,""]},"product_facts":{"id":["uuid",true,"gen_random_uuid()",""],"product_id":["uuid",true,null,""],"label":["text",true,null,""],"value":["text",true,null,""],"position":["integer",true,"0",""],"created_at":["timestamp with time zone",true,"now()",""]},"product_images":{"id":["uuid",true,"gen_random_uuid()",""],"product_id":["uuid",true,null,""],"variant_id":["uuid",false,null,""],"storage_path":["text",true,null,""],"alt":["text",false,null,""],"kind":["product_image_kind",true,"'canonical'::product_image_kind",""],"position":["integer",true,"0",""],"approved_by":["uuid",false,null,""],"approved_at":["timestamp with time zone",false,null,""],"created_at":["timestamp with time zone",true,"now()",""],"approval_source":["text",false,null,""],"view_role":["text",true,"'gallery'::text",""],"angle_degrees":["smallint",false,null,""]},"product_models":{"id":["uuid",true,"gen_random_uuid()",""],"product_id":["uuid",true,null,""],"source_image_id":["uuid",false,null,""],"storage_path":["text",true,null,""],"poster_path":["text",false,null,""],"generation_method":["text",true,"'stable_fast_3d'::text",""],"status":["text",true,"'draft'::text",""],"disclosure":["text",true,"'AI-generated canonical 3D visualization'::text",""],"approved_by":["uuid",false,null,""],"approved_at":["timestamp with time zone",false,null,""],"approval_source":["text",false,null,""],"created_at":["timestamp with time zone",true,"now()",""],"updated_at":["timestamp with time zone",true,"now()",""]},"product_resorts":{"product_id":["uuid",true,null,""],"resort_id":["uuid",true,null,""]},"product_sources":{"id":["uuid",true,"gen_random_uuid()",""],"product_id":["uuid",true,null,""],"label":["text",true,null,""],"url":["text",true,null,""],"source_kind":["text",true,null,""],"observed_on":["date",false,null,""],"position":["integer",true,"0",""],"created_at":["timestamp with time zone",true,"now()",""]},"product_variants":{"id":["uuid",true,"gen_random_uuid()",""],"product_id":["uuid",true,null,""],"size":["text",false,null,""],"color":["text",false,null,""],"edition":["text",false,null,""],"sku_label":["text",false,null,""],"position":["integer",true,"0",""],"active":["boolean",true,"true",""],"variation_key":["text",false,"((((lower(btrim(COALESCE(size, '~'::text))) || '|'::text) || lower(btrim(COALESCE(color, '~'::text)))) || '|'::text) || lower(btrim(COALESCE(edition, '~'::text))))","s"],"created_at":["timestamp with time zone",true,"now()",""],"updated_at":["timestamp with time zone",true,"now()",""],"watch_baseline":["smallint",true,"0",""]},"products":{"id":["uuid",true,"gen_random_uuid()",""],"slug":["text",true,null,""],"name":["text",true,null,""],"brand_id":["uuid",false,null,""],"collection_id":["uuid",false,null,""],"category_id":["uuid",false,null,""],"description":["text",false,null,""],"release_date":["date",false,null,""],"release_type":["release_type",true,"'unknown'::release_type",""],"retail_price_cents":["integer",false,null,""],"retail_price_currency":["character(3)",true,"'USD'::bpchar",""],"retail_price_source":["text",false,null,""],"retail_price_observed_at":["timestamp with time zone",false,null,""],"status":["product_status",true,"'draft'::product_status",""],"is_demo":["boolean",true,"false",""],"created_by":["uuid",false,null,""],"created_at":["timestamp with time zone",true,"now()",""],"updated_at":["timestamp with time zone",true,"now()",""]}}$columns$::jsonb;
 expected_constraints jsonb:=$constraints${"price_snapshots.price_snapshots_pkey":"PRIMARY KEY (id)","price_snapshots.price_snapshots_variant_id_captured_on_key":"UNIQUE (variant_id, captured_on)","price_snapshots.price_snapshots_variant_id_fkey":"FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE","product_facts.product_facts_label_check":"CHECK (length(btrim(label)) >= 1 AND length(btrim(label)) <= 80)","product_facts.product_facts_pkey":"PRIMARY KEY (id)","product_facts.product_facts_product_id_fkey":"FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE","product_facts.product_facts_product_id_label_key":"UNIQUE (product_id, label)","product_facts.product_facts_value_check":"CHECK (length(btrim(value)) >= 1 AND length(btrim(value)) <= 1200)","product_images.product_images_approved_by_fkey":"FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL","product_images.product_images_canonical_only":"CHECK (kind = 'canonical'::product_image_kind)","product_images.product_images_pkey":"PRIMARY KEY (id)","product_images.product_images_product_id_fkey":"FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE","product_images.product_images_requires_approval":"CHECK (approved_at IS NULL AND approved_by IS NULL AND approval_source IS NULL OR approved_at IS NOT NULL AND (approved_by IS NOT NULL AND approval_source IS NULL OR approved_by IS NOT NULL AND approval_source = 'admin_console'::text OR approved_by IS NULL AND (approval_source = ANY (ARRAY['catalog_seed'::text, 'owned_photography'::text]))))","product_images.product_images_spin_angle_check":"CHECK (view_role = 'gallery'::text AND angle_degrees IS NULL OR view_role = 'spin'::text AND angle_degrees >= 0 AND angle_degrees <= 359)","product_images.product_images_variant_id_fkey":"FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL","product_images.product_images_view_role_check":"CHECK (view_role = ANY (ARRAY['gallery'::text, 'spin'::text]))","product_models.product_models_source_image_id_fkey":"FOREIGN KEY (source_image_id) REFERENCES product_images(id) ON DELETE SET NULL","product_models.product_models_approved_by_fkey":"FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL","product_models.product_models_pkey":"PRIMARY KEY (id)","product_models.product_models_poster_path_check":"CHECK (poster_path IS NULL OR poster_path ~ '^/images/products/'::text)","product_models.product_models_product_id_fkey":"FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE","product_models.product_models_requires_approval":"CHECK (status <> 'approved'::text AND approved_at IS NULL AND approved_by IS NULL AND approval_source IS NULL OR status = 'approved'::text AND approved_at IS NOT NULL AND (approved_by IS NOT NULL AND approval_source IS NULL OR approved_by IS NULL AND approval_source = 'catalog_seed'::text))","product_models.product_models_status_check":"CHECK (status = ANY (ARRAY['draft'::text, 'approved'::text, 'rejected'::text]))","product_models.product_models_storage_path_check":"CHECK (storage_path ~ '^/models/products/.+\\.glb$'::text)","product_resorts.product_resorts_pkey":"PRIMARY KEY (product_id, resort_id)","product_resorts.product_resorts_product_id_fkey":"FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE","product_resorts.product_resorts_resort_id_fkey":"FOREIGN KEY (resort_id) REFERENCES resorts(id) ON DELETE CASCADE","product_sources.product_sources_label_check":"CHECK (length(btrim(label)) >= 1 AND length(btrim(label)) <= 160)","product_sources.product_sources_pkey":"PRIMARY KEY (id)","product_sources.product_sources_product_id_fkey":"FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE","product_sources.product_sources_product_id_url_key":"UNIQUE (product_id, url)","product_sources.product_sources_source_kind_check":"CHECK (source_kind = ANY (ARRAY['official_announcement'::text, 'official_product_page'::text, 'official_menu'::text, 'independent_report'::text]))","product_sources.product_sources_url_check":"CHECK (url ~ '^https://'::text)","asks.asks_variant_id_fkey":"FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE","bids.bids_variant_id_fkey":"FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE","checkout_shipping_quotes.checkout_shipping_quotes_variant_id_fkey":"FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE","market_matches.market_matches_variant_id_fkey":"FOREIGN KEY (variant_id) REFERENCES product_variants(id)","orders.orders_variant_id_fkey":"FOREIGN KEY (variant_id) REFERENCES product_variants(id)","product_variants.product_variants_pkey":"PRIMARY KEY (id)","product_variants.product_variants_product_id_fkey":"FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE","product_variants.product_variants_product_id_variation_key_key":"UNIQUE (product_id, variation_key)","verified_sales.verified_sales_variant_id_fkey":"FOREIGN KEY (variant_id) REFERENCES product_variants(id)","sightings.sightings_variant_id_fkey":"FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE","sourcing_assignments.sourcing_assignments_variant_id_fkey":"FOREIGN KEY (variant_id) REFERENCES product_variants(id)","sourcing_requests.sourcing_requests_variant_id_fkey":"FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE","watchlist.watchlist_variant_id_fkey":"FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE","asks.asks_product_id_fkey":"FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE","bids.bids_product_id_fkey":"FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE","orders.orders_product_id_fkey":"FOREIGN KEY (product_id) REFERENCES products(id)","product_suggestions.product_suggestions_created_product_id_fkey":"FOREIGN KEY (created_product_id) REFERENCES products(id) ON DELETE SET NULL","product_suggestions.product_suggestions_merged_product_id_fkey":"FOREIGN KEY (merged_product_id) REFERENCES products(id) ON DELETE SET NULL","products.products_brand_id_fkey":"FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL","products.products_category_id_fkey":"FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL","products.products_collection_id_fkey":"FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE SET NULL","products.products_created_by_fkey":"FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL","products.products_pkey":"PRIMARY KEY (id)","products.products_retail_price_cents_check":"CHECK (retail_price_cents IS NULL OR retail_price_cents >= 0)","products.products_slug_key":"UNIQUE (slug)","verified_sales.verified_sales_product_id_fkey":"FOREIGN KEY (product_id) REFERENCES products(id)","sourcing_requests.sourcing_requests_product_id_fkey":"FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE"}$constraints$::jsonb;
 expected_hooks jsonb:=$hooks${"product_models.trg_product_models_touch":["CREATE TRIGGER trg_product_models_touch BEFORE UPDATE ON product_models FOR EACH ROW EXECUTE FUNCTION touch_updated_at()","O","9baf00d43cdeb2cd0e55c1de045be21b"],"product_variants.product_variants_watch_baseline":["CREATE TRIGGER product_variants_watch_baseline BEFORE INSERT ON product_variants FOR EACH ROW EXECUTE FUNCTION set_variant_watch_baseline()","O","6fa96ec79c192fe9697b9a1a1eca4001"],"product_variants.trg_variants_touch":["CREATE TRIGGER trg_variants_touch BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION touch_updated_at()","O","9baf00d43cdeb2cd0e55c1de045be21b"],"products.managed_product_edit":["CREATE TRIGGER managed_product_edit AFTER UPDATE ON products FOR EACH ROW EXECUTE FUNCTION flag_import_seller_edit()","O","8c5604dae1b6a79e06b7b0d5ee1397ce"],"products.trg_products_touch":["CREATE TRIGGER trg_products_touch BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION touch_updated_at()","O","9baf00d43cdeb2cd0e55c1de045be21b"]}$hooks$::jsonb;
 expected_hook_attrs jsonb:=$attrs${"product_models.trg_product_models_touch":[false,["search_path=public"]],"product_variants.product_variants_watch_baseline":[false,["search_path=public"]],"product_variants.trg_variants_touch":[false,["search_path=public"]],"products.managed_product_edit":[true,["search_path=public, pg_temp"]],"products.trg_products_touch":[false,["search_path=public"]]}$attrs$::jsonb;
 sources text[]:=ARRAY['price_snapshots','product_facts','product_images','product_models','product_resorts','product_sources','product_variants','products']; target text; actual jsonb;
BEGIN
 PERFORM 1 FROM public.account_deletion_controls WHERE id AND NOT worker_enabled FOR SHARE;
 IF NOT FOUND OR NOT public.account_deletion_listing_barrier_current() OR NOT public.account_deletion_profile_barrier_current()
 OR NOT public.account_deletion_private_barrier_current() OR NOT public.account_deletion_application_barrier_current()
 OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Review disabled catalog erasure prerequisites'; END IF;
 FOREACH target IN ARRAY sources LOOP
  EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE',target);
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=format('public.%I',target)::regclass AND relkind='r' AND NOT relispartition)
   OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhparent=format('public.%I',target)::regclass OR inhrelid=format('public.%I',target)::regclass)
   OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class=format('public.%I',target)::regclass) THEN RAISE EXCEPTION 'Review catalog layout'; END IF;
 END LOOP;
 SELECT jsonb_object_agg(relname,cols) INTO actual FROM(
  SELECT r.relname,jsonb_object_agg(a.attname,jsonb_build_array(replace(format_type(a.atttypid,a.atttypmod),'public.',''),a.attnotnull,replace(pg_get_expr(d.adbin,d.adrelid),'public.',''),a.attgenerated))cols
  FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace JOIN pg_attribute a ON a.attrelid=r.oid
  LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE n.nspname='public'AND r.relname=ANY(sources)AND a.attnum>0 AND NOT a.attisdropped GROUP BY r.relname)r;
 IF actual IS DISTINCT FROM expected_columns THEN RAISE EXCEPTION 'Review catalog columns'; END IF;
 SELECT jsonb_object_agg(replace(conrelid::regclass::text,'public.','')||'.'||conname,replace(pg_get_constraintdef(oid,true),'public.','')) INTO actual
 FROM pg_constraint WHERE contype<>'n' AND(conrelid IN(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname=ANY(sources))
 OR confrelid IN(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname=ANY(sources)));
 IF actual IS DISTINCT FROM expected_constraints OR EXISTS(SELECT 1 FROM pg_constraint WHERE
 (conrelid IN(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname=ANY(sources))
 OR confrelid IN(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname=ANY(sources)))AND(NOT convalidated OR condeferrable))
 THEN RAISE EXCEPTION 'Review catalog relationships'; END IF;
 SELECT coalesce(jsonb_object_agg(c.relname||'.'||t.tgname,jsonb_build_array(replace(pg_get_triggerdef(t.oid,true),'public.',''),t.tgenabled,md5(p.prosrc))),'{}')INTO actual
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
 WHERE n.nspname='public'AND c.relname=ANY(sources)AND NOT t.tgisinternal;
 IF actual IS DISTINCT FROM expected_hooks THEN RAISE EXCEPTION 'Review catalog hooks'; END IF;
 SELECT coalesce(jsonb_object_agg(c.relname||'.'||t.tgname,jsonb_build_array(p.prosecdef,p.proconfig)),'{}')INTO actual
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
 WHERE n.nspname='public'AND c.relname=ANY(sources)AND NOT t.tgisinternal;
 IF actual IS DISTINCT FROM expected_hook_attrs THEN RAISE EXCEPTION 'Review catalog hook privileges';END IF;
END $$;

ALTER TABLE public.products DROP CONSTRAINT products_created_by_fkey,ADD CONSTRAINT products_created_by_fkey FOREIGN KEY(created_by)REFERENCES auth.users(id)ON DELETE RESTRICT;
ALTER TABLE public.product_images DROP CONSTRAINT product_images_approved_by_fkey,ADD CONSTRAINT product_images_approved_by_fkey FOREIGN KEY(approved_by)REFERENCES auth.users(id)ON DELETE RESTRICT;
ALTER TABLE public.product_models DROP CONSTRAINT product_models_approved_by_fkey,ADD CONSTRAINT product_models_approved_by_fkey FOREIGN KEY(approved_by)REFERENCES auth.users(id)ON DELETE RESTRICT;
CREATE INDEX account_deletion_catalog_author ON public.products(created_by,id);
CREATE INDEX account_deletion_catalog_image_approver ON public.product_images(approved_by,id);
CREATE INDEX account_deletion_catalog_model_approver ON public.product_models(approved_by,id);
CREATE INDEX account_deletion_catalog_model_source ON public.product_models(source_image_id,product_id);

CREATE FUNCTION public.account_deletion_catalog_member_context(_user uuid)RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE context jsonb; BEGIN
 context:=nullif(current_setting('bluebird.catalog_cleanup',true),'')::jsonb;
 IF context IS NULL OR context->>'user' IS DISTINCT FROM _user::text THEN RETURN false;END IF;
 RETURN public.account_deletion_lease_current((context->>'id')::uuid,_user,(context->>'lease')::uuid,'records')AND public.account_deletion_catalog_barrier_current();
EXCEPTION WHEN OTHERS THEN RETURN false;END $$;
CREATE FUNCTION public.account_deletion_owned_catalog_context(_product uuid)RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$ SELECT coalesce((SELECT public.account_deletion_catalog_member_context(created_by)FROM public.products WHERE id=_product),false);$$;

CREATE FUNCTION public.guard_account_deletion_catalog_writer()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE parent uuid;old_parent uuid;member uuid;owner_record record;BEGIN
 IF TG_TABLE_NAME='products' THEN
  IF TG_OP='DELETE' AND public.account_deletion_owned_catalog_context(OLD.id)THEN RETURN OLD;END IF;
  IF TG_OP='UPDATE'AND public.account_deletion_owned_catalog_context(OLD.id)AND NEW.status='draft'
   AND (to_jsonb(NEW)-ARRAY['status','updated_at'])=(to_jsonb(OLD)-ARRAY['status','updated_at'])THEN RETURN NEW;END IF;
  FOR member IN SELECT DISTINCT u FROM unnest(CASE WHEN TG_OP='DELETE'THEN ARRAY[OLD.created_by]WHEN TG_OP='UPDATE'THEN ARRAY[OLD.created_by,NEW.created_by]ELSE ARRAY[NEW.created_by]END)u WHERE u IS NOT NULL ORDER BY u LOOP
   PERFORM public.assert_member_private_record_writer(member);
  END LOOP;
  IF TG_OP='DELETE'THEN RETURN OLD;ELSE RETURN NEW;END IF;
 END IF;
 IF TG_TABLE_NAME='price_snapshots' THEN
  SELECT product_id INTO parent FROM public.product_variants WHERE id=CASE WHEN TG_OP='DELETE'THEN OLD.variant_id ELSE NEW.variant_id END FOR SHARE;
  IF parent IS NULL AND TG_OP<>'DELETE'THEN RETURN NULL;END IF;
  IF TG_OP='UPDATE'THEN SELECT product_id INTO old_parent FROM public.product_variants WHERE id=OLD.variant_id FOR SHARE;END IF;
 ELSE
  parent:=CASE WHEN TG_OP='DELETE'THEN OLD.product_id ELSE NEW.product_id END;
  IF TG_OP='UPDATE'THEN old_parent:=OLD.product_id;END IF;
 END IF;
 IF TG_OP='DELETE'AND public.account_deletion_owned_catalog_context(parent)THEN RETURN OLD;END IF;
 FOR owner_record IN SELECT p.id,p.created_by FROM public.products p WHERE p.id IN(parent,old_parent)ORDER BY p.id FOR SHARE LOOP
  IF owner_record.created_by IS NULL THEN CONTINUE;END IF;
  IF TG_TABLE_NAME='price_snapshots'AND TG_OP<>'DELETE'THEN
   BEGIN PERFORM public.assert_member_private_record_writer(owner_record.created_by);EXCEPTION WHEN OTHERS THEN RETURN NULL;END;
  ELSE PERFORM public.assert_member_private_record_writer(owner_record.created_by);END IF;
 END LOOP;
 -- Catalog namespaces are product/business namespaces. Never infer media
 -- ownership from a UUID path prefix or assign it to an approver.
 IF TG_TABLE_NAME IN('product_images','product_models')AND TG_OP<>'DELETE' THEN
  IF NEW.approved_by IS NOT NULL AND(TG_OP='INSERT'OR NEW.approved_by IS DISTINCT FROM OLD.approved_by)THEN PERFORM public.assert_member_private_record_writer(NEW.approved_by);END IF;
 END IF;
 IF TG_OP='DELETE'THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $$;
DO $$ DECLARE relation text;BEGIN
 FOREACH relation IN ARRAY ARRAY['products','product_variants','product_images','product_models','product_facts','product_sources','product_resorts','price_snapshots']LOOP
  EXECUTE format('CREATE TRIGGER account_deletion_catalog_writer BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_catalog_writer()',relation);
 END LOOP;
END $$;

CREATE FUNCTION public.account_deletion_catalog_retention(_product uuid)RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.asks WHERE product_id=_product OR variant_id IN(SELECT id FROM public.product_variants WHERE product_id=_product))
 OR EXISTS(SELECT 1 FROM public.bids WHERE product_id=_product OR variant_id IN(SELECT id FROM public.product_variants WHERE product_id=_product))
 OR EXISTS(SELECT 1 FROM public.orders WHERE product_id=_product OR variant_id IN(SELECT id FROM public.product_variants WHERE product_id=_product))
 OR EXISTS(SELECT 1 FROM public.verified_sales WHERE product_id=_product OR variant_id IN(SELECT id FROM public.product_variants WHERE product_id=_product))
 OR EXISTS(SELECT 1 FROM public.sourcing_requests WHERE product_id=_product OR variant_id IN(SELECT id FROM public.product_variants WHERE product_id=_product))
 OR EXISTS(SELECT 1 FROM public.sourcing_assignments WHERE variant_id IN(SELECT id FROM public.product_variants WHERE product_id=_product))
 OR EXISTS(SELECT 1 FROM public.market_matches WHERE variant_id IN(SELECT id FROM public.product_variants WHERE product_id=_product))
 OR EXISTS(SELECT 1 FROM public.checkout_shipping_quotes WHERE variant_id IN(SELECT id FROM public.product_variants WHERE product_id=_product))
 OR EXISTS(SELECT 1 FROM public.sightings WHERE variant_id IN(SELECT id FROM public.product_variants WHERE product_id=_product))
 OR EXISTS(SELECT 1 FROM public.watchlist WHERE variant_id IN(SELECT id FROM public.product_variants WHERE product_id=_product))
 OR EXISTS(SELECT 1 FROM public.product_suggestions WHERE created_product_id=_product OR merged_product_id=_product)
 OR EXISTS(SELECT 1 FROM public.product_images WHERE product_id<>_product AND variant_id IN(SELECT id FROM public.product_variants WHERE product_id=_product))
 OR EXISTS(SELECT 1 FROM public.product_models WHERE product_id<>_product AND source_image_id IN(SELECT id FROM public.product_images WHERE product_id=_product));
$$;
CREATE FUNCTION public.account_deletion_catalog_remaining(_user uuid)RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.products WHERE created_by=_user)
 OR EXISTS(SELECT 1 FROM public.product_images WHERE approved_by=_user)
 OR EXISTS(SELECT 1 FROM public.product_models WHERE approved_by=_user);
$$;
CREATE FUNCTION public.account_deletion_catalog_catalog()RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 WITH sources AS(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname=ANY(ARRAY['products','product_variants','product_images','product_models','product_facts','product_sources','product_resorts','price_snapshots']))
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
CREATE TABLE public.account_deletion_catalog_contract(id boolean PRIMARY KEY DEFAULT true CHECK(id),catalog jsonb NOT NULL,functions jsonb NOT NULL);
ALTER TABLE public.account_deletion_catalog_contract ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_catalog_contract FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.account_deletion_catalog_contract TO service_role;
CREATE FUNCTION public.account_deletion_catalog_scope(_id uuid,_user uuid,_lease uuid,_phase text)RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$ BEGIN
 PERFORM public.account_deletion_listing_scope(_id,_user,_lease,_phase);
 LOCK TABLE public.products,public.product_variants,public.product_images,public.product_models,public.product_facts,public.product_sources,public.product_resorts,public.price_snapshots IN ROW EXCLUSIVE MODE;
 IF NOT public.account_deletion_catalog_barrier_current()THEN RAISE EXCEPTION 'Catalog erasure requires schema review';END IF;
 IF public.account_deletion_listing_remaining(_user)THEN RAISE EXCEPTION 'Complete listing cleanup before catalog erasure';END IF;
END $$;
CREATE FUNCTION public.purge_account_deletion_catalog(_id uuid,_user uuid,_lease uuid,_limit integer DEFAULT 100)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE item public.products;model public.product_models;image public.product_images;variant uuid;ids uuid[];changed integer:=0;selected text;source text;
 previous_context text:=coalesce(current_setting('bluebird.catalog_cleanup',true),'');previous_trust text:=coalesce(current_setting('parkvault.trusted_operation',true),'');
BEGIN
 IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Catalog erasure unavailable';END IF;
 PERFORM public.account_deletion_catalog_scope(_id,_user,_lease,'records');
 IF EXISTS(SELECT 1 FROM public.product_images i JOIN public.products p ON p.id=i.product_id WHERE i.approved_by=_user AND p.created_by IS DISTINCT FROM _user)
 OR EXISTS(SELECT 1 FROM public.product_models m JOIN public.products p ON p.id=m.product_id WHERE m.approved_by=_user AND p.created_by IS DISTINCT FROM _user)
 THEN RAISE EXCEPTION 'Catalog moderation retention requires explicit handling';END IF;
 PERFORM set_config('bluebird.catalog_cleanup',jsonb_build_object('id',_id,'user',_user,'lease',_lease)::text,true);
 PERFORM set_config('parkvault.trusted_operation','on',true);
 SELECT * INTO item FROM public.products WHERE created_by=_user ORDER BY id LIMIT 1 FOR UPDATE;
 IF item.id IS NOT NULL THEN
  IF public.account_deletion_catalog_retention(item.id)THEN RAISE EXCEPTION 'Shared or financial catalog retention requires explicit handling';END IF;
  IF item.status<>'draft'THEN UPDATE public.products SET status='draft'WHERE id=item.id;GET DIAGNOSTICS changed=ROW_COUNT;selected:='unpublished';END IF;
  IF changed=0 THEN
   SELECT * INTO model FROM public.product_models WHERE product_id=item.id ORDER BY id LIMIT 1 FOR UPDATE;
   IF model.id IS NOT NULL THEN
    IF NOT public.account_deletion_listing_media_ready(_id,'product_models',model.id::text,NULL,model.storage_path)
     OR(model.poster_path IS NOT NULL AND NOT public.account_deletion_listing_media_ready(_id,'product_models_poster',model.id::text,NULL,model.poster_path))
    THEN RAISE EXCEPTION 'Catalog model inventory requires resolution';END IF;
    DELETE FROM public.product_models WHERE id=model.id AND product_id=item.id;GET DIAGNOSTICS changed=ROW_COUNT;selected:='models';
   END IF;
  END IF;
  IF changed=0 THEN
   SELECT * INTO image FROM public.product_images WHERE product_id=item.id ORDER BY id LIMIT 1 FOR UPDATE;
   IF image.id IS NOT NULL THEN
    IF NOT public.account_deletion_listing_media_ready(_id,'product_images',image.id::text,'catalog-media',image.storage_path)THEN RAISE EXCEPTION 'Catalog image inventory is incomplete';END IF;
    DELETE FROM public.product_images WHERE id=image.id AND product_id=item.id;GET DIAGNOSTICS changed=ROW_COUNT;selected:='images';
   END IF;
  END IF;
  FOREACH source IN ARRAY ARRAY['product_facts','product_sources']LOOP
   IF changed=0 THEN
    EXECUTE format('WITH targets AS MATERIALIZED(SELECT id FROM public.%I WHERE product_id=$1 ORDER BY id LIMIT $2 FOR UPDATE)DELETE FROM public.%I r USING targets t WHERE r.id=t.id',source,source)USING item.id,_limit;
    GET DIAGNOSTICS changed=ROW_COUNT;IF changed>0 THEN selected:=CASE WHEN source='product_facts'THEN 'facts'ELSE 'sources'END;END IF;
   END IF;
  END LOOP;
  IF changed=0 THEN
   WITH targets AS MATERIALIZED(SELECT product_id,resort_id FROM public.product_resorts WHERE product_id=item.id ORDER BY resort_id LIMIT _limit FOR UPDATE)
   DELETE FROM public.product_resorts r USING targets t WHERE r.product_id=t.product_id AND r.resort_id=t.resort_id;
   GET DIAGNOSTICS changed=ROW_COUNT;IF changed>0 THEN selected:='resorts';END IF;
  END IF;
  IF changed=0 THEN
   SELECT id INTO variant FROM public.product_variants WHERE product_id=item.id ORDER BY id LIMIT 1 FOR UPDATE;
   IF variant IS NOT NULL THEN
    -- A new bid/order/sighting can reference a variant without locking its
    -- product. Lock this variant before the final relationship check.
    IF public.account_deletion_catalog_retention(item.id)THEN RAISE EXCEPTION 'Shared or financial catalog retention requires explicit handling';END IF;
    WITH targets AS MATERIALIZED(SELECT id FROM public.price_snapshots WHERE variant_id=variant ORDER BY id LIMIT _limit FOR UPDATE)
    DELETE FROM public.price_snapshots r USING targets t WHERE r.id=t.id;
    GET DIAGNOSTICS changed=ROW_COUNT;
    IF changed>0 THEN selected:='snapshots';ELSE DELETE FROM public.product_variants WHERE id=variant AND product_id=item.id;GET DIAGNOSTICS changed=ROW_COUNT;selected:='variants';END IF;
   ELSE
    IF public.account_deletion_catalog_retention(item.id)THEN RAISE EXCEPTION 'Catalog relationships require explicit handling';END IF;
    DELETE FROM public.products WHERE id=item.id AND created_by=_user;GET DIAGNOSTICS changed=ROW_COUNT;selected:='products';
   END IF;
  END IF;
 END IF;
 PERFORM set_config('bluebird.catalog_cleanup',previous_context,true);PERFORM set_config('parkvault.trusted_operation',previous_trust,true);
 IF NOT public.account_deletion_lease_current(_id,_user,_lease,'records')OR NOT public.account_deletion_catalog_barrier_current()
 OR public.account_access_coverage()IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)THEN RAISE EXCEPTION 'Catalog erasure unavailable';END IF;
 IF changed=0 AND public.account_deletion_catalog_remaining(_user)THEN RAISE EXCEPTION 'Catalog retention requires explicit handling';END IF;
 RETURN jsonb_build_object('source',selected,'changed',changed,'pass_done',NOT public.account_deletion_catalog_remaining(_user));
EXCEPTION WHEN OTHERS THEN PERFORM set_config('bluebird.catalog_cleanup',previous_context,true);PERFORM set_config('parkvault.trusted_operation',previous_trust,true);RAISE;
END $$;
CREATE FUNCTION public.verify_account_deletion_catalog(_id uuid,_user uuid,_lease uuid)RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$ BEGIN
 PERFORM public.account_deletion_catalog_scope(_id,_user,_lease,'verification');
 RETURN NOT public.account_deletion_catalog_remaining(_user)AND public.account_deletion_lease_current(_id,_user,_lease,'verification');
END $$;
CREATE FUNCTION public.guard_account_deletion_catalog_completion()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NEW.status='completed'AND(NOT public.account_deletion_catalog_barrier_current()OR public.account_deletion_catalog_remaining(OLD.user_id))THEN RAISE EXCEPTION 'Catalog erasure verification required';END IF;RETURN NEW;
END $$;
CREATE TRIGGER guard_account_deletion_catalog_completion AFTER UPDATE OF status,user_id ON public.account_deletion_jobs FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_catalog_completion();
CREATE FUNCTION public.account_deletion_catalog_functions()RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_object_agg(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid)))FROM pg_proc p WHERE p.oid IN(
 'public.account_deletion_catalog_member_context(uuid)'::regprocedure,'public.account_deletion_owned_catalog_context(uuid)'::regprocedure,'public.guard_account_deletion_catalog_writer()'::regprocedure,
 'public.account_deletion_catalog_retention(uuid)'::regprocedure,'public.account_deletion_catalog_remaining(uuid)'::regprocedure,'public.account_deletion_catalog_catalog()'::regprocedure,
 'public.account_deletion_catalog_scope(uuid,uuid,uuid,text)'::regprocedure,'public.purge_account_deletion_catalog(uuid,uuid,uuid,integer)'::regprocedure,'public.verify_account_deletion_catalog(uuid,uuid,uuid)'::regprocedure,
 'public.guard_account_deletion_catalog_completion()'::regprocedure,'public.account_deletion_catalog_functions()'::regprocedure,
 'public.account_deletion_listing_media_ready(uuid,text,text,text,text)'::regprocedure,'public.account_deletion_media_reference(text,text)'::regprocedure,
 to_regprocedure('public.account_deletion_catalog_barrier_current()'));
$$;
CREATE FUNCTION public.account_deletion_catalog_barrier_current()RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.account_deletion_catalog_contract WHERE id AND catalog=public.account_deletion_catalog_catalog()AND functions=public.account_deletion_catalog_functions());$$;
REVOKE ALL ON FUNCTION public.account_deletion_catalog_member_context(uuid),public.account_deletion_owned_catalog_context(uuid),public.guard_account_deletion_catalog_writer(),public.account_deletion_catalog_retention(uuid),public.account_deletion_catalog_remaining(uuid),public.account_deletion_catalog_catalog(),public.account_deletion_catalog_scope(uuid,uuid,uuid,text),public.purge_account_deletion_catalog(uuid,uuid,uuid,integer),public.verify_account_deletion_catalog(uuid,uuid,uuid),public.guard_account_deletion_catalog_completion(),public.account_deletion_catalog_functions(),public.account_deletion_catalog_barrier_current()FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.purge_account_deletion_catalog(uuid,uuid,uuid,integer),public.verify_account_deletion_catalog(uuid,uuid,uuid)TO service_role;
SELECT public.protect_account_access_boundaries();
UPDATE public.account_deletion_private_contract SET hooks=public.account_deletion_private_hooks()WHERE id;
INSERT INTO public.account_deletion_catalog_contract SELECT true,public.account_deletion_catalog_catalog(),public.account_deletion_catalog_functions();
DO $$ BEGIN
 IF NOT public.account_deletion_catalog_barrier_current()OR NOT public.account_deletion_listing_barrier_current()OR NOT public.account_deletion_profile_barrier_current()OR NOT public.account_deletion_private_barrier_current()OR NOT public.account_deletion_application_barrier_current()THEN RAISE EXCEPTION 'Catalog erasure boundaries require review';END IF;
END $$;
COMMIT;
