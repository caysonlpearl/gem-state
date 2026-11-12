-- Add a separate hard-capped ledger for the Redfin Free subscription.
-- Each provider remains capped at 100 calls per rolling 31 days and 25/day.
-- Redfin requests remain disabled until its server-side activation flag is set.
create or replace function public.reserve_openwebninja_provider_call(
  p_cache_key text,
  p_provider text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare cached jsonb;
begin
  if length(p_cache_key) > 500 then raise exception 'Invalid provider cache key'; end if;
  if p_provider not in ('zillow', 'realestate', 'redfin') then raise exception 'Unknown provider'; end if;
  perform pg_advisory_xact_lock(428191025);
  select payload into cached from public.openwebninja_cache
    where cache_key = p_cache_key and expires_at > now();
  if cached is not null then
    return jsonb_build_object('cached', true, 'payload', cached);
  end if;

  delete from public.openwebninja_api_requests where created_at < now() - interval '31 days';
  delete from public.openwebninja_cache where expires_at < now() - interval '31 days';

  -- Use the full published 100-request free allowance, with the existing
  -- 25/day ceiling and per-property retry guard. Rolling 31 days is conservative
  -- relative to calendar-month billing; no paid-plan upgrade is required.
  if exists (
      select 1 from public.openwebninja_api_requests
      where cache_key = p_cache_key and created_at > now() - interval '1 hour'
    )
    or (select count(*) from public.openwebninja_api_requests
        where provider = p_provider and created_at > now() - interval '1 day') >= 25
    or (select count(*) from public.openwebninja_api_requests
        where provider = p_provider and created_at > now() - interval '31 days') >= 100
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

-- Namespaced Redfin IDs use the same member-save and view-count policies.
do $$
declare constraint_row record; definition text;
begin
  for constraint_row in
    select c.conname, c.conrelid::regclass as table_name, pg_get_constraintdef(c.oid) as definition
    from pg_constraint c
    where c.contype='c' and c.conrelid in ('public.saved_partner_homes'::regclass,'public.listing_view_counts'::regclass)
      and pg_get_constraintdef(c.oid) like '%openwebninja-[0-9]{1,20}%'
  loop
    definition:=replace(constraint_row.definition,'openwebninja-[0-9]{1,20}','openwebninja-(redfin-)?[0-9]{1,20}');
    execute format('alter table %s drop constraint %I',constraint_row.table_name,constraint_row.conname);
    execute format('alter table %s add constraint %I %s',constraint_row.table_name,constraint_row.conname,definition);
  end loop;
end $$;
