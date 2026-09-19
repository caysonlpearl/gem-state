-- Gem State account center: private member tools and conversation primitives.

create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  search jsonb not null default '{}'::jsonb,
  email_alerts boolean not null default true,
  paused boolean not null default false,
  last_match_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_searches_name_length check (char_length(btrim(name)) between 1 and 80)
);

create index if not exists saved_searches_user_created_idx
  on public.saved_searches (user_id, created_at desc);

alter table public.saved_searches enable row level security;
grant select, insert, update, delete on public.saved_searches to authenticated;
grant all on public.saved_searches to service_role;

drop policy if exists "Members manage their saved searches" on public.saved_searches;
create policy "Members manage their saved searches"
on public.saved_searches
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create table if not exists public.account_contact_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  allow_email boolean not null default true,
  allow_phone boolean not null default false,
  allow_text boolean not null default false,
  show_contact_buttons boolean not null default true,
  allow_internal_messages boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.account_contact_preferences enable row level security;
grant select, insert, update on public.account_contact_preferences to authenticated;
grant all on public.account_contact_preferences to service_role;

drop policy if exists "Members manage their contact preferences" on public.account_contact_preferences;
create policy "Members manage their contact preferences"
on public.account_contact_preferences
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create table if not exists public.account_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  message_alerts boolean not null default true,
  listing_activity boolean not null default true,
  saved_search_matches boolean not null default true,
  review_requests boolean not null default true,
  listing_upgrade_receipts boolean not null default true,
  product_updates boolean not null default false,
  marketing_email boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.account_notification_preferences enable row level security;
grant select, insert, update on public.account_notification_preferences to authenticated;
grant all on public.account_notification_preferences to service_role;

drop policy if exists "Members manage their notification preferences" on public.account_notification_preferences;
create policy "Members manage their notification preferences"
on public.account_notification_preferences
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

alter table if exists public.notifications
  add column if not exists entity_type text,
  add column if not exists entity_id uuid,
  add column if not exists destination_url text;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.asks(id) on delete set null,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint conversations_distinct_members check (buyer_id <> seller_id),
  constraint conversations_listing_pair_unique unique (listing_id, buyer_id, seller_id)
);

create index if not exists conversations_buyer_recent_idx
  on public.conversations (buyer_id, last_message_at desc);
create index if not exists conversations_seller_recent_idx
  on public.conversations (seller_id, last_message_at desc);

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('buyer', 'seller')),
  last_read_at timestamptz,
  blocked_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_participants_user_idx
  on public.conversation_participants (user_id, conversation_id);

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  attachment_path text,
  attachment_content_type text,
  attachment_size integer,
  created_at timestamptz not null default now(),
  constraint conversation_messages_body_length check (char_length(btrim(body)) between 1 and 5000),
  constraint conversation_messages_attachment_size check (attachment_size is null or attachment_size between 1 and 10485760)
);

create index if not exists conversation_messages_recent_idx
  on public.conversation_messages (conversation_id, created_at asc);

create table if not exists public.conversation_reports (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (conversation_id, reporter_id)
);

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.conversation_reports enable row level security;

grant select on public.conversations, public.conversation_participants, public.conversation_messages to authenticated;
grant insert on public.conversation_reports to authenticated;
grant all on public.conversations, public.conversation_participants, public.conversation_messages, public.conversation_reports to service_role;

drop policy if exists "Participants read conversations" on public.conversations;
create policy "Participants read conversations"
on public.conversations
for select
to authenticated
using (buyer_id = auth.uid() or seller_id = auth.uid());

drop policy if exists "Participants read participant rows" on public.conversation_participants;
create policy "Participants read participant rows"
on public.conversation_participants
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Participants read messages" on public.conversation_messages;
create policy "Participants read messages"
on public.conversation_messages
for select
to authenticated
using (exists (
  select 1 from public.conversation_participants participant
  where participant.conversation_id = conversation_messages.conversation_id
    and participant.user_id = auth.uid()
));

drop policy if exists "Members report conversations" on public.conversation_reports;
create policy "Members report conversations"
on public.conversation_reports
for insert
to authenticated
with check (reporter_id = auth.uid() and exists (
  select 1 from public.conversation_participants participant
  where participant.conversation_id = conversation_reports.conversation_id
    and participant.user_id = auth.uid()
));

create or replace function public.start_conversation(_listing_id uuid, _body text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  uid uuid := auth.uid();
  seller uuid;
  conversation_id uuid;
  listing_title text := 'your listing';
  clean_body text := btrim(coalesce(_body, ''));
begin
  if uid is null then raise exception 'Sign in required'; end if;
  if char_length(clean_body) not between 1 and 5000 then
    raise exception 'Message must be between 1 and 5000 characters';
  end if;

  select a.seller_id, coalesce(p.name, 'your listing')
    into seller, listing_title
  from public.asks a
  left join public.product_variants v on v.id = a.variant_id
  left join public.products p on p.id = v.product_id
  where a.id = _listing_id
    and a.status = 'active'
    and a.approved_at is not null
    and a.expires_at > now()
    and not a.is_demo;
  if seller is null then raise exception 'That listing is no longer available'; end if;
  if seller = uid then raise exception 'You cannot message yourself'; end if;
  if (select count(*) from public.rate_limit_events
      where user_id = uid and action = 'conversation_start'
        and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'You have reached the conversation limit. Try again later.';
  end if;

  insert into public.conversations (listing_id, buyer_id, seller_id)
  values (_listing_id, uid, seller)
  on conflict (listing_id, buyer_id, seller_id)
  do update set closed_at = null, last_message_at = now()
  returning id into conversation_id;

  insert into public.conversation_participants (conversation_id, user_id, role)
  values
    (conversation_id, uid, 'buyer'),
    (conversation_id, seller, 'seller')
  on conflict (conversation_id, user_id) do nothing;

  insert into public.conversation_messages (conversation_id, sender_id, body)
  values (conversation_id, uid, clean_body);

  insert into public.rate_limit_events (user_id, action)
  values (uid, 'conversation_start');

  insert into public.notifications
    (user_id, kind, title, body, order_id, entity_type, entity_id, destination_url)
  values
    (seller, 'message', 'New marketplace message',
     left('A member messaged you about ' || listing_title || ': ' || clean_body, 280),
     null, 'conversation', conversation_id, '/account?section=messages&conversation=' || conversation_id)
  on conflict do nothing;

  update public.conversations set last_message_at = now() where id = conversation_id;
  return conversation_id;
end;
$function$;

create or replace function public.send_conversation_message(_conversation_id uuid, _body text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  uid uuid := auth.uid();
  message_id uuid;
  recipient uuid;
  listing_title text := 'your listing';
  clean_body text := btrim(coalesce(_body, ''));
begin
  if uid is null then raise exception 'Sign in required'; end if;
  if char_length(clean_body) not between 1 and 5000 then
    raise exception 'Message must be between 1 and 5000 characters';
  end if;
  if not exists (
    select 1 from public.conversation_participants
    where conversation_id = _conversation_id and user_id = uid and blocked_at is null
  ) then
    raise exception 'You are not a participant in this conversation';
  end if;
  if (select count(*) from public.rate_limit_events
      where user_id = uid and action = 'conversation_message'
        and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'You are sending messages too quickly. Try again shortly.';
  end if;

  select case when buyer_id = uid then seller_id else buyer_id end
    into recipient
  from public.conversations
  where id = _conversation_id;

  select coalesce(p.name, 'your listing') into listing_title
  from public.conversations c
  left join public.asks a on a.id = c.listing_id
  left join public.product_variants v on v.id = a.variant_id
  left join public.products p on p.id = v.product_id
  where c.id = _conversation_id;

  insert into public.conversation_messages (conversation_id, sender_id, body)
  values (_conversation_id, uid, clean_body)
  returning id into message_id;
  insert into public.rate_limit_events (user_id, action)
  values (uid, 'conversation_message');
  insert into public.notifications
    (user_id, kind, title, body, order_id, entity_type, entity_id, destination_url)
  values
    (recipient, 'message', 'New marketplace message',
     left('You have a new message about ' || listing_title || ': ' || clean_body, 280),
     null, 'conversation', _conversation_id, '/account?section=messages&conversation=' || _conversation_id)
  on conflict do nothing;
  update public.conversations set last_message_at = now(), closed_at = null where id = _conversation_id;
  return message_id;
end;
$function$;

create or replace function public.mark_conversation_read(_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  update public.conversation_participants
  set last_read_at = now()
  where conversation_id = _conversation_id and user_id = auth.uid();
end;
$function$;

create or replace function public.block_conversation(_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  update public.conversation_participants
  set blocked_at = now()
  where conversation_id = _conversation_id and user_id = auth.uid();
  if not found then raise exception 'You are not a participant in this conversation'; end if;
end;
$function$;

revoke all on function public.start_conversation(uuid, text) from public;
revoke all on function public.send_conversation_message(uuid, text) from public;
revoke all on function public.mark_conversation_read(uuid) from public;
revoke all on function public.block_conversation(uuid) from public;
grant execute on function public.start_conversation(uuid, text) to authenticated;
grant execute on function public.send_conversation_message(uuid, text) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.block_conversation(uuid) to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists saved_searches_touch on public.saved_searches;
create trigger saved_searches_touch
before update on public.saved_searches
for each row execute function public.set_updated_at();

drop trigger if exists account_contact_preferences_touch on public.account_contact_preferences;
create trigger account_contact_preferences_touch
before update on public.account_contact_preferences
for each row execute function public.set_updated_at();

drop trigger if exists account_notification_preferences_touch on public.account_notification_preferences;
create trigger account_notification_preferences_touch
before update on public.account_notification_preferences
for each row execute function public.set_updated_at();