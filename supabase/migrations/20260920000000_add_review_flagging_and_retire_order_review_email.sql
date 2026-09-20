-- Two independent changes:
--
-- 1. Retire the order-completion "leave a review" email/notification loop.
-- It was built for the old order-gated review system and was never updated
-- when reviews became open/profile-level (submit_seller_review, no purchase
-- required): the email and in-app notification both still link to
-- /orders/{orderId}, which has had zero review UI since that migration --
-- a dead-end CTA for any buyer who receives one. Since reviews are no
-- longer tied to orders at all, the right fix is to stop generating them
-- rather than repoint them.
--
-- 2. Add review flagging: any signed-in user can flag a seller review
-- (e.g. the seller being reviewed, or another member who spots something
-- fake/abusive), and an admin can dismiss the flag or remove the review.

-- --- Part 1: retire the order-review email loop ---

DROP TRIGGER IF EXISTS queue_completed_order_review ON public.verified_sales;
DROP FUNCTION IF EXISTS public.queue_completed_order_review();
DROP FUNCTION IF EXISTS public.claim_review_emails(uuid);
DROP FUNCTION IF EXISTS public.consume_review_worker_token(text);
DROP TABLE IF EXISTS public.review_worker_tokens;
DROP TABLE IF EXISTS public.transactional_email_queue;

-- --- Part 2: review flagging + moderation ---

ALTER TABLE public.seller_reviews
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'visible'
    CHECK (status IN ('visible', 'flagged', 'removed'));

CREATE TABLE public.seller_review_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.seller_reviews(id) ON DELETE CASCADE,
  flagger_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution text CHECK (resolution IN ('dismissed', 'removed')),
  CONSTRAINT seller_review_flags_reason_length CHECK (reason IS NULL OR char_length(reason) <= 500),
  CONSTRAINT seller_review_flags_one_per_flagger UNIQUE (review_id, flagger_id)
);

CREATE INDEX seller_review_flags_review_idx ON public.seller_review_flags (review_id);
CREATE INDEX seller_review_flags_unresolved_idx ON public.seller_review_flags (review_id) WHERE resolved_at IS NULL;

ALTER TABLE public.seller_review_flags ENABLE ROW LEVEL SECURITY;
-- No direct-table policies: all reads/writes go through SECURITY DEFINER RPCs
-- (flag_seller_review for members, admin_resolve_review_flag + the admin
-- listing query for staff, which uses the service-role client).
REVOKE ALL ON public.seller_review_flags FROM anon, authenticated;

DROP POLICY IF EXISTS "Anyone can read seller reviews" ON public.seller_reviews;
CREATE POLICY "Anyone can read visible seller reviews"
ON public.seller_reviews
FOR SELECT
TO anon, authenticated
USING (status <> 'removed');

CREATE OR REPLACE FUNCTION public.flag_seller_review(_review_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  trimmed_reason text := nullif(btrim(coalesce(_reason, '')), '');
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.seller_reviews WHERE id = _review_id) THEN
    RAISE EXCEPTION 'Review not found';
  END IF;
  IF trimmed_reason IS NOT NULL AND char_length(trimmed_reason) > 500 THEN
    RAISE EXCEPTION 'Reason must be 500 characters or fewer';
  END IF;

  INSERT INTO public.seller_review_flags (review_id, flagger_id, reason)
  VALUES (_review_id, uid, trimmed_reason)
  ON CONFLICT ON CONSTRAINT seller_review_flags_one_per_flagger
  DO UPDATE SET reason = excluded.reason, created_at = now(), resolved_at = NULL, resolved_by = NULL, resolution = NULL;

  UPDATE public.seller_reviews SET status = 'flagged' WHERE id = _review_id AND status = 'visible';
END;
$function$;

REVOKE ALL ON FUNCTION public.flag_seller_review(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.flag_seller_review(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_resolve_review_flag(_review_id uuid, _action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF NOT public.has_role(uid, 'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF _action NOT IN ('dismiss', 'remove') THEN RAISE EXCEPTION 'Action must be dismiss or remove'; END IF;

  UPDATE public.seller_reviews
  SET status = CASE WHEN _action = 'remove' THEN 'removed' ELSE 'visible' END
  WHERE id = _review_id;

  UPDATE public.seller_review_flags
  SET resolved_at = now(), resolved_by = uid,
      resolution = CASE WHEN _action = 'remove' THEN 'removed' ELSE 'dismissed' END
  WHERE review_id = _review_id AND resolved_at IS NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_resolve_review_flag(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_resolve_review_flag(uuid, text) TO authenticated;
