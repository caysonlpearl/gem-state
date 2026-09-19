-- Order-gated reviews only ever worked for the checkout side of the
-- marketplace (an order with a delivered/completed status). The classifieds
-- side added this session is direct-contact, KSL-style: buyer and seller
-- transact off-platform, so there is no order to gate a review on at all.
-- Replacing the review system with an open, profile-level model instead --
-- closer to how KSL and Google reviews work: anyone signed in can leave one
-- review per seller, editable later, with no purchase verification.
--
-- The previous `order_reviews` table and `submit_order_review` function are
-- left in place (dormant) rather than dropped, since neither was ever
-- captured in a tracked migration -- there is no record here of exactly what
-- depends on them, so removing them is a follow-up once the app code no
-- longer calls them.

CREATE TABLE public.seller_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_reviews_comment_length CHECK (comment IS NULL OR char_length(comment) <= 1000),
  CONSTRAINT seller_reviews_not_self CHECK (seller_id <> reviewer_id),
  CONSTRAINT seller_reviews_one_per_reviewer UNIQUE (seller_id, reviewer_id)
);

CREATE INDEX seller_reviews_seller_idx ON public.seller_reviews (seller_id);
CREATE INDEX seller_reviews_reviewer_idx ON public.seller_reviews (reviewer_id);

ALTER TABLE public.seller_reviews ENABLE ROW LEVEL SECURITY;

-- Reviews are public, like Google -- anyone can read them, including
-- signed-out visitors browsing a seller's profile.
CREATE POLICY "Anyone can read seller reviews"
ON public.seller_reviews
FOR SELECT
TO anon, authenticated
USING (true);

-- Writes only ever go through submit_seller_review below (SECURITY DEFINER,
-- runs as owner), so direct table writes are locked out entirely.
REVOKE ALL ON public.seller_reviews FROM anon, authenticated;
GRANT SELECT ON public.seller_reviews TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_seller_review(
  _seller_id uuid,
  _rating integer,
  _comment text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  review_id uuid;
  trimmed_comment text := nullif(btrim(coalesce(_comment, '')), '');
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF uid = _seller_id THEN RAISE EXCEPTION 'You cannot review yourself'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.seller_profiles WHERE user_id = _seller_id) THEN
    RAISE EXCEPTION 'Seller not found';
  END IF;
  IF _rating < 1 OR _rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5';
  END IF;
  IF trimmed_comment IS NOT NULL AND char_length(trimmed_comment) > 1000 THEN
    RAISE EXCEPTION 'Comment must be 1000 characters or fewer';
  END IF;

  INSERT INTO public.seller_reviews (seller_id, reviewer_id, rating, comment)
  VALUES (_seller_id, uid, _rating, trimmed_comment)
  ON CONFLICT ON CONSTRAINT seller_reviews_one_per_reviewer
  DO UPDATE SET rating = excluded.rating, comment = excluded.comment, updated_at = now()
  RETURNING id INTO review_id;

  RETURN review_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_seller_review(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_seller_review(uuid, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_seller_review(_seller_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  DELETE FROM public.seller_reviews WHERE seller_id = _seller_id AND reviewer_id = auth.uid();
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_seller_review(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_seller_review(uuid) TO authenticated;
