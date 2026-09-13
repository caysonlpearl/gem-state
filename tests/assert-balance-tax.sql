INSERT INTO parkvault_qa_20260905.orders
(id,order_number,buyer_id,seller_id,product_id,variant_id,origin,merchandise_cents,buyer_fee_cents,seller_fee_cents,total_cents,payout_cents,fee_schedule_id,fee_snapshot,payment_authorized,shipping_cents,tax_cents)
SELECT '00000000-0000-4000-8000-000000000201','QA-TAX',buyer_id,seller_id,product_id,variant_id,origin,merchandise_cents,buyer_fee_cents,seller_fee_cents,total_cents,payout_cents,fee_schedule_id,fee_snapshot,true,shipping_cents,0
FROM parkvault_qa_20260905.orders WHERE id='00000000-0000-4000-8000-000000000200';
INSERT INTO parkvault_qa_20260905.sourcing_assignments
SELECT (jsonb_populate_record(NULL::parkvault_qa_20260905.sourcing_assignments,to_jsonb(a)||jsonb_build_object(
'id',gen_random_uuid(),'order_id','00000000-0000-4000-8000-000000000201','balance_due_cents',200))).*
FROM parkvault_qa_20260905.sourcing_assignments a LIMIT 1;
DO $test$
DECLARE r text; o parkvault_qa_20260905.orders; failed boolean:=false;
BEGIN
 BEGIN
  PERFORM parkvault_qa_20260905.finalize_sourcing_balance_payment('00000000-0000-4000-8000-000000000201','cs_test_qa_tax','pi_qa_tax','ch_qa_tax',212,0);
 EXCEPTION WHEN OTHERS THEN failed:=true;
 END;
 IF NOT failed THEN RAISE EXCEPTION 'Unexplained extra money was accepted'; END IF;
 r:=parkvault_qa_20260905.finalize_sourcing_balance_payment('00000000-0000-4000-8000-000000000201','cs_test_qa_tax','pi_qa_tax','ch_qa_tax',212,12);
 SELECT * INTO o FROM parkvault_qa_20260905.orders WHERE id='00000000-0000-4000-8000-000000000201';
 IF r<>'completed' OR o.tax_cents<>12 OR o.payout_cents<>5200 OR
    o.total_cents<>o.merchandise_cents+o.buyer_fee_cents+o.shipping_cents+12 THEN
    RAISE EXCEPTION 'Tax reconciliation failed';
 END IF;
 r:=parkvault_qa_20260905.finalize_sourcing_balance_payment(o.id,'cs_test_qa_tax','pi_qa_tax','ch_qa_tax',212,12);
 IF r<>'already_completed' OR (SELECT tax_cents FROM parkvault_qa_20260905.orders WHERE id=o.id)<>12 THEN
    RAISE EXCEPTION 'Tax was added twice';
 END IF;
 INSERT INTO parkvault_qa_20260905.results(test,result) VALUES('balance_tax',jsonb_build_object(
 'passed',true,'payment_cents',212,'tax_cents',12,'shopper_payout_cents',5200,'tax_not_paid_to_shopper',true,'repeated_event_no_double_tax',true));
END $test$;
SELECT test,result FROM parkvault_qa_20260905.results WHERE test='balance_tax';
