-- Keep classified inquiry writes behind a small authenticated RPC. The RPC
-- derives buyer identity from the caller's JWT instead of trusting browser
-- supplied identity fields or requiring a service-role key in the app host.
CREATE OR REPLACE FUNCTION public.create_listing_inquiry(
  _listing_id uuid,
  _message text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  listing record;
  buyer_email text := btrim(coalesce(auth.jwt() ->> 'email', ''));
  buyer_name text;
  inquiry_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;
  IF char_length(btrim(coalesce(_message, ''))) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION 'Tell the seller a little more.';
  END IF;
  IF buyer_email = '' THEN
    RAISE EXCEPTION 'Your account needs an email address before you can contact a seller.';
  END IF;

  SELECT a.id, a.seller_id
  INTO listing
  FROM public.asks a
  WHERE a.id = _listing_id
    AND a.status = 'active'
    AND a.approved_at IS NOT NULL
    AND a.expires_at > now();

  IF listing.id IS NULL THEN
    RAISE EXCEPTION 'That listing is no longer available.';
  END IF;
  IF listing.seller_id = uid THEN
    RAISE EXCEPTION 'You cannot contact yourself.';
  END IF;

  SELECT nullif(btrim(display_name), '')
  INTO buyer_name
  FROM public.profiles
  WHERE id = uid;
  buyer_name := coalesce(buyer_name, split_part(buyer_email, '@', 1), 'Gem State buyer');

  INSERT INTO public.listing_inquiries (
    listing_id, seller_id, buyer_id, buyer_name, buyer_email, message
  ) VALUES (
    listing.id, listing.seller_id, uid, buyer_name, buyer_email, btrim(_message)
  )
  RETURNING id INTO inquiry_id;

  RETURN inquiry_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_listing_inquiry(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_listing_inquiry(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_listing_inquiry(uuid, text) TO service_role;
