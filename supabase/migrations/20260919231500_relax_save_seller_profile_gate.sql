-- save_seller_profile still hard-required the full private ship-from address
-- (name/phone/line1/city/region/postal code) plus a valid default shipping
-- method and handling-time before it would let a seller save their profile
-- and become 'active' at all. The frontend (seller-setup.tsx) was already
-- updated to label these fields optional and the app-level validator
-- (saveSellerSetup in seller.functions.ts) already stopped requiring them,
-- but this RPC -- the one actually called on submit -- was never relaxed to
-- match, so submitting the form with those fields blank always failed with
-- "Complete the private ship-from address and phone number" or "Choose a
-- default shipping method". That made it impossible to ever reach
-- status = 'active' / terms_accepted_at without filling in shipping details
-- that direct-contact classifieds sellers don't need, which is exactly the
-- "weird shipping/payout wizard" symptom reported.

CREATE OR REPLACE FUNCTION public.save_seller_profile(
  _slug text,
  _bio text,
  _ship_from_name text,
  _ship_from_phone text,
  _ship_from_line1 text,
  _ship_from_line2 text,
  _ship_from_city text,
  _ship_from_region text,
  _ship_from_postal_code text,
  _ship_from_country character,
  _default_shipping_method text,
  _default_handling_days smallint,
  _accept_terms boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  clean_slug text := lower(btrim(_slug));
  clean_shipping_method text := nullif(btrim(coalesce(_default_shipping_method, '')), '');
  clean_handling_days smallint := _default_handling_days;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF clean_slug !~ '^[a-z0-9][a-z0-9-]{2,29}$' THEN
    RAISE EXCEPTION 'Seller handle must be 3-30 lowercase letters, numbers or hyphens';
  END IF;
  IF length(coalesce(_bio,'')) > 280 THEN RAISE EXCEPTION 'Bio is too long'; END IF;

  -- Ship-from address, shipping method, and handling time only matter for
  -- Gem State's own future checkout-marketplace listings. Direct-contact
  -- classifieds sellers arrange shipping themselves, so these are optional:
  -- validate a field only if the seller actually provided it.
  IF clean_shipping_method IS NOT NULL AND clean_shipping_method NOT IN (
    'usps_ground_advantage','usps_priority_mail','ups_ground','fedex_ground'
  ) THEN
    RAISE EXCEPTION 'Choose a valid default shipping method';
  END IF;
  IF clean_handling_days IS NOT NULL AND clean_handling_days NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Choose a handling time between 1 and 5 business days';
  END IF;
  IF NOT _accept_terms THEN RAISE EXCEPTION 'Accept the seller and photo-display terms'; END IF;

  INSERT INTO public.seller_profiles (
    user_id, slug, bio, status, ship_from_name, ship_from_phone, ship_from_line1,
    ship_from_line2, ship_from_city, ship_from_region, ship_from_postal_code,
    ship_from_country, default_shipping_method, default_handling_days,
    terms_version, terms_accepted_at
  ) VALUES (
    uid, clean_slug, nullif(btrim(_bio),''), 'active',
    nullif(btrim(_ship_from_name),''), nullif(btrim(_ship_from_phone),''),
    nullif(btrim(_ship_from_line1),''), nullif(btrim(_ship_from_line2),''),
    nullif(btrim(_ship_from_city),''), nullif(upper(btrim(_ship_from_region)),''),
    nullif(btrim(_ship_from_postal_code),''), upper(coalesce(_ship_from_country,'US')),
    clean_shipping_method, clean_handling_days, 'seller-v1', now()
  ) ON CONFLICT (user_id) DO UPDATE SET
    slug = EXCLUDED.slug,
    bio = EXCLUDED.bio,
    status = CASE WHEN seller_profiles.status = 'restricted' THEN 'restricted' ELSE 'active' END,
    ship_from_name = EXCLUDED.ship_from_name,
    ship_from_phone = EXCLUDED.ship_from_phone,
    ship_from_line1 = EXCLUDED.ship_from_line1,
    ship_from_line2 = EXCLUDED.ship_from_line2,
    ship_from_city = EXCLUDED.ship_from_city,
    ship_from_region = EXCLUDED.ship_from_region,
    ship_from_postal_code = EXCLUDED.ship_from_postal_code,
    ship_from_country = EXCLUDED.ship_from_country,
    default_shipping_method = EXCLUDED.default_shipping_method,
    default_handling_days = EXCLUDED.default_handling_days,
    terms_version = EXCLUDED.terms_version,
    terms_accepted_at = EXCLUDED.terms_accepted_at,
    updated_at = now();

  -- Seller shipping settings are defaults for every current exact-item listing.
  UPDATE public.asks
     SET ship_by_days = coalesce(clean_handling_days, ship_by_days),
         updated_at = now()
   WHERE seller_id = uid AND in_hand AND status = 'active';
END;
$function$;
