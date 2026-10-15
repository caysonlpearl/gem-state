begin;

create table public.adzuna_search_cache (
  query_key text primary key,
  payload jsonb not null,
  expires_at timestamptz not null
);
create table public.adzuna_api_requests (
  id bigint generated always as identity primary key,
  query_key text not null,
  created_at timestamptz not null default now()
);
create index adzuna_api_requests_created_idx on public.adzuna_api_requests(created_at);
create index adzuna_api_requests_query_idx on public.adzuna_api_requests(query_key, created_at);
alter table public.adzuna_search_cache enable row level security;
alter table public.adzuna_api_requests enable row level security;
revoke all on public.adzuna_search_cache, public.adzuna_api_requests from anon, authenticated;
grant all on public.adzuna_search_cache, public.adzuna_api_requests to service_role;
grant usage, select on sequence public.adzuna_api_requests_id_seq to service_role;

create function public.reserve_adzuna_search(p_query_key text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare cached jsonb;
begin
  if length(p_query_key) > 500 then raise exception 'Invalid search'; end if;
  perform pg_advisory_xact_lock(428191023);
  select payload into cached from public.adzuna_search_cache
    where query_key = p_query_key and expires_at > now();
  if cached is not null then return jsonb_build_object('cached', true, 'payload', cached); end if;
  delete from public.adzuna_api_requests where created_at < now() - interval '31 days';
  delete from public.adzuna_search_cache where expires_at < now();
  if exists(select 1 from public.adzuna_api_requests where query_key = p_query_key and created_at > now() - interval '30 seconds')
    or (select count(*) from public.adzuna_api_requests where created_at > now() - interval '1 minute') >= 20
    or (select count(*) from public.adzuna_api_requests where created_at > now() - interval '1 day') >= 200
    or (select count(*) from public.adzuna_api_requests where created_at > now() - interval '7 days') >= 900
    or (select count(*) from public.adzuna_api_requests where created_at > now() - interval '31 days') >= 2400
  then return jsonb_build_object('allowed', false); end if;
  insert into public.adzuna_api_requests(query_key) values(p_query_key);
  return jsonb_build_object('allowed', true);
end $$;
revoke all on function public.reserve_adzuna_search(text) from public, anon, authenticated;
grant execute on function public.reserve_adzuna_search(text) to service_role;

commit;
