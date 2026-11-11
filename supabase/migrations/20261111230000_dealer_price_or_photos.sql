-- Authorized dealer vehicles need an advertised price or a safe public photo.
-- Preserve permission, moderation, availability, freshness and inbox checks.
BEGIN;
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


-- Earlier Motive/Overfuel adapters marked otherwise valid unpriced rows invalid.
-- Repair only current, successfully imported rows from these known adapters.
-- Never revive stale, explicitly unavailable or malformed-price records.
UPDATE public.dealer_inventory_records r
SET inventory_status='active'
FROM public.dealer_inventory_sources s, public.dealer_inventory_sync_runs run
WHERE r.source_id=s.id AND r.last_seen_run_id=run.id AND run.source_id=s.id
  AND run.status='completed' AND r.inventory_status='invalid'
  AND r.price_cents IS NULL AND r.missed_run_count=0
  AND r.last_seen_at>now()-interval '72 hours'
  AND s.mapping_profile->>'__provider' IN ('motive','overfuel')
  AND coalesce(s.mapping_profile->>'status','Status') IN ('Status','status')
  AND btrim(coalesce(r.raw_record->>'Status',r.raw_record->>'status',''))=''
  AND btrim(coalesce(r.raw_record->>'Price',r.raw_record->>'price','')) ~ '^(0(\.0+)?)?$';

NOTIFY pgrst,'reload schema';
COMMIT;
