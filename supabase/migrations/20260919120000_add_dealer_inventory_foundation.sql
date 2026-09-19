CREATE TABLE public.dealer_inventory_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  provider_name text,
  source_type text NOT NULL DEFAULT 'manual_upload'
    CHECK (source_type IN ('manual_upload', 'file_url', 'sftp', 'api', 'webhook')),
  file_format text NOT NULL DEFAULT 'csv'
    CHECK (file_format IN ('csv', 'xml', 'json')),
  feed_url text,
  schedule text,
  mapping_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  minimum_row_count integer NOT NULL DEFAULT 1 CHECK (minimum_row_count > 0),
  deactivation_grace_runs integer NOT NULL DEFAULT 2 CHECK (deactivation_grace_runs >= 1),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'error')),
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.dealer_inventory_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.dealer_inventory_sources(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('dry_run', 'apply')),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'rejected')),
  source_filename text,
  source_checksum text,
  raw_payload text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  received_row_count integer NOT NULL DEFAULT 0 CHECK (received_row_count >= 0),
  valid_row_count integer NOT NULL DEFAULT 0 CHECK (valid_row_count >= 0),
  invalid_row_count integer NOT NULL DEFAULT 0 CHECK (invalid_row_count >= 0),
  created_count integer NOT NULL DEFAULT 0 CHECK (created_count >= 0),
  updated_count integer NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
  unchanged_count integer NOT NULL DEFAULT 0 CHECK (unchanged_count >= 0),
  stale_count integer NOT NULL DEFAULT 0 CHECK (stale_count >= 0),
  error_summary jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE public.dealer_inventory_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.dealer_inventory_sources(id) ON DELETE CASCADE,
  source_record_key text NOT NULL CHECK (char_length(btrim(source_record_key)) BETWEEN 1 AND 200),
  stock_number text,
  vin text,
  title text NOT NULL,
  description text,
  price_cents integer,
  city text NOT NULL,
  state text NOT NULL CHECK (state ~ '^[A-Z]{2}$'),
  postal_code text,
  inventory_status text NOT NULL DEFAULT 'active'
    CHECK (inventory_status IN ('active', 'sold', 'pending', 'reserved', 'removed', 'stale', 'invalid')),
  vehicle_make text,
  vehicle_model text,
  vehicle_year smallint,
  vehicle_trim text,
  vehicle_mileage integer,
  vehicle_body_style text,
  vehicle_transmission text,
  vehicle_drivetrain text,
  vehicle_fuel_type text,
  vehicle_exterior_color text,
  vehicle_title_status text,
  source_updated_at timestamptz,
  content_hash text NOT NULL,
  raw_record jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_run_id uuid REFERENCES public.dealer_inventory_sync_runs(id) ON DELETE SET NULL,
  missed_run_count integer NOT NULL DEFAULT 0 CHECK (missed_run_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, source_record_key),
  CONSTRAINT dealer_inventory_records_vin_format
    CHECK (vin IS NULL OR vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  CONSTRAINT dealer_inventory_records_year_range
    CHECK (vehicle_year IS NULL OR vehicle_year BETWEEN 1900 AND 2100),
  CONSTRAINT dealer_inventory_records_mileage_range
    CHECK (vehicle_mileage IS NULL OR vehicle_mileage BETWEEN 0 AND 2000000),
  CONSTRAINT dealer_inventory_records_postal_code
    CHECK (postal_code IS NULL OR postal_code ~ '^[0-9]{5}$')
);

CREATE TABLE public.dealer_inventory_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES public.dealer_inventory_records(id) ON DELETE CASCADE,
  media_url text NOT NULL,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  alt_text text,
  content_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (record_id, media_url)
);

CREATE TABLE public.dealer_inventory_listing_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL UNIQUE REFERENCES public.dealer_inventory_records(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.asks(id) ON DELETE CASCADE,
  link_type text NOT NULL DEFAULT 'imported'
    CHECK (link_type IN ('imported', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX dealer_inventory_sources_owner_idx
  ON public.dealer_inventory_sources (owner_user_id, status);
CREATE INDEX dealer_inventory_sync_runs_source_started_idx
  ON public.dealer_inventory_sync_runs (source_id, started_at DESC);
CREATE INDEX dealer_inventory_records_source_status_idx
  ON public.dealer_inventory_records (source_id, inventory_status);
CREATE INDEX dealer_inventory_records_source_vin_idx
  ON public.dealer_inventory_records (source_id, vin);
CREATE INDEX dealer_inventory_records_source_stock_idx
  ON public.dealer_inventory_records (source_id, stock_number);
CREATE INDEX dealer_inventory_records_make_model_idx
  ON public.dealer_inventory_records (vehicle_make, vehicle_model);

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
  IF NOT EXISTS (
    SELECT 1 FROM public.dealer_inventory_sources
    WHERE id = _source_id AND status IN ('active', 'error')
  ) THEN
    RAISE EXCEPTION 'Inventory source is not active';
  END IF;

  IF jsonb_typeof(_records) <> 'array' OR jsonb_array_length(_records) = 0 THEN
    RAISE EXCEPTION 'A non-empty inventory snapshot is required';
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

    DELETE FROM public.dealer_inventory_media WHERE dealer_inventory_media.record_id = current_record_id;
    FOR media_json IN SELECT value FROM jsonb_array_elements(COALESCE(record_json->'media', '[]'::jsonb)) LOOP
      INSERT INTO public.dealer_inventory_media (
        record_id, media_url, position, alt_text, content_hash
      ) VALUES (
        current_record_id,
        media_json->>'media_url',
        COALESCE(NULLIF(media_json->>'position', '')::integer, 0),
        NULLIF(media_json->>'alt_text', ''),
        media_json->>'content_hash'
      );
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

CREATE OR REPLACE FUNCTION public.touch_dealer_inventory_source(_source_id uuid, _ok boolean, _error text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.dealer_inventory_sources
  SET status = CASE WHEN _ok THEN 'active' ELSE 'error' END,
      last_success_at = CASE WHEN _ok THEN now() ELSE last_success_at END,
      last_error_at = CASE WHEN _ok THEN last_error_at ELSE now() END,
      last_error = CASE WHEN _ok THEN NULL ELSE _error END,
      updated_at = now()
  WHERE id = _source_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.touch_dealer_inventory_source(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_dealer_inventory_source(uuid, boolean, text) TO service_role;

ALTER TABLE public.dealer_inventory_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dealer_inventory_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dealer_inventory_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dealer_inventory_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dealer_inventory_listing_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage dealership inventory sources"
ON public.dealer_inventory_sources FOR ALL TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Owners read dealership inventory sources"
ON public.dealer_inventory_sources FOR SELECT TO authenticated
USING (owner_user_id = auth.uid());

CREATE POLICY "Staff manage dealership inventory sync runs"
ON public.dealer_inventory_sync_runs FOR ALL TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Owners read dealership inventory sync runs"
ON public.dealer_inventory_sync_runs FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.dealer_inventory_sources source
  WHERE source.id = dealer_inventory_sync_runs.source_id
    AND source.owner_user_id = auth.uid()
));

CREATE POLICY "Staff manage dealership inventory records"
ON public.dealer_inventory_records FOR ALL TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Owners read dealership inventory records"
ON public.dealer_inventory_records FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.dealer_inventory_sources source
  WHERE source.id = dealer_inventory_records.source_id
    AND source.owner_user_id = auth.uid()
));

CREATE POLICY "Staff manage dealership inventory media"
ON public.dealer_inventory_media FOR ALL TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Owners read dealership inventory media"
ON public.dealer_inventory_media FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1
  FROM public.dealer_inventory_records record
  JOIN public.dealer_inventory_sources source ON source.id = record.source_id
  WHERE record.id = dealer_inventory_media.record_id
    AND source.owner_user_id = auth.uid()
));

CREATE POLICY "Staff manage dealership inventory listing links"
ON public.dealer_inventory_listing_links FOR ALL TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Owners read dealership inventory listing links"
ON public.dealer_inventory_listing_links FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1
  FROM public.dealer_inventory_records record
  JOIN public.dealer_inventory_sources source ON source.id = record.source_id
  WHERE record.id = dealer_inventory_listing_links.record_id
    AND source.owner_user_id = auth.uid()
));

CREATE TRIGGER dealer_inventory_sources_touch
BEFORE UPDATE ON public.dealer_inventory_sources
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER dealer_inventory_listing_links_touch
BEFORE UPDATE ON public.dealer_inventory_listing_links
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT ON public.dealer_inventory_sources,
  public.dealer_inventory_sync_runs,
  public.dealer_inventory_records,
  public.dealer_inventory_media,
  public.dealer_inventory_listing_links TO authenticated;

GRANT ALL ON public.dealer_inventory_sources,
  public.dealer_inventory_sync_runs,
  public.dealer_inventory_records,
  public.dealer_inventory_media,
  public.dealer_inventory_listing_links TO service_role;
