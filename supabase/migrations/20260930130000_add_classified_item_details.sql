-- Store structured facts for non-vehicle, non-home, non-job, non-service,
-- and non-pet classifieds without changing the established listing RPC ABI.
ALTER TABLE public.classified_listing_details
  ADD COLUMN IF NOT EXISTS item_details jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.classified_listing_details
  DROP CONSTRAINT IF EXISTS classified_listing_details_item_details_object,
  ADD CONSTRAINT classified_listing_details_item_details_object
    CHECK (jsonb_typeof(item_details) = 'object');

CREATE INDEX IF NOT EXISTS classified_listing_details_item_details_gin_idx
  ON public.classified_listing_details USING gin (item_details);
