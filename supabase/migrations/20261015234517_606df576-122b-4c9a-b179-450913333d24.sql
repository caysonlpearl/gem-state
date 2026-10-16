create or replace function public.reserve_mashvisor_search(p_query_key text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare cached jsonb;
begin
  if length(p_query_key) > 500 then raise exception 'Invalid search'; end if;
  perform pg_advisory_xact_lock(428191024);
  select payload into cached from public.mashvisor_search_cache
    where query_key = p_query_key and expires_at > now();
  if cached is not null then return jsonb_build_object('cached', true, 'payload', cached); end if;
  delete from public.mashvisor_api_requests where created_at < now() - interval '31 days';
  delete from public.mashvisor_search_cache where expires_at < now() - interval '14 days';
  if exists(select 1 from public.mashvisor_api_requests where query_key = p_query_key and created_at > now() - interval '1 hour')
    or (select count(*) from public.mashvisor_api_requests where created_at > now() - interval '1 day') >= 2
    or (select count(*) from public.mashvisor_api_requests where created_at > now() - interval '31 days') >= 20
  then return jsonb_build_object('allowed', false); end if;
  insert into public.mashvisor_api_requests(query_key) values(p_query_key);
  return jsonb_build_object('allowed', true);
end $$;
revoke all on function public.reserve_mashvisor_search(text) from public, anon, authenticated;
grant execute on function public.reserve_mashvisor_search(text) to service_role;