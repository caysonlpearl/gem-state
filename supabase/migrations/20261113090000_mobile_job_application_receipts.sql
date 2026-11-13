-- Native application retries must not reset an employer's review or create another notification.
-- Resume bytes stay in the existing private Storage bucket; receipts retain a hash and identifiers only.
create function public.mobile_commit_job_application(_request uuid,_listing uuid,_resume_path text,_cover_letter text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); fingerprint bytea; receipt mobile_message_receipts; ask_record record;
 application uuid; outcome jsonb; file_metadata jsonb; cover text:=nullif(trim(coalesce(_cover_letter,'')),'');
begin
 if actor is null then raise exception 'Unauthorized'; end if;
 if _request is null or _listing is null or length(coalesce(_resume_path,''))>300 or length(coalesce(cover,''))>4000 then raise exception 'Invalid application request'; end if;
 if exists(select 1 from mobile_account_deletions where user_id=actor) then raise exception 'Account deletion pending'; end if;
 if not exists(select 1 from shopping_accounts where user_id=actor and terms_version='2026-11-12') then raise exception 'Accept current terms'; end if;
 fingerprint:=sha256(convert_to(jsonb_build_array('job_application',_listing,_resume_path,cover)::text,'UTF8'));
 insert into mobile_message_receipts(user_id,request_id,input_hash) values(actor,_request,fingerprint) on conflict(user_id,request_id) do nothing;
 select * into receipt from mobile_message_receipts where user_id=actor and request_id=_request for update;
 if receipt.input_hash<>fingerprint then raise exception 'Application retry does not match original request'; end if;
 if receipt.result is not null then return receipt.result||jsonb_build_object('replayed',true); end if;
 select a.seller_id,a.status,a.approved_at,a.expires_at,a.is_demo,p.status product_status,p.name,p.description,c.slug
 into ask_record from asks a join products p on p.id=a.product_id join categories c on c.id=p.category_id where a.id=_listing;
 if not found or ask_record.slug<>'jobs' or ask_record.status<>'active' or ask_record.product_status<>'published' or ask_record.approved_at is null or ask_record.is_demo or ask_record.expires_at is null or ask_record.expires_at<=now()
 or concat_ws(' ',ask_record.name,ask_record.description) ~* '\m(firearms?|ammunition|ammo|rifles?|pistols?|revolvers?|shotguns?|glock|ar[ -]?15|ak[ -]?47|bump[ -]?stocks?|automatic[ -]?conversion|explosives?|silencers?)\M' then raise exception 'Application unavailable'; end if;
 if exists(select 1 from conversations c join conversation_participants p on p.conversation_id=c.id where p.blocked_at is not null and ((c.buyer_id=actor and c.seller_id=ask_record.seller_id) or (c.seller_id=actor and c.buyer_id=ask_record.seller_id))) then raise exception 'Application unavailable'; end if;
 if _resume_path !~ ('^'||actor::text||'/'||_listing::text||'/[0-9a-f-]{36}\.(pdf|doc|docx)$') then raise exception 'Resume unavailable'; end if;
 select metadata into file_metadata from storage.objects where bucket_id='job-application-resumes' and name=_resume_path;
 if not found or coalesce(file_metadata->>'mimetype','') not in ('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document')
 or (case when file_metadata->>'size' ~ '^\d+$' then (file_metadata->>'size')::bigint else 0 end) not between 1 and 10485760 then raise exception 'Resume upload is incomplete'; end if;
 application:=public.submit_job_application(_listing,_resume_path,cover);
 if application is null then raise exception 'Application unavailable'; end if;
 outcome:=jsonb_build_object('ok',true,'applicationId',application);
 update mobile_message_receipts set result=outcome where user_id=actor and request_id=_request;
 return outcome||jsonb_build_object('replayed',false);
end $$;
revoke all on function public.mobile_commit_job_application(uuid,uuid,text,text) from public,anon;
grant execute on function public.mobile_commit_job_application(uuid,uuid,text,text) to authenticated;
create or replace function public.mobile_messaging_capabilities() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('attachments',to_regprocedure('public.mobile_commit_attachment(uuid,uuid,text,text,text,integer)') is not null,'posting',to_regprocedure('public.mobile_commit_listing(uuid,jsonb)') is not null,'savedSearches',to_regprocedure('public.mobile_commit_saved_search(uuid,text,uuid,jsonb)') is not null,'applications',true)
$$;
revoke all on function public.mobile_messaging_capabilities() from public,anon,authenticated;
grant execute on function public.mobile_messaging_capabilities() to service_role;
