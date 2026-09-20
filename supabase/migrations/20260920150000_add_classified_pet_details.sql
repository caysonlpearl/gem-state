-- Pets are a first-class classified category with structured, searchable facts.
-- The existing listing/details row is retained so pets use the same public
-- listing, moderation, media, saves, messaging, and upgrade infrastructure.

INSERT INTO public.categories (slug, name, position)
VALUES ('pets', 'Pets', 160)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.classified_listing_details
  ADD COLUMN IF NOT EXISTS pet_subcategory text,
  ADD COLUMN IF NOT EXISTS pet_species text,
  ADD COLUMN IF NOT EXISTS pet_breed text,
  ADD COLUMN IF NOT EXISTS pet_name text,
  ADD COLUMN IF NOT EXISTS pet_age text,
  ADD COLUMN IF NOT EXISTS pet_sex text,
  ADD COLUMN IF NOT EXISTS pet_placement_type text,
  ADD COLUMN IF NOT EXISTS pet_offered_by text,
  ADD COLUMN IF NOT EXISTS pet_hypoallergenic text,
  ADD COLUMN IF NOT EXISTS pet_vaccinated text,
  ADD COLUMN IF NOT EXISTS pet_spayed_neutered text,
  ADD COLUMN IF NOT EXISTS pet_microchipped text,
  ADD COLUMN IF NOT EXISTS pet_records_available text,
  ADD COLUMN IF NOT EXISTS pet_good_with_kids text,
  ADD COLUMN IF NOT EXISTS pet_good_with_dogs text,
  ADD COLUMN IF NOT EXISTS pet_good_with_cats text,
  ADD COLUMN IF NOT EXISTS pet_indoor_outdoor text,
  ADD COLUMN IF NOT EXISTS pet_special_needs text,
  ADD COLUMN IF NOT EXISTS pet_breeding_terms text;

ALTER TABLE public.classified_listing_details
  DROP CONSTRAINT IF EXISTS classified_listing_details_pet_placement,
  ADD CONSTRAINT classified_listing_details_pet_placement
    CHECK (pet_placement_type IS NULL OR pet_placement_type IN ('sale', 'adoption', 'rehoming', 'free', 'stud_breeding', 'lost_found', 'wanted')),
  DROP CONSTRAINT IF EXISTS classified_listing_details_pet_sex,
  ADD CONSTRAINT classified_listing_details_pet_sex
    CHECK (pet_sex IS NULL OR pet_sex IN ('Male', 'Female', 'Unknown / not disclosed')),
  DROP CONSTRAINT IF EXISTS classified_listing_details_pet_offered_by,
  ADD CONSTRAINT classified_listing_details_pet_offered_by
    CHECK (pet_offered_by IS NULL OR pet_offered_by IN ('Owner', 'Breeder', 'Rescue', 'Shelter', 'Foster', 'Business'));

CREATE INDEX IF NOT EXISTS classified_listing_details_pet_subcategory_idx
  ON public.classified_listing_details (pet_subcategory);
CREATE INDEX IF NOT EXISTS classified_listing_details_pet_species_breed_idx
  ON public.classified_listing_details (pet_species, pet_breed);
CREATE INDEX IF NOT EXISTS classified_listing_details_pet_placement_idx
  ON public.classified_listing_details (pet_placement_type);
CREATE INDEX IF NOT EXISTS classified_listing_details_pet_offered_by_idx
  ON public.classified_listing_details (pet_offered_by);

CREATE OR REPLACE FUNCTION public._apply_classified_pet_details(
  _listing_id uuid,
  _pet jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  category_slug text;
BEGIN
  SELECT c.slug INTO category_slug
  FROM public.asks a
  JOIN public.products p ON p.id = a.product_id
  JOIN public.categories c ON c.id = p.category_id
  WHERE a.id = _listing_id;

  IF category_slug = 'pets' AND (
    nullif(btrim(_pet->>'subcategory'), '') IS NULL
    OR nullif(btrim(_pet->>'species'), '') IS NULL
    OR nullif(btrim(_pet->>'placementType'), '') IS NULL
    OR nullif(btrim(_pet->>'offeredBy'), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Pet subcategory, species, placement type, and offered by are required';
  END IF;

  UPDATE public.classified_listing_details
  SET
    pet_subcategory = nullif(btrim(_pet->>'subcategory'), ''),
    pet_species = nullif(btrim(_pet->>'species'), ''),
    pet_breed = nullif(btrim(_pet->>'breed'), ''),
    pet_name = nullif(btrim(_pet->>'name'), ''),
    pet_age = nullif(btrim(_pet->>'age'), ''),
    pet_sex = nullif(btrim(_pet->>'sex'), ''),
    pet_placement_type = nullif(btrim(_pet->>'placementType'), ''),
    pet_offered_by = nullif(btrim(_pet->>'offeredBy'), ''),
    pet_hypoallergenic = nullif(btrim(_pet->>'hypoallergenic'), ''),
    pet_vaccinated = nullif(btrim(_pet->>'vaccinated'), ''),
    pet_spayed_neutered = nullif(btrim(_pet->>'spayedNeutered'), ''),
    pet_microchipped = nullif(btrim(_pet->>'microchipped'), ''),
    pet_records_available = nullif(btrim(_pet->>'recordsAvailable'), ''),
    pet_good_with_kids = nullif(btrim(_pet->>'goodWithKids'), ''),
    pet_good_with_dogs = nullif(btrim(_pet->>'goodWithDogs'), ''),
    pet_good_with_cats = nullif(btrim(_pet->>'goodWithCats'), ''),
    pet_indoor_outdoor = nullif(btrim(_pet->>'indoorOutdoor'), ''),
    pet_special_needs = nullif(btrim(_pet->>'specialNeeds'), ''),
    pet_breeding_terms = nullif(btrim(_pet->>'breedingTerms'), '')
  WHERE listing_id = _listing_id;
END;
$function$;

REVOKE ALL ON FUNCTION public._apply_classified_pet_details(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._apply_classified_pet_details(uuid, jsonb) TO service_role;

-- Pet-aware create overload. The existing overload remains available for all
-- non-pet callers and this one delegates to it before applying pet details.
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
  new_listing_id uuid;
BEGIN
  new_listing_id := public.create_classified_listing(
    _title, _description, _category_id, _price_cents, _item_condition, _seller_note,
    _region, _city, _state, _postal_code, _fulfillment_mode,
    _parcel_length_in, _parcel_width_in, _parcel_height_in, _parcel_weight_lb,
    _evidence_paths, _public_media_paths, _vehicle, _home, _job, _service
  );
  PERFORM public._apply_classified_pet_details(new_listing_id, _pet);
  RETURN new_listing_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_classified_listing(text, text, uuid, integer, public.item_condition, text, text, text, text, text, text, numeric, numeric, numeric, numeric, text[], text[], jsonb, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_classified_listing(text, text, uuid, integer, public.item_condition, text, text, text, text, text, text, numeric, numeric, numeric, numeric, text[], text[], jsonb, jsonb, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_classified_listing(text, text, uuid, integer, public.item_condition, text, text, text, text, text, text, numeric, numeric, numeric, numeric, text[], text[], jsonb, jsonb, jsonb, jsonb, jsonb) TO service_role;

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
BEGIN
  PERFORM public.update_classified_listing(
    _listing_id, _title, _description, _category_id, _price_cents, _item_condition, _seller_note,
    _region, _city, _state, _postal_code, _fulfillment_mode,
    _parcel_length_in, _parcel_width_in, _parcel_height_in, _parcel_weight_lb,
    _vehicle, _home, _job, _service
  );
  PERFORM public._apply_classified_pet_details(_listing_id, _pet);
END;
$function$;

REVOKE ALL ON FUNCTION public.update_classified_listing(uuid, text, text, uuid, integer, public.item_condition, text, text, text, text, text, text, numeric, numeric, numeric, numeric, jsonb, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_classified_listing(uuid, text, text, uuid, integer, public.item_condition, text, text, text, text, text, text, numeric, numeric, numeric, numeric, jsonb, jsonb, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_classified_listing(uuid, text, text, uuid, integer, public.item_condition, text, text, text, text, text, text, numeric, numeric, numeric, numeric, jsonb, jsonb, jsonb, jsonb, jsonb) TO service_role;
