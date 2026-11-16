-- Ten situational templates reuse the existing private queue, consent, outbox,
-- and provider idempotency contract. This never opts a member into marketing.
alter table public.shopping_controls add column marketing_started_at timestamptz not null default now();
alter table public.shopping_accounts add column marketing_preferences jsonb not null default '{}'
  check (jsonb_typeof(marketing_preferences) = 'object');

create function public.set_shopping_marketing_preferences(member_id uuid, preferences jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if jsonb_typeof(preferences) <> 'object' or exists(
   select 1 from jsonb_each(preferences) p
   where p.key not in ('dailySearches','prices','searches','followups','discovery') or jsonb_typeof(p.value)<>'boolean'
 ) then raise exception 'Invalid email preferences'; end if;
 insert into shopping_accounts(user_id,marketing_preferences) values(member_id,preferences)
 on conflict(user_id) do update set marketing_preferences=excluded.marketing_preferences,updated_at=now();
end $$;
revoke all on function public.set_shopping_marketing_preferences(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.set_shopping_marketing_preferences(uuid,jsonb) to service_role;

create function public.shopping_marketing_priority(kind text, payload jsonb) returns integer
language sql immutable set search_path=public,pg_temp as $$
 select case when kind='price_drop' then 100 when kind='match' then 90
 when payload->>'campaign'='similar_new' then 70 when payload->>'campaign'='local_finds' then 60
 when payload->>'campaign'='category_finds' then 55 when payload->>'campaign'='saved_reminder' then 50
 when payload->>'campaign'='viewed_reminder' then 40 when payload->>'campaign'='weekly_picks' then 35
 when payload->>'campaign'='welcome' then 30 when payload->>'campaign'='comeback' then 25 else 10 end
$$;
revoke all on function public.shopping_marketing_priority(text,jsonb) from public,anon,authenticated;
grant execute on function public.shopping_marketing_priority(text,jsonb) to service_role;

create or replace function public.claim_shopping_delivery() returns setof public.shopping_deliveries
language plpgsql security definer set search_path=public,pg_temp as $$
declare recipient uuid; ids uuid[]; delivery public.shopping_deliveries; campaign text; daily_search boolean;
begin
 -- A retry is the same reserved send, with the same provider idempotency key.
 select * into delivery from shopping_deliveries
 where status in ('pending','processing') and attempts<6 and (lease_until is null or lease_until<now())
 order by created_at limit 1 for update skip locked;
 if found then
  update shopping_deliveries set status='processing',attempts=attempts+1,lease_until=now()+interval '5 minutes'
  where id=delivery.id returning * into delivery;
  return next delivery; return;
 end if;
 select q.user_id into recipient from shopping_queue q join shopping_accounts a on a.user_id=q.user_id
 where q.status='pending' and q.available_at<=now()
 and (not(q.payload ? 'expires_at') or (q.payload->>'expires_at')::timestamptz>now())
 and not exists(select 1 from shopping_deliveries d where d.user_id=q.user_id and
   (d.status in ('pending','processing') or (d.email_sent and coalesce(d.sent_at,d.created_at)>now()-interval '24 hours')))
 and (select count(*) from shopping_deliveries d where d.user_id=q.user_id and d.email_sent and coalesce(d.sent_at,d.created_at)>now()-interval '7 days')
   < case when q.kind='match' and a.marketing_preferences->>'dailySearches'='true' then 7 else 3 end
 order by shopping_marketing_priority(q.kind,q.payload) desc,q.created_at limit 1 for update of q skip locked;
 if recipient is null then return; end if;
 if not pg_try_advisory_xact_lock(hashtextextended(recipient::text,0)) then return; end if;
 -- Recheck after serialization: concurrent workers may select different rows.
 if exists(select 1 from shopping_deliveries where user_id=recipient and
   (status in ('pending','processing') or (email_sent and coalesce(sent_at,created_at)>now()-interval '24 hours'))) then return; end if;
 select coalesce(payload->>'campaign',kind) into campaign from shopping_queue
 where user_id=recipient and status='pending' and available_at<=now()
 and (not(payload ? 'expires_at') or (payload->>'expires_at')::timestamptz>now())
 order by shopping_marketing_priority(kind,payload) desc,created_at limit 1;
 select marketing_preferences->>'dailySearches'='true' into daily_search from shopping_accounts where user_id=recipient;
 if (select count(*) from shopping_deliveries where user_id=recipient and email_sent and coalesce(sent_at,created_at)>now()-interval '7 days')
   >= (case when campaign in ('match','search_match') and daily_search then 7 else 3 end) then return; end if;
 select array_agg(id) into ids from (select id from shopping_queue where user_id=recipient and status='pending'
   and available_at<=now() and coalesce(payload->>'campaign',kind)=campaign
   and (not(payload ? 'expires_at') or (payload->>'expires_at')::timestamptz>now())
   order by created_at limit 6 for update skip locked) candidates;
 if ids is null then return; end if;
 insert into shopping_deliveries(user_id,queue_ids,status,attempts,lease_until)
 values(recipient,ids,'processing',1,now()+interval '5 minutes') returning * into delivery;
 update shopping_queue set status='processing',delivery_id=delivery.id where id=any(ids);
 return next delivery;
end $$;
revoke all on function public.claim_shopping_delivery() from public,anon,authenticated;
grant execute on function public.claim_shopping_delivery() to service_role;

-- Retire only the previous repeating nudge backlog. Real price/search events stay.
update public.shopping_queue set status='suppressed' where status='pending' and kind in ('reminder','alternative');
update public.shopping_queue set payload=payload||jsonb_build_object('expires_at',created_at+interval '7 days')
 where status='pending' and kind in ('price_drop','match') and not(payload ? 'expires_at');
update public.shopping_queue set status='suppressed' where status='pending' and (payload->>'expires_at')::timestamptz<=now();
create index shopping_deliveries_email_cadence on public.shopping_deliveries(user_id,created_at desc) where email_sent;
