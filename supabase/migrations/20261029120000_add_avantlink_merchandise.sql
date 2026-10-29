-- Eligible online merchandise is cached separately from member classifieds.
begin;
create table if not exists public.avantlink_merchandise (
  id text primary key check (id ~ '^[0-9]{1,20}$'),
  sku text not null,
  scope_key text not null,
  title text not null,
  description text not null default '',
  category_slug text not null check (category_slug in ('apparel-accessories','outdoor-sporting','tools-equipment')),
  price_cents bigint not null check (price_cents > 0),
  payload jsonb not null,
  first_seen_at timestamptz not null default now(),
  source_refreshed_at timestamptz not null default now(),
  active boolean not null default true
);
create index if not exists avantlink_merchandise_browse_idx on public.avantlink_merchandise(category_slug, active, price_cents);
create index if not exists avantlink_merchandise_scope_idx on public.avantlink_merchandise(scope_key, source_refreshed_at);

create table if not exists public.avantlink_merchandise_scopes (
  scope_key text primary key,
  completed_at timestamptz,
  generation_started_at timestamptz,
  next_offset integer not null default 0,
  lease_until timestamptz,
  last_error text,
  received_count integer not null default 0,
  accepted_count integer not null default 0
);
create table if not exists public.avantlink_merchandise_requests (
  id bigint generated always as identity primary key,
  scope_key text not null,
  created_at timestamptz not null default now()
);
create index if not exists avantlink_merchandise_requests_time_idx on public.avantlink_merchandise_requests(created_at);
alter table public.avantlink_merchandise enable row level security;
alter table public.avantlink_merchandise_scopes enable row level security;
alter table public.avantlink_merchandise_requests enable row level security;
revoke all on public.avantlink_merchandise, public.avantlink_merchandise_scopes, public.avantlink_merchandise_requests from public, anon, authenticated;
grant all on public.avantlink_merchandise, public.avantlink_merchandise_scopes, public.avantlink_merchandise_requests to service_role;
grant usage, select on sequence public.avantlink_merchandise_requests_id_seq to service_role;

-- A shared lease prevents overlapping scheduler/manual refreshes; budgets
-- cannot be bypassed by concurrent workers or visitor-triggered reads.
create or replace function public.reserve_avantlink_merchandise_page(p_scope_key text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.avantlink_merchandise_scopes%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('avantlink-merchandise'));
  insert into public.avantlink_merchandise_scopes(scope_key) values(p_scope_key) on conflict do nothing;
  select * into s from public.avantlink_merchandise_scopes where scope_key = p_scope_key for update;
  if s.lease_until > now() or (s.completed_at > now() - interval '24 hours' and s.next_offset = 0) then
    return jsonb_build_object('allowed', false, 'reason', 'fresh_or_in_progress');
  end if;
  if (select count(*) from public.avantlink_merchandise_requests where created_at > now() - interval '24 hours') >= 200 then
    return jsonb_build_object('allowed', false, 'reason', 'daily_budget');
  end if;
  if (select count(*) from public.avantlink_merchandise_requests where created_at > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('allowed', false, 'reason', 'hourly_budget');
  end if;
  if s.next_offset >= 10000 then
    return jsonb_build_object('allowed', false, 'reason', 'scope_limit');
  end if;
  update public.avantlink_merchandise_scopes set
    lease_until = now() + interval '5 minutes',
    generation_started_at = case when s.next_offset = 0 then now() else s.generation_started_at end,
    received_count = case when s.next_offset = 0 then 0 else s.received_count end,
    accepted_count = case when s.next_offset = 0 then 0 else s.accepted_count end
    where scope_key = p_scope_key returning * into s;
  insert into public.avantlink_merchandise_requests(scope_key) values(p_scope_key);
  return jsonb_build_object('allowed', true, 'offset', s.next_offset, 'generation', s.generation_started_at,
    'received', s.received_count, 'accepted', s.accepted_count);
end $$;
revoke all on function public.reserve_avantlink_merchandise_page(text) from public, anon, authenticated;
grant execute on function public.reserve_avantlink_merchandise_page(text) to service_role;

-- Existing partner save/moderation UI already supports non-job partners.
alter table public.saved_partner_jobs drop constraint if exists saved_partner_jobs_listing_id_check;
alter table public.saved_partner_jobs add constraint saved_partner_jobs_listing_id_check
  check (listing_id ~ '^(adzuna-[0-9]{1,20}|fsq-[0-9a-f]{24}|rescuegroups-[0-9]{1,20}|avantlink-[0-9]{1,20})$');
alter table public.partner_job_reports drop constraint if exists partner_job_reports_listing_id_check;
alter table public.partner_job_reports add constraint partner_job_reports_listing_id_check
  check (listing_id ~ '^(adzuna-[0-9]{1,20}|mashvisor-[0-9]{1,15}|openwebninja-[0-9]{1,20}|fsq-[0-9a-f]{24}|avantlink-[0-9]{1,20})$');
alter table public.listing_view_counts drop constraint if exists listing_view_counts_listing_id_check;
alter table public.listing_view_counts add constraint listing_view_counts_listing_id_check
  check (listing_id ~ '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|adzuna-[0-9]{1,20}|mashvisor-[0-9]{1,15}|openwebninja-[0-9]{1,20}|fsq-[A-Za-z0-9._:-]{1,160}|marketcheck-(dealer|fsbo)-[A-Za-z0-9._:-]{1,160}|rescuegroups-[0-9]{1,20}|avantlink-[0-9]{1,20})$');
commit;
