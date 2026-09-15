-- The first Cloud seed run used a synthetic seller id that is not an
-- authenticated account. Reattach those classified fixtures to the real
-- test seller so buyer and seller flows can be exercised end to end.
DO $repair$
DECLARE
  stale_owner constant uuid := '00000000-0000-0000-0000-000000000001';
  live_owner uuid;
BEGIN
  SELECT id
    INTO live_owner
    FROM auth.users
   WHERE lower(email) = lower('cayson@xstayproperties.com')
   ORDER BY created_at
   LIMIT 1;

  IF live_owner IS NULL THEN
    RAISE NOTICE 'Classified seed owner repair skipped: test seller account not found';
    RETURN;
  END IF;

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
