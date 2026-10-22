-- Disposable records only; all data rolls back.
BEGIN;
DO $$
DECLARE actor uuid; owner uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 s public.managed_import_sellers; batch uuid; item uuid; listing uuid; product uuid;
 original_category uuid; next_category uuid; before_count integer; denied boolean; result uuid;
BEGIN
 SELECT user_id INTO actor FROM public.user_roles WHERE role='admin' LIMIT 1;
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 SELECT count(*) INTO before_count FROM public.asks;
 INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data,banned_until)
 VALUES(owner,'qa-import-admin-'||owner||'@import.invalid','{"managed_import":true}','{}',now()+interval '100 years');
 INSERT INTO public.seller_profiles(user_id,slug,status) VALUES(owner,'qa-import-admin-'||substr(owner::text,1,8),'active');
 SELECT * INTO s FROM public.register_managed_import_seller('https://www.facebook.com/marketplace/profile/qa-'||owner||'/','QA import admin rollback',owner,actor);
 INSERT INTO public.fb_marketplace_import_batches(imported_by,source_profile_url,seller_name) VALUES(actor,s.source_profile_url,'QA import admin rollback') RETURNING id INTO batch;
 INSERT INTO public.fb_marketplace_import_items(batch_id,seller_id,source_profile_url,source_url,title,description,price_cents,condition,category_slug,city,state,region,evidence_paths,public_paths)
 VALUES(batch,owner,s.source_profile_url,'https://www.facebook.com/marketplace/item/qa-'||owner||'/','QA short description lamp','Great condition!',3000,'used_good','home-garden','Boise','ID','Treasure Valley',ARRAY[owner::text||'/qa.jpg'],ARRAY[owner::text||'/qa.jpg']) RETURNING id INTO item;
 listing:=public.apply_managed_import_item(item,actor,ARRAY[owner::text||'/qa.jpg']);
 SELECT product_id INTO product FROM public.asks WHERE id=listing;
 IF length((SELECT description FROM public.products WHERE id=product))<20 THEN RAISE EXCEPTION 'Short create not normalized'; END IF;
 -- Independent taxonomy changes must survive price/description updates.
 SELECT category_id INTO original_category FROM public.products WHERE id=product;
 SELECT id INTO next_category FROM public.categories WHERE slug='collectibles';
 UPDATE public.products SET category_id=next_category WHERE id=product;
 UPDATE public.fb_marketplace_import_items SET status='needs_update',price_cents=2300,description='6.6oz' WHERE id=item;
 result:=public.apply_managed_import_item(item,actor,NULL);
 IF result IS DISTINCT FROM listing OR (SELECT price_cents FROM public.asks WHERE id=listing)<>2300 OR (SELECT category_id FROM public.products WHERE id=product)<>next_category THEN RAISE EXCEPTION 'Safe category-only update failed'; END IF;
 IF (SELECT description FROM public.products WHERE id=product)<>E'6.6oz\n\nContact seller for more details.' THEN RAISE EXCEPTION 'Short update not normalized'; END IF;
 -- A real price conflict cannot be overwritten, and a retry stays on the same listing.
 UPDATE public.asks SET price_cents=2500 WHERE id=listing;
 UPDATE public.fb_marketplace_import_items SET status='needs_update',price_cents=2200 WHERE id=item;
 result:=public.apply_managed_import_item(item,actor,NULL);
 IF result IS NOT NULL OR (SELECT price_cents FROM public.asks WHERE id=listing)<>2500 THEN RAISE EXCEPTION 'Seller price overwritten'; END IF;
 PERFORM public.keep_bluebird_import_version(item,actor);
 -- Remove/restore protects all public data and excludes in-flight writes.
 PERFORM public.set_import_source_archived(s.source_profile_url,actor,true);
 IF NOT EXISTS(SELECT 1 FROM public.asks WHERE id=listing AND seller_id=owner AND status='active') THEN RAISE EXCEPTION 'Removal changed listing'; END IF;
 denied:=false; BEGIN UPDATE public.fb_marketplace_import_items SET status='needs_update' WHERE id=item; EXCEPTION WHEN OTHERS THEN denied:=SQLERRM LIKE '%removed%'; END;
 IF NOT denied THEN RAISE EXCEPTION 'Removed source staged an update'; END IF;
 denied:=false; BEGIN PERFORM public.apply_managed_import_item(item,actor,NULL); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM LIKE '%removed%'; END;
 IF NOT denied THEN RAISE EXCEPTION 'Removed source applied'; END IF;
 -- Claim/photo ownership transfers remain possible after removal.
 UPDATE public.fb_marketplace_import_items SET public_paths=ARRAY[owner::text||'/claimed-copy.jpg'] WHERE id=item;
 denied:=false; BEGIN PERFORM public.set_import_source_archived(s.source_profile_url,outsider,false); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Non-admin restored source'; END IF;
 PERFORM public.set_import_source_archived(s.source_profile_url,actor,false);
 UPDATE public.fb_marketplace_import_items SET status='needs_update',price_cents=2100 WHERE id=item;
 result:=public.apply_managed_import_item(item,actor,NULL);
 IF result IS DISTINCT FROM listing THEN RAISE EXCEPTION 'Restored source failed'; END IF;
 UPDATE public.managed_import_sellers SET sync_enabled=false WHERE id=s.id;
 denied:=false; BEGIN PERFORM public.apply_managed_import_item(item,actor,NULL); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM LIKE '%paused%'; END;
 IF NOT denied THEN RAISE EXCEPTION 'Pause bypassed'; END IF;
 IF (SELECT count(*) FROM public.asks)<>before_count+1 THEN RAISE EXCEPTION 'Unrelated listing count changed'; END IF;
 RAISE NOTICE 'PASS: short descriptions, category-only differences, price conflicts, remove/restore, in-flight write denial, photo-transfer allowance, admin-only access, paused sync and stable listing IDs';
END $$;
ROLLBACK;
SELECT 'PASS: importer admin integration tests; all controlled records rolled back' AS result;
