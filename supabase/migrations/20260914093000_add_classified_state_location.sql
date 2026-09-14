ALTER TABLE public.classified_listing_details
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'ID';

ALTER TABLE public.classified_listing_details
  DROP CONSTRAINT IF EXISTS classified_listing_details_state_code;

ALTER TABLE public.classified_listing_details
  ADD CONSTRAINT classified_listing_details_state_code
  CHECK (state ~ '^[A-Z]{2}$');

CREATE INDEX IF NOT EXISTS classified_listing_details_state_city_idx
  ON public.classified_listing_details (state, city);
