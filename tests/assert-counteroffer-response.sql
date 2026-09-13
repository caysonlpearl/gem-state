BEGIN;
CREATE OR REPLACE FUNCTION parkvault_qa_20260905.respond_to_listing_offer(_offer_id uuid, _action text, _counter_cents integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE uid uuid := auth.uid(); offer parkvault_qa_20260905.listing_offers; target parkvault_qa_20260905.asks; totals jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  SELECT * INTO offer FROM parkvault_qa_20260905.listing_offers WHERE id = _offer_id FOR UPDATE;
  -- Repeating a saved response only retries release of its old card hold.
  IF offer.id IS NOT NULL AND (
    (_action='counter' AND uid=offer.seller_id AND offer.status='countered'
      AND offer.seller_counter_cents=_counter_cents) OR
    (_action='decline' AND uid=offer.seller_id AND offer.status='declined') OR
    (_action='withdraw' AND uid=offer.buyer_id AND offer.status='withdrawn')
  ) THEN RETURN NULL; END IF;
  IF offer.id IS NULL OR offer.status NOT IN ('pending','countered') OR offer.expires_at <= now() THEN
    RAISE EXCEPTION 'That offer is no longer open';
  END IF;
  SELECT * INTO target FROM parkvault_qa_20260905.asks WHERE id = offer.ask_id;
  IF _action='counter' AND (target.id IS NULL OR target.status<>'active'
      OR target.approved_at IS NULL OR target.expires_at<=now()) THEN
    RAISE EXCEPTION 'That listing is no longer available';
  END IF;

  IF _action IN ('accept','accept_counter') THEN
    RAISE EXCEPTION 'Use ParkVault Checkout to complete this offer';
  ELSIF _action = 'counter' AND uid = offer.seller_id AND offer.status = 'pending'
        AND offer.payment_authorized THEN
    IF _counter_cents IS NULL OR _counter_cents <= offer.amount_cents OR _counter_cents > target.price_cents THEN
      RAISE EXCEPTION 'Enter a counter above the buyer offer and no higher than your listing price';
    END IF;
    -- Calculate before changing any state. A fee error rolls back the entire response.
    totals := public.compute_order_totals(_counter_cents, offer.currency, NULL);
    IF totals->>'total_cents' IS NULL OR totals->>'payout_cents' IS NULL THEN
      RAISE EXCEPTION 'Could not calculate counteroffer totals';
    END IF;
    UPDATE parkvault_qa_20260905.listing_offers SET seller_counter_cents = _counter_cents,
      buyer_fee_cents=(totals->>'buyer_fee_cents')::integer,
      seller_fee_cents=(totals->>'seller_fee_cents')::integer,
      buyer_total_cents=(totals->>'total_cents')::integer,
      seller_payout_cents=(totals->>'payout_cents')::integer,
      fee_schedule_id=(totals->>'fee_schedule_id')::uuid,
      fee_snapshot=totals || jsonb_build_object('shipping_cents',0,'tax_cents',0,'shipping_and_tax_calculated',false),
      shipping_cents=0, tax_cents=0, payment_authorized=false,
      authorization_expires_at=NULL, stripe_payment_status='cancel_pending',
      status = 'countered', expires_at = now() + interval '48 hours', updated_at = now()
      WHERE id = offer.id;
    PERFORM parkvault_qa_20260905.notify_member(offer.buyer_id, 'offer_countered', 'The seller countered your offer',
      'Review the counteroffer and complete secure checkout in Buying.', NULL);
    RETURN NULL;
  ELSIF _action = 'decline' AND uid = offer.seller_id THEN
    UPDATE parkvault_qa_20260905.listing_offers SET status = 'declined', payment_authorized=false, authorization_expires_at=NULL, stripe_payment_status='cancel_pending', updated_at = now() WHERE id = offer.id;
    PERFORM parkvault_qa_20260905.notify_member(offer.buyer_id, 'offer_declined', 'Your offer was declined',
      'The exact-item listing is still available at the seller price.', NULL);
    RETURN NULL;
  ELSIF _action = 'withdraw' AND uid = offer.buyer_id THEN
    UPDATE parkvault_qa_20260905.listing_offers SET status = 'withdrawn', payment_authorized=false, authorization_expires_at=NULL, stripe_payment_status='cancel_pending', updated_at = now() WHERE id = offer.id;
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'That action is not available for this offer';
END;
$function$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
UPDATE parkvault_qa_20260905.asks SET status='active',price_cents=6000,approved_at=now(),expires_at=now()+interval '1 day' WHERE id='00000000-0000-4000-8000-000000000010';
UPDATE parkvault_qa_20260905.listing_offers SET status='pending',payment_authorized=true,expires_at=now()+interval '1 day' WHERE id='00000000-0000-4000-8000-000000000101';
DO $$
DECLARE r record; rejected boolean:=false;
BEGIN
  BEGIN
    PERFORM parkvault_qa_20260905.respond_to_listing_offer('00000000-0000-4000-8000-000000000101','counter',4400);
  EXCEPTION WHEN OTHERS THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Invalid counter accepted'; END IF;
  SELECT * INTO r FROM parkvault_qa_20260905.listing_offers WHERE id='00000000-0000-4000-8000-000000000101';
  IF r.status<>'pending' OR NOT r.payment_authorized THEN RAISE EXCEPTION 'Invalid response mutated offer'; END IF;
  PERFORM parkvault_qa_20260905.respond_to_listing_offer('00000000-0000-4000-8000-000000000101','counter',5000);
  SELECT * INTO r FROM parkvault_qa_20260905.listing_offers WHERE id='00000000-0000-4000-8000-000000000101';
  IF r.status<>'countered' OR r.payment_authorized OR r.buyer_total_cents<>5199 OR r.seller_payout_cents<>4500
    OR r.stripe_payment_status<>'cancel_pending' THEN RAISE EXCEPTION 'Incorrect atomic counter totals'; END IF;
  PERFORM parkvault_qa_20260905.respond_to_listing_offer('00000000-0000-4000-8000-000000000101','counter',5000);
END $$;
ROLLBACK;
SELECT 'counteroffer database assertions passed; fixtures rolled back' AS result;
