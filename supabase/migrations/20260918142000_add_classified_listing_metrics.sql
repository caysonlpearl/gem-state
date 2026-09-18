-- Lightweight seller metrics for classified listings. The counters are
-- intentionally aggregate and do not store visitor identity.

create table if not exists public.classified_listing_metrics (
  listing_id uuid primary key references public.asks(id) on delete cascade,
  impressions bigint not null default 0 check (impressions >= 0),
  views bigint not null default 0 check (views >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.classified_listing_metrics enable row level security;
grant select on public.classified_listing_metrics to authenticated;
grant all on public.classified_listing_metrics to service_role;

drop policy if exists "Sellers read their listing metrics" on public.classified_listing_metrics;
create policy "Sellers read their listing metrics"
on public.classified_listing_metrics
for select
to authenticated
using (exists (
  select 1 from public.asks listing
  where listing.id = classified_listing_metrics.listing_id
    and listing.seller_id = auth.uid()
));

drop trigger if exists classified_listing_metrics_touch on public.classified_listing_metrics;
create trigger classified_listing_metrics_touch
before update on public.classified_listing_metrics
for each row execute function public.set_updated_at();

create or replace function public.record_classified_listing_view(_listing_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if exists (
    select 1 from public.asks listing
    where listing.id = _listing_id
      and listing.status = 'active'
      and listing.approved_at is not null
      and listing.expires_at > now()
      and listing.is_demo = false
  ) then
    insert into public.classified_listing_metrics (listing_id, views)
    values (_listing_id, 1)
    on conflict (listing_id) do update
      set views = classified_listing_metrics.views + 1,
          updated_at = now();
  end if;
end;
$function$;

create or replace function public.record_classified_listing_impressions(_listing_ids uuid[])
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  insert into public.classified_listing_metrics (listing_id, impressions)
  select listing.id, 1
  from public.asks listing
  where listing.id = any(coalesce(_listing_ids, '{}'::uuid[]))
    and listing.status = 'active'
    and listing.approved_at is not null
    and listing.expires_at > now()
    and listing.is_demo = false
  on conflict (listing_id) do update
    set impressions = classified_listing_metrics.impressions + 1,
        updated_at = now();
end;
$function$;

revoke all on function public.record_classified_listing_view(uuid) from public;
revoke all on function public.record_classified_listing_impressions(uuid[]) from public;
grant execute on function public.record_classified_listing_view(uuid) to anon, authenticated, service_role;
grant execute on function public.record_classified_listing_impressions(uuid[]) to anon, authenticated, service_role;

-- The account center needs to count paid-upgrade state without exposing other
-- sellers' purchases. Keep the row owner policy narrow.
grant select on public.listing_upgrade_purchases to authenticated;
drop policy if exists "Sellers read their own listing upgrades" on public.listing_upgrade_purchases;
create policy "Sellers read their own listing upgrades"
on public.listing_upgrade_purchases
for select
to authenticated
using (user_id = auth.uid());
