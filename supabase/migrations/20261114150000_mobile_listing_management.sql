-- Atomic native edit/archive/relist operations and private editor snapshots.
-- No activation, scheduler, account erasure or changes to website RPC behavior.
BEGIN;
SET LOCAL search_path='';
DO $$ BEGIN
 IF to_regprocedure('public.assert_current_account_access()') IS NULL
 OR to_regprocedure('public.protect_account_access_boundaries()') IS NULL
 OR to_regprocedure('public.cancel_ask(uuid)') IS NULL
 OR to_regprocedure('public.relist_ask(uuid)') IS NULL
 OR to_regprocedure('public.replace_listing_media(uuid,text[])') IS NULL
 OR to_regprocedure('public.update_classified_listing(uuid,text,text,uuid,integer,public.item_condition,text,text,text,text,text,text,numeric,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb,jsonb)') IS NULL
 OR to_regprocedure('public.update_free_pet_listing(uuid,text,text,uuid,integer,public.item_condition,text,text,text,text,text,text,numeric,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb,jsonb)') IS NULL
 OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Review listing management prerequisites'; END IF;
END $$;

CREATE FUNCTION public.mobile_listing_scope_allowed(_category text,_title text,_description text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(_category=ANY(ARRAY[
 'cars-trucks','motorcycles','rvs-campers','powersports','auto-parts','trailers',
 'furniture','apparel-accessories','baby-kids','books-media','collectibles','crafts-hobbies',
 'electronics','health-beauty','home-garden','jewelry-watches','musical-instruments','office-business',
 'tickets-events','tools-equipment','industrial','outdoor-sporting','farm-garden','general',
 'other-real-estate','services','jobs','pets']) AND
 (coalesce(_title,'')||' '||coalesce(_description,'')) !~*
 $pattern$(^|[^a-zA-Z0-9_])(firearms?|ammunition|ammo|rifles?|pistols?|revolvers?|shotguns?|glock|ar[ -]?15|ak[ -]?47|bump[ -]?stocks?|automatic[ -]?conversion|explosives?|silencers?)($|[^a-zA-Z0-9_])$pattern$,false)
$$;

-- Share-lock the live session row: deletion's session revocation must serialize
-- with the entire write, including the receipt. No reliance on an earlier JWT check.
CREATE FUNCTION public.mobile_lock_listing_actor()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE actor uuid:=auth.uid(); session uuid:=nullif(auth.jwt()->>'session_id','')::uuid;
BEGIN
 IF actor IS NULL OR session IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 PERFORM public.assert_current_account_access();
 PERFORM 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
 WHERE s.id=session AND s.user_id=actor AND (s.not_after IS NULL OR s.not_after>now())
 AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now()) FOR SHARE OF s,u;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM public.mobile_account_deletions WHERE user_id=actor)
 OR EXISTS(SELECT 1 FROM public.account_deletion_jobs WHERE user_id=actor AND status<>'completed')
 THEN RAISE EXCEPTION 'Sign in required'; END IF;
 RETURN actor;
END $$;

-- Private helper is not caller-addressable. Only content/state/media contribute
-- to the revision; ordinary views and impressions never invalidate an open editor.
CREATE FUNCTION public.mobile_listing_snapshot_internal(_listing uuid,_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE snapshot jsonb; media jsonb;
BEGIN
 SELECT jsonb_build_object('id',a.id,'status',a.status,'approved_at',a.approved_at,
  'expires_at',a.expires_at,'sold_at',a.sold_at,'variant_id',a.variant_id,'currency',a.currency,
  'price_cents',a.price_cents,'item_condition',a.item_condition,'seller_note',a.seller_note,
  'parcel_length_in',a.parcel_length_in,'parcel_width_in',a.parcel_width_in,
  'parcel_height_in',a.parcel_height_in,'parcel_weight_lb',a.parcel_weight_lb,
  'products',jsonb_build_object('name',p.name,'description',p.description,'status',p.status,
   'categories',jsonb_build_object('slug',c.slug)),
  'classified_listing_details',to_jsonb(d)) INTO snapshot
 FROM public.asks a JOIN public.products p ON p.id=a.product_id
 JOIN public.categories c ON c.id=p.category_id
 JOIN public.classified_listing_details d ON d.listing_id=a.id
 WHERE a.id=_listing AND a.seller_id=_actor AND a.is_demo=false
 AND public.mobile_listing_scope_allowed(c.slug,p.name,p.description);
 IF snapshot IS NULL THEN RETURN NULL; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('storage_path',m.storage_path,'position',m.position)
  ORDER BY m.position,m.id),'[]'::jsonb) INTO media FROM
  (SELECT id,storage_path,position FROM public.listing_media WHERE ask_id=_listing ORDER BY position,id LIMIT 33) m;
 IF jsonb_array_length(media)>32 THEN RAISE EXCEPTION 'Listing media unavailable'; END IF;
 snapshot:=snapshot||jsonb_build_object('listing_media',media);
 RETURN jsonb_build_object('snapshot',snapshot,'version',encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'));
END $$;

CREATE FUNCTION public.mobile_listing_editor_snapshot(_listing uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='8s' AS $$
DECLARE actor uuid:=public.mobile_lock_listing_actor();
BEGIN RETURN public.mobile_listing_snapshot_internal(_listing,actor)||jsonb_build_object('ownerId',actor); END $$;

CREATE FUNCTION public.mobile_manage_listing(_request uuid,_listing uuid,_action text,_expected text,_input jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' SET statement_timeout='15s' AS $$
DECLARE actor uuid:=public.mobile_lock_listing_actor(); input_hash bytea; receipt public.mobile_message_receipts;
 current_snapshot jsonb; next_snapshot jsonb; category uuid; rpc_name text; media text[]; outcome jsonb; state text;
BEGIN
 IF _request IS NULL OR _listing IS NULL OR _action IS NULL OR _action NOT IN ('edit','archive','relist')
 OR _expected IS NULL OR _expected!~'^[0-9a-f]{64}$' OR _input IS NULL OR jsonb_typeof(_input)<>'object'
 OR octet_length(_input::text)>65536 OR (_action<>'edit' AND _input<>'{}'::jsonb)
 THEN RAISE EXCEPTION 'Invalid listing management request'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.shopping_accounts WHERE user_id=actor AND terms_version='2026-11-12')
 THEN RAISE EXCEPTION 'Accept current terms'; END IF;
 input_hash:=sha256(convert_to(jsonb_build_array('listing-management-v1',_listing,_action,_expected,_input)::text,'UTF8'));
 INSERT INTO public.mobile_message_receipts(user_id,request_id,input_hash) VALUES(actor,_request,input_hash)
 ON CONFLICT(user_id,request_id) DO NOTHING;
 SELECT * INTO receipt FROM public.mobile_message_receipts WHERE user_id=actor AND request_id=_request FOR UPDATE;
 IF receipt.input_hash<>input_hash THEN RAISE EXCEPTION 'Listing retry does not match original request'; END IF;
 IF receipt.result IS NOT NULL THEN RETURN receipt.result||jsonb_build_object('replayed',true); END IF;
 SELECT a.status::text INTO state FROM public.asks a WHERE a.id=_listing AND a.seller_id=actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Listing unavailable'; END IF;
 current_snapshot:=public.mobile_listing_snapshot_internal(_listing,actor);
 IF current_snapshot IS NULL THEN RAISE EXCEPTION 'Listing unavailable'; END IF;
 IF current_snapshot->>'version'<>_expected THEN RAISE EXCEPTION 'Listing changed; reload before trying again'; END IF;
 IF _action='edit' THEN
  IF state<>'active' THEN RAISE EXCEPTION 'Only open listings can be edited'; END IF;
  IF NOT public.mobile_listing_scope_allowed(_input->>'category',_input->>'title',_input->>'description')
  OR coalesce(jsonb_typeof(_input->'itemDetails'),'object') NOT IN ('object','null')
  THEN RAISE EXCEPTION 'Choose an eligible listing'; END IF;
  SELECT id INTO category FROM public.categories WHERE slug=_input->>'category';
  IF category IS NULL THEN RAISE EXCEPTION 'Choose an eligible listing'; END IF;
  rpc_name:=CASE WHEN _input->>'category'='pets' AND (_input->>'priceCents')::integer=0 THEN 'update_free_pet_listing' ELSE 'update_classified_listing' END;
  EXECUTE format('SELECT public.%I($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)',rpc_name) USING
   _listing,_input->>'title',_input->>'description',category,(_input->>'priceCents')::integer,(_input->>'condition')::public.item_condition,
   nullif(_input->>'sellerNote',''),_input->>'region',_input->>'city',_input->>'state',nullif(_input->>'postalCode',''),_input->>'fulfillmentMode',
   (_input->>'parcelLengthIn')::numeric,(_input->>'parcelWidthIn')::numeric,(_input->>'parcelHeightIn')::numeric,(_input->>'parcelWeightLb')::numeric,
   nullif(_input->'vehicle','null'::jsonb),nullif(_input->'home','null'::jsonb),nullif(_input->'job','null'::jsonb),nullif(_input->'service','null'::jsonb),nullif(_input->'pet','null'::jsonb);
  UPDATE public.classified_listing_details SET item_details=coalesce(nullif(_input->'itemDetails','null'::jsonb),'{}'::jsonb) WHERE listing_id=_listing;
  IF NOT FOUND THEN RAISE EXCEPTION 'Listing details unavailable'; END IF;
  IF _input?'publicMediaPaths' AND jsonb_typeof(_input->'publicMediaPaths')<>'array' THEN RAISE EXCEPTION 'Choose your own listing photos'; END IF;
  SELECT array_agg(p) INTO media FROM jsonb_array_elements_text(coalesce(_input->'publicMediaPaths','[]'::jsonb)) p;
  IF coalesce(cardinality(media),0)>8 OR EXISTS(SELECT 1 FROM unnest(media) p WHERE p NOT LIKE actor::text||'/%' OR p LIKE '%..%' OR p~'[[:cntrl:]]')
  OR (SELECT count(DISTINCT p) FROM unnest(media) p)<>coalesce(cardinality(media),0)
  THEN RAISE EXCEPTION 'Choose your own listing photos'; END IF;
  IF coalesce(cardinality(media),0)>0 THEN PERFORM public.replace_listing_media(_listing,media); END IF;
  UPDATE public.asks SET approved_at=NULL WHERE id=_listing;
 ELSIF _action='archive' THEN
  PERFORM public.cancel_ask(_listing);
 ELSE
  IF state NOT IN ('cancelled','expired') THEN RAISE EXCEPTION 'Only removed or expired listings can be relisted'; END IF;
  PERFORM public.relist_ask(_listing);
  -- Native relisting always returns to review, even if an older domain function
  -- kept its former approval. Never expose a review-only catalog switch.
  UPDATE public.asks SET approved_at=NULL WHERE id=_listing;
 END IF;
 next_snapshot:=public.mobile_listing_snapshot_internal(_listing,actor);
 IF next_snapshot IS NULL THEN RAISE EXCEPTION 'Listing unavailable'; END IF;
 outcome:=jsonb_build_object('listingId',_listing,'action',_action,'version',next_snapshot->>'version',
  'status',next_snapshot->'snapshot'->>'status','approvedAt',next_snapshot->'snapshot'->'approved_at');
 UPDATE public.mobile_message_receipts SET result=outcome WHERE user_id=actor AND request_id=_request;
 RETURN outcome||jsonb_build_object('replayed',false);
END $$;

CREATE FUNCTION public.mobile_listing_management_capabilities()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('version',1,'management',true)
$$;
REVOKE ALL ON FUNCTION public.mobile_listing_scope_allowed(text,text,text),public.mobile_lock_listing_actor(),public.mobile_listing_snapshot_internal(uuid,uuid),
 public.mobile_listing_editor_snapshot(uuid),public.mobile_manage_listing(uuid,uuid,text,text,jsonb),public.mobile_listing_management_capabilities() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mobile_listing_editor_snapshot(uuid),public.mobile_manage_listing(uuid,uuid,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_listing_management_capabilities() TO service_role;
SELECT public.protect_account_access_boundaries();
DO $$ BEGIN
 IF public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Listing management access boundary requires review'; END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
