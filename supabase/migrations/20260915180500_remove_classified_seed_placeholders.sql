-- Keep staged classifieds useful for QA without presenting generated artwork as
-- seller photography. The UI supplies the deterministic category illustration
-- whenever a listing has no public photos.

CREATE TEMP TABLE classified_seed_placeholder_paths (
  storage_path text PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO classified_seed_placeholder_paths (storage_path)
SELECT DISTINCT lm.storage_path
FROM public.listing_media AS lm
JOIN public.asks AS a ON a.id = lm.ask_id
JOIN public.products AS p ON p.id = a.product_id
WHERE a.seller_note IN (
  'Example listing for marketplace testing. Confirm item details and availability directly with the seller.',
  'MVP seed record; replace demo media and copy before launch.',
  'Seed record for MVP testing; replace demo photo and copy before approval.'
)
AND p.name IN (
  '2019 Toyota Tacoma TRD Off-Road 4x4',
  '2021 Ford F-150 XLT SuperCrew 4WD',
  '2018 Subaru Outback 2.5i Premium AWD',
  '2020 Jeep Wrangler Sport 4WD',
  '2016 Honda Civic EX Sedan',
  '2022 Hyundai Tucson SEL AWD',
  '2017 Chevrolet Silverado 1500 LT 4WD',
  '2015 Ram 1500 Big Horn 4WD'
);

-- Remove the generated objects as well as their rows so they cannot be
-- accidentally exposed by a future media query.
DELETE FROM storage.objects AS object
USING classified_seed_placeholder_paths AS seed
WHERE object.bucket_id IN ('ask-evidence', 'listing-media')
  AND object.name = seed.storage_path;

DELETE FROM public.listing_media AS media
USING classified_seed_placeholder_paths AS seed
WHERE media.storage_path = seed.storage_path;

DELETE FROM public.ask_media AS media
USING classified_seed_placeholder_paths AS seed
WHERE media.storage_path = seed.storage_path;

UPDATE public.products AS p
SET description = regexp_replace(
  p.description,
  '^Example Idaho vehicle listing used to validate browsing and seller contact flows\.\s*',
  ''
)
FROM public.asks AS a
WHERE a.product_id = p.id
  AND a.seller_note = 'Example listing for marketplace testing. Confirm item details and availability directly with the seller.';

UPDATE public.asks
SET seller_note = 'Staged listing for marketplace testing. Confirm item details and availability directly with the seller.'
WHERE seller_note = 'Example listing for marketplace testing. Confirm item details and availability directly with the seller.';

UPDATE public.asks AS a
SET evidence_count = (SELECT count(*)::integer FROM public.ask_media WHERE ask_id = a.id),
    public_media_count = (SELECT count(*)::integer FROM public.listing_media WHERE ask_id = a.id),
    updated_at = now()
WHERE EXISTS (
  SELECT 1
  FROM public.classified_listing_details AS details
  WHERE details.listing_id = a.id
);
