-- Public browsing must never wait for a maintenance UPDATE. This computed
-- PostgREST field ranks currently paid placements without changing any rows.
-- It runs under the caller's existing table RLS and exposes only a boolean.
CREATE OR REPLACE FUNCTION public.catalog_is_featured(public.asks)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT coalesce(($1).featured_until > now(), false);
$$;
REVOKE ALL ON FUNCTION public.catalog_is_featured(public.asks) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_is_featured(public.asks)
  TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
