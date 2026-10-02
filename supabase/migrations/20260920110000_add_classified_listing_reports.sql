-- Member reports for published classified listings.

create table if not exists public.classified_listing_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.asks(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  constraint classified_listing_reports_reason_length check (char_length(btrim(reason)) between 2 and 80),
  constraint classified_listing_reports_details_length check (details is null or char_length(details) <= 500),
  constraint classified_listing_reports_one_per_member unique (listing_id, reporter_id)
);

create index if not exists classified_listing_reports_status_created_idx
  on public.classified_listing_reports (status, created_at desc);

alter table public.classified_listing_reports enable row level security;
revoke all on public.classified_listing_reports from anon, authenticated;
grant all on public.classified_listing_reports to service_role;
grant insert, select, update on public.classified_listing_reports to authenticated;

drop policy if exists "Members create listing reports" on public.classified_listing_reports;
create policy "Members create listing reports"
on public.classified_listing_reports
for insert
to authenticated
with check (reporter_id = auth.uid());

drop policy if exists "Admins read listing reports" on public.classified_listing_reports;
create policy "Admins read listing reports"
on public.classified_listing_reports
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins update listing reports" on public.classified_listing_reports;
create policy "Admins update listing reports"
on public.classified_listing_reports
for update
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));
