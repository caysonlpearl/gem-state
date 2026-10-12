-- Sellers can mark a classified listing as sold instead of only taking it
-- down. A sold listing leaves public search exactly like a take-down (it is
-- cancelled through the existing cancel_ask path, so every side effect of a
-- take-down still happens), and sold_at records when it sold so its page can
-- stay up for a while with a "Sold" banner before redirecting.

ALTER TABLE public.asks ADD COLUMN IF NOT EXISTS sold_at timestamptz;

CREATE OR REPLACE FUNCTION public.mark_ask_sold(_ask_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- cancel_ask enforces sign-in, ownership and that the listing is active.
  PERFORM public.cancel_ask(_ask_id);
  UPDATE public.asks SET sold_at = now() WHERE id = _ask_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_ask_sold(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_ask_sold(uuid) TO authenticated;

-- A relisted listing is no longer sold, so a later take-down of it can't be
-- mistaken for a sale.
CREATE OR REPLACE FUNCTION public.clear_ask_sold_at_on_relist()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' THEN
    NEW.sold_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS asks_clear_sold_at_on_relist ON public.asks;
CREATE TRIGGER asks_clear_sold_at_on_relist
  BEFORE UPDATE OF status ON public.asks
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_ask_sold_at_on_relist();

-- Why a Facebook-imported listing was flagged for removal: 'sold' when
-- Facebook shows the Sold badge, so publishing the removal marks the Bluebird
-- listing sold instead of only taking it down.
ALTER TABLE public.fb_marketplace_import_items
  ADD COLUMN IF NOT EXISTS removed_reason text
  CHECK (removed_reason IN ('sold', 'unavailable', 'missing'));
