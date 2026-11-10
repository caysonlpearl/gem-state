-- Publication permission is recorded separately from a dealer account's terms.
-- Authorized syndicated inventory never impersonates a member seller.
CREATE TABLE public.dealer_feed_publications (
  source_id uuid PRIMARY KEY REFERENCES public.dealer_inventory_sources(id),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 2 AND 120),
  website text NOT NULL CHECK (website ~ '^https://[a-zA-Z0-9.-]+$'),
  phone text,
  address_line1 text,
  city text NOT NULL,
  state text NOT NULL CHECK (state ~ '^[A-Z]{2}$'),
  postal_code text,
  authorized_by uuid NOT NULL REFERENCES auth.users(id),
  authorized_at timestamptz NOT NULL DEFAULT now(),
  authorization_reference text NOT NULL CHECK (length(btrim(authorization_reference)) > 10),
  enabled boolean NOT NULL DEFAULT false,
  revoked_at timestamptz
);
ALTER TABLE public.dealer_feed_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dealer_feed_publications FROM anon, authenticated;
GRANT ALL ON public.dealer_feed_publications TO service_role;

CREATE FUNCTION public.read_published_dealer_inventory(
  _record_id uuid DEFAULT NULL, _dealer_slug text DEFAULT NULL, _full_photos boolean DEFAULT false
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH dealers AS (
    SELECT p.source_id, p.slug, p.display_name, p.website, p.phone, p.address_line1,
      p.city, p.state, p.postal_code, s.deactivation_grace_runs
    FROM public.dealer_feed_publications p
    JOIN public.dealer_inventory_sources s ON s.id = p.source_id
    WHERE p.enabled AND p.revoked_at IS NULL AND s.status IN ('active','error')
      AND (_dealer_slug IS NULL OR p.slug = _dealer_slug)
      AND (_record_id IS NULL OR EXISTS (
        SELECT 1 FROM public.dealer_inventory_records r WHERE r.source_id=p.source_id AND r.id=_record_id))
  ), vehicles AS (
    SELECT jsonb_build_object(
      'id',r.id,'dealer_slug',p.slug,'title',r.title,'description',r.description,
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

-- Extend the existing partner save/report/view paths without changing their RLS.
ALTER TABLE public.saved_partner_vehicles DROP CONSTRAINT saved_partner_vehicles_listing_id_check;
ALTER TABLE public.saved_partner_vehicles ADD CONSTRAINT saved_partner_vehicles_listing_id_check
  CHECK (listing_id ~ '^(marketcheck-(dealer|fsbo)-[A-Za-z0-9._:-]{1,160}|dealerfeed-[0-9a-f-]{36})$');
ALTER TABLE public.partner_vehicle_reports DROP CONSTRAINT partner_vehicle_reports_listing_id_check;
ALTER TABLE public.partner_vehicle_reports ADD CONSTRAINT partner_vehicle_reports_listing_id_check
  CHECK (listing_id ~ '^(marketcheck-(dealer|fsbo)-[A-Za-z0-9._:-]{1,160}|dealerfeed-[0-9a-f-]{36})$');
ALTER TABLE public.listing_view_counts DROP CONSTRAINT listing_view_counts_listing_id_check;
ALTER TABLE public.listing_view_counts ADD CONSTRAINT listing_view_counts_listing_id_check
  CHECK (listing_id ~ '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|adzuna-[0-9]{1,20}|mashvisor-[0-9]{1,15}|openwebninja-[0-9]{1,20}|fsq-[A-Za-z0-9._:-]{1,160}|marketcheck-(dealer|fsbo)-[A-Za-z0-9._:-]{1,160}|rescuegroups-[0-9]{1,20}|avantlink-[0-9]{1,20}|dealerfeed-[0-9a-f-]{36})$');
