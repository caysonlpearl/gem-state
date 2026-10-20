-- Controlled QA identity only. All listing, audit and pause changes roll back.
BEGIN;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$
DECLARE m public.managed_import_sellers; actor uuid; batch uuid; item uuid; listing uuid; value text; subtype text; blocked boolean; count_before integer; count_after integer;
BEGIN
 SELECT * INTO m FROM public.managed_import_sellers WHERE display_name='QA legacy seller — disposable';
 IF m.id IS NULL THEN RAISE EXCEPTION 'Designated QA seller is missing'; END IF;
 SELECT user_id INTO actor FROM public.user_roles WHERE role='admin' LIMIT 1;
 SELECT id INTO batch FROM public.fb_marketplace_import_batches WHERE source_profile_url=m.source_profile_url LIMIT 1;
 IF actor IS NULL OR batch IS NULL THEN RAISE EXCEPTION 'Controlled QA setup is incomplete'; END IF;
 IF has_function_privilege('authenticated','public.apply_managed_import_item(uuid,uuid,text[])','EXECUTE') OR has_function_privilege('anon','public.apply_managed_import_item(uuid,uuid,text[])','EXECUTE') THEN RAISE EXCEPTION 'Import RPC is publicly executable'; END IF;
 SELECT count(*) INTO count_before FROM public.asks WHERE seller_id<>m.owner_user_id;
 UPDATE public.managed_import_sellers SET sync_enabled=true WHERE id=m.id;
 INSERT INTO public.fb_marketplace_import_items(batch_id,source_profile_url,source_url,title,description,price_cents,condition,category_slug,city,state,region,status,item_details)
 VALUES(batch,m.source_profile_url,'https://www.facebook.com/marketplace/item/bluebird-subcategory-rollback-qa','Subcategory rollback QA truck','Controlled import subcategory verification. This transaction always rolls back.',12500,'used_good','industrial','Boise','ID','Treasure Valley','draft','{"itemType":"Heavy Equipment/Tractors"}') RETURNING id INTO item;
 listing:=public.apply_managed_import_item(item,actor,ARRAY[m.owner_user_id::text || '/subcategory-rollback-qa.jpg']);
 SELECT item_details->>'itemType' INTO value FROM public.classified_listing_details WHERE listing_id=listing;
 IF value IS DISTINCT FROM 'Heavy Equipment/Tractors' THEN RAISE EXCEPTION 'Initial publication lost its subcategory'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.asks a JOIN public.products p ON p.id=a.product_id JOIN public.categories c ON c.id=p.category_id JOIN public.classified_listing_details d ON d.listing_id=a.id WHERE a.id=listing AND c.slug='industrial' AND d.item_details->>'itemType' ILIKE '%Heavy Equipment/Tractors%') THEN RAISE EXCEPTION 'Parent category and public filter do not match'; END IF;
 FOREACH subtype IN ARRAY ARRAY['Cranes','Generators','Hydraulics','Pumps','Truck Bodies','Trailers','Welding Equipment'] LOOP
 UPDATE public.fb_marketplace_import_items SET status='needs_update',item_details=jsonb_build_object('itemType',subtype) WHERE id=item;
 PERFORM public.apply_managed_import_item(item,actor,ARRAY[m.owner_user_id::text || '/subcategory-rollback-qa.jpg']);
 IF NOT EXISTS(SELECT 1 FROM public.classified_listing_details WHERE listing_id=listing AND item_details->>'itemType' ILIKE '%' || subtype || '%') THEN RAISE EXCEPTION 'Public filter lost new subcategory %',subtype; END IF;
 END LOOP;
 UPDATE public.fb_marketplace_import_items SET status='needs_update',item_details='{"itemType":"Cranes"}' WHERE id=item;
 PERFORM public.apply_managed_import_item(item,actor,ARRAY[m.owner_user_id::text || '/subcategory-rollback-qa.jpg']);
 SELECT item_details->>'itemType' INTO value FROM public.classified_listing_details WHERE listing_id=listing;
 IF value IS DISTINCT FROM 'Cranes' THEN RAISE EXCEPTION 'Refresh lost its subcategory'; END IF;
 -- A seller edit must block conflicting metadata and roll back the price update.
 UPDATE public.classified_listing_details SET item_details='{"itemType":"Welding Equipment"}' WHERE listing_id=listing;
 UPDATE public.fb_marketplace_import_items SET status='needs_update',price_cents=13000,item_details='{"itemType":"Pumps"}' WHERE id=item;
 blocked:=false;
 BEGIN
  PERFORM public.apply_managed_import_item(item,actor,ARRAY[m.owner_user_id::text || '/subcategory-rollback-qa.jpg']);
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'Listing details changed on Bluebird%' THEN blocked:=true; ELSE RAISE; END IF;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Seller classification edit was overwritten'; END IF;
 IF (SELECT price_cents FROM public.asks WHERE id=listing)<>12500 THEN RAISE EXCEPTION 'Conflict partially changed the price'; END IF;
 IF (SELECT item_details->>'itemType' FROM public.classified_listing_details WHERE listing_id=listing)<>'Welding Equipment' THEN RAISE EXCEPTION 'Seller edit did not survive'; END IF;
 UPDATE public.managed_import_sellers SET sync_enabled=false WHERE id=m.id;
 blocked:=false;
 BEGIN PERFORM public.apply_managed_import_item(item,actor,ARRAY[m.owner_user_id::text || '/subcategory-rollback-qa.jpg']);
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%paused%' THEN blocked:=true; ELSE RAISE; END IF; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Import ignored seller pause'; END IF;
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 PERFORM set_config('request.jwt.claims','{"role":"authenticated"}',true);
 blocked:=false;
 BEGIN PERFORM public.apply_managed_import_item(item,actor,ARRAY[m.owner_user_id::text || '/subcategory-rollback-qa.jpg']);
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%Administrator access required%' THEN blocked:=true; ELSE RAISE; END IF; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Non-service role could publish'; END IF;
 SELECT count(*) INTO count_after FROM public.asks WHERE seller_id<>m.owner_user_id;
 IF count_after<>count_before THEN RAISE EXCEPTION 'Unrelated seller listings changed'; END IF;
 RAISE NOTICE 'Passed: publish, refresh, seller-edit protection, atomic conflict rollback, pause, role denial, unrelated records';
END $$;
ROLLBACK;
SELECT 'PASS: publish, every new Industrial filter, refresh, seller edit protection, atomic rollback, pause and role denial; QA changes rolled back' AS integration_result;
