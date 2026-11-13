-- First-party learning is shared across web/apps. Native advertising permission
-- is separate and must never mutate the website's advertising consent.
create function public.mobile_set_personalization(_subject text,_user uuid,_allowed boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if (_user is not null and _subject <> 'u:'||_user::text) or (_user is null and _subject !~ '^g:[0-9a-f-]{36}$') then raise exception 'Invalid actor'; end if;
 insert into shopping_privacy(subject,personalization) values(_subject,_allowed)
 on conflict(subject) do update set personalization=excluded.personalization,updated_at=now();
 insert into shopping_consents(subject,user_id,purpose,allowed,version,source)
 values(_subject,_user,'personalization',_allowed,'2026-11-12','mobile');
 if not _allowed then perform public.mobile_clear_shopping_history(_subject,_user); end if;
end $$;
create function public.mobile_clear_shopping_history(_subject text,_user uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if (_user is not null and _subject <> 'u:'||_user::text) or (_user is null and _subject !~ '^g:[0-9a-f-]{36}$') then raise exception 'Invalid actor'; end if;
 perform public.clear_shopping_history(_subject);
 if _user is not null then
  update mobile_push_outbox p set status='suppressed',lease_until=null from notifications n
  where p.notification_id=n.id and p.user_id=_user and n.kind<>'message' and p.status in ('pending','processing');
 end if;
end $$;
revoke all on function public.mobile_set_personalization(text,uuid,boolean),public.mobile_clear_shopping_history(text,uuid) from public,anon,authenticated;
grant execute on function public.mobile_set_personalization(text,uuid,boolean),public.mobile_clear_shopping_history(text,uuid) to service_role;
