-- Signed links to resized listing-card photos, reused across server
-- instances until an hour before they expire, so Supabase's CDN can serve
-- the cached resize instead of resizing again for every freshly signed link.
-- Written and read only by the server (service role); no public access.
CREATE TABLE IF NOT EXISTS public.listing_thumbnail_links (
  path text PRIMARY KEY,
  url text NOT NULL,
  reuse_until timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.listing_thumbnail_links ENABLE ROW LEVEL SECURITY;
