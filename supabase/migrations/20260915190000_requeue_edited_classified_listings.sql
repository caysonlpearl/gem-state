-- Editing a live classified changes the content buyers rely on. Return it to
-- the same moderation state used for a newly submitted listing.
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
  IF _price_cents < 100 OR _price_cents > 50000000 THEN
    RAISE EXCEPTION 'Enter a listing price between $1 and $500,000';
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

REVOKE ALL ON FUNCTION public.update_classified_listing(uuid, text, text, uuid, integer, public.item_condition, text, text, text, text, text, text, numeric, numeric, numeric, numeric, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_classified_listing(uuid, text, text, uuid, integer, public.item_condition, text, text, text, text, text, text, numeric, numeric, numeric, numeric, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_classified_listing(uuid, text, text, uuid, integer, public.item_condition, text, text, text, text, text, text, numeric, numeric, numeric, numeric, jsonb) TO service_role;
