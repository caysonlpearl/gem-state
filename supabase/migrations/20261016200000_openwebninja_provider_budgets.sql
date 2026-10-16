-- Two OpenWeb Ninja subscriptions serve the same Zillow endpoints: Real-Time
-- Zillow Data and Real-Time Real Estate Data. Each has its own 100-call
-- monthly plan, so calls are logged per provider and budgeted separately.
alter table public.openwebninja_api_requests
  add column if not exists provider text not null default 'zillow';

create index if not exists openwebninja_api_requests_provider_created_idx
  on public.openwebninja_api_requests (provider, created_at);

create or replace function public.reserve_openwebninja_provider_call(
  p_cache_key text,
  p_provider text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare cached jsonb;
begin
  if length(p_cache_key) > 500 then raise exception 'Invalid provider cache key'; end if;
  if p_provider not in ('zillow', 'realestate') then raise exception 'Unknown provider'; end if;
  perform pg_advisory_xact_lock(428191025);
  select payload into cached from public.openwebninja_cache
    where cache_key = p_cache_key and expires_at > now();
  if cached is not null then
    return jsonb_build_object('cached', true, 'payload', cached);
  end if;

  delete from public.openwebninja_api_requests where created_at < now() - interval '31 days';
  delete from public.openwebninja_cache where expires_at < now() - interval '31 days';

  -- Each plan is 100 calls/month: keep ten in reserve, and at most 25 a day.
  if exists (
      select 1 from public.openwebninja_api_requests
      where cache_key = p_cache_key and created_at > now() - interval '1 hour'
    )
    or (select count(*) from public.openwebninja_api_requests
        where provider = p_provider and created_at > now() - interval '1 day') >= 25
    or (select count(*) from public.openwebninja_api_requests
        where provider = p_provider and created_at > now() - interval '31 days') >= 90
  then
    return jsonb_build_object('allowed', false);
  end if;

  insert into public.openwebninja_api_requests(cache_key, provider) values (p_cache_key, p_provider);
  return jsonb_build_object('allowed', true);
end $$;

-- The original reservation is the Zillow subscription's budget.
create or replace function public.reserve_openwebninja_call(p_cache_key text) returns jsonb
language sql security definer set search_path = pg_catalog, public as $$
  select public.reserve_openwebninja_provider_call(p_cache_key, 'zillow');
$$;

revoke all on function public.reserve_openwebninja_provider_call(text, text) from public, anon, authenticated;
grant execute on function public.reserve_openwebninja_provider_call(text, text) to service_role;
revoke all on function public.reserve_openwebninja_call(text) from public, anon, authenticated;
grant execute on function public.reserve_openwebninja_call(text) to service_role;
