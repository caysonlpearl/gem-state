-- Homes, Jobs, and Services listings previously had no real creation path:
-- only vehicles and generic items could persist category-specific fields.
-- This adds the columns and RPC overloads needed to create/edit them.

-- The categories themselves didn't exist as real rows either (browse/mock
-- code referenced these slugs, but nothing had ever inserted them), so a
-- listing in any of these three categories would fail category lookup
-- before ever reaching create_classified_listing's own validation.
INSERT INTO public.categories (slug, name, position)
VALUES
  ('other-real-estate', 'Homes', 130),
  ('services', 'Services', 140),
  ('jobs', 'Jobs', 150)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.classified_listing_details
  ADD COLUMN IF NOT EXISTS home_mode text,
  ADD COLUMN IF NOT EXISTS home_property_type text,
  ADD COLUMN IF NOT EXISTS home_bedrooms numeric(4,1),
  ADD COLUMN IF NOT EXISTS home_bathrooms numeric(4,1),
  ADD COLUMN IF NOT EXISTS home_square_feet integer,
  ADD COLUMN IF NOT EXISTS home_year_built smallint,
  ADD COLUMN IF NOT EXISTS home_acreage text,
  ADD COLUMN IF NOT EXISTS home_heating text,
  ADD COLUMN IF NOT EXISTS home_cooling text,
  ADD COLUMN IF NOT EXISTS home_garage_parking text,
  ADD COLUMN IF NOT EXISTS home_yard text,
  ADD COLUMN IF NOT EXISTS home_appliances_included text,
  ADD COLUMN IF NOT EXISTS home_floor_coverings text,
  ADD COLUMN IF NOT EXISTS home_basement_type text,
  ADD COLUMN IF NOT EXISTS home_exterior_material text,
  ADD COLUMN IF NOT EXISTS home_special_features text,
  ADD COLUMN IF NOT EXISTS home_hoa_fees text,
  ADD COLUMN IF NOT EXISTS home_school_district text,
  ADD COLUMN IF NOT EXISTS home_lease_length text,
  ADD COLUMN IF NOT EXISTS home_available text,
  ADD COLUMN IF NOT EXISTS home_pets_policy text,
  ADD COLUMN IF NOT EXISTS home_smoking_policy text,
  ADD COLUMN IF NOT EXISTS home_open_house text,
  ADD COLUMN IF NOT EXISTS job_employer_name text,
  ADD COLUMN IF NOT EXISTS job_employer_address text,
  ADD COLUMN IF NOT EXISTS job_pay_type text,
  ADD COLUMN IF NOT EXISTS job_pay_min numeric,
  ADD COLUMN IF NOT EXISTS job_pay_max numeric,
  ADD COLUMN IF NOT EXISTS job_employment_type text,
  ADD COLUMN IF NOT EXISTS job_experience_required text,
  ADD COLUMN IF NOT EXISTS job_education_level text,
  ADD COLUMN IF NOT EXISTS job_responsibilities text[],
  ADD COLUMN IF NOT EXISTS job_qualifications text[],
  ADD COLUMN IF NOT EXISTS service_subcategory text,
  ADD COLUMN IF NOT EXISTS service_area text,
  ADD COLUMN IF NOT EXISTS service_availability text,
  ADD COLUMN IF NOT EXISTS service_business_address text,
  ADD COLUMN IF NOT EXISTS service_license_number text,
  ADD COLUMN IF NOT EXISTS service_license_lookup_url text,
  ADD COLUMN IF NOT EXISTS service_offerings text[];

ALTER TABLE public.classified_listing_details
  DROP CONSTRAINT IF EXISTS classified_listing_details_home_mode,
  ADD CONSTRAINT classified_listing_details_home_mode
    CHECK (home_mode IS NULL OR home_mode IN ('rent', 'buy', 'build')),
  DROP CONSTRAINT IF EXISTS classified_listing_details_home_bedrooms,
  ADD CONSTRAINT classified_listing_details_home_bedrooms
    CHECK (home_bedrooms IS NULL OR home_bedrooms BETWEEN 0 AND 20),
  DROP CONSTRAINT IF EXISTS classified_listing_details_home_bathrooms,
  ADD CONSTRAINT classified_listing_details_home_bathrooms
    CHECK (home_bathrooms IS NULL OR home_bathrooms BETWEEN 0 AND 20),
  DROP CONSTRAINT IF EXISTS classified_listing_details_home_square_feet,
  ADD CONSTRAINT classified_listing_details_home_square_feet
    CHECK (home_square_feet IS NULL OR home_square_feet BETWEEN 0 AND 50000),
  DROP CONSTRAINT IF EXISTS classified_listing_details_home_year_built,
  ADD CONSTRAINT classified_listing_details_home_year_built
    CHECK (home_year_built IS NULL OR home_year_built BETWEEN 1800 AND 2100),
  DROP CONSTRAINT IF EXISTS classified_listing_details_job_pay_type,
  ADD CONSTRAINT classified_listing_details_job_pay_type
    CHECK (job_pay_type IS NULL OR job_pay_type IN ('Hourly', 'Salary', 'Commission', 'Contract')),
  DROP CONSTRAINT IF EXISTS classified_listing_details_job_employment_type,
  ADD CONSTRAINT classified_listing_details_job_employment_type
    CHECK (job_employment_type IS NULL OR job_employment_type IN ('Full-time', 'Part-time', 'Seasonal', 'Contract', 'Temporary')),
  DROP CONSTRAINT IF EXISTS classified_listing_details_job_pay_min,
  ADD CONSTRAINT classified_listing_details_job_pay_min
    CHECK (job_pay_min IS NULL OR job_pay_min >= 0),
  DROP CONSTRAINT IF EXISTS classified_listing_details_job_pay_max,
  ADD CONSTRAINT classified_listing_details_job_pay_max
    CHECK (job_pay_max IS NULL OR job_pay_max >= 0);

CREATE INDEX IF NOT EXISTS classified_listing_details_home_mode_idx
  ON public.classified_listing_details (home_mode);
CREATE INDEX IF NOT EXISTS classified_listing_details_job_employment_type_idx
  ON public.classified_listing_details (job_employment_type);
CREATE INDEX IF NOT EXISTS classified_listing_details_service_subcategory_idx
  ON public.classified_listing_details (service_subcategory);

-- Shared internal helper: writes the category-specific columns for a listing
-- that already exists. Not granted to `authenticated` directly -- only the
-- SECURITY DEFINER create/update wrapper functions below call it, and they
-- run as the function owner, so no separate grant is required for that call.
CREATE OR REPLACE FUNCTION public._apply_classified_category_details(
  _listing_id uuid,
  _home jsonb DEFAULT '{}'::jsonb,
  _job jsonb DEFAULT '{}'::jsonb,
  _service jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  home_bedrooms_value numeric;
  home_bathrooms_value numeric;
  home_square_feet_value integer;
  home_year_built_value smallint;
  job_pay_min_value numeric;
  job_pay_max_value numeric;
BEGIN
  BEGIN
    home_bedrooms_value := nullif(_home->>'bedrooms', '')::numeric;
    home_bathrooms_value := nullif(_home->>'bathrooms', '')::numeric;
    home_square_feet_value := nullif(_home->>'squareFeet', '')::integer;
    home_year_built_value := nullif(_home->>'yearBuilt', '')::smallint;
    job_pay_min_value := nullif(_job->>'payMin', '')::numeric;
    job_pay_max_value := nullif(_job->>'payMax', '')::numeric;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Home or job numeric fields must be valid numbers';
  END;

  UPDATE public.classified_listing_details
  SET
    home_mode = nullif(btrim(_home->>'mode'), ''),
    home_property_type = nullif(btrim(_home->>'propertyType'), ''),
    home_bedrooms = home_bedrooms_value,
    home_bathrooms = home_bathrooms_value,
    home_square_feet = home_square_feet_value,
    home_year_built = home_year_built_value,
    home_acreage = nullif(btrim(_home->>'acreage'), ''),
    home_heating = nullif(btrim(_home->>'heating'), ''),
    home_cooling = nullif(btrim(_home->>'cooling'), ''),
    home_garage_parking = nullif(btrim(_home->>'garageParking'), ''),
    home_yard = nullif(btrim(_home->>'yard'), ''),
    home_appliances_included = nullif(btrim(_home->>'appliancesIncluded'), ''),
    home_floor_coverings = nullif(btrim(_home->>'floorCoverings'), ''),
    home_basement_type = nullif(btrim(_home->>'basementType'), ''),
    home_exterior_material = nullif(btrim(_home->>'exteriorMaterial'), ''),
    home_special_features = nullif(btrim(_home->>'specialFeatures'), ''),
    home_hoa_fees = nullif(btrim(_home->>'hoaFees'), ''),
    home_school_district = nullif(btrim(_home->>'schoolDistrict'), ''),
    home_lease_length = nullif(btrim(_home->>'leaseLength'), ''),
    home_available = nullif(btrim(_home->>'available'), ''),
    home_pets_policy = nullif(btrim(_home->>'pets'), ''),
    home_smoking_policy = nullif(btrim(_home->>'smoking'), ''),
    home_open_house = nullif(btrim(_home->>'openHouse'), ''),
    job_employer_name = nullif(btrim(_job->>'employerName'), ''),
    job_employer_address = nullif(btrim(_job->>'employerAddress'), ''),
    job_pay_type = nullif(btrim(_job->>'payType'), ''),
    job_pay_min = job_pay_min_value,
    job_pay_max = job_pay_max_value,
    job_employment_type = nullif(btrim(_job->>'employmentType'), ''),
    job_experience_required = nullif(btrim(_job->>'experienceRequired'), ''),
    job_education_level = nullif(btrim(_job->>'educationLevel'), ''),
    job_responsibilities = CASE WHEN jsonb_typeof(_job->'responsibilities') = 'array'
      THEN (SELECT array_agg(value) FROM jsonb_array_elements_text(_job->'responsibilities') AS value)
      ELSE NULL END,
    job_qualifications = CASE WHEN jsonb_typeof(_job->'qualifications') = 'array'
      THEN (SELECT array_agg(value) FROM jsonb_array_elements_text(_job->'qualifications') AS value)
      ELSE NULL END,
    service_subcategory = nullif(btrim(_service->>'subcategory'), ''),
    service_area = nullif(btrim(_service->>'serviceArea'), ''),
    service_availability = nullif(btrim(_service->>'availability'), ''),
    service_business_address = nullif(btrim(_service->>'businessAddress'), ''),
    service_license_number = nullif(btrim(_service->>'licenseNumber'), ''),
    service_license_lookup_url = nullif(btrim(_service->>'licenseLookupUrl'), ''),
    service_offerings = CASE WHEN jsonb_typeof(_service->'offerings') = 'array'
      THEN (SELECT array_agg(value) FROM jsonb_array_elements_text(_service->'offerings') AS value)
      ELSE NULL END
  WHERE listing_id = _listing_id;
END;
$function$;

REVOKE ALL ON FUNCTION public._apply_classified_category_details(uuid, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._apply_classified_category_details(uuid, jsonb, jsonb, jsonb) TO service_role;

-- New create_classified_listing overload: delegates to the existing 18-arg
-- version (title..vehicle) and then fills in the category-specific columns.
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
  _service jsonb
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
    _evidence_paths, _public_media_paths, _vehicle
  );

  PERFORM public._apply_classified_category_details(new_listing_id, _home, _job, _service);

  RETURN new_listing_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_classified_listing(text, text, uuid, integer, public.item_condition, text, text, text, text, text, text, numeric, numeric, numeric, numeric, text[], text[], jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_classified_listing(text, text, uuid, integer, public.item_condition, text, text, text, text, text, text, numeric, numeric, numeric, numeric, text[], text[], jsonb, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_classified_listing(text, text, uuid, integer, public.item_condition, text, text, text, text, text, text, numeric, numeric, numeric, numeric, text[], text[], jsonb, jsonb, jsonb, jsonb) TO service_role;

-- New update_classified_listing overload: delegates to the existing 17-arg
-- version (listing_id..vehicle) -- which already resets approved_at and
-- requeues the product for moderation -- then updates the category columns.
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
  _service jsonb
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
    _parcel_length_in, _parcel_width_in, _parcel_height_in, _parcel_weight_lb, _vehicle
  );

  PERFORM public._apply_classified_category_details(_listing_id, _home, _job, _service);
END;
$function$;

REVOKE ALL ON FUNCTION public.update_classified_listing(uuid, text, text, uuid, integer, public.item_condition, text, text, text, text, text, numeric, numeric, numeric, numeric, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_classified_listing(uuid, text, text, uuid, integer, public.item_condition, text, text, text, text, text, numeric, numeric, numeric, numeric, jsonb, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_classified_listing(uuid, text, text, uuid, integer, public.item_condition, text, text, text, text, text, numeric, numeric, numeric, numeric, jsonb, jsonb, jsonb, jsonb) TO service_role;
