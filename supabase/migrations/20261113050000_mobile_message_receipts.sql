-- A committed message and its retry receipt share one transaction. No leases or
-- best-effort cache can safely decide whether an uncertain message was sent.
create table public.mobile_message_receipts (
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null, input_hash bytea not null,
 result jsonb, created_at timestamptz not null default now(),
 primary key(user_id,request_id)
);
alter table public.mobile_message_receipts enable row level security;
revoke all on public.mobile_message_receipts from public,anon,authenticated;
grant all on public.mobile_message_receipts to service_role;

create function public.mobile_commit_message(_request uuid,_operation text,_target text,_body text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); fingerprint bytea; receipt mobile_message_receipts;
 conversation uuid; message uuid; outcome jsonb;
begin
 if actor is null then raise exception 'Unauthorized'; end if;
 if _request is null or _operation is null or _operation not in ('start','reply') or _target is null or length(_target)>200
 or _body is null or length(trim(_body)) not between 1 and 5000 then
  raise exception 'Invalid message request';
 end if;
 if exists(select 1 from mobile_account_deletions where user_id=actor) then
  raise exception 'Account deletion pending';
 end if;
 if not exists(select 1 from shopping_accounts where user_id=actor and terms_version='2026-11-12') then
  raise exception 'Accept current terms';
 end if;
 fingerprint:=sha256(convert_to(jsonb_build_array(_operation,_target,trim(_body))::text,'UTF8'));
 insert into mobile_message_receipts(user_id,request_id,input_hash)
 values(actor,_request,fingerprint) on conflict(user_id,request_id) do nothing;
 select * into receipt from mobile_message_receipts
 where user_id=actor and request_id=_request for update;
 if receipt.input_hash<>fingerprint then raise exception 'Message retry does not match original request'; end if;
 if receipt.result is not null then return receipt.result||jsonb_build_object('replayed',true); end if;
 if _operation='reply' then
  conversation:=_target::uuid;
  message:=public.send_conversation_message(conversation,trim(_body));
 elsif _target like 'dealerfeed-%' then
  conversation:=public.start_dealer_conversation(null,substring(_target from 12)::uuid,trim(_body));
 else
  conversation:=public.start_conversation(_target::uuid,trim(_body));
 end if;
 if conversation is null then raise exception 'Conversation unavailable'; end if;
 if message is null then
  select id into message from conversation_messages
  where conversation_id=conversation and sender_id=actor and xmin=pg_current_xact_id()::xid order by created_at desc,id desc limit 1;
 end if;
 if message is null then raise exception 'Message unavailable'; end if;
 outcome:=jsonb_build_object('conversationId',conversation,'messageId',message);
 update mobile_message_receipts set result=outcome where user_id=actor and request_id=_request;
 return outcome||jsonb_build_object('replayed',false);
end $$;
revoke all on function public.mobile_commit_message(uuid,text,text,text) from public,anon;
grant execute on function public.mobile_commit_message(uuid,text,text,text) to authenticated;
