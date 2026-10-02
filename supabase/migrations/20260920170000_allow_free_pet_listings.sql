-- Pets, wanted/ISO, and lost/found listings may be free. Keep a non-zero
-- minimum for every other marketplace category and route free pets through
-- dedicated wrappers so the existing listing validation remains unchanged.

ALTER TABLE public.asks DROP CONSTRAINT IF EXISTS asks_price_cents_check;
ALTER TABLE public.asks
  ADD CONSTRAINT asks_price_cents_check CHECK (price_cents BETWEEN 0 AND 1000000000);

CREATE OR REPLACE FUNCTION public.create_free_pet_listing(
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
  _vehicle jsonb,
  _home jsonb,
  _job jsonb,
  _service jsonb,
  _pet jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  category_slug text;
  listing_id uuid;
BEGIN
  SELECT slug INTO category_slug
  FROM public.categories
  WHERE id = _category_id;

  IF category_slug IS DISTINCT FROM 'pets' OR _price_cents <> 0 THEN
    RAISE EXCEPTION 'Only free pet listings may use this function';
  END IF;

  -- The established pet-aware wrapper requires the legacy minimum. Create
  -- the complete listing at that temporary value, then normalize every
  -- public price field to zero before returning it.
  listing_id := public.create_classified_listing(
    _title, _description, _category_id, 100, _item_condition, _seller_note,
    _region, _city, _state, _postal_code, _fulfillment_mode,
    _parcel_length_in, _parcel_width_in, _parcel_height_in, _parcel_weight_lb,
    _evidence_paths, _public_media_paths, _vehicle, _home, _job, _service, _pet
  );

  UPDATE public.asks
  SET price_cents = 0
  WHERE id = listing_id;

  UPDATE public.products
  SET retail_price_cents = 0
  WHERE id = (SELECT product_id FROM public.asks WHERE id = listing_id);

  UPDATE public.ask_events
  SET price_cents = 0
  WHERE id = (
    SELECT id
    FROM public.ask_events
    WHERE ask_id = listing_id
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  );

  RETURN listing_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_free_pet_listing(
  text, text, uuid, integer, public.item_condition, text, text, text, text, text,
  text, numeric, numeric, numeric, numeric, text[], text[], jsonb, jsonb, jsonb,
  jsonb, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_free_pet_listing(
  text, text, uuid, integer, public.item_condition, text, text, text, text, text,
  text, numeric, numeric, numeric, numeric, text[], text[], jsonb, jsonb, jsonb,
  jsonb, jsonb
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_free_pet_listing(
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
  _vehicle jsonb,
  _home jsonb,
  _job jsonb,
  _service jsonb,
  _pet jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  product_id uuid;
BEGIN
  IF _price_cents <> 0 OR _category_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.categories WHERE id = _category_id AND slug = 'pets'
  ) THEN
    RAISE EXCEPTION 'Only free pet listings may use this function';
  END IF;

  SELECT a.product_id INTO product_id
  FROM public.asks a
  JOIN public.products p ON p.id = a.product_id
  JOIN public.categories c ON c.id = p.category_id
  WHERE a.id = _listing_id
    AND a.seller_id = auth.uid()
    AND c.slug = 'pets';

  IF product_id IS NULL THEN
    RAISE EXCEPTION 'Pet listing not found';
  END IF;

  PERFORM public.update_classified_listing(
    _listing_id, _title, _description, _category_id, 100, _item_condition,
    _seller_note, _region, _city, _state, _postal_code, _fulfillment_mode,
    _parcel_length_in, _parcel_width_in, _parcel_height_in, _parcel_weight_lb,
    _vehicle, _home, _job, _service, _pet
  );

  UPDATE public.asks
  SET price_cents = 0
  WHERE id = _listing_id;

  UPDATE public.products
  SET retail_price_cents = 0
  WHERE id = product_id;

  UPDATE public.ask_events
  SET price_cents = 0
  WHERE id = (
    SELECT id
    FROM public.ask_events
    WHERE ask_id = _listing_id
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_free_pet_listing(
  uuid, text, text, uuid, integer, public.item_condition, text, text, text, text,
  text, text, numeric, numeric, numeric, numeric, jsonb, jsonb, jsonb, jsonb, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_free_pet_listing(
  uuid, text, text, uuid, integer, public.item_condition, text, text, text, text,
  text, text, numeric, numeric, numeric, numeric, jsonb, jsonb, jsonb, jsonb, jsonb
) TO authenticated, service_role;
