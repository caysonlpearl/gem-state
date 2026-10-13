-- Authorized imports are direct-contact classifieds, not platform-shipped orders.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.apply_seller_shipping_defaults()'::regprocedure) INTO definition;
 definition:=replace(definition,'BEGIN', $guard$BEGIN
  IF coalesce(auth.role(),'')='service_role'
     AND EXISTS(SELECT 1 FROM public.managed_import_sellers WHERE owner_user_id=NEW.seller_id)
     AND current_setting('parkvault.trusted_operation',true)='on' THEN
    NEW.ship_by_days:=coalesce(NEW.ship_by_days,7);
    RETURN NEW;
  END IF;
$guard$);
 EXECUTE definition;
END $$;
NOTIFY pgrst,'reload schema';
