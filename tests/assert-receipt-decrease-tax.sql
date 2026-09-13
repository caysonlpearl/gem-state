-- Run after the migration inside a ROLLBACK transaction. All fixtures stay isolated.
CREATE SCHEMA receipt_tax_qa;
REVOKE ALL ON SCHEMA receipt_tax_qa FROM PUBLIC,anon,authenticated;
DO $clone$
DECLARE n text; d text; r record;
names text[]:=ARRAY['orders','sourcing_assignments','order_evidence','order_events','order_payments','order_payouts','sourcing_receipt_tax_quotes'];
BEGIN
 FOREACH n IN ARRAY names LOOP
   EXECUTE format('CREATE TABLE receipt_tax_qa.%I (LIKE public.%I INCLUDING ALL)',n,n);
 END LOOP;
 FOR r IN SELECT oid FROM pg_proc WHERE oid IN ('public.shopper_confirm_purchase(uuid,integer,text)'::regprocedure,
   'public.finalize_sourcing_refund(uuid,text,integer)'::regprocedure) LOOP
   d:=pg_get_functiondef(r.oid);
   FOREACH n IN ARRAY names||ARRAY['shopper_confirm_purchase','finalize_sourcing_refund','notify_member'] LOOP
     d:=replace(d,'public.'||n,'receipt_tax_qa.'||n);
   END LOOP;
   EXECUTE d;
 END LOOP;
END $clone$;
CREATE FUNCTION receipt_tax_qa.notify_member(uuid,text,text,text,uuid) RETURNS void LANGUAGE sql AS 'SELECT NULL::void';
INSERT INTO receipt_tax_qa.orders
(id,order_number,status,buyer_id,seller_id,product_id,variant_id,origin,merchandise_cents,buyer_fee_cents,
seller_fee_cents,shipping_cents,tax_cents,total_cents,payout_cents,stripe_payment_intent_id,fee_schedule_id,fee_snapshot,payment_authorized)
SELECT '00000000-0000-4000-8000-000000000301','QA-RECEIPT-TAX','sourcing',buyer_id,seller_id,product_id,variant_id,
origin,5000,799,0,1000,390,7189,5000,'pi_qa_receipt',fee_schedule_id,'{}'::jsonb,true
FROM parkvault_qa_20260905.orders o WHERE id='00000000-0000-4000-8000-000000000200';
INSERT INTO receipt_tax_qa.sourcing_assignments
SELECT (jsonb_populate_record(NULL::receipt_tax_qa.sourcing_assignments,to_jsonb(a)||jsonb_build_object(
 'id',gen_random_uuid(),'order_id','00000000-0000-4000-8000-000000000301',
 'actual_cost_cents',NULL,'balance_due_cents',0,'refund_due_cents',0,'purchase_confirmed_at',NULL))).*
FROM parkvault_qa_20260905.sourcing_assignments a WHERE order_id='00000000-0000-4000-8000-000000000200';
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
DO $test$
DECLARE test_order_id uuid:='00000000-0000-4000-8000-000000000301';
 path text:='00000000-0000-4000-8000-000000000001/receipt.jpg';
 failed boolean:=false; r jsonb; o receipt_tax_qa.orders;
BEGIN
 BEGIN
   PERFORM receipt_tax_qa.shopper_confirm_purchase(test_order_id,4300,path);
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE 'Receipt tax must be verified%' THEN RAISE; END IF;
   failed:=true;
 END;
 IF NOT failed THEN RAISE EXCEPTION 'Tax quote bypass accepted'; END IF;
 INSERT INTO receipt_tax_qa.sourcing_receipt_tax_quotes
 (order_id,actual_cost_cents,original_total_cents,original_tax_cents,merchandise_cents,platform_fee_cents,
 shipping_cents,tax_cents,calculation_id,payment_intent_id)
 VALUES(test_order_id,4300,7189,390,4800,799,1000,378,'taxcalc_qa','pi_qa_receipt');
 r:=receipt_tax_qa.shopper_confirm_purchase(test_order_id,4300,path);
 SELECT * INTO o FROM receipt_tax_qa.orders WHERE orders.id=test_order_id;
 IF (r->>'refund_due_cents')::integer<>212 OR o.tax_cents<>378 OR o.total_cents<>6977
   OR o.payout_cents<>4800 OR o.buyer_fee_cents<>799 THEN RAISE EXCEPTION 'Receipt/tax/fee arithmetic failed'; END IF;
 r:=receipt_tax_qa.shopper_confirm_purchase(test_order_id,4300,path);
 IF NOT (r->>'already_confirmed')::boolean OR (SELECT count(*) FROM receipt_tax_qa.order_evidence)<>1
 THEN RAISE EXCEPTION 'Receipt confirmation was duplicated'; END IF;
 PERFORM receipt_tax_qa.finalize_sourcing_refund(test_order_id,'re_qa_receipt',212);
 PERFORM receipt_tax_qa.finalize_sourcing_refund(test_order_id,'re_qa_receipt',212);
 IF (SELECT count(*) FROM receipt_tax_qa.order_payments)<>1
 OR (SELECT refund_due_cents FROM receipt_tax_qa.sourcing_assignments WHERE order_id=test_order_id)<>0
 OR (SELECT status FROM receipt_tax_qa.orders WHERE orders.id=test_order_id)<>'ready_to_ship'
 THEN RAISE EXCEPTION 'Refund finalization was not idempotent'; END IF;
END $test$;
SELECT 'PASS: reduced tax included in refund; platform fee retained; tax excluded from shopper payout; quote bypass blocked; receipt/refund retries idempotent' AS result;
