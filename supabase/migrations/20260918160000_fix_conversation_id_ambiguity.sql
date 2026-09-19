-- Fix the marketplace conversation RPCs for PL/pgSQL variable/column name
-- collisions. The old `conversation_id` variable was ambiguous in the final
-- UPDATE after a message was inserted, which rolled back otherwise valid
-- buyer messages.

create or replace function public.start_conversation(_listing_id uuid, _body text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  uid uuid := auth.uid();
  seller uuid;
  v_conversation_id uuid;
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
  if exists (
    select 1
    from public.account_contact_preferences preferences
    where preferences.user_id = seller
      and preferences.allow_internal_messages = false
  ) then
    raise exception 'This seller is not accepting Gem State messages';
  end if;
  if (select count(*) from public.rate_limit_events
      where user_id = uid and action = 'conversation_start'
        and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'You have reached the conversation limit. Try again later.';
  end if;

  insert into public.conversations (listing_id, buyer_id, seller_id)
  values (_listing_id, uid, seller)
  on conflict (listing_id, buyer_id, seller_id)
  do update set closed_at = null, last_message_at = now()
  returning id into v_conversation_id;

  insert into public.conversation_participants (conversation_id, user_id, role)
  values
    (v_conversation_id, uid, 'buyer'),
    (v_conversation_id, seller, 'seller')
  on conflict (conversation_id, user_id) do nothing;

  insert into public.conversation_messages (conversation_id, sender_id, body)
  values (v_conversation_id, uid, clean_body);

  insert into public.rate_limit_events (user_id, action)
  values (uid, 'conversation_start');

  insert into public.notifications
    (user_id, kind, title, body, order_id, entity_type, entity_id, destination_url)
  values
    (seller, 'message', 'New marketplace message',
     left('A member messaged you about ' || listing_title || ': ' || clean_body, 280),
     null, 'conversation', v_conversation_id,
     '/account?section=messages&conversation=' || v_conversation_id)
  on conflict do nothing;

  update public.conversations as c
  set last_message_at = now()
  where c.id = v_conversation_id;
  return v_conversation_id;
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
  v_message_id uuid;
  v_recipient uuid;
  listing_title text := 'your listing';
  clean_body text := btrim(coalesce(_body, ''));
begin
  if uid is null then raise exception 'Sign in required'; end if;
  if char_length(clean_body) not between 1 and 5000 then
    raise exception 'Message must be between 1 and 5000 characters';
  end if;
  if not exists (
    select 1
    from public.conversation_participants participant
    where participant.conversation_id = _conversation_id
      and participant.user_id = uid
      and participant.blocked_at is null
  ) then
    raise exception 'You are not a participant in this conversation';
  end if;
  if (select count(*) from public.rate_limit_events
      where user_id = uid and action = 'conversation_message'
        and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'You are sending messages too quickly. Try again shortly.';
  end if;

  select case when c.buyer_id = uid then c.seller_id else c.buyer_id end
    into v_recipient
  from public.conversations c
  where c.id = _conversation_id;

  select coalesce(p.name, 'your listing')
    into listing_title
  from public.conversations c
  left join public.asks a on a.id = c.listing_id
  left join public.product_variants v on v.id = a.variant_id
  left join public.products p on p.id = v.product_id
  where c.id = _conversation_id;

  insert into public.conversation_messages (conversation_id, sender_id, body)
  values (_conversation_id, uid, clean_body)
  returning id into v_message_id;

  insert into public.rate_limit_events (user_id, action)
  values (uid, 'conversation_message');

  insert into public.notifications
    (user_id, kind, title, body, order_id, entity_type, entity_id, destination_url)
  values
    (v_recipient, 'message', 'New marketplace message',
     left('You have a new message about ' || listing_title || ': ' || clean_body, 280),
     null, 'conversation', _conversation_id,
     '/account?section=messages&conversation=' || _conversation_id)
  on conflict do nothing;

  update public.conversations as c
  set last_message_at = now(), closed_at = null
  where c.id = _conversation_id;
  return v_message_id;
end;
$function$;

grant execute on function public.start_conversation(uuid, text) to authenticated;
grant execute on function public.send_conversation_message(uuid, text) to authenticated;
