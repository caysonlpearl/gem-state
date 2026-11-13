-- Durable choices outlive disposable browsing events and queue receipts.
create table public.shopping_choices (
 subject text not null references public.shopping_privacy(subject) on delete cascade,
 listing_id text not null, user_id uuid references auth.users(id) on delete cascade,
 dismissed boolean not null default false, choice_at timestamptz,
 purchased_at timestamptz, reminder_anchor bigint not null default 0,
 reminder_step smallint not null default 0 check(reminder_step in(0,1,3,7)),
 updated_at timestamptz not null default now(), primary key(subject,listing_id)
);
alter table public.shopping_choices enable row level security;
revoke all on public.shopping_choices from public,anon,authenticated;
grant all on public.shopping_choices to service_role;

create function public.remember_shopping_choice() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.listing_id is null or new.kind not in('dismiss','save','purchase') then return new; end if;
 insert into shopping_choices(subject,listing_id,user_id,dismissed,choice_at,purchased_at)
 values(new.subject,new.listing_id,new.user_id,new.kind='dismiss',case when new.kind<>'purchase' then new.occurred_at end,case when new.kind='purchase' then new.occurred_at end)
 on conflict(subject,listing_id) do update set
 dismissed=case when excluded.choice_at>=coalesce(shopping_choices.choice_at,'1970-01-01') then excluded.dismissed else shopping_choices.dismissed end,
 choice_at=greatest(shopping_choices.choice_at,excluded.choice_at),
 purchased_at=coalesce(shopping_choices.purchased_at,excluded.purchased_at),updated_at=now();
 return new;
end $$;
revoke all on function public.remember_shopping_choice() from public,anon,authenticated;
create trigger remember_shopping_choice after insert on public.shopping_events for each row execute function public.remember_shopping_choice();

create function public.remember_shopping_reminder() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare permission shopping_privacy; anchor bigint; step smallint;
begin
 if new.kind<>'reminder' or new.status<>'sent' or old.status='sent' then return new; end if;
 select * into permission from shopping_privacy where subject='u:'||new.user_id::text for share;
 if not found or not permission.personalization or new.created_at<permission.history_after then return new; end if;
 anchor=(new.payload->>'interest_at')::bigint; step=(new.payload->>'step')::smallint;
 if anchor is null or step not in(1,3,7) then return new; end if;
 insert into shopping_choices(subject,listing_id,user_id,reminder_anchor,reminder_step)
 values('u:'||new.user_id::text,new.listing_id,new.user_id,anchor,step)
 on conflict(subject,listing_id) do update set
 reminder_step=case when excluded.reminder_anchor>shopping_choices.reminder_anchor then excluded.reminder_step when excluded.reminder_anchor=shopping_choices.reminder_anchor then greatest(shopping_choices.reminder_step,excluded.reminder_step) else shopping_choices.reminder_step end,
 reminder_anchor=greatest(shopping_choices.reminder_anchor,excluded.reminder_anchor),updated_at=now();
 return new;
end $$;
revoke all on function public.remember_shopping_reminder() from public,anon,authenticated;
create trigger remember_shopping_reminder after update of status on public.shopping_queue for each row execute function public.remember_shopping_reminder();

create function public.reset_shopping_choices() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.history_after>old.history_after then delete from shopping_choices where subject=new.subject; end if;
 return new;
end $$;
revoke all on function public.reset_shopping_choices() from public,anon,authenticated;
create trigger reset_shopping_choices after update of history_after on public.shopping_privacy for each row execute function public.reset_shopping_choices();

insert into shopping_choices(subject,listing_id,user_id,dismissed,choice_at)
select distinct on(e.subject,e.listing_id) e.subject,e.listing_id,e.user_id,e.kind='dismiss',e.occurred_at
from shopping_events e join shopping_privacy p using(subject)
where p.personalization and e.occurred_at>=p.history_after and e.kind in('dismiss','save') and e.listing_id is not null
order by e.subject,e.listing_id,e.occurred_at desc;
insert into shopping_choices(subject,listing_id,user_id,purchased_at)
select e.subject,e.listing_id,e.user_id,min(e.occurred_at) from shopping_events e join shopping_privacy p using(subject)
where p.personalization and e.occurred_at>=p.history_after and e.kind='purchase' and e.listing_id is not null
group by e.subject,e.listing_id,e.user_id
on conflict(subject,listing_id) do update set purchased_at=excluded.purchased_at;
