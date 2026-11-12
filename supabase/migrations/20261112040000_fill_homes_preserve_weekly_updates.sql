-- Remove the operator's daily cap. Keep each subscription's 100-request
-- rolling monthly cap and shared same-property retry lock.
create or replace function public.reserve_openwebninja_account_call(
  p_cache_key text, p_provider text, p_account text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare cached jsonb;
begin
  if p_cache_key is null or length(p_cache_key) > 500 then raise exception 'Invalid provider cache key'; end if;
  if p_provider is null or p_provider not in ('zillow','realestate','redfin') then raise exception 'Unknown provider'; end if;
  if p_account is null or p_account not in ('primary','backup') then raise exception 'Unknown account'; end if;
  perform pg_advisory_xact_lock(428191025);
  select payload into cached from public.openwebninja_cache
    where cache_key=p_cache_key and expires_at>now();
  if cached is not null then return jsonb_build_object('cached',true,'payload',cached); end if;
  delete from public.openwebninja_api_requests where created_at<now()-interval '31 days';
  delete from public.openwebninja_cache where expires_at<now()-interval '31 days';
  if exists(select 1 from public.openwebninja_api_requests
      where cache_key=p_cache_key and created_at>now()-interval '1 hour')
    or (select count(*) from public.openwebninja_api_requests
      where account=p_account and provider=p_provider and created_at>now()-interval '31 days')>=100
  then return jsonb_build_object('allowed',false); end if;
  insert into public.openwebninja_api_requests(cache_key,provider,account)
    values(p_cache_key,p_provider,p_account);
  return jsonb_build_object('allowed',true);
end $$;

-- Details may use either activated account, but cannot spend the combined
-- credits needed for weekly searches of their shared regional inventory.
create or replace function public.reserve_openwebninja_home_call(
  p_cache_key text, p_provider text, p_account text,
  p_accounts text[], p_reserved_searches integer
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare remaining integer;
begin
  if p_accounts is null or cardinality(p_accounts)=0
    or cardinality(p_accounts)>2
    or not p_accounts <@ array['primary','backup']::text[]
    or array_position(p_accounts,null) is not null
    or (select count(distinct a) from unnest(p_accounts) a)<>cardinality(p_accounts)
    or not coalesce(p_account=any(p_accounts),false)
    or p_reserved_searches is null or p_reserved_searches<0 or p_reserved_searches>15
  then raise exception 'Invalid home budget'; end if;
  perform pg_advisory_xact_lock(428191025);
  if exists(select 1 from public.openwebninja_cache where cache_key=p_cache_key and expires_at>now())
  then return public.reserve_openwebninja_account_call(p_cache_key,p_provider,p_account); end if;
  select sum(greatest(0,100-(select count(*) from public.openwebninja_api_requests r
    where r.provider=p_provider and r.account=a and r.created_at>now()-interval '31 days')))
    into remaining from unnest(p_accounts) a;
  if remaining<=p_reserved_searches
  then return jsonb_build_object('allowed',false,'reason','weekly refresh allowance protected'); end if;
  return public.reserve_openwebninja_account_call(p_cache_key,p_provider,p_account);
end $$;
revoke all on function public.reserve_openwebninja_home_call(text,text,text,text[],integer) from public,anon,authenticated;
grant execute on function public.reserve_openwebninja_home_call(text,text,text,text[],integer) to service_role;

