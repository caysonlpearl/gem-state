-- The $500,000 price cap was sized for general classifieds items. Idaho
-- home listings routinely exceed that (the Homes category this session
-- added real creation for), so it silently rejected valid home sale
-- prices. Raise it to $10,000,000 everywhere it's enforced.

ALTER TABLE public.asks DROP CONSTRAINT asks_price_cents_check;
ALTER TABLE public.asks ADD CONSTRAINT asks_price_cents_check CHECK (price_cents BETWEEN 100 AND 1000000000);

CREATE OR REPLACE FUNCTION public.create_classified_listing(
  _title text,
  _description text,
  _category_id uuid,
  _price_cents integer,
  _item_condition public.item_condition,
  _seller_note text,
  _region text,
  _city text,
  _postal_code text,
  _fulfillment_mode text,
  _parcel_length_in numeric,
  _parcel_width_in numeric,
  _parcel_height_in numeric,
  _parcel_weight_lb numeric,
  _evidence_paths text[],
  _public_media_paths text[],
  _vehicle jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  product_id uuid;
  variant_id uuid;
  listing_id uuid;
  media_path text;
  media_position integer := 0;
  listing_slug text;
  seller record;
  vehicle_year_value smallint;
  vehicle_mileage_value integer;
  vin_value text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;

  SELECT * INTO seller FROM public.seller_profiles WHERE user_id = uid;
  IF seller.user_id IS NULL OR seller.status <> 'active' OR seller.terms_accepted_at IS NULL
     OR seller.default_shipping_method IS NULL OR seller.default_handling_days IS NULL THEN
    RAISE EXCEPTION 'Complete seller setup before listing';
  END IF;

  IF char_length(btrim(coalesce(_title, ''))) NOT BETWEEN 3 AND 120 THEN
    RAISE EXCEPTION 'Enter a title between 3 and 120 characters';
  END IF;
  IF char_length(btrim(coalesce(_description, ''))) NOT BETWEEN 20 AND 5000 THEN
    RAISE EXCEPTION 'Enter a description between 20 and 5000 characters';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.categories WHERE id = _category_id) THEN
    RAISE EXCEPTION 'Choose a valid category';
  END IF;
  IF _price_cents < 100 OR _price_cents > 1000000000 THEN
    RAISE EXCEPTION 'Enter a listing price between $1 and $10,000,000';
  END IF;
  IF char_length(btrim(coalesce(_region, ''))) NOT BETWEEN 2 AND 80
     OR char_length(btrim(coalesce(_city, ''))) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Enter a valid Idaho region and city';
  END IF;
  IF _postal_code IS NOT NULL AND _postal_code !~ '^[0-9]{5}$' THEN
    RAISE EXCEPTION 'Enter a five-digit ZIP code';
  END IF;
  IF _fulfillment_mode NOT IN ('local_pickup', 'shipping', 'both') THEN
    RAISE EXCEPTION 'Choose local pickup, shipping, or both';
  END IF;
  IF coalesce(cardinality(_evidence_paths), 0) NOT BETWEEN 1 AND 8
     OR coalesce(cardinality(_public_media_paths), 0) NOT BETWEEN 1 AND 8 THEN
    RAISE EXCEPTION 'Add between 1 and 8 exact-item photos';
  END IF;

  FOREACH media_path IN ARRAY _evidence_paths LOOP
    IF split_part(media_path, '/', 1) <> uid::text THEN
      RAISE EXCEPTION 'Evidence photo path does not belong to the caller';
    END IF;
  END LOOP;
  FOREACH media_path IN ARRAY _public_media_paths LOOP
    IF split_part(media_path, '/', 1) <> uid::text THEN
      RAISE EXCEPTION 'Listing photo path does not belong to the caller';
    END IF;
  END LOOP;

  BEGIN
    vehicle_year_value := nullif(_vehicle->>'year', '')::smallint;
    vehicle_mileage_value := nullif(_vehicle->>'mileage', '')::integer;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Vehicle year and mileage must be valid numbers';
  END;

  vin_value := upper(nullif(btrim(_vehicle->>'vin'), ''));
  IF vehicle_year_value IS NOT NULL AND vehicle_year_value NOT BETWEEN 1900 AND 2100 THEN
    RAISE EXCEPTION 'Vehicle year is outside the supported range';
  END IF;
  IF vehicle_mileage_value IS NOT NULL AND vehicle_mileage_value NOT BETWEEN 0 AND 2000000 THEN
    RAISE EXCEPTION 'Vehicle mileage is outside the supported range';
  END IF;
  IF vin_value IS NOT NULL AND vin_value !~ '^[A-HJ-NPR-Z0-9]{17}$' THEN
    RAISE EXCEPTION 'VIN must contain 17 valid characters';
  END IF;

  listing_slug := regexp_replace(lower(btrim(_title)), '[^a-z0-9]+', '-', 'g');
  listing_slug := trim(both '-' from listing_slug) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);

  PERFORM set_config('parkvault.trusted_operation', 'on', true);

  INSERT INTO public.products (
    slug, name, category_id, description, retail_price_cents,
    retail_price_currency, status, is_demo, created_by
  ) VALUES (
    listing_slug, btrim(_title), _category_id, btrim(_description), _price_cents,
    'USD', 'pending_review', false, uid
  ) RETURNING id INTO product_id;

  INSERT INTO public.product_variants (product_id, sku_label, position, active)
  VALUES (product_id, 'Classified item', 0, true)
  RETURNING id INTO variant_id;

  INSERT INTO public.asks (
    product_id, variant_id, seller_id, price_cents, currency, item_condition,
    in_hand, seller_note, is_demo, expires_at,
    parcel_length_in, parcel_width_in, parcel_height_in, parcel_weight_lb, ship_by_days
  ) VALUES (
    product_id, variant_id, uid, _price_cents, 'USD', _item_condition,
    true, nullif(btrim(coalesce(_seller_note, '')), ''), false, now() + interval '90 days',
    _parcel_length_in, _parcel_width_in, _parcel_height_in, _parcel_weight_lb,
    seller.default_handling_days
  ) RETURNING id INTO listing_id;

  media_position := 0;
  FOREACH media_path IN ARRAY _evidence_paths LOOP
    INSERT INTO public.ask_media (ask_id, storage_path, position)
    VALUES (listing_id, media_path, media_position);
    media_position := media_position + 1;
  END LOOP;

  media_position := 0;
  FOREACH media_path IN ARRAY _public_media_paths LOOP
    INSERT INTO public.listing_media (ask_id, storage_path, alt_text, position, rights_attested_at)
    VALUES (listing_id, media_path, btrim(_title), media_position, now());
    media_position := media_position + 1;
  END LOOP;

  INSERT INTO public.classified_listing_details (
    listing_id, region, city, postal_code, fulfillment_mode,
    vehicle_make, vehicle_model, vehicle_year, vehicle_trim, vehicle_mileage,
    vehicle_body_style, vehicle_transmission, vehicle_drivetrain, vehicle_fuel_type,
    vehicle_exterior_color, vehicle_title_status, vin
  ) VALUES (
    listing_id, btrim(_region), btrim(_city), nullif(btrim(coalesce(_postal_code, '')), ''), _fulfillment_mode,
    nullif(btrim(_vehicle->>'make'), ''), nullif(btrim(_vehicle->>'model'), ''), vehicle_year_value,
    nullif(btrim(_vehicle->>'trim'), ''), vehicle_mileage_value,
    nullif(btrim(_vehicle->>'body_style'), ''), nullif(btrim(_vehicle->>'transmission'), ''),
    nullif(btrim(_vehicle->>'drivetrain'), ''), nullif(btrim(_vehicle->>'fuel_type'), ''),
    nullif(btrim(_vehicle->>'exterior_color'), ''), nullif(btrim(_vehicle->>'title_status'), ''), vin_value
  );

  INSERT INTO public.ask_events (ask_id, actor_id, event_type, to_status, price_cents, note)
  VALUES (listing_id, uid, 'created', 'active', _price_cents, 'Classified listing submitted for review');

  PERFORM set_config('parkvault.trusted_operation', 'off', true);
  RETURN listing_id;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('parkvault.trusted_operation', 'off', true);
  RAISE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_classified_listing(
  _listing_id uuid,
  _title text,
  _description text,
  _category_id uuid,
  _price_cents integer,
  _item_condition public.item_condition,
  _seller_note text,
  _region text,
  _city text,
  _state text,
  _postal_code text,
  _fulfillment_mode text,
  _parcel_length_in numeric,
  _parcel_width_in numeric,
  _parcel_height_in numeric,
  _parcel_weight_lb numeric,
  _vehicle jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  product_id uuid;
  normalized_state text := upper(btrim(coalesce(_state, '')));
  vehicle_year_value smallint;
  vehicle_mileage_value integer;
  vin_value text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  SELECT a.product_id INTO product_id
  FROM public.asks a
  WHERE a.id = _listing_id AND a.seller_id = uid;
  IF product_id IS NULL THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.asks WHERE id = _listing_id AND status = 'active') THEN
    RAISE EXCEPTION 'Only open listings can be edited';
  END IF;
  IF char_length(btrim(coalesce(_title, ''))) NOT BETWEEN 3 AND 120 THEN
    RAISE EXCEPTION 'Enter a title between 3 and 120 characters';
  END IF;
  IF char_length(btrim(coalesce(_description, ''))) NOT BETWEEN 20 AND 5000 THEN
    RAISE EXCEPTION 'Enter a description between 20 and 5000 characters';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.categories WHERE id = _category_id) THEN
    RAISE EXCEPTION 'Choose a valid category';
  END IF;
  IF _price_cents < 100 OR _price_cents > 1000000000 THEN
    RAISE EXCEPTION 'Enter a listing price between $1 and $10,000,000';
  END IF;
  IF char_length(btrim(coalesce(_region, ''))) NOT BETWEEN 2 AND 80
     OR char_length(btrim(coalesce(_city, ''))) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Enter a valid region and city';
  END IF;
  IF normalized_state !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'Enter a valid two-letter state code';
  END IF;
  IF _postal_code IS NOT NULL AND _postal_code !~ '^[0-9]{5}$' THEN
    RAISE EXCEPTION 'Enter a five-digit ZIP code';
  END IF;
  IF _fulfillment_mode NOT IN ('local_pickup', 'shipping', 'both') THEN
    RAISE EXCEPTION 'Choose local pickup, shipping, or both';
  END IF;

  BEGIN
    vehicle_year_value := nullif(_vehicle->>'year', '')::smallint;
    vehicle_mileage_value := nullif(_vehicle->>'mileage', '')::integer;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Vehicle year and mileage must be valid numbers';
  END;
  vin_value := upper(nullif(btrim(_vehicle->>'vin'), ''));
  IF vehicle_year_value IS NOT NULL AND vehicle_year_value NOT BETWEEN 1900 AND 2100 THEN
    RAISE EXCEPTION 'Vehicle year is outside the supported range';
  END IF;
  IF vehicle_mileage_value IS NOT NULL AND vehicle_mileage_value NOT BETWEEN 0 AND 2000000 THEN
    RAISE EXCEPTION 'Vehicle mileage is outside the supported range';
  END IF;
  IF vin_value IS NOT NULL AND vin_value !~ '^[A-HJ-NPR-Z0-9]{17}$' THEN
    RAISE EXCEPTION 'VIN must contain 17 valid characters';
  END IF;

  PERFORM public.update_ask(
    _listing_id,
    _price_cents,
    _item_condition,
    _seller_note,
    _parcel_length_in,
    _parcel_width_in,
    _parcel_height_in,
    _parcel_weight_lb
  );
  UPDATE public.products
  SET name = btrim(_title), description = btrim(_description), category_id = _category_id,
      status = 'pending_review'::public.product_status
  WHERE id = product_id AND created_by = uid;
  UPDATE public.classified_listing_details
  SET region = btrim(_region), city = btrim(_city), state = normalized_state,
      postal_code = nullif(btrim(coalesce(_postal_code, '')), ''), fulfillment_mode = _fulfillment_mode,
      vehicle_make = nullif(btrim(_vehicle->>'make'), ''), vehicle_model = nullif(btrim(_vehicle->>'model'), ''),
      vehicle_year = vehicle_year_value, vehicle_trim = nullif(btrim(_vehicle->>'trim'), ''),
      vehicle_mileage = vehicle_mileage_value, vehicle_body_style = nullif(btrim(_vehicle->>'body_style'), ''),
      vehicle_transmission = nullif(btrim(_vehicle->>'transmission'), ''),
      vehicle_drivetrain = nullif(btrim(_vehicle->>'drivetrain'), ''),
      vehicle_fuel_type = nullif(btrim(_vehicle->>'fuel_type'), ''),
      vehicle_exterior_color = nullif(btrim(_vehicle->>'exterior_color'), ''),
      vehicle_title_status = nullif(btrim(_vehicle->>'title_status'), ''), vin = vin_value
  WHERE listing_id = _listing_id;
  UPDATE public.asks
  SET approved_at = NULL, updated_at = now()
  WHERE id = _listing_id AND seller_id = uid;
END;
$function$;
