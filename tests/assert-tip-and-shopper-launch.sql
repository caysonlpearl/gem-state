-- Run after the three launch migrations inside BEGIN ... ROLLBACK only.
-- Temporarily reuses an existing sandbox fixture; no Stripe call or commit.
DO $$
DECLARE o public.orders; shopper uuid; buyer uuid; first_tip jsonb; retry_tip jsonb; p jsonb; was_rejected boolean;
BEGIN
  SELECT * INTO o FROM public.orders WHERE status='completed'
    AND stripe_checkout_session_id LIKE 'cs_test_%' ORDER BY created_at DESC LIMIT 1;
  SELECT shopper_id INTO shopper FROM public.shopper_service_profiles
    WHERE public.has_role(shopper_id,'shopper') AND shopper_id<>o.buyer_id LIMIT 1;
  IF o.id IS NULL OR shopper IS NULL THEN RAISE EXCEPTION 'Sandbox fixtures unavailable'; END IF;
  PERFORM set_config('parkvault.trusted_operation','on',true);
  UPDATE public.orders SET origin='sourcing_shopper',seller_id=shopper,ask_id=NULL,bid_id=NULL WHERE id=o.id;
  buyer:=o.buyer_id;
  p:=jsonb_build_object('line_items',jsonb_build_array(jsonb_build_object('price_data',jsonb_build_object('unit_amount',500))),
    'metadata',jsonb_build_object('parkvault_order_id',o.id::text));
  first_tip:=public.begin_sourcing_tip_checkout(o.id,buyer,500,p);
  retry_tip:=public.begin_sourcing_tip_checkout(o.id,buyer,500,p||'{"ignored_retry_value":true}'::jsonb);
  IF first_tip->>'id'<>retry_tip->>'id' OR first_tip->'stripe_create_params'<>retry_tip->'stripe_create_params' THEN
    RAISE EXCEPTION 'Tip retry changed the reservation or frozen request'; END IF;
  was_rejected:=false;
  BEGIN PERFORM public.begin_sourcing_tip_checkout(o.id,buyer,600,p);
  EXCEPTION WHEN OTHERS THEN was_rejected:=true; END;
  IF NOT was_rejected THEN RAISE EXCEPTION 'Changed tip amount was accepted'; END IF;
  IF NOT public.claim_sourcing_tip_payment((first_tip->>'id')::uuid,o.id,'cs_test_tip_qa','pi_tip_qa',500) THEN
    RAISE EXCEPTION 'First tip claim failed'; END IF;
  IF public.claim_sourcing_tip_payment((first_tip->>'id')::uuid,o.id,'cs_test_tip_duplicate','pi_tip_duplicate',500) THEN
    RAISE EXCEPTION 'Duplicate payable session was accepted'; END IF;
  was_rejected:=false;
  BEGIN INSERT INTO public.sourcing_tips(order_id,buyer_id,shopper_id,amount_cents) VALUES(o.id,buyer,shopper,500);
  EXCEPTION WHEN unique_violation THEN was_rejected:=true; END;
  IF NOT was_rejected THEN RAISE EXCEPTION 'Second active tip was accepted'; END IF;

  UPDATE public.shopper_service_profiles SET stripe_payouts_enabled=false WHERE shopper_id=shopper;
  was_rejected:=false;
  BEGIN UPDATE public.orders SET status='sourcing' WHERE id=o.id;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%finish payout setup%' THEN RAISE; END IF;
    was_rejected:=true;
  END;
  IF NOT was_rejected THEN RAISE EXCEPTION 'Unready shopper could start paid work'; END IF;

  PERFORM set_config('request.jwt.claim.sub',shopper::text,true);
  PERFORM public.save_shopper_shipping(jsonb_build_object('ship_from_name','QA rollback only',
    'ship_from_phone','2085550100','ship_from_line1','123 Test St','ship_from_line2','',
    'ship_from_city','Boise','ship_from_region','ID','ship_from_postal_code','83702','ship_from_country','US',
    'default_shipping_method','usps_ground_advantage','default_handling_days',2));
  IF NOT EXISTS(SELECT 1 FROM public.seller_profiles WHERE user_id=shopper AND ship_from_line1='123 Test St') THEN
    RAISE EXCEPTION 'Shopper shipping address was not saved'; END IF;
END $$;
SELECT 'tip reservation, duplicate rejection, payout gate and shipping setup passed; rollback required' AS result;
