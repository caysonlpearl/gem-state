-- Approved dealerships can receive buyer messages before owner activation.
-- Ownership, authorization, private participants, preferences and blocks stay enforced.
BEGIN;
CREATE OR REPLACE FUNCTION public.start_dealer_conversation(_dealer_id uuid,_record_id uuid,_body text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE buyer uuid:=auth.uid(); seller uuid; dealer uuid; subject text; thread uuid; clean text:=btrim(coalesce(_body,''));
BEGIN
  IF buyer IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF char_length(clean) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Message must be between 1 and 5000 characters'; END IF;
  IF _record_id IS NOT NULL THEN
    IF jsonb_array_length(public.read_published_dealer_inventory(_record_id,NULL,false)->'vehicles')<>1 THEN
      RAISE EXCEPTION 'That vehicle is no longer available'; END IF;
    SELECT p.dealer_id,r.title INTO dealer,subject FROM public.dealer_inventory_records r
      JOIN public.dealer_feed_publications p ON p.source_id=r.source_id
      WHERE r.id=_record_id AND p.inbox_enabled AND p.enabled AND p.revoked_at IS NULL;
    IF _dealer_id IS NOT NULL AND _dealer_id IS DISTINCT FROM dealer THEN RAISE EXCEPTION 'Wrong dealership'; END IF;
  ELSE
    SELECT d.id,d.display_name||' inquiry' INTO dealer,subject FROM public.dealer_profiles d
      WHERE d.id=_dealer_id AND d.status='ready' AND
        (d.agreements_accepted_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.dealer_feed_publications p
          JOIN public.dealer_inventory_sources s ON s.id=p.source_id
          WHERE p.dealer_id=d.id AND p.inbox_enabled AND p.enabled AND p.revoked_at IS NULL AND s.status IN ('active','error')));
  END IF;
  SELECT owner_user_id INTO seller FROM public.dealer_profiles WHERE id=dealer AND status='ready' FOR SHARE;
  IF seller IS NULL THEN RAISE EXCEPTION 'The dealership inbox is not available'; END IF;
  IF seller=buyer THEN RAISE EXCEPTION 'You cannot message yourself'; END IF;
  IF EXISTS(SELECT 1 FROM public.account_contact_preferences WHERE user_id=seller AND NOT allow_internal_messages) THEN
    RAISE EXCEPTION 'The dealership is not accepting Bluebird messages'; END IF;
  IF EXISTS(SELECT 1 FROM public.conversations c JOIN public.conversation_participants p ON p.conversation_id=c.id
    WHERE c.buyer_id=buyer AND c.seller_id=seller AND p.blocked_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Messaging is unavailable for this conversation'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('dealer-message:'||buyer::text,0));
  IF (SELECT count(*) FROM public.rate_limit_events WHERE user_id=buyer AND action='conversation_start'
    AND created_at>now()-interval '1 hour')>=20 THEN RAISE EXCEPTION 'You have reached the conversation limit. Try again later.'; END IF;
  IF _record_id IS NULL THEN
    INSERT INTO public.conversations(dealer_id,buyer_id,seller_id,dealer_context_title)
      VALUES(dealer,buyer,seller,subject)
      ON CONFLICT(dealer_id,buyer_id,seller_id) WHERE dealer_id IS NOT NULL AND dealer_inventory_record_id IS NULL AND listing_id IS NULL
      DO UPDATE SET last_message_at=now(),closed_at=NULL RETURNING id INTO thread;
  ELSE
    INSERT INTO public.conversations(dealer_id,dealer_inventory_record_id,buyer_id,seller_id,dealer_context_title)
      VALUES(dealer,_record_id,buyer,seller,subject)
      ON CONFLICT(dealer_inventory_record_id,buyer_id,seller_id) WHERE dealer_inventory_record_id IS NOT NULL
      DO UPDATE SET last_message_at=now(),closed_at=NULL RETURNING id INTO thread;
  END IF;
  INSERT INTO public.conversation_participants(conversation_id,user_id,role)
    VALUES(thread,buyer,'buyer'),(thread,seller,'seller') ON CONFLICT DO NOTHING;
  INSERT INTO public.conversation_messages(conversation_id,sender_id,body) VALUES(thread,buyer,clean);
  INSERT INTO public.rate_limit_events(user_id,action) VALUES(buyer,'conversation_start');
  INSERT INTO public.notifications(user_id,kind,title,body,entity_type,entity_id,destination_url)
    VALUES(seller,'message','New dealership message',left(subject||': '||clean,280),'conversation',thread,
      '/account?section=messages&conversation='||thread);
  RETURN thread;
END $$;
REVOKE ALL ON FUNCTION public.start_dealer_conversation(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_dealer_conversation(uuid,uuid,text) TO authenticated;

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
    WHERE (_record_id IS NULL OR r.id=_record_id) AND r.price_cents>0
      AND (r.inventory_status='active' OR
        (r.inventory_status='stale' AND r.missed_run_count<p.deactivation_grace_runs))
      AND r.last_seen_at>now()-interval '72 hours'
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


NOTIFY pgrst,'reload schema';

COMMIT;
