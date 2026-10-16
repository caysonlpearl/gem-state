-- Member reports for partner (Adzuna) jobs, which have no asks row for
-- classified_listing_reports to reference. A report an admin marks
-- "reviewed" removes that job from Bluebird's results and pages.
create table if not exists public.partner_job_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null check (listing_id ~ '^adzuna-[0-9]{1,20}$'),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 2 and 80),
  details text check (details is null or char_length(details) <= 500),
  status text not null default 'open'
    check (status in ('open', 'under_review', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  unique (listing_id, reporter_id)
);

create index if not exists partner_job_reports_status_idx
  on public.partner_job_reports (status, created_at desc);

alter table public.partner_job_reports enable row level security;
revoke all on public.partner_job_reports from anon, authenticated;
grant all on public.partner_job_reports to service_role;
grant insert, select, update on public.partner_job_reports to authenticated;

drop policy if exists "Members create partner job reports" on public.partner_job_reports;
create policy "Members create partner job reports"
on public.partner_job_reports for insert to authenticated
with check (reporter_id = auth.uid() and status = 'open');

drop policy if exists "Admins read partner job reports" on public.partner_job_reports;
create policy "Admins read partner job reports"
on public.partner_job_reports for select to authenticated
using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins update partner job reports" on public.partner_job_reports;
create policy "Admins update partner job reports"
on public.partner_job_reports for update to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));
