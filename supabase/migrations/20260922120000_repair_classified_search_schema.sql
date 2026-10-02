-- Repair the live classified search schema when the original expansion
-- migration was not applied. Every operation is idempotent so this is safe
-- to run against databases that already contain some or all of the fields.

ALTER TABLE public.classified_listing_details
  ADD COLUMN IF NOT EXISTS home_acres numeric,
  ADD COLUMN IF NOT EXISTS job_category text;

ALTER TABLE public.classified_listing_details
  DROP CONSTRAINT IF EXISTS classified_listing_details_home_acres,
  ADD CONSTRAINT classified_listing_details_home_acres
    CHECK (home_acres IS NULL OR home_acres BETWEEN 0 AND 100000),
  DROP CONSTRAINT IF EXISTS classified_listing_details_job_category_length,
  ADD CONSTRAINT classified_listing_details_job_category_length
    CHECK (
      job_category IS NULL
      OR char_length(btrim(job_category)) BETWEEN 2 AND 80
    );

CREATE INDEX IF NOT EXISTS classified_listing_details_home_acres_idx
  ON public.classified_listing_details (home_acres);

CREATE INDEX IF NOT EXISTS classified_listing_details_job_category_idx
  ON public.classified_listing_details (job_category);

UPDATE public.classified_listing_details
SET home_acres = NULLIF(regexp_replace(home_acreage, '[^0-9.]', '', 'g'), '')::numeric
WHERE home_acres IS NULL
  AND NULLIF(regexp_replace(home_acreage, '[^0-9.]', '', 'g'), '') IS NOT NULL;

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
  home_acres_value numeric;
  job_pay_min_value numeric;
  job_pay_max_value numeric;
BEGIN
  BEGIN
    home_bedrooms_value := nullif(_home->>'bedrooms', '')::numeric;
    home_bathrooms_value := nullif(_home->>'bathrooms', '')::numeric;
    home_square_feet_value := nullif(_home->>'squareFeet', '')::integer;
    home_year_built_value := nullif(_home->>'yearBuilt', '')::smallint;
    home_acres_value := NULLIF(
      regexp_replace(_home->>'acreage', '[^0-9.]', '', 'g'),
      ''
    )::numeric;
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
    home_acres = home_acres_value,
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
    job_category = nullif(btrim(_job->>'category'), ''),
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
