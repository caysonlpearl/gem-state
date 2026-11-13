-- Native saved-search writes and their receipts commit together. A lost response,
-- a later rename/deletion, or a withdrawn permission must never revive an old write.
create function public.preserve_mobile_saved_search_scope() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if old.search->'mobileCatalog'='true'::jsonb then
  if new.search is null or jsonb_typeof(new.search)<>'object' then raise exception 'Invalid saved search filters'; end if;
  new.search:=coalesce(new.search,'{}'::jsonb)||'{"mobileCatalog":true}'::jsonb;
 end if;
 return new;
end $$;
create trigger preserve_mobile_saved_search_scope before update of search on public.saved_searches
for each row execute function public.preserve_mobile_saved_search_scope();

create function public.mobile_commit_saved_search(_request uuid,_operation text,_target uuid,_input jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); fingerprint bytea; receipt mobile_message_receipts;
 current_search saved_searches; target uuid; outcome jsonb; clean jsonb; privacy_only boolean;
begin
 if actor is null then raise exception 'Unauthorized'; end if;
 if _request is null or _operation is null or _operation not in ('create','update','delete') or _input is null or jsonb_typeof(_input)<>'object'
 or (_operation<>'create' and _target is null) then raise exception 'Invalid saved search request'; end if;
 if exists(select 1 from jsonb_object_keys(_input) k where k not in ('name','search','emailAlerts','paused')) then raise exception 'Invalid saved search request'; end if;
 if _operation='create' and (not(_input?'name') or not(_input?'search') or _input?'paused') then raise exception 'Invalid saved search request'; end if;
 if _operation='update' and _input='{}'::jsonb then raise exception 'Invalid saved search request'; end if;
 if _operation='delete' and _input<>'{}'::jsonb then raise exception 'Invalid saved search request'; end if;
 if _input?'name' and (jsonb_typeof(_input->'name')<>'string' or length(trim(_input->>'name')) not between 1 and 80) then raise exception 'Name your saved search'; end if;
 if exists(select 1 from jsonb_each(_input) e where e.key in ('emailAlerts','paused') and jsonb_typeof(e.value)<>'boolean') then raise exception 'Invalid saved search request'; end if;
 privacy_only:=_operation='delete' or (_operation='update' and not exists(select 1 from jsonb_each(_input) e where not((e.key='paused' and e.value='true'::jsonb) or (e.key='emailAlerts' and e.value='false'::jsonb))));
 if not privacy_only then
  if exists(select 1 from mobile_account_deletions where user_id=actor) then raise exception 'Account deletion pending'; end if;
  if not exists(select 1 from shopping_accounts where user_id=actor and terms_version='2026-11-12') then raise exception 'Accept current terms'; end if;
 end if;
 if _input?'search' then
  clean:=_input->'search';
  if jsonb_typeof(clean)<>'object' or exists(select 1 from jsonb_each(clean) e where jsonb_typeof(e.value) not in ('string','number','boolean','null')) then raise exception 'Invalid saved search filters'; end if;
  if coalesce(clean->>'category',clean->>'categorySlug',clean->>'section','') not in ('','all') and not exists(select 1 from categories where slug=coalesce(clean->>'category',clean->>'categorySlug',clean->>'section') and slug<>'firearms') then raise exception 'Saved search unavailable'; end if;
  if exists(select 1 from jsonb_each(clean) e where e.key like 'firearm%' and e.value not in ('null'::jsonb,'false'::jsonb,'""'::jsonb)) then raise exception 'Saved search unavailable'; end if;
  clean:=clean||'{"mobileCatalog":true}'::jsonb;
 end if;
 fingerprint:=sha256(convert_to(jsonb_build_array('saved_search',_operation,_target,_input)::text,'UTF8'));
 insert into mobile_message_receipts(user_id,request_id,input_hash) values(actor,_request,fingerprint) on conflict(user_id,request_id) do nothing;
 select * into receipt from mobile_message_receipts where user_id=actor and request_id=_request for update;
 if receipt.input_hash<>fingerprint then raise exception 'Saved search retry does not match original request'; end if;
 if receipt.result is not null then return receipt.result||jsonb_build_object('replayed',true); end if;

 if _operation='create' then
  if concat_ws(' ',_input->>'name',clean->>'q',clean->>'query',clean->>'keyword') ~* '\m(firearms?|ammunition|ammo|rifles?|pistols?|revolvers?|shotguns?|glock|ar[ -]?15|ak[ -]?47|bump[ -]?stocks?|automatic[ -]?conversion|explosives?|silencers?)\M' then raise exception 'Saved search unavailable'; end if;
  insert into saved_searches(user_id,name,search,email_alerts) values(actor,trim(_input->>'name'),clean,coalesce((_input->>'emailAlerts')::boolean,false)) returning * into current_search;
  target:=current_search.id;
 else
  select * into current_search from saved_searches where id=_target and user_id=actor for update;
  if not found and _operation<>'delete' then raise exception 'Saved search unavailable'; end if;
  target:=_target;
  if _operation='update' then
   clean:=coalesce(clean,current_search.search,'{}'::jsonb)||'{"mobileCatalog":true}'::jsonb;
   if not privacy_only and coalesce(clean->>'category',clean->>'categorySlug',clean->>'section','') not in ('','all') and not exists(select 1 from categories where slug=coalesce(clean->>'category',clean->>'categorySlug',clean->>'section') and slug<>'firearms') then raise exception 'Saved search unavailable'; end if;
  end if;

 if _operation<>'delete' and not privacy_only then
  if exists(select 1 from jsonb_each(coalesce(clean,'{}'::jsonb)) e where e.key like 'firearm%' and e.value not in ('null'::jsonb,'false'::jsonb,'""'::jsonb)) then raise exception 'Saved search unavailable'; end if;
  if concat_ws(' ',coalesce(_input->>'name',current_search.name),clean->>'q',clean->>'query',clean->>'keyword') ~* '\m(firearms?|ammunition|ammo|rifles?|pistols?|revolvers?|shotguns?|glock|ar[ -]?15|ak[ -]?47|bump[ -]?stocks?|automatic[ -]?conversion|explosives?|silencers?)\M' then raise exception 'Saved search unavailable'; end if;
 end if;
  if _operation='delete' then delete from saved_searches where id=_target and user_id=actor;
  else
   update saved_searches set name=case when _input?'name' then trim(_input->>'name') else name end,
    search=clean,
    email_alerts=case when _input?'emailAlerts' then (_input->>'emailAlerts')::boolean else email_alerts end,
    paused=case when _input?'paused' then (_input->>'paused')::boolean else paused end
   where id=_target and user_id=actor;
  end if;
 end if;
 -- Receipt outcomes contain identifiers only; deleted search text is not retained here.
 outcome:=jsonb_build_object('id',target,'ok',true);
 update mobile_message_receipts set result=outcome where user_id=actor and request_id=_request;
 return outcome||jsonb_build_object('replayed',false);
end $$;
revoke all on function public.mobile_commit_saved_search(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.mobile_commit_saved_search(uuid,text,uuid,jsonb) to authenticated;
create or replace function public.mobile_messaging_capabilities() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('attachments',to_regprocedure('public.mobile_commit_attachment(uuid,uuid,text,text,text,integer)') is not null,'posting',to_regprocedure('public.mobile_commit_listing(uuid,jsonb)') is not null,'savedSearches',true)
$$;
revoke all on function public.mobile_messaging_capabilities() from public,anon,authenticated;
grant execute on function public.mobile_messaging_capabilities() to service_role;
