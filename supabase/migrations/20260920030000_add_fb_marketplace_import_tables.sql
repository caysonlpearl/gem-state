-- Admin tool: with a seller's permission, recreate every listing from their
-- Facebook Marketplace profile as a real GemList listing under their own
-- account. Extraction happens outside this schema entirely (a person drives
-- a live, already-logged-in browser -- see the "Facebook Marketplace Seller
-- Import" plan); this just holds what was extracted so an admin can review
-- it before anything is published, and tracks what's already been published
-- so a later re-run can tell what changed instead of duplicating everything.

CREATE TABLE public.fb_marketplace_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  imported_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  source_profile_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX fb_marketplace_import_batches_seller_idx
  ON public.fb_marketplace_import_batches (seller_id, created_at DESC);

CREATE TABLE public.fb_marketplace_import_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.fb_marketplace_import_batches(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_url text NOT NULL,
  title text NOT NULL,
  description text,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  condition text,
  category_slug text NOT NULL DEFAULT 'general',
  evidence_paths text[] NOT NULL DEFAULT '{}'::text[],
  public_paths text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'needs_update', 'possibly_removed', 'published', 'discarded')),
  previous_price_cents integer,
  previous_description text,
  listing_id uuid REFERENCES public.asks(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fb_marketplace_import_items_source_per_seller UNIQUE (seller_id, source_url)
);

CREATE INDEX fb_marketplace_import_items_batch_idx
  ON public.fb_marketplace_import_items (batch_id);
CREATE INDEX fb_marketplace_import_items_seller_status_idx
  ON public.fb_marketplace_import_items (seller_id, status);

CREATE TRIGGER fb_marketplace_import_items_set_updated_at
  BEFORE UPDATE ON public.fb_marketplace_import_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.fb_marketplace_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fb_marketplace_import_items ENABLE ROW LEVEL SECURITY;

-- Admin-only end to end: this tool is driven entirely by admin-gated server
-- functions using the service-role client, so no anon/authenticated grants
-- are needed at all. RLS stays enabled with no policies, which denies all
-- access through the normal (non-service-role) client by default.
REVOKE ALL ON public.fb_marketplace_import_batches FROM anon, authenticated;
REVOKE ALL ON public.fb_marketplace_import_items FROM anon, authenticated;
