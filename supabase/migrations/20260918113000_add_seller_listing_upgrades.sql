-- Seller-only paid listing upgrades. Buyer/product checkout remains separate.

alter table public.asks
  add column if not exists featured_until timestamptz,
  add column if not exists promoted_at timestamptz;

create table if not exists public.listing_upgrade_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null,
  amount_cents integer not null check (amount_cents >= 0),
  duration_days integer not null default 0 check (duration_days >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.listing_upgrade_catalog (code, name, description, amount_cents, duration_days)
values
  ('featured', 'Featured placement', 'Give a listing more visibility in curated marketplace rows.', 499, 7),
  ('bump', 'Bump to the top', 'Refresh a listing’s position in browse results.', 299, 0),
  ('extend', 'Extend duration', 'Keep an active listing visible for another 30 days.', 199, 30)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  duration_days = excluded.duration_days,
  updated_at = now();

create table if not exists public.listing_upgrade_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.asks(id) on delete cascade,
  upgrade_id uuid not null references public.listing_upgrade_catalog(id),
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'canceled', 'failed', 'refunded')),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  receipt_url text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listing_upgrade_purchases_user_created_idx
  on public.listing_upgrade_purchases (user_id, created_at desc);
create index if not exists listing_upgrade_purchases_listing_idx
  on public.listing_upgrade_purchases (listing_id, created_at desc);

alter table public.listing_upgrade_catalog enable row level security;
alter table public.listing_upgrade_purchases enable row level security;
grant select on public.listing_upgrade_catalog to authenticated;
grant all on public.listing_upgrade_catalog, public.listing_upgrade_purchases to service_role;

drop policy if exists "Members read active upgrade options" on public.listing_upgrade_catalog;
create policy "Members read active upgrade options"
on public.listing_upgrade_catalog
for select
to authenticated
using (active = true);

drop trigger if exists listing_upgrade_catalog_touch on public.listing_upgrade_catalog;
create trigger listing_upgrade_catalog_touch
before update on public.listing_upgrade_catalog
for each row execute function public.set_updated_at();

drop trigger if exists listing_upgrade_purchases_touch on public.listing_upgrade_purchases;
create trigger listing_upgrade_purchases_touch
before update on public.listing_upgrade_purchases
for each row execute function public.set_updated_at();
