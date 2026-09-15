create table if not exists public.listing_inquiries (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.asks(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  buyer_name text not null,
  buyer_email text not null,
  message text not null,
  status text not null default 'new' check (status in ('new', 'read', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists listing_inquiries_seller_created_idx
  on public.listing_inquiries (seller_id, created_at desc);

create index if not exists listing_inquiries_listing_created_idx
  on public.listing_inquiries (listing_id, created_at desc);

alter table public.listing_inquiries enable row level security;

grant select, insert, update on public.listing_inquiries to authenticated;
grant all on public.listing_inquiries to service_role;

drop policy if exists "Buyers create listing inquiries" on public.listing_inquiries;
create policy "Buyers create listing inquiries"
on public.listing_inquiries
for insert
to authenticated
with check (buyer_id = auth.uid());

drop policy if exists "Participants read listing inquiries" on public.listing_inquiries;
create policy "Participants read listing inquiries"
on public.listing_inquiries
for select
to authenticated
using (buyer_id = auth.uid() or seller_id = auth.uid());

drop policy if exists "Sellers update listing inquiries" on public.listing_inquiries;
create policy "Sellers update listing inquiries"
on public.listing_inquiries
for update
to authenticated
using (seller_id = auth.uid())
with check (seller_id = auth.uid());
