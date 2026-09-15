-- Ensure the Cloud seed fixtures point at the authenticated seller account used
-- for the marketplace flow test. This is intentionally idempotent.
DO $repair$
DECLARE
  stale_owner constant uuid := '00000000-0000-0000-0000-000000000001';
  live_owner constant uuid := '8b810fde-e0ca-4d6d-bc72-00b35ee2a689';
BEGIN
  UPDATE public.asks AS a
     SET seller_id = live_owner
   WHERE a.seller_id = stale_owner
     AND EXISTS (
       SELECT 1
         FROM public.classified_listing_details AS d
        WHERE d.listing_id = a.id
     );

  UPDATE public.products AS p
     SET created_by = live_owner
   WHERE p.created_by = stale_owner
     AND EXISTS (
       SELECT 1
         FROM public.asks AS a
         JOIN public.classified_listing_details AS d ON d.listing_id = a.id
        WHERE a.product_id = p.id
          AND a.seller_id = live_owner
     );

  UPDATE public.ask_events AS e
     SET actor_id = live_owner
   WHERE e.actor_id = stale_owner
     AND EXISTS (
       SELECT 1
         FROM public.classified_listing_details AS d
        WHERE d.listing_id = e.ask_id
     );
END;
$repair$;
