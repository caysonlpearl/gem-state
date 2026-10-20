BEGIN;
ALTER TABLE public.fb_marketplace_import_items
 ADD COLUMN IF NOT EXISTS item_details jsonb NOT NULL DEFAULT '{}'::jsonb,
 ADD COLUMN IF NOT EXISTS last_applied_item_details jsonb;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.fb_marketplace_import_items'::regclass AND conname='import_item_details_object') THEN
 ALTER TABLE public.fb_marketplace_import_items ADD CONSTRAINT import_item_details_object CHECK(jsonb_typeof(item_details)='object');
 END IF;
END $$;
-- Preserve the existing ownership, pause, consent, moderation and photo guards.
DO $$ BEGIN
 IF to_regprocedure('public.apply_managed_import_item_core_20261020(uuid,uuid,text[])') IS NULL THEN
 ALTER FUNCTION public.apply_managed_import_item(uuid,uuid,text[]) RENAME TO apply_managed_import_item_core_20261020;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.apply_managed_import_item(_item uuid,_actor uuid,_paths text[] DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result uuid; i public.fb_marketplace_import_items; current_details jsonb; next_details jsonb;
BEGIN
 PERFORM public.assert_import_operator(_actor);
 result:=public.apply_managed_import_item_core_20261020(_item,_actor,_paths);
 IF result IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO i FROM public.fb_marketplace_import_items WHERE id=_item FOR UPDATE;
 SELECT coalesce(item_details,'{}'::jsonb) INTO current_details FROM public.classified_listing_details WHERE listing_id=result FOR UPDATE;
 IF current_details IS NULL THEN RAISE EXCEPTION 'Imported listing details are missing'; END IF;
 IF i.item_details='{}'::jsonb THEN RETURN result; END IF;
 -- Seller edits take precedence; an exception rolls back the whole apply.
 IF i.last_applied_item_details IS NOT NULL AND current_details IS DISTINCT FROM i.last_applied_item_details THEN
   IF i.item_details IS DISTINCT FROM i.last_applied_item_details THEN
     RAISE EXCEPTION 'Listing details changed on Bluebird. Review the seller edits before applying this import';
   END IF;
   RETURN result;
 END IF;
 -- Existing real listings without an import baseline keep their classifications.
 IF i.last_applied_item_details IS NULL AND current_details<>'{}'::jsonb THEN RETURN result; END IF;
 next_details:=current_details || i.item_details;
 UPDATE public.classified_listing_details SET item_details=next_details WHERE listing_id=result;
 UPDATE public.fb_marketplace_import_items SET last_applied_item_details=next_details WHERE id=_item;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.apply_managed_import_item(uuid,uuid,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_managed_import_item(uuid,uuid,text[]) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
