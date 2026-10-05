-- Keep linked dealer inventory and public listing visibility consistent.
-- Sold/removed records hide linked listings immediately. Stale records hide them
-- after the source-configured grace window. Active records never auto-republish;
-- moderation remains the only path back to public visibility.
CREATE OR REPLACE FUNCTION public.sync_dealer_inventory_listing_visibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  grace_runs integer;
  source_dealer_id uuid;
BEGIN
  SELECT s.deactivation_grace_runs, s.dealer_id
    INTO grace_runs, source_dealer_id
  FROM public.dealer_inventory_sources s
  WHERE s.id = NEW.source_id;

  IF source_dealer_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.inventory_status IN ('sold', 'removed')
     OR (NEW.inventory_status = 'stale' AND NEW.missed_run_count >= COALESCE(grace_runs, 2)) THEN
    UPDATE public.asks AS a
    SET approved_at = NULL, updated_at = now()
    FROM public.dealer_inventory_listing_links AS l
    WHERE l.record_id = NEW.id
      AND a.id = l.listing_id
      AND a.dealer_id = source_dealer_id
      AND a.approved_at IS NOT NULL;

    INSERT INTO public.dealer_audit_events (dealer_id, actor_user_id, action, target_type, target_id, metadata)
    SELECT source_dealer_id, NULL, 'inventory_listing_visibility_sync', 'listing', a.id::text,
      jsonb_build_object('recordId', NEW.id, 'inventoryStatus', NEW.inventory_status,
        'missedRunCount', NEW.missed_run_count, 'graceRuns', COALESCE(grace_runs, 2),
        'publicVisibility', 'hidden_pending_review')
    FROM public.dealer_inventory_listing_links l
    JOIN public.asks a ON a.id = l.listing_id
    WHERE l.record_id = NEW.id AND a.dealer_id = source_dealer_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dealer_inventory_listing_visibility_sync ON public.dealer_inventory_records;
CREATE TRIGGER dealer_inventory_listing_visibility_sync
AFTER INSERT OR UPDATE OF inventory_status, missed_run_count ON public.dealer_inventory_records
FOR EACH ROW EXECUTE FUNCTION public.sync_dealer_inventory_listing_visibility();

CREATE OR REPLACE FUNCTION public.validate_dealer_inventory_listing_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  rec_status text;
  source_dealer_id uuid;
  listing_status text;
  listing_approved_at timestamptz;
  listing_dealer_id uuid;
  category_slug text;
BEGIN
  SELECT r.inventory_status, s.dealer_id INTO rec_status, source_dealer_id
  FROM public.dealer_inventory_records r
  JOIN public.dealer_inventory_sources s ON s.id = r.source_id
  WHERE r.id = NEW.record_id;
  IF rec_status IS NULL THEN RAISE EXCEPTION 'Inventory record not found.'; END IF;
  IF rec_status <> 'active' THEN
    RAISE EXCEPTION 'Only an active inventory record can be linked. Apply a current feed before publishing it.';
  END IF;
  IF source_dealer_id IS NULL THEN
    RAISE EXCEPTION 'Associate the inventory source with a ready dealership before linking listings.';
  END IF;

  SELECT a.status, a.approved_at, a.dealer_id, c.slug
    INTO listing_status, listing_approved_at, listing_dealer_id, category_slug
  FROM public.asks a
  JOIN public.products p ON p.id = a.product_id
  LEFT JOIN public.categories c ON c.id = p.category_id
  WHERE a.id = NEW.listing_id;
  IF listing_status IS NULL THEN RAISE EXCEPTION 'Listing not found.'; END IF;
  IF listing_status <> 'active' OR listing_approved_at IS NULL THEN
    RAISE EXCEPTION 'Link the inventory to an active, approved marketplace listing. Approve the listing first.';
  END IF;
  IF listing_dealer_id IS NOT NULL AND listing_dealer_id <> source_dealer_id THEN
    RAISE EXCEPTION 'That listing is already attributed to a different dealership.';
  END IF;
  IF category_slug IS NOT NULL AND category_slug NOT IN ('cars-trucks','motorcycles','boats','rvs','atvs') THEN
    RAISE EXCEPTION 'Dealer inventory can only be linked to a vehicle listing.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dealer_inventory_listing_link_guard ON public.dealer_inventory_listing_links;
CREATE TRIGGER dealer_inventory_listing_link_guard
BEFORE INSERT OR UPDATE ON public.dealer_inventory_listing_links
FOR EACH ROW EXECUTE FUNCTION public.validate_dealer_inventory_listing_link();

GRANT EXECUTE ON FUNCTION public.sync_dealer_inventory_listing_visibility() TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_dealer_inventory_listing_link() TO service_role;
