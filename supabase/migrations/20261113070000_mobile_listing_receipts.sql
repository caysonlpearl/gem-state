-- A native listing, all category details, and its explicit retry receipt commit
-- in one transaction. Existing website posting continues using its domain RPC.
create function public.mobile_commit_listing(_request uuid,_input jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); fingerprint bytea; receipt mobile_message_receipts;
 category uuid; listing uuid; outcome jsonb; rpc_name text; media text[]; evidence text[];
begin
 if actor is null then raise exception 'Unauthorized'; end if;
 if _request is null or _input is null or jsonb_typeof(_input)<>'object' then raise exception 'Invalid listing request'; end if;
 if exists(select 1 from mobile_account_deletions where user_id=actor) then raise exception 'Account deletion pending'; end if;
 if not exists(select 1 from shopping_accounts where user_id=actor and terms_version='2026-11-12') then raise exception 'Accept current terms'; end if;
 select id into category from categories where slug=_input->>'category';
 if category is null or _input->>'category'='firearms' then raise exception 'Choose an eligible category'; end if;
 fingerprint:=sha256(convert_to(jsonb_build_array('listing',_input)::text,'UTF8'));
 insert into mobile_message_receipts(user_id,request_id,input_hash) values(actor,_request,fingerprint)
 on conflict(user_id,request_id) do nothing;
 select * into receipt from mobile_message_receipts where user_id=actor and request_id=_request for update;
 if receipt.input_hash<>fingerprint then raise exception 'Listing retry does not match original request'; end if;
 if receipt.result is not null then return receipt.result||jsonb_build_object('replayed',true); end if;
 select array_agg(p) into media from jsonb_array_elements_text(_input->'publicMediaPaths') p;
 select array_agg(p) into evidence from jsonb_array_elements_text(_input->'evidencePaths') p;
 if coalesce(cardinality(media),0) not between 1 and 8 or coalesce(cardinality(evidence),0) not between 1 and 8
 or exists(select 1 from unnest(media||evidence) p where p not like actor::text||'/%') then raise exception 'Add your own listing photos'; end if;
 rpc_name:=case when _input->>'category'='pets' and (_input->>'priceCents')::integer=0 then 'create_free_pet_listing' else 'create_classified_listing' end;
 -- The selected function name is an internal two-item allowlist. Parameters
 -- remain bound values and existing domain validation/moderation is retained.
 execute format('select public.%I($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)',rpc_name)
 into listing using
 _input->>'title',_input->>'description',category,(_input->>'priceCents')::integer,(_input->>'condition')::public.item_condition,
 nullif(_input->>'sellerNote',''),_input->>'region',_input->>'city',_input->>'state',nullif(_input->>'postalCode',''),_input->>'fulfillmentMode',
 (_input->>'parcelLengthIn')::numeric,(_input->>'parcelWidthIn')::numeric,(_input->>'parcelHeightIn')::numeric,(_input->>'parcelWeightLb')::numeric,
 evidence,media,nullif(_input->'vehicle','null'::jsonb),nullif(_input->'home','null'::jsonb),nullif(_input->'job','null'::jsonb),nullif(_input->'service','null'::jsonb),nullif(_input->'pet','null'::jsonb);
 if listing is null then raise exception 'Listing unavailable'; end if;
 update classified_listing_details set item_details=coalesce(_input->'itemDetails','{}'::jsonb) where listing_id=listing;
 if not found then raise exception 'Listing details unavailable'; end if;
 outcome:=jsonb_build_object('listingId',listing);
 update mobile_message_receipts set result=outcome where user_id=actor and request_id=_request;
 return outcome||jsonb_build_object('replayed',false);
end $$;
revoke all on function public.mobile_commit_listing(uuid,jsonb) from public,anon;
grant execute on function public.mobile_commit_listing(uuid,jsonb) to authenticated;

create or replace function public.mobile_messaging_capabilities() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('attachments',to_regprocedure('public.mobile_commit_attachment(uuid,uuid,text,text,text,integer)') is not null,'posting',true)
$$;
revoke all on function public.mobile_messaging_capabilities() from public,anon,authenticated;
grant execute on function public.mobile_messaging_capabilities() to service_role;
