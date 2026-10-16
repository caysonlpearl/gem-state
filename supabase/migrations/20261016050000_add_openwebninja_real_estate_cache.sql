-- OpenWeb Ninja property data is provider inventory, not Bluebird-owned
-- listings. Keep the response cache and request budget server-only.
CREATE TABLE IF NOT EXISTS public.openwebninja_cache (
  cache_key text PRIMARY KEY,
  payload jsonb NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS public.openwebninja_api_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cache_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS openwebninja_api_requests_created_idx
  ON public.openwebninja_api_requests(created_at);

REVOKE ALL ON public.openwebninja_cache, public.openwebninja_api_requests FROM anon, authenticated;
GRANT ALL ON public.openwebninja_cache, public.openwebninja_api_requests TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.openwebninja_api_requests_id_seq TO service_role;

ALTER TABLE public.openwebninja_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.openwebninja_api_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.reserve_openwebninja_call(p_cache_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE cached jsonb;
BEGIN
  IF length(p_cache_key) > 500 THEN RAISE EXCEPTION 'Invalid provider cache key'; END IF;
  PERFORM pg_advisory_xact_lock(428191025);
  SELECT payload INTO cached FROM public.openwebninja_cache
    WHERE cache_key = p_cache_key AND expires_at > now();
  IF cached IS NOT NULL THEN
    RETURN jsonb_build_object('cached', true, 'payload', cached);
  END IF;

  DELETE FROM public.openwebninja_api_requests WHERE created_at < now() - interval '31 days';
  DELETE FROM public.openwebninja_cache WHERE expires_at < now() - interval '31 days';

  -- The free plan is 100 calls/month. Reserve ten calls for manual checks and
  -- transient retries; cache hits never consume this budget.
  IF EXISTS (
      SELECT 1 FROM public.openwebninja_api_requests
      WHERE cache_key = p_cache_key AND created_at > now() - interval '1 hour'
    )
    OR (SELECT count(*) FROM public.openwebninja_api_requests WHERE created_at > now() - interval '1 day') >= 10
    OR (SELECT count(*) FROM public.openwebninja_api_requests WHERE created_at > now() - interval '31 days') >= 90
  THEN
    RETURN jsonb_build_object('allowed', false);
  END IF;

  INSERT INTO public.openwebninja_api_requests(cache_key) VALUES (p_cache_key);
  RETURN jsonb_build_object('allowed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_openwebninja_call(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_openwebninja_call(text) TO service_role;
