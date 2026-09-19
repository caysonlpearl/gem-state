ALTER TABLE public._restore_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._restore_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._restore_chunks FORCE ROW LEVEL SECURITY;
ALTER TABLE public._restore_errors FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public._restore_chunks FROM anon, authenticated;
REVOKE ALL ON public._restore_errors FROM anon, authenticated;

ALTER VIEW public.active_seller_listings SET (security_invoker = on);
ALTER VIEW public.seller_storefronts SET (security_invoker = on);
ALTER VIEW public.variant_ask_depth_public SET (security_invoker = on);
ALTER VIEW public.variant_bid_depth_public SET (security_invoker = on);
ALTER VIEW public.variant_market_summary SET (security_invoker = on);
ALTER VIEW public.variant_sightings_public SET (security_invoker = on);
ALTER VIEW public.variant_sourcing_offers SET (security_invoker = on);
ALTER VIEW public.variant_verified_sales_public SET (security_invoker = on);
ALTER VIEW public.variant_watch_counts SET (security_invoker = on);