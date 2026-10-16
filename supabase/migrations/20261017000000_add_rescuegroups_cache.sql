-- RescueGroups.org adoptable pets: a service-role-only cache and request log,
-- the same shape as the other partner feeds (MarketCheck, OpenWeb Ninja).
-- NOT YET APPLIED -- see docs/rescuegroups-handoff.md.
create table if not exists public.rescuegroups_cache (
  cache_key text primary key,
  payload jsonb not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.rescuegroups_api_requests (
  id bigint generated always as identity primary key,
  cache_key text not null,
  created_at timestamptz not null default now()
);
create index if not exists rescuegroups_api_requests_created_idx
  on public.rescuegroups_api_requests (created_at);

alter table public.rescuegroups_cache enable row level security;
alter table public.rescuegroups_api_requests enable row level security;
revoke all on public.rescuegroups_cache, public.rescuegroups_api_requests from anon, authenticated;
grant all on public.rescuegroups_cache, public.rescuegroups_api_requests to service_role;

-- Same contract as reserve_marketcheck_call: returns {allowed} and blocks a
-- duplicate key within 30 seconds or once the daily cap is reached.
create or replace function public.reserve_rescuegroups_call(
  p_cache_key text,
  p_daily_limit integer default 200
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if length(p_cache_key) > 1000 then raise exception 'Invalid cache key'; end if;
  perform pg_advisory_xact_lock(428191030);
  delete from public.rescuegroups_api_requests where created_at < now() - interval '7 days';
  if exists (
    select 1 from public.rescuegroups_api_requests
    where cache_key = p_cache_key and created_at > now() - interval '30 seconds'
  ) then
    return jsonb_build_object('allowed', false, 'reason', 'duplicate');
  end if;
  if (select count(*) from public.rescuegroups_api_requests
      where created_at > now() - interval '1 day') >= greatest(1, p_daily_limit) then
    return jsonb_build_object('allowed', false, 'reason', 'daily_limit');
  end if;
  insert into public.rescuegroups_api_requests(cache_key) values (p_cache_key);
  return jsonb_build_object('allowed', true);
end $$;

revoke all on function public.reserve_rescuegroups_call(text, integer) from public, anon, authenticated;
grant execute on function public.reserve_rescuegroups_call(text, integer) to service_role;

-- Pets join the per-listing view counts.
alter table public.listing_view_counts
  drop constraint if exists listing_view_counts_listing_id_check;
alter table public.listing_view_counts
  add constraint listing_view_counts_listing_id_check
  check (listing_id ~ '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|adzuna-[0-9]{1,20}|mashvisor-[0-9]{1,15}|openwebninja-[0-9]{1,20}|fsq-[A-Za-z0-9._:-]{1,160}|marketcheck-(dealer|fsbo)-[A-Za-z0-9._:-]{1,160}|rescuegroups-[0-9]{1,20})$');
