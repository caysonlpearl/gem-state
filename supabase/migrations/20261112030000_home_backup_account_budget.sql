-- Keep existing usage attached to the original account. Each activated backup
-- subscription gets its own hard cap; cached homes and retry locks stay shared.
alter table public.openwebninja_api_requests
  add column if not exists account text not null default 'primary'
  check (account in ('primary', 'backup'));
create index if not exists openwebninja_account_budget_idx
  on public.openwebninja_api_requests(account, provider, created_at);

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
      where account=p_account and provider=p_provider and created_at>now()-interval '1 day')>=25
    or (select count(*) from public.openwebninja_api_requests
      where account=p_account and provider=p_provider and created_at>now()-interval '31 days')>=100
  then return jsonb_build_object('allowed',false); end if;
  insert into public.openwebninja_api_requests(cache_key,provider,account)
    values(p_cache_key,p_provider,p_account);
  return jsonb_build_object('allowed',true);
end $$;

-- Old callers continue charging only the original subscription.
create or replace function public.reserve_openwebninja_provider_call(p_cache_key text,p_provider text)
returns jsonb language sql security definer set search_path = pg_catalog, public as $$
  select public.reserve_openwebninja_account_call(p_cache_key,p_provider,'primary');
$$;
revoke all on function public.reserve_openwebninja_account_call(text,text,text) from public,anon,authenticated;
grant execute on function public.reserve_openwebninja_account_call(text,text,text) to service_role;
