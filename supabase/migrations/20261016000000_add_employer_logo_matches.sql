-- Which logo.dev domain (if any) matches a partner job's employer name.
-- Written and read only by the server (service role); no client access.
create table if not exists public.employer_logo_matches (
  name_key text primary key check (char_length(name_key) between 3 and 200),
  domain text check (domain is null or domain ~ '^[a-z0-9.-]{1,253}$'),
  checked_at timestamptz not null default now()
);

alter table public.employer_logo_matches enable row level security;
revoke all on public.employer_logo_matches from anon, authenticated;
