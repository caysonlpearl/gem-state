-- Page views and partner-employer first-seen dates.
--
-- A view counts once per visitor per listing per day. Visitors are a salted
-- SHA-256 of IP + user agent + date computed on the server, so no IP or
-- browser detail is stored and hashes can't be linked across days. Only the
-- server (service role) reads or writes these tables.

create table if not exists public.listing_view_counts (
  listing_id text primary key
    check (listing_id ~ '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|adzuna-[0-9]{1,20})$'),
  views bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.listing_view_visitors (
  listing_id text not null,
  visitor_hash text not null check (char_length(visitor_hash) = 64),
  seen_on date not null default current_date,
  primary key (listing_id, visitor_hash)
);
create index if not exists listing_view_visitors_seen_on_idx
  on public.listing_view_visitors (seen_on);

alter table public.listing_view_counts enable row level security;
alter table public.listing_view_visitors enable row level security;
revoke all on public.listing_view_counts, public.listing_view_visitors from anon, authenticated;
grant all on public.listing_view_counts, public.listing_view_visitors to service_role;

create or replace function public.record_listing_view(_listing_id text, _visitor_hash text)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  total bigint;
begin
  insert into public.listing_view_visitors (listing_id, visitor_hash)
  values (_listing_id, _visitor_hash)
  on conflict do nothing;
  if found then
    insert into public.listing_view_counts as c (listing_id, views)
    values (_listing_id, 1)
    on conflict (listing_id) do update set views = c.views + 1, updated_at = now();
  end if;
  -- Yesterday's hashes can never match again (the date is in the hash).
  if random() < 0.01 then
    delete from public.listing_view_visitors where seen_on < current_date - 1;
  end if;
  select views into total from public.listing_view_counts where listing_id = _listing_id;
  return coalesce(total, 0);
end;
$$;

revoke all on function public.record_listing_view(text, text) from public, anon, authenticated;
grant execute on function public.record_listing_view(text, text) to service_role;

-- When Bluebird first showed a job from each partner employer ("On Bluebird since").
create table if not exists public.partner_employers (
  name_key text primary key check (char_length(name_key) between 3 and 200),
  first_seen_at timestamptz not null default now()
);
alter table public.partner_employers enable row level security;
revoke all on public.partner_employers from anon, authenticated;
grant all on public.partner_employers to service_role;
