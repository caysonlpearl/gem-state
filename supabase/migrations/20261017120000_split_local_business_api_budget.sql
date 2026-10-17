-- Local Business Data has a businesses-returned quota, not a request quota.
-- Keep its reservations separate from the OpenWeb Ninja home providers and
-- from the historical request ledger, which used the wrong unit.
create table if not exists public.service_business_api_reservations (
  id bigint generated always as identity primary key,
  request_key text not null,
  directory_id text not null,
  reserved_businesses integer not null check (reserved_businesses between 1 and 50),
  actual_businesses integer check (actual_businesses is null or actual_businesses between 0 and 50),
  response_payload jsonb,
  status text not null default 'reserved' check (status in ('reserved', 'settled')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index if not exists service_business_api_reservations_created_idx
  on public.service_business_api_reservations (created_at);
create index if not exists service_business_api_reservations_key_idx
  on public.service_business_api_reservations (request_key, created_at);

alter table public.service_business_api_reservations enable row level security;
revoke all on public.service_business_api_reservations from anon, authenticated;
grant all on public.service_business_api_reservations to service_role;
grant usage, select on sequence public.service_business_api_reservations_id_seq to service_role;

create or replace function public.reserve_service_business_credits(
  p_request_key text,
  p_directory_id text,
  p_requested_businesses integer default 14
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  requested integer := least(greatest(coalesce(p_requested_businesses, 14), 1), 50);
  used_31d integer;
  used_24h integer;
  reservation_id bigint;
begin
  if length(coalesce(p_request_key, '')) < 1 or length(p_request_key) > 300 then
    raise exception 'Invalid service business request key';
  end if;
  if length(coalesce(p_directory_id, '')) < 1 or length(p_directory_id) > 300 then
    raise exception 'Invalid service business directory id';
  end if;

  perform pg_advisory_xact_lock(428191027);
  delete from public.service_business_api_reservations
    where created_at < now() - interval '31 days';

  if exists (
    select 1 from public.service_business_api_reservations
    where request_key = p_request_key
      and created_at > now() - interval '31 days'
  ) then
    return jsonb_build_object('allowed', false, 'reason', 'recently_reserved');
  end if;

  select coalesce(sum(coalesce(actual_businesses, reserved_businesses)), 0)::integer
    into used_31d
    from public.service_business_api_reservations
   where created_at > now() - interval '31 days';
  select coalesce(sum(coalesce(actual_businesses, reserved_businesses)), 0)::integer
    into used_24h
    from public.service_business_api_reservations
   where created_at > now() - interval '24 hours';

  -- The new account has 500 businesses/month. Keep 50 credits available for
  -- manual verification or provider-side accounting differences, and only
  -- reserve 14 businesses per day so a 31-day month cannot exceed 434.
  if used_31d + requested > 450 then
    return jsonb_build_object('allowed', false, 'reason', 'monthly_business_budget');
  end if;
  if used_24h + requested > 14 then
    return jsonb_build_object('allowed', false, 'reason', 'daily_business_budget');
  end if;

  insert into public.service_business_api_reservations (
    request_key, directory_id, reserved_businesses
  ) values (p_request_key, p_directory_id, requested)
  returning id into reservation_id;

  return jsonb_build_object(
    'allowed', true,
    'reservation_id', reservation_id,
    'reserved_businesses', requested,
    'remaining_businesses', 450 - used_31d - requested
  );
end;
$$;

create or replace function public.settle_service_business_credits(
  p_reservation_id bigint,
  p_actual_businesses integer,
  p_response_payload jsonb default null
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  reserved integer;
  actual integer;
begin
  select reserved_businesses into reserved
    from public.service_business_api_reservations
   where id = p_reservation_id
   for update;
  if reserved is null then return false; end if;
  actual := least(greatest(coalesce(p_actual_businesses, reserved), 0), reserved);
  update public.service_business_api_reservations
     set actual_businesses = actual,
         response_payload = p_response_payload,
         status = 'settled',
         settled_at = now()
   where id = p_reservation_id;
  return true;
end;
$$;

revoke all on function public.reserve_service_business_credits(text, text, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_service_business_credits(text, text, integer)
  to service_role;
revoke all on function public.settle_service_business_credits(bigint, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.settle_service_business_credits(bigint, integer, jsonb)
  to service_role;
