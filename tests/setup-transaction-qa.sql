BEGIN;
CREATE SCHEMA parkvault_qa_20260905;
REVOKE ALL ON SCHEMA parkvault_qa_20260905 FROM PUBLIC, anon, authenticated;
DO $clone$
DECLARE n text; d text; r record;
names text[]:=ARRAY['orders','asks','listing_offers','order_addresses','ask_events','market_matches','order_events','sourcing_assignments','sourcing_balance_checkouts','order_payments','order_payouts'];
fns text[]:=ARRAY['reserve_authorized_offer_for_capture','begin_sourcing_balance_checkout','prepare_sourcing_balance_checkout','record_sourcing_balance_checkout','finalize_sourcing_balance_payment'];
BEGIN
 FOREACH n IN ARRAY names LOOP
 EXECUTE format('CREATE TABLE parkvault_qa_20260905.%I (LIKE public.%I INCLUDING ALL)',n,n);
 END LOOP;
 FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace ns ON p.pronamespace=ns.oid WHERE ns.nspname='public' AND p.proname=ANY(fns) LOOP
 d:=pg_get_functiondef(r.oid);
 FOREACH n IN ARRAY names||fns||ARRAY['notify_member'] LOOP
 d:=replace(d,'public.'||n,'parkvault_qa_20260905.'||n);
 END LOOP;
 EXECUTE d;
 END LOOP;
END $clone$;
CREATE FUNCTION parkvault_qa_20260905.notify_member(uuid,text,text,text,uuid) RETURNS void LANGUAGE sql AS 'SELECT NULL::void';
CREATE TABLE parkvault_qa_20260905.results (test text,result jsonb,at timestamptz DEFAULT clock_timestamp());
INSERT INTO parkvault_qa_20260905.asks(id,product_id,variant_id,seller_id,price_cents,approved_at,evidence_count,public_media_count)
VALUES ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001',4500,now(),1,1);
INSERT INTO parkvault_qa_20260905.listing_offers(id,ask_id,buyer_id,seller_id,amount_cents,buyer_fee_cents,seller_fee_cents,shipping_cents,tax_cents,buyer_total_cents,seller_payout_cents,fee_schedule_id,fee_snapshot,payment_authorized,authorization_expires_at,stripe_payment_intent_id,stripe_checkout_session_id,shipping_address)
SELECT ('00000000-0000-4000-8000-00000000010'||i)::uuid,'00000000-0000-4000-8000-000000000010',('00000000-0000-4000-8000-00000000000'||(i+1))::uuid,'00000000-0000-4000-8000-000000000001',4500,199,450,995,0,5694,4050,'00000000-0000-4000-8000-000000000040','{}',true,now()+interval '1 day','pi_qa_fake_'||i,'cs_test_qa_fake_'||i,'{"recipient_name":"QA Synthetic","line1":"1 Test Road","city":"Test","region":"CA","postal_code":"94080"}'::jsonb
FROM generate_series(1,2) AS i;
INSERT INTO parkvault_qa_20260905.orders(id,buyer_id,seller_id,product_id,variant_id,origin,merchandise_cents,buyer_fee_cents,seller_fee_cents,shipping_cents,tax_cents,total_cents,payout_cents,fee_schedule_id,fee_snapshot,payment_authorized)
VALUES ('00000000-0000-4000-8000-000000000200','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000030','sourcing_shopper',5000,500,0,995,0,6495,5000,'00000000-0000-4000-8000-000000000040','{}',true);
INSERT INTO parkvault_qa_20260905.sourcing_assignments(order_id,variant_id,buyer_id,shopper_id,shopper_profile_id,shopper_fee_cents,reference_price_cents,reference_confidence,reference_observed_at,buyer_max_purchase_cents,coverage_label,purchase_deadline,currency,actual_cost_cents,balance_due_cents)
VALUES ('00000000-0000-4000-8000-000000000200','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000050',500,4500,'test',now(),4500,'QA synthetic',now()+interval '1 day','USD',4700,200);
COMMIT;
SELECT 'private QA schema initialized' as result;
