-- Dedupe table for saved-search alerts. The worker may safely retry the same
-- listing without creating duplicate in-app notifications or emails.
create table if not exists public.saved_search_matches (
  id uuid primary key default gen_random_uuid(),
  saved_search_id uuid not null references public.saved_searches(id) on delete cascade,
  listing_id uuid not null references public.asks(id) on delete cascade,
  matched_at timestamptz not null default now(),
  emailed_at timestamptz,
  unique (saved_search_id, listing_id)
);

create index if not exists saved_search_matches_recent_idx
  on public.saved_search_matches (saved_search_id, matched_at desc);

alter table public.saved_search_matches enable row level security;
grant all on public.saved_search_matches to service_role;
