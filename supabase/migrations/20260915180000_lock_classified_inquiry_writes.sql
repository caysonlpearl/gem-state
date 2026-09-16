-- Classified inquiries are created and validated by the authenticated server
-- function. Do not allow a browser client to write identity or listing metadata
-- directly to this table.
revoke insert, update, delete on table public.listing_inquiries from authenticated;

drop policy if exists "Buyers create listing inquiries" on public.listing_inquiries;
drop policy if exists "Sellers update listing inquiries" on public.listing_inquiries;
