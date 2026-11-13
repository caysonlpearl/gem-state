-- Dealer visibility is separate from feed availability and survives refreshes.
BEGIN;
CREATE TABLE public.dealer_inventory_controls (
  dealer_id uuid NOT NULL REFERENCES public.dealer_profiles(id) ON DELETE CASCADE,
  vehicle_key text NOT NULL CHECK (length(vehicle_key) BETWEEN 1 AND 300),
  record_id uuid REFERENCES public.dealer_inventory_records(id) ON DELETE SET NULL,
  visibility text NOT NULL DEFAULT 'visible' CHECK (visibility IN ('visible','hidden','sold')),
  reason text CHECK (reason IS NULL OR length(reason)<=500),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(dealer_id,vehicle_key)
);
ALTER TABLE public.dealer_inventory_controls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dealer_inventory_controls FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.dealer_inventory_controls TO service_role;

CREATE FUNCTION public.dealer_inventory_vehicle_key(_vin text,_source uuid,_source_key text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
  SELECT CASE WHEN upper(coalesce(_vin,'')) ~ '^[A-HJ-NPR-Z0-9]{17}$' THEN 'vin:'||upper(_vin)
    ELSE 'source:'||_source::text||':'||_source_key END;
$$;
REVOKE ALL ON FUNCTION public.dealer_inventory_vehicle_key(text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dealer_inventory_vehicle_key(text,uuid,text) TO service_role;

CREATE FUNCTION public.set_dealer_inventory_visibility(_record_id uuid,_visibility text,_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.dealer_inventory_records; dealer uuid; actor uuid:=auth.uid(); v_vehicle_key text; previous text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Sign in to manage dealership inventory'; END IF;
  IF _visibility NOT IN ('visible','hidden','sold') OR _visibility IS NULL OR length(coalesce(_reason,''))>500 THEN RAISE EXCEPTION 'Invalid inventory choice'; END IF;
  SELECT * INTO r FROM public.dealer_inventory_records WHERE id=_record_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vehicle not found'; END IF;
  SELECT s.dealer_id INTO dealer FROM public.dealer_inventory_sources s WHERE s.id=r.source_id;
  IF dealer IS NULL OR NOT EXISTS (SELECT 1 FROM public.dealer_profiles d WHERE d.id=dealer AND
    (d.owner_user_id=actor OR EXISTS(SELECT 1 FROM public.dealer_members m WHERE m.dealer_id=d.id AND m.user_id=actor AND m.status='active'))) THEN
    RAISE EXCEPTION 'Access to this dealership is required';
  END IF;
  v_vehicle_key:=public.dealer_inventory_vehicle_key(r.vin,r.source_id,r.source_record_key);
  SELECT c.visibility INTO previous FROM public.dealer_inventory_controls c WHERE c.dealer_id=dealer AND c.vehicle_key=v_vehicle_key;
  INSERT INTO public.dealer_inventory_controls(dealer_id,vehicle_key,record_id,visibility,reason,updated_by,updated_at)
    VALUES(dealer,v_vehicle_key,r.id,_visibility,nullif(btrim(_reason),''),actor,now())
    ON CONFLICT(dealer_id,vehicle_key) DO UPDATE SET record_id=EXCLUDED.record_id,visibility=EXCLUDED.visibility,
      reason=EXCLUDED.reason,updated_by=EXCLUDED.updated_by,updated_at=now();
  -- Old manually linked listings use their existing moderation gate. Restoring
  -- removes the dealer hold but cannot bypass an administrator's approval.
  IF _visibility IN ('hidden','sold') THEN
    UPDATE public.asks a SET approved_at=NULL,updated_at=now()
      FROM public.dealer_inventory_listing_links l
      JOIN public.dealer_inventory_records linked_record ON linked_record.id=l.record_id
      JOIN public.dealer_inventory_sources linked_source ON linked_source.id=linked_record.source_id
      WHERE linked_source.dealer_id=dealer AND a.id=l.listing_id AND a.dealer_id=dealer AND a.approved_at IS NOT NULL
        AND public.dealer_inventory_vehicle_key(linked_record.vin,linked_record.source_id,linked_record.source_record_key)=v_vehicle_key;
  END IF;
  INSERT INTO public.dealer_audit_events(dealer_id,actor_user_id,action,target_type,target_id,metadata)
    VALUES(dealer,actor,'inventory_visibility_changed','inventory_record',r.id::text,
      jsonb_build_object('from',coalesce(previous,'visible'),'to',_visibility,'reason',nullif(btrim(_reason),'')));
  RETURN jsonb_build_object('recordId',r.id,'visibility',_visibility);
END $$;
REVOKE ALL ON FUNCTION public.set_dealer_inventory_visibility(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_dealer_inventory_visibility(uuid,text,text) TO authenticated;

CREATE FUNCTION public.report_dealer_inventory_details(_record_id uuid,_details text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE dealer uuid; actor uuid:=auth.uid(); report uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Sign in to report inventory details'; END IF;
  IF length(btrim(coalesce(_details,''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'Describe the incorrect details in 5 to 500 characters'; END IF;
  SELECT s.dealer_id INTO dealer FROM public.dealer_inventory_records r JOIN public.dealer_inventory_sources s ON s.id=r.source_id WHERE r.id=_record_id;
  IF dealer IS NULL OR NOT EXISTS (SELECT 1 FROM public.dealer_profiles d WHERE d.id=dealer AND
    (d.owner_user_id=actor OR EXISTS(SELECT 1 FROM public.dealer_members m WHERE m.dealer_id=d.id AND m.user_id=actor AND m.status='active'))) THEN
    RAISE EXCEPTION 'Access to this dealership is required';
  END IF;
  INSERT INTO public.partner_vehicle_reports(listing_id,reporter_id,reason,details,status)
    VALUES('dealerfeed-'||_record_id::text,actor,'Incorrect dealership inventory details',btrim(_details),'open')
    ON CONFLICT(listing_id,reporter_id) DO UPDATE SET details=EXCLUDED.details,status='open',resolved_at=NULL,resolved_by=NULL
    WHERE partner_vehicle_reports.status IN ('open','under_review','dismissed')
    RETURNING id INTO report;
  -- A reviewed moderation removal must not be reset by an owner report.
  IF report IS NULL THEN RAISE EXCEPTION 'This vehicle has a completed moderation review. Contact Bluebird support'; END IF;
  INSERT INTO public.dealer_audit_events(dealer_id,actor_user_id,action,target_type,target_id,metadata)
    VALUES(dealer,actor,'inventory_details_reported','inventory_record',_record_id::text,jsonb_build_object('reportId',report));
  RETURN jsonb_build_object('reported',true,'reportId',report);
END $$;
REVOKE ALL ON FUNCTION public.report_dealer_inventory_details(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.report_dealer_inventory_details(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_dealer_inventory() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'name',d.display_name,'slug',d.slug,'logoUrl',d.logo_url,
  'email',d.email,'phone',d.phone,'website',d.website,'address',d.address_line1,'city',d.city,'state',d.state,
  'records',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'priceCents',r.price_cents,
    'status',r.inventory_status,'vin',r.vin,'stockNumber',r.stock_number,'dealerVisibility',coalesce(c.visibility,'visible'),
    'detailReportOpen',EXISTS(SELECT 1 FROM public.partner_vehicle_reports report WHERE report.listing_id='dealerfeed-'||r.id::text AND report.reporter_id=auth.uid() AND report.status IN ('open','under_review'))))
    FROM public.dealer_inventory_records r JOIN public.dealer_inventory_sources s ON s.id=r.source_id
    LEFT JOIN public.dealer_inventory_controls c ON c.dealer_id=d.id AND c.vehicle_key=public.dealer_inventory_vehicle_key(r.vin,r.source_id,r.source_record_key)
    WHERE s.dealer_id=d.id),'[]'::jsonb))),'[]'::jsonb)
 FROM public.dealer_profiles d WHERE auth.uid() IS NOT NULL AND
  (d.owner_user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.dealer_members m WHERE m.dealer_id=d.id AND m.user_id=auth.uid() AND m.status='active'));
$$;
REVOKE ALL ON FUNCTION public.my_dealer_inventory() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_dealer_inventory() TO authenticated;

CREATE OR REPLACE FUNCTION public.read_published_dealer_inventory(
  _record_id uuid DEFAULT NULL, _dealer_slug text DEFAULT NULL, _full_photos boolean DEFAULT false
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH dealers AS (
    SELECT p.source_id, p.slug, coalesce(d.display_name,p.display_name) display_name,
      coalesce(d.website,p.website) website,coalesce(d.phone,p.phone) phone,coalesce(d.address_line1,p.address_line1) address_line1,
      coalesce(d.city,p.city) city,coalesce(d.state,p.state) state,coalesce(d.postal_code,p.postal_code) postal_code,
      d.id dealer_id,d.owner_user_id,d.logo_url,d.email,
      (p.inbox_enabled AND d.owner_user_id IS NOT NULL AND coalesce(pref.allow_internal_messages,true)
        AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=d.owner_user_id)) inbox_enabled,
      EXISTS(SELECT 1 FROM auth.users u WHERE u.id=d.owner_user_id AND u.email_confirmed_at IS NOT NULL) owner_activated,
      s.deactivation_grace_runs
    FROM public.dealer_feed_publications p
    JOIN public.dealer_inventory_sources s ON s.id = p.source_id
    LEFT JOIN public.dealer_profiles d ON d.id=p.dealer_id
    LEFT JOIN public.account_contact_preferences pref ON pref.user_id=d.owner_user_id
    WHERE (d.id IS NULL OR d.status='ready') AND p.enabled AND p.revoked_at IS NULL AND s.status IN ('active','error')
      AND (_dealer_slug IS NULL OR p.slug = _dealer_slug)
      AND (_record_id IS NULL OR EXISTS (
        SELECT 1 FROM public.dealer_inventory_records r WHERE r.source_id=p.source_id AND r.id=_record_id))
  ), vehicles AS (
    SELECT jsonb_build_object(
      'id',r.id,'dealer_slug',p.slug,'title',r.title,'description',r.description,
      'msrp',CASE WHEN btrim(r.raw_record->>'msrp') ~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' THEN nullif((r.raw_record->>'msrp')::numeric,0) ELSE NULL END,
      'price_cents',r.price_cents,'vin',r.vin,'stock_number',r.stock_number,
      'city',r.city,'state',r.state,'postal_code',r.postal_code,
      'vehicle_year',r.vehicle_year,'vehicle_make',r.vehicle_make,'vehicle_model',r.vehicle_model,
      'vehicle_trim',r.vehicle_trim,'vehicle_mileage',r.vehicle_mileage,
      'vehicle_body_style',r.vehicle_body_style,'vehicle_transmission',r.vehicle_transmission,
      'vehicle_drivetrain',r.vehicle_drivetrain,'vehicle_fuel_type',r.vehicle_fuel_type,
      'vehicle_exterior_color',r.vehicle_exterior_color,
      'condition',r.raw_record->>'condition','certified',r.raw_record->>'certified',
      'first_seen_at',r.first_seen_at,'last_seen_at',r.last_seen_at,
      'source_url',CASE WHEN split_part(r.raw_record->>'url','?',1) LIKE p.website || '/inventory/%'
        THEN split_part(r.raw_record->>'url','?',1) ELSE p.website END,
      'photos',COALESCE((SELECT jsonb_agg(m.media_url ORDER BY m.position) FROM (
        SELECT media_url, position FROM public.dealer_inventory_media
        WHERE record_id=r.id AND active AND media_url ~ '^https://'
          AND media_url !~* '[?&](api_?key|key|token|access_token)='
        ORDER BY position LIMIT CASE WHEN _full_photos THEN 80 ELSE 1 END
      ) m),'[]'::jsonb)
    ) AS vehicle
    FROM public.dealer_inventory_records r JOIN dealers p ON p.source_id=r.source_id
    WHERE (_record_id IS NULL OR r.id=_record_id) AND (r.price_cents>0 OR EXISTS (
        SELECT 1 FROM public.dealer_inventory_media eligible_media
        WHERE eligible_media.record_id=r.id AND eligible_media.active
          AND eligible_media.media_url ~ '^https://'
          AND eligible_media.media_url !~* '[?&](api_?key|key|token|access_token)='
      ))
      AND (r.inventory_status='active' OR
        (r.inventory_status='stale' AND r.missed_run_count<p.deactivation_grace_runs))
      AND r.last_seen_at>now()-interval '72 hours'
      AND NOT EXISTS (SELECT 1 FROM public.dealer_inventory_controls control
        WHERE control.dealer_id=p.dealer_id AND control.vehicle_key=public.dealer_inventory_vehicle_key(r.vin,r.source_id,r.source_record_key)
          AND control.visibility IN ('hidden','sold'))
      AND NOT EXISTS (SELECT 1 FROM public.partner_vehicle_reports report
        WHERE report.listing_id='dealerfeed-'||r.id::text AND report.status='reviewed')
    ORDER BY r.id LIMIT 5000
  )
  SELECT jsonb_build_object(
    'dealers',COALESCE((SELECT jsonb_agg(to_jsonb(p)-'source_id'-'deactivation_grace_runs') FROM dealers p),'[]'::jsonb),
    'vehicles',COALESCE((SELECT jsonb_agg(vehicle) FROM vehicles),'[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.read_published_dealer_inventory(uuid,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_published_dealer_inventory(uuid,text,boolean) TO anon, authenticated, service_role;

-- Cached homepage cards are checked against persistent dealer holds before serving.
CREATE FUNCTION public.suppressed_dealer_listing_ids(_ids text[]) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF coalesce(cardinality(_ids),0)>1000 THEN RAISE EXCEPTION 'Too many listings'; END IF;
 RETURN ARRAY(SELECT DISTINCT id FROM (
   SELECT 'dealerfeed-'||r.id::text id FROM public.dealer_inventory_records r
     JOIN public.dealer_inventory_sources s ON s.id=r.source_id
     JOIN public.dealer_inventory_controls c ON c.dealer_id=s.dealer_id AND c.vehicle_key=public.dealer_inventory_vehicle_key(r.vin,r.source_id,r.source_record_key)
     WHERE c.visibility IN ('hidden','sold') AND 'dealerfeed-'||r.id::text=ANY(_ids)
   UNION ALL
   SELECT l.listing_id::text id FROM public.dealer_inventory_listing_links l
     JOIN public.dealer_inventory_records r ON r.id=l.record_id
     JOIN public.dealer_inventory_sources s ON s.id=r.source_id
     JOIN public.dealer_inventory_controls c ON c.dealer_id=s.dealer_id AND c.vehicle_key=public.dealer_inventory_vehicle_key(r.vin,r.source_id,r.source_record_key)
     WHERE c.visibility IN ('hidden','sold') AND l.listing_id::text=ANY(_ids)
 ) hidden);
END $$;
REVOKE ALL ON FUNCTION public.suppressed_dealer_listing_ids(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suppressed_dealer_listing_ids(text[]) TO anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
