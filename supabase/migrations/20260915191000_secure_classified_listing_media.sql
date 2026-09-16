-- Listing media is staged at upload time and becomes readable to the public
-- only after its listing is approved, active, unexpired, and published.
UPDATE storage.buckets
SET public = false
WHERE id = 'listing-media';

CREATE OR REPLACE FUNCTION public.can_read_approved_classified_media(_storage_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.listing_media lm
    JOIN public.asks a ON a.id = lm.ask_id
    JOIN public.products p ON p.id = a.product_id
    WHERE lm.storage_path = _storage_path
      AND a.status = 'active'
      AND a.approved_at IS NOT NULL
      AND a.expires_at > now()
      AND NOT a.is_demo
      AND p.status = 'published'
  );
$function$;

REVOKE ALL ON FUNCTION public.can_read_approved_classified_media(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_approved_classified_media(text) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Public reads approved classified listing media" ON storage.objects;
CREATE POLICY "Public reads approved classified listing media"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'listing-media'
  AND public.can_read_approved_classified_media(name)
);

DROP POLICY IF EXISTS "Classified owners and staff read listing media" ON storage.objects;
CREATE POLICY "Classified owners and staff read listing media"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'listing-media'
  AND (
    split_part(name, '/', 1) = auth.uid()::text
    OR public.is_staff(auth.uid())
  )
);
