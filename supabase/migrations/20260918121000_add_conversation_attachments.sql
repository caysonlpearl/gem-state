-- Private marketplace message attachments. Files are never public; recipients
-- receive short-lived signed download URLs from server-only code.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'conversation-attachments',
  'conversation-attachments',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Conversation attachments are private" on storage.objects;
create policy "Conversation attachments are private"
on storage.objects
for all
to authenticated
using (bucket_id = 'conversation-attachments' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'conversation-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.send_conversation_message_with_attachment(
  _conversation_id uuid,
  _body text,
  _attachment_path text,
  _attachment_content_type text,
  _attachment_size integer
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  uid uuid := auth.uid();
  message_id uuid;
  recipient uuid;
begin
  if uid is null then raise exception 'Sign in required'; end if;
  if char_length(btrim(coalesce(_body, ''))) not between 1 and 5000 then
    raise exception 'Message must be between 1 and 5000 characters';
  end if;
  if _attachment_path is not null and split_part(_attachment_path, '/', 1) <> uid::text then
    raise exception 'Attachment path is not valid';
  end if;
  if _attachment_content_type is not null and _attachment_content_type not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
    raise exception 'Attachment type is not allowed';
  end if;
  if _attachment_size is not null and _attachment_size not between 1 and 10485760 then
    raise exception 'Attachment is too large';
  end if;
  if not exists (
    select 1 from public.conversation_participants
    where conversation_id = _conversation_id and user_id = uid and blocked_at is null
  ) then raise exception 'You are not a participant in this conversation'; end if;
  select case when buyer_id = uid then seller_id else buyer_id end into recipient
  from public.conversations where id = _conversation_id;
  if recipient is null then raise exception 'Conversation not found'; end if;

  insert into public.conversation_messages
    (conversation_id, sender_id, body, attachment_path, attachment_content_type, attachment_size)
  values (_conversation_id, uid, btrim(_body), _attachment_path, _attachment_content_type, _attachment_size)
  returning id into message_id;
  insert into public.rate_limit_events (user_id, action) values (uid, 'conversation_message');
  insert into public.notifications
    (user_id, kind, title, body, order_id, entity_type, entity_id, destination_url)
  values
    (recipient, 'message', 'New marketplace message', 'You have a new message with an attachment.', null,
     'conversation', _conversation_id, '/account?section=messages&conversation=' || _conversation_id)
  on conflict do nothing;
  update public.conversations set last_message_at = now(), closed_at = null where id = _conversation_id;
  return message_id;
end;
$function$;

revoke all on function public.send_conversation_message_with_attachment(uuid, text, text, text, integer) from public;
grant execute on function public.send_conversation_message_with_attachment(uuid, text, text, text, integer) to authenticated;
