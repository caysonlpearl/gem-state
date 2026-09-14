ALTER TABLE public.classified_listing_details
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'ID';

ALTER TABLE public.classified_listing_details
  DROP CONSTRAINT IF EXISTS classified_listing_details_state_code;

ALTER TABLE public.classified_listing_details
  ADD CONSTRAINT classified_listing_details_state_code
  CHECK (state ~ '^[A-Z]{2}$');

CREATE INDEX IF NOT EXISTS classified_listing_details_state_city_idx
  ON public.classified_listing_details (state, city);

CREATE OR REPLACE FUNCTION public.create_classified_listing(
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
  new_listing_id uuid;
  normalized_state text := upper(btrim(coalesce(_state, '')));
BEGIN
  IF normalized_state !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'Enter a valid two-letter state code';
  END IF;

  new_listing_id := public.create_classified_listing(
    _title,
    _description,
    _category_id,
    _price_cents,
    _item_condition,
    _seller_note,
    _region,
    _city,
    _postal_code,
    _fulfillment_mode,
    _parcel_length_in,
    _parcel_width_in,
    _parcel_height_in,
    _parcel_weight_lb,
    _evidence_paths,
    _public_media_paths,
    _vehicle
  );

  UPDATE public.classified_listing_details
  SET state = normalized_state
  WHERE listing_id = new_listing_id;

  RETURN new_listing_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_classified_listing(text, text, uuid, integer, public.item_condition, text, text, text, text, text, text, numeric, numeric, numeric, numeric, text[], text[], jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_classified_listing(text, text, uuid, integer, public.item_condition, text, text, text, text, text, text, numeric, numeric, numeric, numeric, text[], text[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_classified_listing(text, text, uuid, integer, public.item_condition, text, text, text, text, text, text, numeric, numeric, numeric, numeric, text[], text[], jsonb) TO service_role;
