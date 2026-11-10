-- Serialize scheduled feed deliveries without giving clients scheduler access.
ALTER TABLE public.dealer_inventory_sources
  ADD COLUMN IF NOT EXISTS sync_lease_token uuid,
  ADD COLUMN IF NOT EXISTS sync_lease_until timestamptz;

CREATE OR REPLACE FUNCTION public.claim_dealer_inventory_source(_source_id uuid, _last_success_at timestamptz)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.dealer_inventory_sources
  SET sync_lease_token = gen_random_uuid(), sync_lease_until = now() + interval '10 minutes'
  WHERE id = _source_id AND status IN ('active', 'error')
    AND last_success_at IS NOT DISTINCT FROM _last_success_at
    AND (sync_lease_until IS NULL OR sync_lease_until < now())
  RETURNING sync_lease_token;
$$;
CREATE OR REPLACE FUNCTION public.release_dealer_inventory_source(_source_id uuid, _lease_token uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.dealer_inventory_sources SET sync_lease_token = NULL, sync_lease_until = NULL
  WHERE id = _source_id AND sync_lease_token = _lease_token;
$$;
REVOKE ALL ON FUNCTION public.claim_dealer_inventory_source(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_dealer_inventory_source(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_dealer_inventory_source(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_dealer_inventory_source(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.reconcile_dealer_inventory_records(
  _source_id uuid,
  _run_id uuid,
  _records jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  record_json jsonb;
  existing_record public.dealer_inventory_records%ROWTYPE;
  current_record_id uuid;
  media_json jsonb;
  created_count integer := 0;
  updated_count integer := 0;
  unchanged_count integer := 0;
  stale_count integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(_source_id::text));
  IF NOT EXISTS (SELECT 1 FROM public.dealer_inventory_sync_runs WHERE id = _run_id AND source_id = _source_id AND status = 'running') THEN
    RAISE EXCEPTION 'Inventory run does not belong to this source or is not running';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.dealer_inventory_sources
    WHERE id = _source_id AND status IN ('active', 'error')
  ) THEN
    RAISE EXCEPTION 'Inventory source is not active';
  END IF;

  IF jsonb_typeof(_records) <> 'array' OR jsonb_array_length(_records) = 0 THEN
    RAISE EXCEPTION 'A non-empty inventory snapshot is required';
  END IF;

  IF jsonb_array_length(_records) < (SELECT minimum_row_count FROM public.dealer_inventory_sources WHERE id = _source_id) THEN
    RAISE EXCEPTION 'Inventory snapshot is below the configured minimum';
  END IF;

  UPDATE public.dealer_inventory_records AS existing
  SET inventory_status = CASE
        WHEN existing.inventory_status IN ('sold', 'removed') THEN existing.inventory_status
        ELSE 'stale'
      END,
      missed_run_count = CASE
        WHEN existing.inventory_status IN ('sold', 'removed') THEN existing.missed_run_count
        ELSE existing.missed_run_count + 1
      END,
      updated_at = now()
  WHERE existing.source_id = _source_id
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(_records) AS incoming
      WHERE incoming->>'source_record_key' = existing.source_record_key
        OR (
          existing.vin IS NOT NULL
          AND NULLIF(incoming->>'vin', '') IS NOT NULL
          AND incoming->>'vin' = existing.vin
        )
    );
  GET DIAGNOSTICS stale_count = ROW_COUNT;

  FOR record_json IN SELECT value FROM jsonb_array_elements(_records) LOOP
    existing_record := NULL;
    SELECT * INTO existing_record
    FROM public.dealer_inventory_records
    WHERE source_id = _source_id
      AND (
        source_record_key = record_json->>'source_record_key'
        OR (
          vin IS NOT NULL
          AND NULLIF(record_json->>'vin', '') IS NOT NULL
          AND vin = record_json->>'vin'
        )
      )
    ORDER BY CASE WHEN source_record_key = record_json->>'source_record_key' THEN 0 ELSE 1 END
    LIMIT 1
    FOR UPDATE;

    IF existing_record.id IS NULL THEN
      INSERT INTO public.dealer_inventory_records (
        source_id, source_record_key, stock_number, vin, title, description,
        price_cents, city, state, postal_code, inventory_status, vehicle_make,
        vehicle_model, vehicle_year, vehicle_trim, vehicle_mileage,
        vehicle_body_style, vehicle_transmission, vehicle_drivetrain,
        vehicle_fuel_type, vehicle_exterior_color, vehicle_title_status,
        source_updated_at, content_hash, raw_record, last_seen_run_id
      ) VALUES (
        _source_id,
        record_json->>'source_record_key',
        NULLIF(record_json->>'stock_number', ''),
        NULLIF(record_json->>'vin', ''),
        record_json->>'title',
        NULLIF(record_json->>'description', ''),
        NULLIF(record_json->>'price_cents', '')::integer,
        record_json->>'city',
        record_json->>'state',
        NULLIF(record_json->>'postal_code', ''),
        COALESCE(NULLIF(record_json->>'inventory_status', ''), 'active'),
        NULLIF(record_json->>'vehicle_make', ''),
        NULLIF(record_json->>'vehicle_model', ''),
        NULLIF(record_json->>'vehicle_year', '')::smallint,
        NULLIF(record_json->>'vehicle_trim', ''),
        NULLIF(record_json->>'vehicle_mileage', '')::integer,
        NULLIF(record_json->>'vehicle_body_style', ''),
        NULLIF(record_json->>'vehicle_transmission', ''),
        NULLIF(record_json->>'vehicle_drivetrain', ''),
        NULLIF(record_json->>'vehicle_fuel_type', ''),
        NULLIF(record_json->>'vehicle_exterior_color', ''),
        NULLIF(record_json->>'vehicle_title_status', ''),
        NULLIF(record_json->>'source_updated_at', '')::timestamptz,
        record_json->>'content_hash',
        COALESCE(record_json->'raw_record', '{}'::jsonb),
        _run_id
      ) RETURNING id INTO current_record_id;
      created_count := created_count + 1;
    ELSE
      current_record_id := existing_record.id;
      IF existing_record.content_hash = record_json->>'content_hash' THEN
        unchanged_count := unchanged_count + 1;
      ELSE
        updated_count := updated_count + 1;
      END IF;

      UPDATE public.dealer_inventory_records
      SET source_record_key = record_json->>'source_record_key',
          stock_number = NULLIF(record_json->>'stock_number', ''),
          vin = NULLIF(record_json->>'vin', ''),
          title = record_json->>'title',
          description = NULLIF(record_json->>'description', ''),
          price_cents = NULLIF(record_json->>'price_cents', '')::integer,
          city = record_json->>'city',
          state = record_json->>'state',
          postal_code = NULLIF(record_json->>'postal_code', ''),
          inventory_status = COALESCE(NULLIF(record_json->>'inventory_status', ''), 'active'),
          vehicle_make = NULLIF(record_json->>'vehicle_make', ''),
          vehicle_model = NULLIF(record_json->>'vehicle_model', ''),
          vehicle_year = NULLIF(record_json->>'vehicle_year', '')::smallint,
          vehicle_trim = NULLIF(record_json->>'vehicle_trim', ''),
          vehicle_mileage = NULLIF(record_json->>'vehicle_mileage', '')::integer,
          vehicle_body_style = NULLIF(record_json->>'vehicle_body_style', ''),
          vehicle_transmission = NULLIF(record_json->>'vehicle_transmission', ''),
          vehicle_drivetrain = NULLIF(record_json->>'vehicle_drivetrain', ''),
          vehicle_fuel_type = NULLIF(record_json->>'vehicle_fuel_type', ''),
          vehicle_exterior_color = NULLIF(record_json->>'vehicle_exterior_color', ''),
          vehicle_title_status = NULLIF(record_json->>'vehicle_title_status', ''),
          source_updated_at = NULLIF(record_json->>'source_updated_at', '')::timestamptz,
          content_hash = record_json->>'content_hash',
          raw_record = COALESCE(record_json->'raw_record', '{}'::jsonb),
          last_seen_at = now(),
          last_seen_run_id = _run_id,
          missed_run_count = 0,
          updated_at = now()
      WHERE id = current_record_id;
    END IF;

    -- Preserve media identities and avoid rewriting thousands of unchanged
    -- photo rows on each hourly feed refresh.
    DELETE FROM public.dealer_inventory_media AS old_media
    WHERE old_media.record_id = current_record_id AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(record_json->'media', '[]'::jsonb)) AS image
      WHERE image->>'media_url' = old_media.media_url
    );
    FOR media_json IN SELECT value FROM jsonb_array_elements(COALESCE(record_json->'media', '[]'::jsonb)) LOOP
      INSERT INTO public.dealer_inventory_media AS saved (record_id, media_url, position, alt_text, content_hash)
      VALUES (current_record_id, media_json->>'media_url', (media_json->>'position')::integer,
              media_json->>'alt_text', media_json->>'content_hash')
      ON CONFLICT (record_id, media_url) DO UPDATE
      SET position = EXCLUDED.position, alt_text = EXCLUDED.alt_text,
          content_hash = EXCLUDED.content_hash, active = true, last_seen_at = now()
      WHERE (saved.position, saved.alt_text, saved.content_hash, saved.active)
        IS DISTINCT FROM (EXCLUDED.position, EXCLUDED.alt_text, EXCLUDED.content_hash, true);
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'createdCount', created_count,
    'updatedCount', updated_count,
    'unchangedCount', unchanged_count,
    'staleCount', stale_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.reconcile_dealer_inventory_records(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_dealer_inventory_records(uuid, uuid, jsonb) TO service_role;

-- Keep linked dealer inventory and public listing visibility consistent.
-- Sold/removed records hide linked listings immediately. Stale records hide them
-- after the source-configured grace window. Active records never auto-republish;
-- moderation remains the only path back to public visibility.
CREATE OR REPLACE FUNCTION public.sync_dealer_inventory_listing_visibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  grace_runs integer;
  source_dealer_id uuid;
BEGIN
  SELECT s.deactivation_grace_runs, s.dealer_id
    INTO grace_runs, source_dealer_id
  FROM public.dealer_inventory_sources s
  WHERE s.id = NEW.source_id;

  IF source_dealer_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.inventory_status IN ('sold', 'removed', 'invalid')
     OR (NEW.inventory_status = 'stale' AND NEW.missed_run_count >= COALESCE(grace_runs, 2)) THEN
    UPDATE public.asks AS a
    SET approved_at = NULL, updated_at = now()
    FROM public.dealer_inventory_listing_links AS l
    WHERE l.record_id = NEW.id
      AND a.id = l.listing_id
      AND a.dealer_id = source_dealer_id
      AND a.approved_at IS NOT NULL;

    INSERT INTO public.dealer_audit_events (dealer_id, actor_user_id, action, target_type, target_id, metadata)
    SELECT source_dealer_id, NULL, 'inventory_listing_visibility_sync', 'listing', a.id::text,
      jsonb_build_object('recordId', NEW.id, 'inventoryStatus', NEW.inventory_status,
        'missedRunCount', NEW.missed_run_count, 'graceRuns', COALESCE(grace_runs, 2),
        'publicVisibility', 'hidden_pending_review')
    FROM public.dealer_inventory_listing_links l
    JOIN public.asks a ON a.id = l.listing_id
    WHERE l.record_id = NEW.id AND a.dealer_id = source_dealer_id;
  END IF;
  RETURN NEW;
END;
$$;

