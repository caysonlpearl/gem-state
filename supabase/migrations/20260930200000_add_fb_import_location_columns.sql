-- create_classified_listing/update_classified_listing require a real
-- region/city/state (2-80 chars each) -- the import staging table was
-- missing them entirely, which would have made every publish attempt fail
-- validation. Facebook listing pages show a city/state; region (a GemList-
-- specific concept, e.g. "Treasure Valley") has no Facebook equivalent and
-- is filled in by the admin during review.

ALTER TABLE public.fb_marketplace_import_items
  ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS fulfillment_mode text NOT NULL DEFAULT 'local_pickup'
    CHECK (fulfillment_mode IN ('local_pickup', 'shipping', 'both'));
