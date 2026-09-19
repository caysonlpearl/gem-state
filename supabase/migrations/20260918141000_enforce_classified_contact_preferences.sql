-- Respect the seller's account-center contact preference when a buyer starts
-- an internal Gem State conversation from a public classified listing.

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

revoke all on function public.start_conversation(uuid, text) from public;
grant execute on function public.start_conversation(uuid, text) to authenticated;

-- Keep the legacy inquiry RPC aligned with the same seller preference so old
-- entry points cannot bypass the account-center setting.
create or replace function public.create_listing_inquiry(
  _listing_id uuid,
  _message text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  uid uuid := auth.uid();
  listing record;
  buyer_email text := btrim(coalesce(auth.jwt() ->> 'email', ''));
  buyer_name text;
  inquiry_id uuid;
begin
  if uid is null then raise exception 'Sign in required'; end if;
  if char_length(btrim(coalesce(_message, ''))) not between 10 and 2000 then
    raise exception 'Tell the seller a little more.';
  end if;
  if buyer_email = '' then
    raise exception 'Your account needs an email address before you can contact a seller.';
  end if;

  select a.id, a.seller_id
    into listing
  from public.asks a
  where a.id = _listing_id
    and a.status = 'active'
    and a.approved_at is not null
    and a.expires_at > now();
  if listing.id is null then raise exception 'That listing is no longer available.'; end if;
  if listing.seller_id = uid then raise exception 'You cannot contact yourself.'; end if;
  if exists (
    select 1 from public.account_contact_preferences preferences
    where preferences.user_id = listing.seller_id
      and preferences.allow_internal_messages = false
  ) then
    raise exception 'This seller is not accepting Gem State messages';
  end if;

  select nullif(btrim(display_name), '') into buyer_name
  from public.profiles where id = uid;
  buyer_name := coalesce(buyer_name, split_part(buyer_email, '@', 1), 'Gem State buyer');

  insert into public.listing_inquiries
    (listing_id, seller_id, buyer_id, buyer_name, buyer_email, message)
  values
    (listing.id, listing.seller_id, uid, buyer_name, buyer_email, btrim(_message))
  returning id into inquiry_id;
  return inquiry_id;
end;
$function$;

revoke all on function public.create_listing_inquiry(uuid, text) from public;
grant execute on function public.create_listing_inquiry(uuid, text) to authenticated;
grant execute on function public.create_listing_inquiry(uuid, text) to service_role;
