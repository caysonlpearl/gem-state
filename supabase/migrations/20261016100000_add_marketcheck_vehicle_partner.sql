begin;

create table if not exists public.marketcheck_cache (
  cache_key text primary key,
  payload jsonb not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.marketcheck_api_requests (
  id bigint generated always as identity primary key,
  cache_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists marketcheck_api_requests_created_idx
  on public.marketcheck_api_requests(created_at);

alter table public.marketcheck_cache enable row level security;
alter table public.marketcheck_api_requests enable row level security;
revoke all on public.marketcheck_cache, public.marketcheck_api_requests from anon, authenticated;
grant all on public.marketcheck_cache, public.marketcheck_api_requests to service_role;
grant usage, select on sequence public.marketcheck_api_requests_id_seq to service_role;

create or replace function public.reserve_marketcheck_call(
  p_cache_key text,
  p_monthly_limit integer default 100
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  month_start timestamptz := date_trunc('month', now());
begin
  if length(p_cache_key) > 2000 then raise exception 'Invalid MarketCheck cache key'; end if;
  perform pg_advisory_xact_lock(428191024);
  delete from public.marketcheck_api_requests where created_at < month_start - interval '2 months';
  if exists (
    select 1 from public.marketcheck_api_requests
    where cache_key = p_cache_key and created_at > now() - interval '30 seconds'
  ) then
    return jsonb_build_object('allowed', false, 'reason', 'duplicate');
  end if;
  if (select count(*) from public.marketcheck_api_requests where created_at >= month_start) >= greatest(1, p_monthly_limit) then
    return jsonb_build_object('allowed', false, 'reason', 'monthly_limit');
  end if;
  insert into public.marketcheck_api_requests(cache_key) values (p_cache_key);
  return jsonb_build_object('allowed', true);
end $$;

revoke all on function public.reserve_marketcheck_call(text, integer) from public, anon, authenticated;
grant execute on function public.reserve_marketcheck_call(text, integer) to service_role;

create table if not exists public.saved_partner_vehicles (
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id text not null check (listing_id ~ '^marketcheck-(dealer|fsbo)-[A-Za-z0-9._:-]{1,160}$'),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

alter table public.saved_partner_vehicles enable row level security;
create policy "Members read their saved partner vehicles" on public.saved_partner_vehicles
  for select to authenticated using (user_id = auth.uid());
create policy "Members save partner vehicles" on public.saved_partner_vehicles
  for insert to authenticated with check (user_id = auth.uid());
create policy "Members update their saved partner vehicles" on public.saved_partner_vehicles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Members remove their saved partner vehicles" on public.saved_partner_vehicles
  for delete to authenticated using (user_id = auth.uid());

create table if not exists public.partner_vehicle_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null check (listing_id ~ '^marketcheck-(dealer|fsbo)-[A-Za-z0-9._:-]{1,160}$'),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 2 and 80),
  details text check (details is null or char_length(details) <= 500),
  status text not null default 'open' check (status in ('open', 'under_review', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  unique (listing_id, reporter_id)
);

create index if not exists partner_vehicle_reports_status_idx
  on public.partner_vehicle_reports(status, created_at desc);

alter table public.partner_vehicle_reports enable row level security;
revoke all on public.partner_vehicle_reports from anon, authenticated;
grant all on public.partner_vehicle_reports to service_role;
grant insert, select, update on public.partner_vehicle_reports to authenticated;
create policy "Members create partner vehicle reports" on public.partner_vehicle_reports
  for insert to authenticated with check (reporter_id = auth.uid() and status = 'open');
create policy "Admins read partner vehicle reports" on public.partner_vehicle_reports
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admins update partner vehicle reports" on public.partner_vehicle_reports
  for update to authenticated using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

alter table public.listing_view_counts
  drop constraint if exists listing_view_counts_listing_id_check;
alter table public.listing_view_counts
  add constraint listing_view_counts_listing_id_check
  check (listing_id ~ '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|adzuna-[0-9]{1,20}|mashvisor-[0-9]{1,15}|openwebninja-[0-9]{1,20}|marketcheck-(dealer|fsbo)-[A-Za-z0-9._:-]{1,160})$');

commit;
