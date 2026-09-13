DO $test$
DECLARE c parkvault_qa_20260905.sourcing_balance_checkouts; p jsonb; r jsonb; outcome text;
BEGIN
 SELECT * INTO c FROM parkvault_qa_20260905.sourcing_balance_checkouts;
 p:=jsonb_build_object('line_items',jsonb_build_array(jsonb_build_object('price_data',jsonb_build_object('unit_amount',200))),
 'metadata',jsonb_build_object('parkvault_order_id',c.order_id),'expires_at',1000);
 r:=parkvault_qa_20260905.prepare_sourcing_balance_checkout(c.id,c.order_id,c.buyer_id,c.attempt,p);
 r:=parkvault_qa_20260905.prepare_sourcing_balance_checkout(c.id,c.order_id,c.buyer_id,c.attempt,jsonb_set(p,'{expires_at}','9999'));
 IF r<>p THEN RAISE EXCEPTION 'Frozen checkout params changed'; END IF;
 INSERT INTO parkvault_qa_20260905.results(test,result) VALUES('frozen_params',jsonb_build_object('passed',true));
 PERFORM parkvault_qa_20260905.record_sourcing_balance_checkout(c.id,c.order_id,c.buyer_id,c.attempt,'cs_test_qa_balance',now()+interval '30 minutes');
 outcome:=parkvault_qa_20260905.finalize_sourcing_balance_payment(c.order_id,'cs_test_qa_balance','pi_qa_balance','ch_qa_balance',200);
 IF outcome<>'completed' THEN RAISE EXCEPTION 'First completion failed'; END IF;
 outcome:=parkvault_qa_20260905.finalize_sourcing_balance_payment(c.order_id,'cs_test_qa_balance','pi_qa_balance','ch_qa_balance',200);
 IF outcome<>'already_completed' THEN RAISE EXCEPTION 'Repeated payment was not idempotent'; END IF;
 outcome:=parkvault_qa_20260905.finalize_sourcing_balance_payment(c.order_id,'cs_test_qa_other','pi_qa_other','ch_qa_other',200);
 IF outcome<>'duplicate' THEN RAISE EXCEPTION 'Duplicate payment was not rejected'; END IF;
 PERFORM parkvault_qa_20260905.record_sourcing_balance_checkout(c.id,c.order_id,c.buyer_id,c.attempt,'cs_test_qa_balance',now()+interval '30 minutes');
 IF (SELECT status FROM parkvault_qa_20260905.sourcing_balance_checkouts WHERE id=c.id)<>'succeeded' THEN
 RAISE EXCEPTION 'Late recorder downgraded payment'; END IF;
 IF (SELECT count(*) FROM parkvault_qa_20260905.order_payments WHERE order_id=c.order_id)<>1 THEN
 RAISE EXCEPTION 'Duplicate ledger entry'; END IF;
 INSERT INTO parkvault_qa_20260905.results(test,result) VALUES('balance_finalization',jsonb_build_object('passed',true,'ledger_entries',1,'duplicate_rejected',true,'late_record_preserved_success',true));
END $test$;
SELECT test,result FROM parkvault_qa_20260905.results WHERE test IN ('frozen_params','balance_finalization');
