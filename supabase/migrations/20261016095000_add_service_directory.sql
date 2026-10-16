-- Local service businesses for Services, imported from Foursquare's open
-- places dataset (Apache 2.0). These are directory entries, not marketplace
-- listings: they aren't owned by a Bluebird member until the owner claims
-- them. Read and written only by the server (service role).
create table if not exists public.service_directory (
  id text primary key check (id ~ '^fsq-[0-9a-f]{24}$'),
  name text not null check (char_length(name) between 1 and 200),
  trade text not null,
  trades text[] not null default '{}',
  -- 1 home and trade services, 2 automotive and personal, 3 offices. Unfiltered
  -- Services pages lead with the trades people come to Bluebird for.
  priority smallint not null default 2 check (priority between 1 and 3),
  category_labels text[] not null default '{}',
  address text,
  city text not null,
  state text not null default 'ID',
  postcode text,
  latitude double precision,
  longitude double precision,
  phone text,
  website text,
  email text,
  facebook_id text,
  instagram text,
  source_refreshed_at date,
  -- Hours, Google rating and confirmed contact details looked up on demand.
  enrichment jsonb,
  enriched_at timestamptz,
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  hidden boolean not null default false,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_directory_place_idx
  on public.service_directory (state, lower(city)) where not hidden;
create index if not exists service_directory_trades_idx
  on public.service_directory using gin (trades) where not hidden;
create index if not exists service_directory_geo_idx
  on public.service_directory (latitude, longitude) where not hidden;

alter table public.service_directory enable row level security;
revoke all on public.service_directory from anon, authenticated;
grant all on public.service_directory to service_role;

-- An owner asking to take over their business's directory entry. An admin
-- reviews each claim before the entry is marked as theirs.
create table if not exists public.service_directory_claims (
  id uuid primary key default gen_random_uuid(),
  directory_id text not null references public.service_directory(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  contact text not null check (char_length(btrim(contact)) between 3 and 200),
  role text not null check (char_length(btrim(role)) between 2 and 80),
  note text check (note is null or char_length(note) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  unique (directory_id, user_id)
);

alter table public.service_directory_claims enable row level security;
revoke all on public.service_directory_claims from anon, authenticated;
grant all on public.service_directory_claims to service_role;
grant select, insert on public.service_directory_claims to authenticated;
grant update on public.service_directory_claims to authenticated;

drop policy if exists "Members file their own claims" on public.service_directory_claims;
create policy "Members file their own claims"
on public.service_directory_claims for insert to authenticated
with check (user_id = auth.uid() and status = 'pending');

drop policy if exists "Members read their own claims" on public.service_directory_claims;
create policy "Members read their own claims"
on public.service_directory_claims for select to authenticated
using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins review claims" on public.service_directory_claims;
create policy "Admins review claims"
on public.service_directory_claims for update to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

-- Lookups of business details through OpenWeb Ninja's Local Business Data
-- API (500 requests/month). Cached results live on service_directory.
create table if not exists public.service_enrichment_requests (
  id bigint generated always as identity primary key,
  directory_id text not null,
  created_at timestamptz not null default now()
);
create index if not exists service_enrichment_requests_created_idx
  on public.service_enrichment_requests (created_at);
alter table public.service_enrichment_requests enable row level security;
revoke all on public.service_enrichment_requests from anon, authenticated;
grant all on public.service_enrichment_requests to service_role;
grant usage, select on sequence public.service_enrichment_requests_id_seq to service_role;

create or replace function public.reserve_service_enrichment(p_directory_id text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform pg_advisory_xact_lock(428191026);
  delete from public.service_enrichment_requests where created_at < now() - interval '31 days';
  -- The plan allows 500 a month; keep 50 spare and spread use across days.
  if exists (
      select 1 from public.service_enrichment_requests
      where directory_id = p_directory_id and created_at > now() - interval '7 days'
    )
    or (select count(*) from public.service_enrichment_requests
        where created_at > now() - interval '1 day') >= 20
    or (select count(*) from public.service_enrichment_requests
        where created_at > now() - interval '31 days') >= 450
  then
    return false;
  end if;
  insert into public.service_enrichment_requests (directory_id) values (p_directory_id);
  return true;
end;
$$;

revoke all on function public.reserve_service_enrichment(text) from public, anon, authenticated;
grant execute on function public.reserve_service_enrichment(text) to service_role;

-- Directory entries can be flagged like partner jobs and homes.
alter table public.partner_job_reports drop constraint if exists partner_job_reports_listing_id_check;
alter table public.partner_job_reports add constraint partner_job_reports_listing_id_check
  check (listing_id ~ '^(adzuna-[0-9]{1,20}|mashvisor-[0-9]{1,15}|openwebninja-[0-9]{1,20}|fsq-[0-9a-f]{24})$');

-- Views and saves work for directory businesses like other listings.
alter table public.listing_view_counts drop constraint if exists listing_view_counts_listing_id_check;
alter table public.listing_view_counts add constraint listing_view_counts_listing_id_check
  check (listing_id ~ '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|adzuna-[0-9]{1,20}|mashvisor-[0-9]{1,15}|openwebninja-[0-9]{1,20}|fsq-[0-9a-f]{24}|marketcheck-(dealer|fsbo)-[A-Za-z0-9._:-]{1,160})$');
alter table public.saved_partner_jobs drop constraint if exists saved_partner_jobs_listing_id_check;
alter table public.saved_partner_jobs add constraint saved_partner_jobs_listing_id_check
  check (listing_id ~ '^(adzuna-[0-9]{1,20}|fsq-[0-9a-f]{24})$');

-- Business counts per trade for the Services category lists.
create or replace function public.service_directory_trade_counts()
returns table (trade text, n bigint)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select t.trade, count(*)
  from public.service_directory d, unnest(d.trades) as t(trade)
  where not d.hidden
  group by t.trade
$$;
revoke all on function public.service_directory_trade_counts() from public, anon, authenticated;
grant execute on function public.service_directory_trade_counts() to service_role;
