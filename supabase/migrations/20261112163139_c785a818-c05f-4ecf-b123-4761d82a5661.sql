create table if not exists public.employer_claims (
  id uuid primary key default gen_random_uuid(),
  employer_key text not null check (char_length(employer_key) between 3 and 200),
  employer_name text not null check (char_length(btrim(employer_name)) between 2 and 200),
  city text not null default '' check (char_length(city) <= 120),
  state text not null default '' check (char_length(state) <= 40),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact text not null check (char_length(btrim(contact)) between 3 and 200),
  role text not null check (char_length(btrim(role)) between 2 and 80),
  note text check (note is null or char_length(note) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  unique (employer_key, user_id)
);

alter table public.employer_claims enable row level security;
revoke all on public.employer_claims from anon, authenticated;
grant all on public.employer_claims to service_role;
grant select, insert on public.employer_claims to authenticated;
grant update on public.employer_claims to authenticated;

drop policy if exists "Members file their own employer claims" on public.employer_claims;
create policy "Members file their own employer claims"
on public.employer_claims for insert to authenticated
with check (user_id = auth.uid() and status = 'pending');

drop policy if exists "Members read their own employer claims" on public.employer_claims;
create policy "Members read their own employer claims"
on public.employer_claims for select to authenticated
using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins review employer claims" on public.employer_claims;
create policy "Admins review employer claims"
on public.employer_claims for update to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));