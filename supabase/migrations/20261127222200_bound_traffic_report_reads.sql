begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';

create index if not exists analytics_traffic_period_idx
  on public.analytics_events (occurred_at, id) where is_demo = false;

-- One JSON value per page avoids the Data API's row cap. Keep only the fields
-- consumed by the existing traffic, funnel, vitals and editorial aggregators.
create or replace function public.traffic_report_event_page(
  p_since timestamptz,
  p_until timestamptz,
  p_names text[],
  p_limit integer,
  p_after_at timestamptz default null,
  p_after_id uuid default null
) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  if (select auth.role()) is distinct from 'service_role'
    and not coalesce((select public.has_role(auth.uid(), 'admin'::public.app_role)), false) then
    raise insufficient_privilege;
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id, 'name', e.name, 'user_id', e.user_id,
      'session_id', e.session_id, 'occurred_at', e.occurred_at,
      'props', jsonb_strip_nulls(jsonb_build_object(
        'article', e.props->'article', 'device', e.props->'device',
        'event_at', e.props->'event_at', 'event_id', e.props->'event_id',
        'internal_reason', e.props->'internal_reason', 'is_bot', e.props->'is_bot',
        'is_internal', e.props->'is_internal', 'landing_path', e.props->'landing_path',
        'listing_id', e.props->'listing_id', 'media_article', e.props->'media_article',
        'method', e.props->'method', 'metric', e.props->'metric',
        'metric_id', e.props->'metric_id', 'mode', e.props->'mode',
        'placement', e.props->'placement', 'results', e.props->'results',
        'site_host', e.props->'site_host', 'template', e.props->'template',
        'traffic_channel', e.props->'traffic_channel', 'traffic_policy', e.props->'traffic_policy',
        'traffic_source', e.props->'traffic_source', 'traffic_visit', e.props->'traffic_visit',
        'user_agent', e.props->'user_agent', 'value', e.props->'value',
        'webdriver', e.props->'webdriver'
      ))
    ) order by e.occurred_at, e.id), '[]'::jsonb)
    from (
      select a.id, a.name, a.user_id, a.session_id, a.occurred_at, a.props
      from public.analytics_events a
      where a.is_demo = false and a.name = any(p_names)
        and a.occurred_at >= p_since and a.occurred_at < p_until
        and (a.occurred_at, a.id) > (
          coalesce(p_after_at, '-infinity'::timestamptz),
          coalesce(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid)
        )
      order by a.occurred_at, a.id
      limit greatest(1, least(coalesce(p_limit, 6000), 6000))
    ) e
  );
end;
$$;
revoke all on function public.traffic_report_event_page(timestamptz,timestamptz,text[],integer,timestamptz,uuid)
  from public, anon, authenticated;
grant execute on function public.traffic_report_event_page(timestamptz,timestamptz,text[],integer,timestamptz,uuid)
  to authenticated, service_role;

-- Keep the 180-day staff exclusion window without loading all staff event rows.
create or replace function public.traffic_report_staff_exclusions(p_until timestamptz, p_staff_ids uuid[])
returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  if (select auth.role()) is distinct from 'service_role'
    and not coalesce((select public.has_role(auth.uid(), 'admin'::public.app_role)), false) then
    raise insufficient_privilege;
  end if;

  return (
    select jsonb_build_object(
      'browserIds', coalesce(jsonb_agg(distinct session_id)
        filter (where session_id is not null and session_id <> ''), '[]'::jsonb),
      'visitIds', coalesce(jsonb_agg(distinct props->>'traffic_visit')
        filter (where jsonb_typeof(props->'traffic_visit') = 'string' and props->>'traffic_visit' <> ''), '[]'::jsonb)
    )
    from public.analytics_events
    where user_id = any(p_staff_ids)
      and occurred_at >= p_until - interval '180 days' and occurred_at < p_until
  );
end;
$$;
revoke all on function public.traffic_report_staff_exclusions(timestamptz,uuid[])
  from public, anon, authenticated;
grant execute on function public.traffic_report_staff_exclusions(timestamptz,uuid[])
  to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
