-- Exercises actual PostgreSQL visibility and leases. All fixtures roll back.
begin;
do $$
declare article_id uuid; source_id uuid; token uuid;
begin
  if has_table_privilege('anon','public.editorial_articles','SELECT') or has_table_privilege('authenticated','public.editorial_articles','SELECT') then
    raise exception 'Private draft records must not be readable directly.';
  end if;
  if has_function_privilege('anon','public.reserve_editorial_refresh(uuid,boolean)','EXECUTE') then
    raise exception 'Anonymous callers must not reserve source refreshes.';
  end if;
  insert into public.editorial_articles(slug,title,excerpt,body_html,kind,status,published_at)
    values ('qa-editorial-transaction-test','QA editorial transaction test','Private transaction fixture.', '<p>This is a private publishing contract fixture, never committed.</p>','original','draft',now()-interval '1 hour') returning id into article_id;
  if exists(select 1 from public.editorial_public_articles where id=article_id) then raise exception 'Draft leaked to public view.'; end if;
  update public.editorial_articles set status='published' where id=article_id;
  if not exists(select 1 from public.editorial_public_articles where id=article_id) then raise exception 'Published article missing.'; end if;
  update public.editorial_articles set status='archived' where id=article_id;
  if exists(select 1 from public.editorial_public_articles where id=article_id) then raise exception 'Unpublished article remained public.'; end if;
  update public.editorial_articles set status='published',published_at=now()+interval '1 day' where id=article_id;
  if exists(select 1 from public.editorial_public_articles where id=article_id) then raise exception 'Future article leaked.'; end if;
  select id into source_id from public.editorial_sources where key='idaho-capital-sun';
  update public.editorial_sources set usage='link',images_permitted=false,last_attempt_at=null,refresh_lease_until=null where id=source_id;
  begin
    insert into public.editorial_articles(slug,title,excerpt,body_html,kind,status,source_id)
      values ('qa-unlicensed-transaction-test','QA permission fixture','Private transaction fixture.','<p>Publisher article without recorded permission should be rejected.</p>','licensed','published',source_id);
    raise exception 'Missing publication rights were accepted.';
  exception when raise_exception then
    if sqlerrm <> 'Full-story republication permission must be recorded first.' then raise; end if;
  end;
  token := public.reserve_editorial_refresh(source_id,true);
  if token is null then raise exception 'First refresh lease was not reserved.'; end if;
  if public.reserve_editorial_refresh(source_id,true) is not null then raise exception 'A concurrent refresh acquired the same source.'; end if;
end $$;
rollback;
