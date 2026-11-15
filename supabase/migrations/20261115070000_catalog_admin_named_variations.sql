-- Repair generated variation writes and distinguish named options without
-- inventing size/color/edition attributes. Source only; deletion worker stays off.
BEGIN;
SET LOCAL search_path='';SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='30s';
DO $$ DECLARE expression text;BEGIN
 PERFORM 1 FROM public.account_deletion_controls WHERE id AND NOT worker_enabled FOR SHARE;
 IF NOT FOUND OR NOT public.account_deletion_catalog_barrier_current()OR NOT public.account_deletion_listing_barrier_current()
 OR public.account_access_coverage()IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Review disabled named variation prerequisites';END IF;
 LOCK TABLE public.product_variants IN ACCESS EXCLUSIVE MODE;
 SELECT replace(pg_get_expr(d.adbin,d.adrelid),'public.','')INTO expression FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE a.attrelid='public.product_variants'::regclass AND a.attname='variation_key'AND a.attgenerated='s';
 IF expression IS DISTINCT FROM $expression$((((lower(btrim(COALESCE(size, '~'::text))) || '|'::text) || lower(btrim(COALESCE(color, '~'::text)))) || '|'::text) || lower(btrim(COALESCE(edition, '~'::text))))$expression$ THEN RAISE EXCEPTION 'Review generated variation expression';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.admin_create_product(text,text,uuid,text[],text[],text,text,text,public.release_type,date,integer,text,public.product_status,uuid)'::regprocedure AND md5(prosrc)='ec0aa2c1ec03bb700946f6e2faf698c8'AND prosecdef AND proconfig=ARRAY['search_path=public'])THEN RAISE EXCEPTION 'Review variation writer source';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.admin_save_variant(uuid,text,uuid,text,text,text,integer,boolean)'::regprocedure AND md5(prosrc)='7f0ade826bc04fd9e344e7ee0612921f'AND prosecdef AND proconfig=ARRAY['search_path=public'])THEN RAISE EXCEPTION 'Review variation writer source';END IF;
 -- Encoded label keys contain no pipe; existing structured keys always do.
 -- A long legacy label requires separate review before rebuilding its index.
 IF EXISTS(SELECT 1 FROM public.product_variants WHERE size IS NULL AND color IS NULL AND edition IS NULL
 AND octet_length('label:'||replace(replace(lower(btrim(sku_label)),'%','%25'),'|','%7C'))>2000)
 THEN RAISE EXCEPTION 'Review oversized named variation keys';END IF;
END $$;
-- PostgreSQL 17 supports SET EXPRESSION AS. This rewrites existing generated
-- values and their index; measure capacity before installation, not during a
-- shopper request. Parent product/variant ids and their references stay intact.
ALTER TABLE public.product_variants ALTER COLUMN variation_key SET EXPRESSION AS (CASE WHEN size IS NULL AND color IS NULL AND edition IS NULL AND nullif(btrim(sku_label),'') IS NOT NULL THEN 'label:' || replace(replace(lower(btrim(sku_label)),'%','%25'),'|','%7C') ELSE lower(btrim(coalesce(size,'~'))) || '|' || lower(btrim(coalesce(color,'~'))) || '|' || lower(btrim(coalesce(edition,'~'))) END);
ANALYZE public.product_variants;

CREATE OR REPLACE FUNCTION public.admin_create_product(_name text, _slug text, _category_id uuid, _resort_codes text[], _variations text[] DEFAULT NULL::text[], _brand_text text DEFAULT NULL::text, _collection_text text DEFAULT NULL::text, _description text DEFAULT NULL::text, _release_type public.release_type DEFAULT 'unknown'::public.release_type, _release_date date DEFAULT NULL::date, _retail_price_cents integer DEFAULT NULL::integer, _retail_price_source text DEFAULT NULL::text, _status public.product_status DEFAULT 'draft'::public.product_status, _suggestion_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _caller uuid := auth.uid();
  _clean_name text := btrim(coalesce(_name, ''));
  _clean_slug text := lower(regexp_replace(btrim(coalesce(nullif(_slug, ''), _name)), '[^a-zA-Z0-9]+', '-', 'g'));
  _brand_id uuid;
  _collection_id uuid;
  _product_id uuid;
  _codes text[];
  _labels text[];
  _label text;
  _i integer := 0;
  _submission_author uuid;
  _submission_seller uuid;
  _submission_status public.suggestion_status;
begin
  if _caller is null or not public.has_role(_caller, 'admin') then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  -- Lock the actual submission and its held seller before creating any
  -- derivative catalog content. A request that wins first stops approval;
  -- an approval that wins first commits before deletion can inventory it.
  if _suggestion_id is not null then
    select submitted_by,status into _submission_author,_submission_status from public.product_suggestions
      where id=_suggestion_id for update;
    if not found then raise exception 'That request no longer exists.'; end if;
    perform public.assert_member_private_record_writer(_submission_author);
    for _submission_seller in select seller_id from public.seller_listing_requests
      where suggestion_id=_suggestion_id order by seller_id for share loop
      perform public.assert_member_private_record_writer(_submission_seller);
    end loop;
    if _submission_status='approved' then
      raise exception 'That request already has an approved catalog page.';
    end if;
  end if;

  _clean_slug := trim(both '-' from _clean_slug);
  if char_length(_clean_name) < 3 or char_length(_clean_name) > 160 then
    raise exception 'Give the product a name between 3 and 160 characters.';
  end if;
  if char_length(_clean_slug) < 3 then
    raise exception 'The product needs a usable URL slug.';
  end if;
  if exists (select 1 from public.products where slug = _clean_slug) then
    raise exception 'A catalog page already uses the slug %.', _clean_slug;
  end if;
  if _category_id is null or not exists (select 1 from public.categories where id = _category_id) then
    raise exception 'Choose a catalog category.';
  end if;

  select coalesce(array_agg(distinct upper(c)), array[]::text[])
  into _codes
  from unnest(coalesce(_resort_codes, array[]::text[])) as c
  where upper(c) in (select code from public.resorts where active);
  if array_length(_codes, 1) is null then
    raise exception 'Choose at least one resort where this product is sold.';
  end if;

  if nullif(btrim(coalesce(_brand_text, '')), '') is not null then
    insert into public.brands (slug, name)
    values (trim(both '-' from lower(regexp_replace(btrim(_brand_text), '[^a-zA-Z0-9]+', '-', 'g'))), btrim(_brand_text))
    on conflict (slug) do update set name = excluded.name
    returning id into _brand_id;
  end if;

  if nullif(btrim(coalesce(_collection_text, '')), '') is not null then
    insert into public.collections (slug, name)
    values (trim(both '-' from lower(regexp_replace(btrim(_collection_text), '[^a-zA-Z0-9]+', '-', 'g'))), btrim(_collection_text))
    on conflict (slug) do update set name = excluded.name
    returning id into _collection_id;
  end if;

  insert into public.products (
    slug, name, brand_id, collection_id, category_id, description,
    release_date, release_type, retail_price_cents, retail_price_source,
    retail_price_observed_at, status, is_demo, created_by
  )
  values (
    _clean_slug, _clean_name, _brand_id, _collection_id, _category_id,
    nullif(btrim(coalesce(_description, '')), ''),
    _release_date, coalesce(_release_type, 'unknown'),
    _retail_price_cents,
    nullif(btrim(coalesce(_retail_price_source, '')), ''),
    case when _retail_price_cents is not null then now() else null end,
    coalesce(_status, 'draft'), false, _caller
  )
  returning id into _product_id;

  insert into public.product_resorts (product_id, resort_id)
  select _product_id, r.id from public.resorts r where r.code = any(_codes)
  on conflict do nothing;

  select coalesce(array_agg(btrim(v) order by ordinal), array[]::text[])
  into _labels
  from unnest(coalesce(_variations, array[]::text[])) with ordinality as item(v,ordinal)
  where btrim(coalesce(v, '')) <> '';

  if array_length(_labels, 1) is null then
    _labels := array['Standard'];
  end if;

  if cardinality(_labels)>40 or exists(select 1 from unnest(_labels) label where char_length(label)>120) then
    raise exception 'Use up to 40 variation labels of up to 120 characters each.';
  end if;
  if (select count(*)<>count(distinct lower(label)) from unnest(_labels) label) then
    raise exception 'Variation labels must be unique, ignoring case and surrounding spaces.';
  end if;

  foreach _label in array _labels loop
    insert into public.product_variants (product_id, sku_label, position, active)
    values (
      _product_id, _label,
      _i, true
    );
    _i := _i + 1;
  end loop;

  if _suggestion_id is not null then
    update public.product_suggestions
    set status = 'approved',
        reviewer_id = _caller,
        created_product_id = _product_id,
        reviewed_at = now(),
        updated_at = now()
    where id = _suggestion_id;
  end if;

  insert into public.admin_audit_log (actor_id, action, entity, entity_id, after, note)
  values (
    _caller, 'product_created', 'products', _product_id,
    jsonb_build_object('slug', _clean_slug, 'status', coalesce(_status, 'draft'), 'variations', _labels, 'resorts', _codes),
    case when _suggestion_id is not null then 'Created from member request' else null end
  );

  return _product_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_save_variant(_product_id uuid, _label text, _variant_id uuid DEFAULT NULL::uuid, _size text DEFAULT NULL::text, _color text DEFAULT NULL::text, _edition text DEFAULT NULL::text, _position integer DEFAULT NULL::integer, _active boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _caller uuid := auth.uid();
  _clean_label text := nullif(btrim(coalesce(_label, '')), '');
  _before jsonb;
  _id uuid := _variant_id;
begin
  if _caller is null or not public.has_role(_caller, 'admin') then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;
  if _clean_label is null or char_length(_clean_label) > 120 then
    raise exception 'Give the variation a label of up to 120 characters.';
  end if;
  if not exists (select 1 from public.products where id = _product_id) then
    raise exception 'That catalog page no longer exists.';
  end if;

  if _id is null then
    insert into public.product_variants (product_id, sku_label, size, color, edition, position, active)
    values (
      _product_id, _clean_label,
      nullif(btrim(coalesce(_size, '')), ''),
      nullif(btrim(coalesce(_color, '')), ''),
      nullif(btrim(coalesce(_edition, '')), ''),
      coalesce(_position, (select coalesce(max(position), -1) + 1 from public.product_variants where product_id = _product_id)),
      coalesce(_active, true)
    )
    returning id into _id;

    insert into public.admin_audit_log (actor_id, action, entity, entity_id, after)
    values (_caller, 'variant_created', 'product_variants', _id,
            jsonb_build_object('product_id', _product_id, 'label', _clean_label));
    return _id;
  end if;

  select to_jsonb(v) into _before
  from public.product_variants v
  where v.id = _id and v.product_id = _product_id
  for update;
  if _before is null then
    raise exception 'That variation no longer exists.';
  end if;

  update public.product_variants
  set sku_label = _clean_label,
      size = nullif(btrim(coalesce(_size, '')), ''),
      color = nullif(btrim(coalesce(_color, '')), ''),
      edition = nullif(btrim(coalesce(_edition, '')), ''),
      position = coalesce(_position, position),
      active = coalesce(_active, active),
      updated_at = now()
  where id = _id;

  insert into public.admin_audit_log (actor_id, action, entity, entity_id, before, after)
  values (_caller, 'variant_updated', 'product_variants', _id, _before,
          jsonb_build_object('label', _clean_label, 'active', coalesce(_active, true), 'position', _position));

  return _id;
end;
$function$
;
SELECT public.protect_account_access_boundaries();
-- Repin only the reviewed generated expression/index rebuild after the old
-- catalog contract passed. No general-purpose contract refresh is exposed.
UPDATE public.account_deletion_catalog_contract SET catalog=public.account_deletion_catalog_catalog()WHERE id;
DO $$ BEGIN
 IF NOT public.account_deletion_catalog_barrier_current()OR NOT public.account_deletion_listing_barrier_current()
 OR NOT public.account_deletion_private_barrier_current()OR NOT public.account_deletion_profile_barrier_current()
 OR public.account_access_coverage()IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Named variation boundaries require review';END IF;
END $$;
COMMIT;
