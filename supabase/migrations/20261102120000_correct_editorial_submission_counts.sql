-- Editing an existing listing is not a new listing submission. Keep legacy
-- events without a mode, and deduplicate repeated acknowledgements by event ID.
CREATE OR REPLACE FUNCTION public.editorial_performance(_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'articleViews', count(*) FILTER (WHERE name = 'media_article_viewed'),
    'ctaClicks', count(*) FILTER (WHERE name = 'media_cta_clicked'),
    'listingViews', count(*) FILTER (WHERE name = 'listing_viewed' AND props ? 'media_article'),
    'sellerContacts', count(DISTINCT coalesce(nullif(props->>'event_id',''),id::text)) FILTER (
      WHERE name = 'inquiry_completed' AND props ? 'media_article'
    ),
    'postingStarted', count(*) FILTER (
      WHERE name = 'classified_listing_submit_started' AND props ? 'media_article'
        AND coalesce(props->>'mode','create') = 'create'
    ),
    'postingCompleted', count(DISTINCT coalesce(nullif(props->>'event_id',''),id::text)) FILTER (
      WHERE name = 'classified_listing_submit_succeeded' AND props ? 'media_article'
        AND coalesce(props->>'mode','create') = 'create'
    )
  ) FROM public.analytics_events
  WHERE occurred_at >= now() - make_interval(days => greatest(1,least(_days,90)))
    AND is_demo = false AND props->>'site_host' = 'onbluebird.com'
    AND name IN ('media_article_viewed','media_cta_clicked','listing_viewed','inquiry_completed','classified_listing_submit_started','classified_listing_submit_succeeded')
    AND coalesce(props->>'is_internal','false') <> 'true'
    AND coalesce(props->>'is_bot','false') <> 'true';
$$;
REVOKE ALL ON FUNCTION public.editorial_performance(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.editorial_performance(integer) TO service_role;
