-- Staging no longer requires a resolved GemList seller account up front --
-- Facebook Marketplace doesn't expose a seller's email, so there was never
-- a real identity to resolve at stage time anyway. seller_id now stays NULL
-- until the admin supplies an email at publish time; until then, items are
-- grouped and diffed by the Facebook profile URL instead.

ALTER TABLE public.fb_marketplace_import_batches
  ALTER COLUMN seller_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS seller_name text;

ALTER TABLE public.fb_marketplace_import_items
  ALTER COLUMN seller_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS source_profile_url text NOT NULL DEFAULT '';

ALTER TABLE public.fb_marketplace_import_items
  DROP CONSTRAINT IF EXISTS fb_marketplace_import_items_source_per_seller;
ALTER TABLE public.fb_marketplace_import_items
  ADD CONSTRAINT fb_marketplace_import_items_source_per_profile
    UNIQUE (source_profile_url, source_url);

DROP INDEX IF EXISTS fb_marketplace_import_items_seller_status_idx;
CREATE INDEX fb_marketplace_import_items_profile_status_idx
  ON public.fb_marketplace_import_items (source_profile_url, status);
