create extension if not exists vector with schema extensions;

create table public.shopping_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 terms_version text, terms_accepted_at timestamptz,
 shopping_alerts boolean, suppressed_at timestamptz, alerts_version text, alerts_updated_at timestamptz,
 unsubscribe_token uuid not null default gen_random_uuid() unique,
 history_after timestamptz not null default '1970-01-01',
 updated_at timestamptz not null default now()
);
create table public.shopping_consents (
 id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade,
 subject text not null, purpose text not null check (purpose in ('terms','shopping_alerts','personalization','advertising')),
 allowed boolean not null, version text not null, recorded_at timestamptz not null default now()
);
create table public.shopping_events (
 id uuid primary key, subject text not null, user_id uuid references auth.users(id) on delete cascade,
 session_id uuid not null, kind text not null, listing_id text, search jsonb not null default '{}',
 context jsonb not null default '{}', occurred_at timestamptz not null default now(),
 check (jsonb_typeof(search) = 'object' and jsonb_typeof(context) = 'object')
);
create index shopping_events_subject_time on public.shopping_events(subject,occurred_at desc);
create index shopping_events_listing_time on public.shopping_events(listing_id,occurred_at desc);
create table public.shopping_inventory (
 listing_id text primary key, card jsonb not null, category text not null, price_cents bigint not null,
 previous_price_cents bigint, price_version uuid not null default gen_random_uuid(), price_changed_at timestamptz,
 content_hash text not null, first_seen_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(), valid_until timestamptz not null,
 check (price_cents >= 0)
);
create index shopping_inventory_valid on public.shopping_inventory(valid_until);
create table public.shopping_embeddings (
 listing_id text primary key references public.shopping_inventory(listing_id) on delete cascade,
 content_hash text not null, model_version text not null,
 embedding extensions.vector(768) not null, updated_at timestamptz not null default now()
);
create table public.shopping_favorites (
 subject text not null, listing_id text not null, saved_at timestamptz not null default now(),
 primary key(subject,listing_id)
);
create table public.shopping_queue (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 listing_id text not null, kind text not null check (kind in ('price_drop','match','reminder','alternative','offer')),
 event_key text not null, search_id uuid, requested boolean not null default false,
 payload jsonb not null default '{}', status text not null default 'pending'
   check (status in ('pending','processing','sent','suppressed','failed')),
 available_at timestamptz not null default now(), lease_until timestamptz,
 attempts integer not null default 0, notification_id uuid not null default gen_random_uuid(),
 delivery_id uuid, sent_at timestamptz, created_at timestamptz not null default now(),
 unique(user_id,listing_id,event_key)
);
create index shopping_queue_due on public.shopping_queue(status,available_at);
create table public.shopping_deliveries (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 queue_ids uuid[] not null, status text not null default 'pending', attempts integer not null default 0,
 lease_until timestamptz, sent_at timestamptz, clicked_at timestamptz, opened_at timestamptz,
 tracking_token uuid not null default gen_random_uuid() unique, created_at timestamptz not null default now()
);
create table public.shopping_controls (
 id boolean primary key default true check(id), tracking boolean not null default true,
 recommendations boolean not null default true, embeddings boolean not null default true, learning boolean not null default true, notifications boolean not null default false,
 advertising boolean not null default false, catalog_ready_at timestamptz, lease_until timestamptz, model_version text not null default 'rules-v1',
 model jsonb not null default '{}', updated_at timestamptz not null default now()
);
insert into public.shopping_controls(id) values(true);
create index shopping_consents_subject_time on public.shopping_consents(subject,recorded_at desc);

create function public.register_shopping_signup() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.raw_user_meta_data->>'shopping_terms_version' = '2026-11-12' then
  insert into shopping_accounts(user_id,terms_version,terms_accepted_at,shopping_alerts,alerts_version,alerts_updated_at)
  values(new.id,'2026-11-12',now(),coalesce(new.raw_user_meta_data->>'shopping_alerts' = 'true',false),'2026-11-12',now());
  insert into shopping_consents(user_id,subject,purpose,allowed,version) values
   (new.id,'u:'||new.id::text,'terms',true,'2026-11-12'),
   (new.id,'u:'||new.id::text,'shopping_alerts',coalesce(new.raw_user_meta_data->>'shopping_alerts' = 'true',false),'2026-11-12');
 end if;
 return new;
end $$;
revoke all on function public.register_shopping_signup() from public,anon,authenticated;
create trigger register_shopping_signup after insert on auth.users for each row execute function public.register_shopping_signup();
create table public.shopping_experiments (
 subject text primary key, holdout boolean not null, assigned_at timestamptz not null default now()
);
create table public.shopping_ad_outbox (
 id uuid not null, user_id uuid references auth.users(id) on delete cascade, subject text not null,
 provider text not null check(provider in ('meta','google')), name text not null, payload jsonb not null,
 status text not null default 'pending', attempts integer not null default 0,
 created_at timestamptz not null default now(), primary key(id,provider)
);

create table public.shopping_privacy (
 subject text primary key, personalization boolean not null default false,
 advertising boolean not null default false, history_after timestamptz not null default '1970-01-01',
 updated_at timestamptz not null default now()
);
create table public.shopping_model_evaluations (
 week date primary key, baseline jsonb not null, challenger jsonb not null,
 outcomes integer not null, promoted boolean not null default false, created_at timestamptz not null default now()
);
-- Server-only access. Clients can neither impersonate another shopper nor grant
-- themselves a verified purchase label, queue delivery or edit an embedding.
do $$ declare t text; begin
 foreach t in array array['shopping_accounts','shopping_consents','shopping_events','shopping_inventory','shopping_embeddings','shopping_favorites','shopping_queue','shopping_deliveries','shopping_controls','shopping_experiments','shopping_ad_outbox','shopping_privacy','shopping_model_evaluations'] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('revoke all on public.%I from public, anon, authenticated', t);
  execute format('grant all on public.%I to service_role', t);
 end loop;
end $$;

-- One lease per recipient, not per event: related queued candidates are grouped
-- into a durable delivery whose id is also the email provider idempotency key.
create function public.claim_shopping_delivery() returns setof public.shopping_deliveries
language plpgsql security definer set search_path = public, pg_temp as $$
declare recipient uuid; ids uuid[]; delivery public.shopping_deliveries;
begin
 select * into delivery from shopping_deliveries
 where status in ('pending','processing') and attempts < 6 and
 (lease_until is null or lease_until < now()) order by created_at limit 1 for update skip locked;
 if found then
  update shopping_deliveries set status='processing', attempts=attempts+1,
    lease_until=now()+interval '5 minutes' where id=delivery.id returning * into delivery;
  return next delivery; return;
 end if;
 select q.user_id into recipient from shopping_queue q
 where q.status='pending' and q.available_at<=now()
 and not exists(select 1 from shopping_deliveries d where d.user_id=q.user_id and (d.status in ('pending','processing') or d.created_at>=date_bin(interval '15 minutes',now(),'2000-01-01'::timestamptz)))
 order by q.created_at limit 1 for update skip locked;
 if recipient is null then return; end if;
 -- Serializes two workers which selected different queue rows for one user.
 if not pg_try_advisory_xact_lock(hashtextextended(recipient::text, 0)) then return; end if;
 if exists(select 1 from shopping_deliveries where user_id=recipient and status in ('pending','processing')) then return; end if;
 select array_agg(id) into ids from (select id from shopping_queue
 where user_id=recipient and status='pending' and available_at<=now() order by created_at limit 500 for update skip locked) candidates;
 insert into shopping_deliveries(user_id,queue_ids,status,attempts,lease_until)
 values(recipient,ids,'processing',1,now()+interval '5 minutes') returning * into delivery;
 update shopping_queue set status='processing',delivery_id=delivery.id where id=any(ids);
 return next delivery;
end $$;
revoke all on function public.claim_shopping_delivery() from public,anon,authenticated;
grant execute on function public.claim_shopping_delivery() to service_role;

create function public.clear_shopping_history(subject_key text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 delete from shopping_events where subject=subject_key;
 if subject_key like 'u:%' then
  update analytics_events set user_id=null,session_id=null,props=props-'traffic_visit' where user_id=substring(subject_key from 3)::uuid
  and name in ('listing_viewed','search_performed','search_completed','page_view','filter_applied','seller_contacted','business_action','inquiry_completed');
 end if;
 delete from shopping_favorites where subject=subject_key;
 update shopping_privacy set history_after=now() where subject=subject_key;
 if subject_key like 'u:%' then
  update shopping_accounts set history_after=now() where user_id=substring(subject_key from 3)::uuid;
  update shopping_queue set status='suppressed' where user_id=substring(subject_key from 3)::uuid and status in ('pending','processing');
 end if;
end $$;
revoke all on function public.clear_shopping_history(text) from public,anon,authenticated;
grant execute on function public.clear_shopping_history(text) to service_role;

create function public.retain_shopping_data() returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 delete from shopping_email_receipts where created_at < now()-interval '180 days';
 delete from shopping_events where occurred_at < now()-interval '90 days';
 -- Keep business totals while retiring old linked browsing identifiers in bounded batches.
 with expired as(select id from analytics_events where created_at<now()-interval '90 days' and
   name in ('listing_viewed','search_performed','search_completed','page_view','filter_applied','seller_contacted','business_action','inquiry_completed')
   and (user_id is not null or session_id is not null or props ? 'traffic_visit') order by created_at limit 1000 for update skip locked)
 update analytics_events a set user_id=null,session_id=null,props=props-'traffic_visit' from expired e where a.id=e.id;
 delete from shopping_consents where user_id is null and recorded_at < now()-interval '90 days';
 delete from shopping_favorites f where f.subject like 'g:%' and f.saved_at < now()-interval '90 days';
 delete from shopping_inventory where valid_until < now()-interval '30 days';
 delete from shopping_privacy where subject like 'g:%' and updated_at < now()-interval '90 days';
 delete from shopping_queue where status in ('sent','suppressed','failed') and created_at < now()-interval '180 days';
 delete from shopping_deliveries where status in ('sent','suppressed','failed') and created_at < now()-interval '180 days';
 delete from shopping_ad_outbox where created_at < now()-interval '30 days';
end $$;
revoke all on function public.retain_shopping_data() from public,anon,authenticated;
grant execute on function public.retain_shopping_data() to service_role;

-- Consent and suppression are one transaction. Audit records cannot be changed by clients.
create function public.set_shopping_privacy(subject_key text, member_id uuid, personalize boolean, advertise boolean, policy text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into shopping_privacy(subject,personalization,advertising) values(subject_key,personalize,advertise)
 on conflict(subject) do update set personalization=excluded.personalization,advertising=excluded.advertising,updated_at=now();
 insert into shopping_consents(subject,user_id,purpose,allowed,version) values
 (subject_key,member_id,'personalization',personalize,policy),(subject_key,member_id,'advertising',advertise,policy);
 if not personalize then perform clear_shopping_history(subject_key); end if;
 if not advertise then update shopping_ad_outbox set status='suppressed' where subject=subject_key and status='pending'; end if;
end $$;
revoke all on function public.set_shopping_privacy(text,uuid,boolean,boolean,text) from public,anon,authenticated;
grant execute on function public.set_shopping_privacy(text,uuid,boolean,boolean,text) to service_role;

create function public.set_shopping_account(member_id uuid, accept_terms boolean, alerts boolean, policy text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into shopping_accounts(user_id) values(member_id) on conflict do nothing;
 if accept_terms then
  update shopping_accounts set terms_version=policy,terms_accepted_at=now(),updated_at=now() where user_id=member_id;
  insert into shopping_consents(user_id,subject,purpose,allowed,version) values(member_id,'u:'||member_id::text,'terms',true,policy);
 end if;
 if alerts is not null then
  update shopping_accounts set shopping_alerts=alerts,alerts_version=policy,alerts_updated_at=now(),updated_at=now() where user_id=member_id;
  insert into shopping_consents(user_id,subject,purpose,allowed,version) values(member_id,'u:'||member_id::text,'shopping_alerts',alerts,policy);
  if alerts then update shopping_accounts set suppressed_at=null where user_id=member_id;
  elsif not accept_terms then update shopping_accounts set suppressed_at=now() where user_id=member_id; end if;
  if not alerts then update shopping_queue set status='suppressed' where user_id=member_id and status in ('pending','processing') and (not accept_terms or not requested); end if;
 end if;
end $$;
revoke all on function public.set_shopping_account(uuid,boolean,boolean,text) from public,anon,authenticated;
grant execute on function public.set_shopping_account(uuid,boolean,boolean,text) to service_role;

-- Current public listing content is the only material exported to the embedding runner.
create function public.shopping_embedding_candidates(batch_size integer default 96) returns table(listing_id text,content_hash text,card jsonb)
language sql security definer set search_path=public,pg_temp as $$
 select i.listing_id,i.content_hash,i.card from shopping_inventory i left join shopping_embeddings e using(listing_id)
 where i.valid_until>now() and (e.listing_id is null or e.content_hash<>i.content_hash or e.model_version<>'siglip2-base-patch16-224-v1')
 order by i.last_seen_at desc,i.listing_id limit least(greatest(batch_size,1),256)
$$;
revoke all on function public.shopping_embedding_candidates(integer) from public,anon,authenticated;
grant execute on function public.shopping_embedding_candidates(integer) to service_role;

-- Source-verified outcomes only; no message body, addresses, payment credentials or identity documents.
create function public.record_shopping_outcome() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare member uuid; item text; event_kind text; event_id uuid:=new.id; happened timestamptz:=now(); amount numeric; currency_code text;
begin
 if tg_table_name='listing_inquiries' then member=new.buyer_id; item=new.listing_id::text; event_kind='inquiry';
 elsif tg_table_name='conversations' then member=new.buyer_id; item=coalesce(new.listing_id::text,case when new.dealer_inventory_record_id is not null then 'dealerfeed-'||new.dealer_inventory_record_id::text end); event_kind='inquiry';
 elsif tg_table_name='orders' then
  if new.is_demo or new.stripe_payment_status is distinct from 'succeeded' or new.stripe_captured_at is null or new.ask_id is null then return new; end if;
  member=new.buyer_id;item=new.ask_id::text;event_kind='purchase';happened=new.stripe_captured_at;amount=new.merchandise_cents/100.0;currency_code=new.currency;
 elsif tg_table_name='verified_sales' then
  if not new.is_live then return new; end if;
  select o.buyer_id,o.ask_id::text,o.id,o.merchandise_cents/100.0,o.currency into member,item,event_id,amount,currency_code from orders o where o.id=new.order_id and not o.is_demo;
  event_kind='purchase';happened=new.sold_at;
 end if;
 if item is not null and exists(select 1 from shopping_privacy where subject='u:'||member::text and personalization)
 and exists(select 1 from shopping_controls where tracking) then
  insert into shopping_events(id,subject,user_id,session_id,kind,listing_id,context,occurred_at)
  values(event_id,'u:'||member::text,member,event_id,event_kind,item,jsonb_strip_nulls(jsonb_build_object('source','verified_'||tg_table_name,'value',amount,'currency',currency_code)),happened) on conflict(id) do nothing;
 end if;
 return new;
end $$;
revoke all on function public.record_shopping_outcome() from public,anon,authenticated;
create trigger shopping_accepted_inquiry after insert on public.listing_inquiries for each row execute function public.record_shopping_outcome();
create trigger shopping_conversation after insert on public.conversations for each row execute function public.record_shopping_outcome();
create trigger shopping_verified_sale after insert on public.verified_sales for each row execute function public.record_shopping_outcome();
create trigger shopping_verified_purchase after insert or update of stripe_payment_status,stripe_captured_at on public.orders for each row execute function public.record_shopping_outcome();

-- Existing saves stay in their original systems. This read does not copy private profiles or messages.
create function public.shopping_saved_interests(member_id uuid) returns table(listing_id text,saved_at timestamptz)
language sql security definer set search_path=public,pg_temp as $$
 select listing_id,created_at from saved_partner_vehicles where user_id=member_id
 union all select listing_id,created_at from saved_partner_homes where user_id=member_id
 union all select listing_id,created_at from saved_partner_jobs where user_id=member_id
 union all select a.id::text,w.created_at from watchlist w join asks a on a.variant_id=w.variant_id where w.user_id=member_id
$$;
revoke all on function public.shopping_saved_interests(uuid) from public,anon,authenticated;
grant execute on function public.shopping_saved_interests(uuid) to service_role;

-- Candidate retrieval stays in Postgres: never transfer the whole vector table on a page view.
create index shopping_vectors_cosine on public.shopping_embeddings using hnsw (embedding extensions.vector_cosine_ops);
create function public.shopping_visual_candidates(seed_ids text[]) returns table(seed_id text,listing_id text,similarity double precision,card jsonb)
language sql security definer set search_path=public,extensions,pg_temp as $$
 select seed.listing_id,c.listing_id,c.similarity,c.card from shopping_embeddings seed
 join shopping_inventory source on source.listing_id=seed.listing_id and source.content_hash=seed.content_hash
 cross join lateral (
  select i.listing_id,(1-(e.embedding <=> seed.embedding))::double precision similarity,i.card
  from shopping_embeddings e join shopping_inventory i using(listing_id)
  where i.category=source.category and coalesce(i.card->'home'->>'mode','shop')=coalesce(source.card->'home'->>'mode','shop') and i.valid_until>now() and i.content_hash=e.content_hash and e.model_version=seed.model_version
  and (i.listing_id !~ '^[0-9a-f-]{36}$' or exists(select 1 from asks a join products p on p.id=a.product_id where a.id::text=i.listing_id and a.status='active' and not a.is_demo and a.approved_at is not null and a.expires_at>now() and p.status='published'))
  order by e.embedding <=> seed.embedding limit 40
 ) c where seed.listing_id=any(seed_ids) and seed.model_version='siglip2-base-patch16-224-v1'
$$;
revoke all on function public.shopping_visual_candidates(text[]) from public,anon,authenticated;
grant execute on function public.shopping_visual_candidates(text[]) to service_role;

create function public.shopping_training_rows() returns table(subject text,session text,listing text,context jsonb,contact boolean)
language sql security definer set search_path=public,pg_temp as $$
 select e.subject,e.session_id::text,e.listing_id,e.context,exists(
  select 1 from shopping_events c where c.subject=e.subject and c.listing_id=e.listing_id
  and c.kind in ('inquiry','purchase') and c.occurred_at>=e.occurred_at and c.occurred_at<e.occurred_at+interval '7 days'
 ) from shopping_events e where e.kind='impression' and e.context->>'source'='recommendation'
 and e.occurred_at>=now()-interval '30 days' and e.occurred_at<now()-interval '7 days'
 order by e.occurred_at desc limit 10000
$$;
revoke all on function public.shopping_training_rows() from public,anon,authenticated;
grant execute on function public.shopping_training_rows() to service_role;

alter table public.shopping_accounts add column delivery_blocked boolean not null default false;
alter table public.shopping_deliveries add column provider_id text, add column provider_status text, add column email_sent boolean not null default false;
create index shopping_delivery_provider on public.shopping_deliveries(provider_id) where provider_id is not null;
create table public.shopping_email_receipts(id text primary key,kind text not null,created_at timestamptz not null default now());
alter table public.shopping_email_receipts enable row level security;
revoke all on public.shopping_email_receipts from public,anon,authenticated;
grant all on public.shopping_email_receipts to service_role;

create function public.shopping_report() returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select jsonb_build_object(
 'cohorts',(select coalesce(jsonb_agg(t),'[]') from (
  select x.holdout,count(distinct e.subject) shoppers,count(*) filter(where e.kind='view') views,
   count(distinct e.subject) filter(where e.kind in ('contact','inquiry')) contact_shoppers,
   count(*) filter(where e.kind='inquiry') accepted_inquiries,
   count(*) filter(where e.kind='purchase') verified_purchases,
   count(distinct e.subject) filter(where e.subject in(select subject from shopping_events where kind='notification_click' and occurred_at>now()-interval '30 days')) returning_from_email
  from shopping_events e join shopping_experiments x using(subject) where e.occurred_at>now()-interval '30 days' group by x.holdout
 ) t),
 'deliveries',(select jsonb_build_object('sent',count(*) filter(where email_sent),'clicked',count(*) filter(where clicked_at is not null),'opened_approximate',count(*) filter(where opened_at is not null),'failed',count(*) filter(where status='failed'),'complaints',count(*) filter(where provider_status='email.complained'),'bounced',count(*) filter(where provider_status='email.bounced')) from shopping_deliveries where created_at>now()-interval '30 days'),
 'unsubscribes',(select count(*) from shopping_consents where purpose='shopping_alerts' and not allowed and recorded_at>now()-interval '30 days'),
 'catalog',(select count(*) from shopping_inventory where valid_until>now()),
 'vectors',(select count(*) from shopping_embeddings e join shopping_inventory i using(listing_id) where e.content_hash=i.content_hash and i.valid_until>now()),
 'activity_bytes',pg_total_relation_size('shopping_events'), 'vector_bytes',pg_total_relation_size('shopping_embeddings'),
 'queue',(select coalesce(jsonb_object_agg(status,n),'{}') from(select status,count(*) n from shopping_queue group by status)t)
 )
$$;
revoke all on function public.shopping_report() from public,anon,authenticated;
grant execute on function public.shopping_report() to service_role;


-- Serialize event writes with withdrawal/clear-history so an in-flight browser
-- batch cannot restore cleared history after consent has been revoked.
create function public.guard_shopping_event() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare permission shopping_privacy;
begin
 select * into permission from shopping_privacy where subject=new.subject for share;
 if not found or not permission.personalization or new.occurred_at<permission.history_after
 or new.occurred_at<now()-interval '90 days' then return null; end if;
 return new;
end $$;
revoke all on function public.guard_shopping_event() from public,anon,authenticated;
create trigger guard_shopping_event before insert on public.shopping_events for each row execute function public.guard_shopping_event();


create function public.guard_shopping_notification() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare allowed boolean; suppressed timestamptz; explicitly_requested boolean;
begin
 if new.kind<>'shopping_alert' then return new; end if;
 select shopping_alerts,suppressed_at into allowed,suppressed from shopping_accounts where user_id=new.user_id for share;
 select q.requested and exists(select 1 from saved_searches s where s.user_id=new.user_id and not s.paused and (suppressed is null or s.created_at>suppressed) and s.id::text in(select jsonb_array_elements_text(q.payload->'search_ids'))) into explicitly_requested from shopping_queue q where q.id=new.entity_id and q.user_id=new.user_id;
 if (allowed is false and not coalesce(explicitly_requested,false)) or not exists(select 1 from shopping_controls where notifications) then return null; end if;
 return new;
end $$;
revoke all on function public.guard_shopping_notification() from public,anon,authenticated;
create trigger guard_shopping_notification before insert on public.notifications for each row execute function public.guard_shopping_notification();


create function public.guard_shopping_optional_write() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare permission shopping_privacy;
begin
 select * into permission from shopping_privacy where subject=new.subject for share;
 if not found then return null; end if;
 if tg_table_name='shopping_favorites' then
  if not permission.personalization or new.saved_at<permission.history_after then return null; end if;
 elsif not permission.advertising or new.created_at<permission.updated_at then return null;
 end if;
 return new;
end $$;
revoke all on function public.guard_shopping_optional_write() from public,anon,authenticated;
create trigger guard_shopping_favorite before insert or update on public.shopping_favorites for each row execute function public.guard_shopping_optional_write();
create trigger guard_shopping_ad before insert on public.shopping_ad_outbox for each row execute function public.guard_shopping_optional_write();
