-- The provider plan is monthly. Keep the ten-call monthly buffer while
-- allowing a normal browsing session to load multiple property detail pages
-- after the area search has been cached.
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
  -- transient retries; cache hits never consume this budget. A 25-call daily
  -- ceiling prevents bursts without blocking a normal browsing session.
  IF EXISTS (
      SELECT 1 FROM public.openwebninja_api_requests
      WHERE cache_key = p_cache_key AND created_at > now() - interval '1 hour'
    )
    OR (SELECT count(*) FROM public.openwebninja_api_requests WHERE created_at > now() - interval '1 day') >= 25
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
