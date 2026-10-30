begin;
-- Bluebird Local is independent of marketplace listings and provider quotas.
create table if not exists public.editorial_sources (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  feed_url text not null,
  website text not null,
  state text not null check (state in ('ID','UT')),
  enabled boolean not null default true,
  auto_publish boolean not null default true,
  usage text not null default 'link' check (usage in ('link','full')),
  permission_note text not null default '',
  images_permitted boolean not null default false,
  etag text,
  last_modified text,
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  next_refresh_at timestamptz not null default now(),
  refresh_token uuid,
  refresh_lease_until timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  check (usage = 'link' or length(trim(permission_note)) >= 12),
  check (not images_permitted or usage = 'full')
);
create table if not exists public.editorial_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(title) between 3 and 220),
  excerpt text not null default '',
  body_html text not null default '' check (length(body_html) <= 150000),
  draft_text text check (length(draft_text) <= 150000),
  kind text not null check (kind in ('original','licensed','external')),
  status text not null default 'draft' check (status in ('draft','review','scheduled','published','archived')),
  topic text not null default 'local-news' check (topic in ('local-news','business-jobs','homes-living','cars-transport','outdoors-sports','guides')),
  state text not null default 'ID' check (state in ('ID','UT')),
  city text,
  category_slugs text[] not null default '{}',
  author_name text not null default 'Bluebird Marketplace editorial team',
  author_url text,
  source_id uuid references public.editorial_sources(id),
  source_name text,
  source_url text unique,
  source_published_at timestamptz,
  source_hash text,
  review_reason text,
  pending_update jsonb,
  guide_path text unique check (guide_path is null or (kind = 'original' and guide_path ~ '^/guides/[a-z0-9-]+$')),
  manual_revision integer not null default 0,
  featured boolean not null default false,
  image_url text,
  image_credit text,
  image_rights text,
  published_at timestamptz not null default now(),
  content_modified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'external' or (source_url is not null and body_html = '')),
  check (kind <> 'licensed' or source_id is not null),
  check (image_url is null or (length(trim(image_credit)) > 0 and length(trim(image_rights)) >= 12))
);
create index if not exists editorial_articles_public_feed on public.editorial_articles (published_at desc) where status = 'published';
create index if not exists editorial_articles_due on public.editorial_articles (published_at) where status = 'scheduled';
alter table public.editorial_articles add column if not exists source_fingerprint text;
create unique index if not exists editorial_articles_source_fingerprint on public.editorial_articles(source_fingerprint) where source_fingerprint is not null;
create table if not exists public.editorial_refresh_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.editorial_sources(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','completed','failed','unchanged')),
  discovered integer not null default 0,
  created integer not null default 0,
  updated integer not null default 0,
  review_count integer not null default 0,
  error text
);
create table if not exists public.editorial_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  article_id uuid references public.editorial_articles(id),
  source_id uuid references public.editorial_sources(id),
  action text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.editorial_sources enable row level security;
alter table public.editorial_articles enable row level security;
alter table public.editorial_refresh_runs enable row level security;
alter table public.editorial_audit_events enable row level security;
revoke all on public.editorial_sources, public.editorial_articles, public.editorial_refresh_runs, public.editorial_audit_events from anon, authenticated;
grant all on public.editorial_sources, public.editorial_articles, public.editorial_refresh_runs, public.editorial_audit_events to service_role;

create or replace function public.reserve_editorial_refresh(_source_id uuid, _force boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare token uuid;
begin
  update public.editorial_sources set refresh_token = gen_random_uuid(), refresh_lease_until = now() + interval '5 minutes', last_attempt_at = now()
  where id = _source_id and enabled and (refresh_lease_until is null or refresh_lease_until < now())
    and (last_attempt_at is null or last_attempt_at < now() - interval '1 minute')
    and (_force or next_refresh_at <= now()) returning refresh_token into token;
  return token;
end $$;
revoke all on function public.reserve_editorial_refresh(uuid,boolean) from public, anon, authenticated;
grant execute on function public.reserve_editorial_refresh(uuid,boolean) to service_role;

create or replace function public.guard_editorial_publication()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.status in ('published','scheduled') and new.kind = 'licensed' and not exists (
    select 1 from public.editorial_sources s where s.id = new.source_id and s.usage = 'full' and length(trim(s.permission_note)) >= 12
  ) then raise exception 'Full-story republication permission must be recorded first.'; end if;
  if new.status in ('published','scheduled') and new.kind <> 'external' and new.guide_path is null and length(trim(new.body_html)) < 30 then
    raise exception 'An article needs its complete body before publication.';
  end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'guard_editorial_publication' and tgrelid = 'public.editorial_articles'::regclass) then
    create trigger guard_editorial_publication before insert or update on public.editorial_articles for each row execute function public.guard_editorial_publication();
  end if;
end $$;

insert into public.editorial_sources (key,name,feed_url,website,state) values
('idaho-capital-sun','Idaho Capital Sun','https://idahocapitalsun.com/feed/','https://idahocapitalsun.com','ID'),
('utah-news-dispatch','Utah News Dispatch','https://utahnewsdispatch.com/feed/','https://utahnewsdispatch.com','UT'),
('idaho-at-work','Idaho Department of Labor','https://idahoatwork.com/feed/','https://idahoatwork.com','ID'),
('idaho-fish-game','Idaho Fish and Game','https://idfg.idaho.gov/press/rss.xml','https://idfg.idaho.gov','ID')
on conflict (key) do nothing;
-- Keep this source paused until its website returns and its actual feed
-- address can be verified. Never poll an unverified path.
update public.editorial_sources set enabled = false, feed_url = '', last_error = 'Publisher website is under maintenance. Verify its RSS address before enabling.'
where key = 'idaho-fish-game' and last_success_at is null and feed_url = 'https://idfg.idaho.gov/press/rss.xml';

-- Permission revocation and unpublishing take effect on the next request;
-- public readers never serve a stale in-process copy of an article.
drop view if exists public.editorial_public_articles;
create view public.editorial_public_articles with (security_invoker = true) as
select a.*, s.images_permitted as source_images_permitted
from public.editorial_articles a left join public.editorial_sources s on s.id = a.source_id
where a.status = 'published' and a.published_at <= now()
  and (a.kind <> 'licensed' or (s.usage = 'full' and length(trim(s.permission_note)) >= 12));
revoke all on public.editorial_public_articles from public, anon, authenticated;
grant select on public.editorial_public_articles to service_role;

create or replace function public.editorial_performance(_days integer default 30)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'articleViews', count(*) filter (where name = 'media_article_viewed'),
    'ctaClicks', count(*) filter (where name = 'media_cta_clicked'),
    'listingViews', count(*) filter (where name = 'listing_viewed' and props ? 'media_article'),
    'sellerContacts', count(*) filter (where name = 'inquiry_completed' and props ? 'media_article'),
    'postingStarted', count(*) filter (where name = 'classified_listing_submit_started' and props ? 'media_article'),
    'postingCompleted', count(*) filter (where name = 'classified_listing_submit_succeeded' and props ? 'media_article')
  ) from public.analytics_events
  where occurred_at >= now() - make_interval(days => greatest(1,least(_days,90)))
    and is_demo = false and props->>'site_host' = 'onbluebird.com'
    and name in ('media_article_viewed','media_cta_clicked','listing_viewed','inquiry_completed','classified_listing_submit_started','classified_listing_submit_succeeded')
    and coalesce(props->>'is_internal','false') <> 'true'
    and coalesce(props->>'is_bot','false') <> 'true';
$$;
revoke all on function public.editorial_performance(integer) from public, anon, authenticated;
grant execute on function public.editorial_performance(integer) to service_role;
notify pgrst, 'reload schema';

commit;
