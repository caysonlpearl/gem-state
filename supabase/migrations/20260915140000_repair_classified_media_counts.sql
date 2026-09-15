-- Classified seed records attach media rows before approval, but the legacy
-- ask counters default to zero. The marketplace transaction guards use these
-- counters to ensure a buyer can only purchase a listing with reviewable media.
-- Reconcile the counters from their source rows so seeded and existing
-- classified listings can enter the normal offer and checkout flows.
UPDATE public.asks AS a
SET evidence_count = counts.evidence_count,
    public_media_count = counts.public_media_count,
    updated_at = now()
FROM (
  SELECT
    a2.id,
    (SELECT count(*)::integer FROM public.ask_media AS em WHERE em.ask_id = a2.id) AS evidence_count,
    (SELECT count(*)::integer FROM public.listing_media AS lm WHERE lm.ask_id = a2.id) AS public_media_count
  FROM public.asks AS a2
  WHERE EXISTS (
    SELECT 1
    FROM public.classified_listing_details AS d
    WHERE d.listing_id = a2.id
  )
) AS counts
WHERE a.id = counts.id;

-- Keep future classified seed runs consistent with the same source-of-truth
-- counters after their media rows are inserted.
CREATE OR REPLACE FUNCTION public.sync_classified_media_counts(_listing_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.asks AS a
     SET evidence_count = (SELECT count(*)::integer FROM public.ask_media WHERE ask_id = a.id),
         public_media_count = (SELECT count(*)::integer FROM public.listing_media WHERE ask_id = a.id),
         updated_at = now()
   WHERE a.id = _listing_id
     AND EXISTS (
       SELECT 1 FROM public.classified_listing_details AS d WHERE d.listing_id = a.id
     );
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_classified_media_counts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_classified_media_counts(uuid) TO service_role;
