-- Match explicit title/description choices before nearby pagination and totals.
-- Additive: ordinary and already-installed callers retain the existing RPC.
BEGIN;
create function public.service_directory_nearby_search(
  p_lat double precision,
  p_lon double precision,
  p_miles double precision,
  p_trade text default null,
  p_q text default null,
  p_offset int default 0,
  p_limit int default 24,
  p_search_descriptions boolean default null
)
returns table (id text, total bigint)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with hits as (
    select d.id, d.claimed_at, d.priority, (d.enrichment->>'reviewCount')::int as reviews,
           d.source_refreshed_at, d.name
    from public.service_directory d
    where not d.hidden
      and d.state = 'ID'
      and d.latitude between p_lat - p_miles / 69.0 and p_lat + p_miles / 69.0
      and 3958.8 * 2 * asin(sqrt(
            power(sin(radians(d.latitude - p_lat) / 2), 2)
            + cos(radians(p_lat)) * cos(radians(d.latitude))
              * power(sin(radians(d.longitude - p_lon) / 2), 2))) <= p_miles
      and (p_trade is null or d.trades @> array[p_trade])
      and (p_q is null or d.name ilike '%' || p_q || '%'
        or (p_search_descriptions is distinct from false and d.trade ilike '%' || p_q || '%')
        or (p_search_descriptions is true and d.enrichment->>'summary' ilike '%' || p_q || '%'))
  )
  select hits.id, count(*) over ()
  from hits
  order by claimed_at desc nulls last, priority, reviews desc nulls last,
           source_refreshed_at desc nulls last, name
  offset greatest(p_offset, 0)
  limit greatest(p_limit, 1)
$$;
revoke all on function public.service_directory_nearby_search(double precision, double precision, double precision, text, text, int, int, boolean) from public, anon, authenticated;
grant execute on function public.service_directory_nearby_search(double precision, double precision, double precision, text, text, int, int, boolean) to service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
