-- Keep every marketplace listing free and offer only two optional visibility
-- upgrades. Existing receipts remain intact even when an option is retired.

alter table public.asks
  add column if not exists ranking_at timestamptz;

update public.asks
set ranking_at = coalesce(promoted_at, created_at, now())
where ranking_at is null;

alter table public.asks
  alter column ranking_at set default now(),
  alter column ranking_at set not null;

update public.listing_upgrade_catalog
set
  name = 'Boosted listing',
  description = 'Move your listing back to the top of relevant browse results.',
  amount_cents = 1200,
  duration_days = 0,
  active = true,
  updated_at = now()
where code = 'bump';

update public.listing_upgrade_catalog
set
  name = 'Featured listing',
  description = 'Pin your listing above standard results for one full day.',
  amount_cents = 1000,
  duration_days = 1,
  active = true,
  updated_at = now()
where code = 'featured';

update public.listing_upgrade_catalog
set active = false, updated_at = now()
where code not in ('bump', 'featured');

create index if not exists asks_public_visibility_ranking_idx
  on public.asks (featured_until desc nulls last, ranking_at desc, id)
  where status = 'active' and approved_at is not null and is_demo = false;
