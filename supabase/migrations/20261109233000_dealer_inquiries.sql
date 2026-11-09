begin;
create table public.dealer_inquiries (
 id uuid primary key default gen_random_uuid(), request_key uuid not null unique,
 fingerprint text not null, abuse_key text not null, created_at timestamptz not null default now(),
 dealership_name text not null check (length(dealership_name) between 1 and 160),
 website text not null check (length(website) <= 300), name text not null check (length(name) between 1 and 120),
 email text not null check (length(email) <= 255), phone text not null default '',
 provider text not null default '', inventory_count text not null default '', notes text not null default '' check (length(notes) <= 2000),
 attribution jsonb not null default '{}', status text not null default 'new' check(status in ('new','contacted','closed')),
 notification_status text not null default 'pending' check(notification_status in ('pending','sending','sent','failed')),
 notification_attempts int not null default 0, notification_next_at timestamptz not null default now(),
 notification_token uuid, notification_sent_at timestamptz
);
create index dealer_inquiries_retry on public.dealer_inquiries(notification_next_at) where notification_status in ('pending','sending');
create index dealer_inquiries_abuse on public.dealer_inquiries(abuse_key, created_at);
alter table public.dealer_inquiries enable row level security;
revoke all on public.dealer_inquiries from anon, authenticated;
grant select on public.dealer_inquiries to authenticated;
grant update(status) on public.dealer_inquiries to authenticated;
create policy "Administrators read dealership inquiries" on public.dealer_inquiries for select to authenticated using(public.has_role(auth.uid(), 'admin'));
create policy "Administrators manage inquiry status" on public.dealer_inquiries for update to authenticated using(public.has_role(auth.uid(), 'admin')) with check(public.has_role(auth.uid(), 'admin'));
grant all on public.dealer_inquiries to service_role;

create function public.accept_dealer_inquiry(_key uuid, _fingerprint text, _abuse_key text, _payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare existing public.dealer_inquiries; new_id uuid;
begin
 -- A single, short transaction serializes duplicate and rate-limit decisions.
 perform pg_advisory_xact_lock(hashtextextended('bluebird-dealer-intake',0));
 select * into existing from public.dealer_inquiries where request_key=_key;
 if found then
   if existing.fingerprint <> _fingerprint then raise exception 'Request changed; reload and try again'; end if;
   return jsonb_build_object('id',existing.id,'created',false);
 end if;
 if (select count(*) from public.dealer_inquiries where abuse_key=_abuse_key and created_at>now()-interval '1 hour')>=5
 or (select count(*) from public.dealer_inquiries where lower(email)=lower(_payload->>'email') and created_at>now()-interval '1 day')>=3
 or (select count(*) from public.dealer_inquiries where created_at>now()-interval '1 hour')>=100 then
   raise exception 'Please wait before submitting another request';
 end if;
 insert into public.dealer_inquiries(request_key,fingerprint,abuse_key,dealership_name,website,name,email,phone,provider,inventory_count,notes,attribution)
 values(_key,_fingerprint,_abuse_key,_payload->>'dealershipName',_payload->>'website',_payload->>'name',_payload->>'email',coalesce(_payload->>'phone',''),coalesce(_payload->>'provider',''),coalesce(_payload->>'inventoryCount',''),coalesce(_payload->>'notes',''),coalesce(_payload->'attribution','{}')) returning id into new_id;
 return jsonb_build_object('id',new_id,'created',true);
end $$;
revoke all on function public.accept_dealer_inquiry(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.accept_dealer_inquiry(uuid,text,text,jsonb) to service_role;

create function public.claim_dealer_inquiry_notifications(_id uuid default null)
returns setof public.dealer_inquiries language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.dealer_inquiries set notification_status='failed' where notification_status='sending' and notification_attempts>=8 and notification_next_at<=now();
 return query with due as (
 select id from public.dealer_inquiries where notification_status in ('pending','sending')
 and notification_next_at<=now() and notification_attempts<8 and (_id is null or id=_id)
 order by created_at for update skip locked limit 10
 )
 update public.dealer_inquiries l set notification_status='sending',notification_attempts=l.notification_attempts+1,
 notification_next_at=now()+interval '10 minutes',notification_token=gen_random_uuid()
 from due where l.id=due.id returning l.*;
end $$;
revoke all on function public.claim_dealer_inquiry_notifications(uuid) from public,anon,authenticated;
grant execute on function public.claim_dealer_inquiry_notifications(uuid) to service_role;
commit;
