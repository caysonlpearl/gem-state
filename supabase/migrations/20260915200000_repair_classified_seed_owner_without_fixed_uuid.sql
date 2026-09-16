-- Re-run the demo-fixture owner repair without depending on a hard-coded
-- account UUID. This is safe to apply after earlier seed-repair migrations.
DO $repair$
DECLARE
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
   WHERE a.is_demo
     AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = a.seller_id)
     AND EXISTS (
       SELECT 1 FROM public.classified_listing_details AS d
       WHERE d.listing_id = a.id
     );

  UPDATE public.products AS p
     SET created_by = live_owner
   WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.created_by)
     AND EXISTS (
       SELECT 1
       FROM public.asks AS a
       JOIN public.classified_listing_details AS d ON d.listing_id = a.id
       WHERE a.product_id = p.id AND a.is_demo AND a.seller_id = live_owner
     );

  UPDATE public.ask_events AS e
     SET actor_id = live_owner
   WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = e.actor_id)
     AND EXISTS (
       SELECT 1
       FROM public.asks AS a
       JOIN public.classified_listing_details AS d ON d.listing_id = a.id
       WHERE a.id = e.ask_id AND a.is_demo AND a.seller_id = live_owner
     );
END;
$repair$;
