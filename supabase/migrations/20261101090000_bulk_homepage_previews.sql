-- Background preview reads must fit inside the hosted request budget. Sample
-- each existing group inside Postgres instead of issuing a request per group.
begin;

create or replace function public.homepage_merchandise_previews(p_per_scope integer default 12)
returns table (id text, first_seen_at timestamptz, source_refreshed_at timestamptz, product jsonb)
language sql stable security invoker set search_path = '' as $$
  select item.id, item.first_seen_at, item.source_refreshed_at,
    (select jsonb_object_agg(field, item.payload->'raw'->field)
     from unnest(array[
       'lngDatafeedId','lngMerchantId','lngProductId','strProductSKU',
       'strProductName','strDepartmentName','strCategoryName','strSubCategoryName',
       'strBrandName','dblProductPrice','dblProductSalePrice','strBuyURL',
       'strLargeImage','strMediumImage','strThumbnailImage','txtVariants'
     ]) as fields(field)) as product
  from public.avantlink_merchandise_scopes as scope
  cross join lateral (
    select m.id, m.first_seen_at, m.source_refreshed_at, m.payload
    from public.avantlink_merchandise as m
    where m.scope_key = scope.scope_key and m.active
      and m.source_refreshed_at >= now() - interval '7 days'
    order by m.first_seen_at desc, m.id
    limit greatest(1, least(coalesce(p_per_scope, 12), 24))
  ) as item;
$$;
revoke all on function public.homepage_merchandise_previews(integer) from public, anon, authenticated;
grant execute on function public.homepage_merchandise_previews(integer) to service_role;

create or replace function public.homepage_service_previews(p_trades text[], p_per_trade integer default 8)
returns setof public.service_directory
language sql stable security invoker set search_path = '' as $$
  select business.*
  from (select distinct trade from unnest(p_trades[1:64]) as requested(trade)) as wanted
  cross join lateral (
    select d.* from public.service_directory as d
    where not d.hidden and d.state = 'ID' and d.trades @> array[wanted.trade]
    order by d.claimed_at desc nulls last, d.priority,
      (d.enrichment->'reviewCount') desc nulls last,
      d.source_refreshed_at desc nulls last, d.name, d.id
    limit greatest(1, least(coalesce(p_per_trade, 8), 24))
  ) as business;
$$;
revoke all on function public.homepage_service_previews(text[], integer) from public, anon, authenticated;
grant execute on function public.homepage_service_previews(text[], integer) to service_role;

commit;
