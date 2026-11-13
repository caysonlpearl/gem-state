-- Attachment upload finalization and its retry receipt commit together. The
-- private bucket and shared domain RPC retain participation/block checks.
create function public.mobile_commit_attachment(
 _request uuid, _conversation uuid, _body text, _path text, _content_type text, _size integer
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); fingerprint bytea; receipt mobile_message_receipts;
 metadata jsonb; message uuid; outcome jsonb;
begin
 if actor is null then raise exception 'Unauthorized'; end if;
 if _request is null or _conversation is null or _body is null or length(trim(_body)) not between 1 and 5000
 or _path is null or split_part(_path,'/',1)<>actor::text or split_part(_path,'/',2)<>_conversation::text
 or _path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$'
 or _content_type is null or _content_type not in ('image/jpeg','image/png','image/webp','application/pdf')
 or _size is null or _size not between 1 and 10485760 then
  raise exception 'Invalid attachment request';
 end if;
 if exists(select 1 from mobile_account_deletions where user_id=actor) then raise exception 'Account deletion pending'; end if;
 if not exists(select 1 from shopping_accounts where user_id=actor and terms_version='2026-11-12') then raise exception 'Accept current terms'; end if;
 fingerprint:=sha256(convert_to(jsonb_build_array('attachment',_conversation,trim(_body),_path,_content_type,_size)::text,'UTF8'));
 insert into mobile_message_receipts(user_id,request_id,input_hash) values(actor,_request,fingerprint)
 on conflict(user_id,request_id) do nothing;
 select * into receipt from mobile_message_receipts where user_id=actor and request_id=_request for update;
 if receipt.input_hash<>fingerprint then raise exception 'Message retry does not match original request'; end if;
 if receipt.result is not null then return receipt.result||jsonb_build_object('replayed',true); end if;
 select o.metadata into metadata from storage.objects o
 where o.bucket_id='conversation-attachments' and o.name=_path;
 if metadata is null then raise sqlstate 'PT409' using message='Attachment upload is incomplete.'; end if;
 -- Storage's system metadata is recorded from the uploaded bytes, not from
 -- user_metadata. Do not accept a missing/mismatched object as a sent file.
 if coalesce(metadata->>'size','') !~ '^[0-9]+$' or (metadata->>'size')::numeric<>_size
 or coalesce(metadata->>'mimetype','')<>_content_type then raise exception 'Attachment metadata does not match'; end if;
 message:=public.send_conversation_message_with_attachment(_conversation,trim(_body),_path,_content_type,_size);
 if message is null then raise exception 'Message unavailable'; end if;
 outcome:=jsonb_build_object('conversationId',_conversation,'messageId',message);
 update mobile_message_receipts set result=outcome where user_id=actor and request_id=_request;
 return outcome||jsonb_build_object('replayed',false);
end $$;
revoke all on function public.mobile_commit_attachment(uuid,uuid,text,text,text,integer) from public,anon;
grant execute on function public.mobile_commit_attachment(uuid,uuid,text,text,text,integer) to authenticated;

-- Only the server may discover readiness. An unapplied migration or failed
-- capability read keeps new attachment delivery unavailable, without hiding
-- existing signed attachment links or affecting text messages.
create function public.mobile_messaging_capabilities() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('attachments',true)
$$;
revoke all on function public.mobile_messaging_capabilities() from public,anon,authenticated;
grant execute on function public.mobile_messaging_capabilities() to service_role;
