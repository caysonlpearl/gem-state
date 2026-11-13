-- Apply after 20261113010000_shopper_personalization.sql. Native apps share the
-- website's terms/alert records; no second recommendation/consent database.
alter table public.shopping_consents add column if not exists source text not null default 'web';
create table public.mobile_controls (
 id boolean primary key default true check(id), push_enabled boolean not null default false,
 advertising_enabled boolean not null default false, updated_at timestamptz not null default now()
);
insert into public.mobile_controls(id) values(true);
create table public.mobile_push_devices (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 platform text not null check(platform in ('ios','android')), token text not null unique check(length(token) between 16 and 4096),
 updated_at timestamptz not null default now()
);
create table public.mobile_push_outbox (
 id uuid primary key default gen_random_uuid(), notification_id uuid not null references public.notifications(id) on delete cascade,
 device_id uuid not null references public.mobile_push_devices(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','processing','sent','suppressed','failed')),
 attempts integer not null default 0, available_at timestamptz not null default now(),
 lease_id uuid, lease_until timestamptz, sent_at timestamptz, created_at timestamptz not null default now(),
 unique(notification_id,device_id)
);
create index mobile_push_due on public.mobile_push_outbox(status,available_at);
create table public.mobile_account_deletions (
 user_id uuid primary key references auth.users(id) on delete cascade,
 status text not null default 'requested' check(status in ('requested','processing','completed','failed')),
 requested_at timestamptz not null default now(), completed_at timestamptz, error_code text
);
create table public.mobile_ad_consents (
 user_id uuid not null references auth.users(id) on delete cascade,
 advertising boolean not null default false,
 att text not null default 'not_determined' check(att in ('authorized','denied','restricted','not_determined','not_applicable')),
 platform text not null check(platform in ('ios','android')), policy_version text not null default '2026-11-12', updated_at timestamptz not null default now(), primary key(user_id,platform)
);
do $$ declare t text; begin
 foreach t in array array['mobile_controls','mobile_push_devices','mobile_push_outbox','mobile_account_deletions','mobile_ad_consents'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

create function public.mobile_accept_terms(_user uuid, _version text, _shopping_alerts boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare onboarding boolean;
begin
 select not exists(select 1 from shopping_accounts where user_id=_user and terms_version=_version) into onboarding;
 if _version <> '2026-11-12' then raise exception 'Current terms are required'; end if;
 insert into public.shopping_accounts(user_id,terms_version,terms_accepted_at,shopping_alerts,alerts_version,alerts_updated_at)
 values(_user,_version,now(),_shopping_alerts,_version,now())
 on conflict(user_id) do update set terms_version=excluded.terms_version,terms_accepted_at=coalesce(shopping_accounts.terms_accepted_at,now()),
 shopping_alerts=excluded.shopping_alerts,alerts_version=excluded.alerts_version,alerts_updated_at=now(),updated_at=now();
 if _shopping_alerts then update shopping_accounts set suppressed_at=null where user_id=_user;
 elsif not onboarding then update shopping_accounts set suppressed_at=now() where user_id=_user; end if;
 insert into public.shopping_consents(user_id,subject,purpose,allowed,version,source)
 values(_user,'u:'||_user::text,'terms',true,_version,'mobile'),(_user,'u:'||_user::text,'shopping_alerts',_shopping_alerts,_version,'mobile');
 if not _shopping_alerts then
  update public.shopping_queue set status='suppressed',lease_until=null where user_id=_user and status in ('pending','processing') and (not onboarding or not requested);
  update public.mobile_push_outbox p set status='suppressed',lease_until=null from public.notifications n
   where p.notification_id=n.id and p.user_id=_user and n.kind<>'message' and p.status in ('pending','processing');
 end if;
end $$;
create function public.mobile_register_device(_user uuid,_token text,_platform text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare previous public.mobile_push_devices; begin
 if _platform not in ('ios','android') or length(_token) not between 16 and 4096 then raise exception 'Invalid device'; end if;
 insert into public.mobile_push_devices(user_id,token,platform) values(_user,_token,_platform) on conflict(token) do nothing;
 select * into previous from public.mobile_push_devices where token=_token for update;
 if found and previous.user_id<>_user then
  delete from public.mobile_push_outbox where device_id=previous.id;
 end if;
 insert into public.mobile_push_devices(user_id,token,platform) values(_user,_token,_platform)
 on conflict(token) do update set user_id=excluded.user_id,platform=excluded.platform,updated_at=now();
end $$;
create function public.mobile_enqueue_notification() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.kind not in ('message','shopping_alert') then return new; end if;
 insert into public.mobile_push_outbox(notification_id,device_id,user_id)
 select new.id,d.id,new.user_id from public.mobile_push_devices d where d.user_id=new.user_id
 on conflict(notification_id,device_id) do nothing;
 return new;
end $$;
create trigger mobile_notification_created after insert on public.notifications
for each row execute function public.mobile_enqueue_notification();
create function public.claim_mobile_push_delivery() returns setof public.mobile_push_outbox
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.mobile_controls where id and push_enabled) then return; end if;
 update public.mobile_push_outbox set status='failed',lease_until=null where attempts>=8 and status='processing' and lease_until<now();
 return query with candidate as (
  select id from public.mobile_push_outbox where attempts<8 and available_at<=now()
  and (status='pending' or (status='processing' and lease_until<now()))
  order by available_at,id for update skip locked limit 1
 ) update public.mobile_push_outbox p set status='processing',attempts=p.attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes'
 from candidate where p.id=candidate.id returning p.*;
end $$;
revoke all on function public.mobile_accept_terms(uuid,text,boolean),public.mobile_register_device(uuid,text,text),public.mobile_enqueue_notification(),public.claim_mobile_push_delivery() from public,anon,authenticated;
grant execute on function public.mobile_accept_terms(uuid,text,boolean),public.mobile_register_device(uuid,text,text),public.claim_mobile_push_delivery() to service_role;

-- A request immediately withdraws delivery/tracking privileges, even while
-- verified deletion of retained records and media is still pending.
create function public.mobile_request_deletion(_user uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into mobile_account_deletions(user_id) values(_user) on conflict(user_id) do nothing;
 update shopping_accounts set shopping_alerts=false,suppressed_at=now(),alerts_updated_at=now() where user_id=_user;
 update mobile_ad_consents set advertising=false,updated_at=now() where user_id=_user;
 update shopping_queue set status='suppressed',lease_until=null where user_id=_user and status in ('pending','processing');
 delete from mobile_push_devices where user_id=_user;
end $$;
revoke all on function public.mobile_request_deletion(uuid) from public,anon,authenticated;
grant execute on function public.mobile_request_deletion(uuid) to service_role;
