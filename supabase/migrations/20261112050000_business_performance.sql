-- Durable public-business attribution. Sold/expired inventory does not erase
-- its historical activity. Only the server writes this directory.
create table public.business_performance_entities(
 business_key text primary key check(length(business_key) between 1 and 300),
 canonical_key text not null,
 metadata jsonb not null,
 updated_at timestamptz not null default now()
);
create table public.business_listing_attribution(
 listing_id text primary key,
 business_key text not null references public.business_performance_entities(business_key),
 title text not null,
 source text not null,
 updated_at timestamptz not null default now()
);
create table public.business_sales_assumptions(
 business_key text primary key,
 conversion_percent numeric check(conversion_percent between 0 and 100),
 updated_at timestamptz not null default now(),
 updated_by uuid not null references auth.users(id)
);
create table public.business_tracking_release(
 id boolean primary key default true check(id),
 tracking_started_at timestamptz not null default now()
);
insert into public.business_tracking_release(id) values(true);
alter table public.business_performance_entities enable row level security;
alter table public.business_listing_attribution enable row level security;
alter table public.business_sales_assumptions enable row level security;
alter table public.business_tracking_release enable row level security;
revoke all on public.business_performance_entities,public.business_listing_attribution,public.business_sales_assumptions,public.business_tracking_release from public,anon,authenticated;
grant all on public.business_performance_entities,public.business_listing_attribution,public.business_sales_assumptions,public.business_tracking_release to service_role;
create index if not exists analytics_business_period_idx on public.analytics_events(name,occurred_at,id) where is_demo=false;
comment on table public.business_sales_assumptions is 'Admin-entered modeling assumptions, never confirmed vehicle sales.';
