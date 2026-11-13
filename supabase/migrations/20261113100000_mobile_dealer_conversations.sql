-- Native general dealer messages have their own conversations. Existing unscoped
-- website chats are never relabeled or made visible through this mapping.
create table public.mobile_dealer_conversations (
 conversation_id uuid primary key references public.conversations(id) on delete cascade,
 dealer_id uuid not null references public.dealer_profiles(id) on delete cascade,
 buyer_id uuid not null references auth.users(id) on delete cascade,
 seller_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),unique(dealer_id,buyer_id,seller_id)
);
alter table public.mobile_dealer_conversations enable row level security;
revoke all on public.mobile_dealer_conversations from public,anon,authenticated;
grant all on public.mobile_dealer_conversations to service_role;
create function public.mobile_start_dealer_conversation(_request uuid,_dealer uuid,_body text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); seller uuid; dealer_name text; dealer_description text; thread uuid; message uuid;
 clean text:=btrim(coalesce(_body,'')); fingerprint bytea; receipt mobile_message_receipts; outcome jsonb;
begin
 if actor is null then raise exception 'Unauthorized'; end if;
 if _request is null or _dealer is null or length(clean) not between 1 and 5000 then raise exception 'Invalid message request'; end if;
 if exists(select 1 from mobile_account_deletions where user_id=actor) then raise exception 'Account deletion pending'; end if;
 if not exists(select 1 from shopping_accounts where user_id=actor and terms_version='2026-11-12') then raise exception 'Accept current terms'; end if;
 fingerprint:=sha256(convert_to(jsonb_build_array('dealer_start',_dealer,clean)::text,'UTF8'));
 insert into mobile_message_receipts(user_id,request_id,input_hash) values(actor,_request,fingerprint) on conflict(user_id,request_id) do nothing;
 select * into receipt from mobile_message_receipts where user_id=actor and request_id=_request for update;
 if receipt.input_hash<>fingerprint then raise exception 'Message retry does not match original request'; end if;
 if receipt.result is not null then return receipt.result||jsonb_build_object('replayed',true); end if;
 select d.owner_user_id,d.display_name,d.description into seller,dealer_name,dealer_description from dealer_profiles d
 where d.id=_dealer and d.status='ready' and (d.agreements_accepted_at is not null or exists(
 select 1 from dealer_feed_publications p join dealer_inventory_sources s on s.id=p.source_id
 where p.dealer_id=d.id and p.inbox_enabled and p.enabled and p.revoked_at is null and s.status in ('active','error'))) for share;
 if seller is null or seller=actor or concat_ws(' ',dealer_name,dealer_description) ~* '\m(firearms?|ammunition|ammo|rifles?|pistols?|revolvers?|shotguns?|glock|ar[ -]?15|ak[ -]?47|bump[ -]?stocks?|automatic[ -]?conversion|explosives?|silencers?)\M' then raise exception 'Dealership messaging unavailable'; end if;
 if not exists(select 1 from auth.users where id=seller) then raise exception 'Dealership messaging unavailable'; end if;
 if exists(select 1 from account_contact_preferences where user_id=seller and not allow_internal_messages) then raise exception 'Dealership messaging unavailable'; end if;
 if exists(select 1 from conversations c join conversation_participants p on p.conversation_id=c.id where p.blocked_at is not null and ((c.buyer_id=actor and c.seller_id=seller)or(c.buyer_id=seller and c.seller_id=actor))) then raise exception 'Messaging is unavailable for this conversation'; end if;
 perform pg_advisory_xact_lock(hashtextextended('dealer-message:'||actor::text,0));
 if(select count(*) from rate_limit_events where user_id=actor and action='conversation_start' and created_at>now()-interval '1 hour')>=20 then raise exception 'You have reached the conversation limit. Try again later.'; end if;
 select conversation_id into thread from mobile_dealer_conversations where dealer_id=_dealer and buyer_id=actor and seller_id=seller for update;
 if thread is null then
  insert into conversations(buyer_id,seller_id,dealer_context_title) values(actor,seller,dealer_name||' inquiry') returning id into thread;
  insert into conversation_participants(conversation_id,user_id,role) values(thread,actor,'buyer'),(thread,seller,'seller');
  insert into mobile_dealer_conversations(conversation_id,dealer_id,buyer_id,seller_id)values(thread,_dealer,actor,seller);
 end if;
 message:=public.send_conversation_message(thread,clean);
 if message is null then raise exception 'Message unavailable'; end if;
 insert into rate_limit_events(user_id,action)values(actor,'conversation_start');
 outcome:=jsonb_build_object('conversationId',thread,'messageId',message);
 update mobile_message_receipts set result=outcome where user_id=actor and request_id=_request;
 return outcome||jsonb_build_object('replayed',false);
end $$;
revoke all on function public.mobile_start_dealer_conversation(uuid,uuid,text) from public,anon;
grant execute on function public.mobile_start_dealer_conversation(uuid,uuid,text) to authenticated;
create or replace function public.mobile_messaging_capabilities() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object(
 'attachments',to_regprocedure('public.mobile_commit_attachment(uuid,uuid,text,text,text,integer)') is not null,
 'posting',to_regprocedure('public.mobile_commit_listing(uuid,jsonb)') is not null,
 'savedSearches',to_regprocedure('public.mobile_commit_saved_search(uuid,text,uuid,jsonb)') is not null,
 'applications',to_regprocedure('public.mobile_commit_job_application(uuid,uuid,text,text)') is not null,
 'dealerMessages',true)
$$;
revoke all on function public.mobile_messaging_capabilities() from public,anon,authenticated;
grant execute on function public.mobile_messaging_capabilities() to service_role;
