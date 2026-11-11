begin;

alter table public.dealer_profiles add column if not exists price_insights_enabled boolean not null default true;
alter table public.dealer_profiles add column if not exists valuation_dealer_type text
  check (valuation_dealer_type in ('franchise','independent'));

create table public.vehicle_price_insight_cache (
  cache_key text primary key,
  payload jsonb,
  expires_at timestamptz not null default now(),
  locked_until timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.vehicle_valuation_requests (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('vehicles','vinaudit','marketcheck')),
  cache_key text not null,
  created_at timestamptz not null default now()
);
create index on public.vehicle_valuation_requests(provider,created_at);
create table public.vehicle_valuation_provider_state (
  provider text primary key check (provider in ('vehicles','vinaudit','marketcheck')),
  blocked_until timestamptz not null,
  reason text not null
);
alter table public.vehicle_price_insight_cache enable row level security;
alter table public.vehicle_valuation_requests enable row level security;
alter table public.vehicle_valuation_provider_state enable row level security;
revoke all on public.vehicle_price_insight_cache,public.vehicle_valuation_requests,public.vehicle_valuation_provider_state from anon,authenticated;
grant all on public.vehicle_price_insight_cache,public.vehicle_valuation_requests,public.vehicle_valuation_provider_state to service_role;
grant usage,select on sequence public.vehicle_valuation_requests_id_seq to service_role;

create function public.claim_vehicle_price_insight(_key text) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
declare claimed boolean;
begin
  if length(_key)>100 then raise exception 'Invalid cache key'; end if;
  insert into public.vehicle_price_insight_cache(cache_key,locked_until)
    values(_key,now()+interval '90 seconds')
    on conflict(cache_key) do update set locked_until=now()+interval '90 seconds'
    where vehicle_price_insight_cache.locked_until<=now() and vehicle_price_insight_cache.expires_at<=now()
    returning true into claimed;
  return coalesce(claimed,false);
end $$;

create function public.reserve_vehicle_valuation_call(_provider text,_key text,_lifetime_limit integer,_monthly_limit integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if _provider not in ('vehicles','vinaudit','marketcheck') or length(_key)>100 then raise exception 'Invalid valuation request'; end if;
  perform pg_advisory_xact_lock(428191025);
  if exists(select 1 from public.vehicle_valuation_provider_state where provider=_provider and blocked_until>now()) then
    return jsonb_build_object('allowed',false,'reason','provider_blocked'); end if;
  if _lifetime_limit<=0 or _monthly_limit<=0 then return jsonb_build_object('allowed',false,'reason','disabled'); end if;
  if (select count(*) from public.vehicle_valuation_requests where provider=_provider)>=_lifetime_limit then
    return jsonb_build_object('allowed',false,'reason','lifetime_limit'); end if;
  if (select count(*) from public.vehicle_valuation_requests where provider=_provider and created_at>=date_trunc('month',now()))>=_monthly_limit then
    return jsonb_build_object('allowed',false,'reason','monthly_limit'); end if;
  -- Leave headroom below Starter's five requests per second, across all workers.
  if (select count(*) from public.vehicle_valuation_requests where provider=_provider and created_at>now()-interval '1 second')>=4 then
    return jsonb_build_object('allowed',false,'reason','rate_limit'); end if;
  insert into public.vehicle_valuation_requests(provider,cache_key) values(_provider,_key);
  return jsonb_build_object('allowed',true);
end $$;

revoke all on function public.claim_vehicle_price_insight(text),public.reserve_vehicle_valuation_call(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.claim_vehicle_price_insight(text),public.reserve_vehicle_valuation_call(text,text,integer,integer) to service_role;
commit;
