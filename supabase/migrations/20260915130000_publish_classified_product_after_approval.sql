-- Classified asks and catalog products have separate moderation states.
-- Keep the public product state in sync when classified moderation approves an ask.
CREATE OR REPLACE FUNCTION public.publish_classified_product_after_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.status = 'active'
     AND NEW.approved_at IS NOT NULL
     AND NOT NEW.is_demo
     AND EXISTS (
       SELECT 1
       FROM public.classified_listing_details AS details
       WHERE details.listing_id = NEW.id
     ) THEN
    PERFORM set_config('parkvault.trusted_operation', 'on', true);

    UPDATE public.products
    SET status = 'published'::public.product_status
    WHERE id = NEW.product_id
      AND status = 'pending_review'::public.product_status;

    PERFORM set_config('parkvault.trusted_operation', 'off', true);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('parkvault.trusted_operation', 'off', true);
  RAISE;
END;
$function$;

DROP TRIGGER IF EXISTS publish_classified_product_after_approval
ON public.asks;

CREATE TRIGGER publish_classified_product_after_approval
AFTER UPDATE OF status, approved_at ON public.asks
FOR EACH ROW
EXECUTE FUNCTION public.publish_classified_product_after_approval();

REVOKE ALL ON FUNCTION public.publish_classified_product_after_approval() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_classified_product_after_approval() TO service_role;
