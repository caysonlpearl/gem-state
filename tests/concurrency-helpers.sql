CREATE FUNCTION parkvault_qa_20260905.try_offer(n integer, hold_seconds integer)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb; started timestamptz:=clock_timestamp();
BEGIN
 r:=parkvault_qa_20260905.reserve_authorized_offer_for_capture(
   ('00000000-0000-4000-8000-00000000010'||n)::uuid,
   '00000000-0000-4000-8000-000000000001');
 PERFORM pg_sleep(hold_seconds);
 r:=r||jsonb_build_object('ok',true,'elapsed_ms',extract(epoch from clock_timestamp()-started)*1000);
 INSERT INTO parkvault_qa_20260905.results VALUES('offer_'||n,r,clock_timestamp());
 RETURN r;
EXCEPTION WHEN OTHERS THEN
 r:=jsonb_build_object('ok',false,'error',SQLERRM,'elapsed_ms',extract(epoch from clock_timestamp()-started)*1000);
 INSERT INTO parkvault_qa_20260905.results VALUES('offer_'||n,r,clock_timestamp());
 RETURN r;
END $$;

CREATE FUNCTION parkvault_qa_20260905.try_balance(n integer, hold_seconds integer)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb; started timestamptz:=clock_timestamp();
BEGIN
 r:=parkvault_qa_20260905.begin_sourcing_balance_checkout(
   '00000000-0000-4000-8000-000000000200','00000000-0000-4000-8000-000000000002');
 PERFORM pg_sleep(hold_seconds);
 r:=r||jsonb_build_object('ok',true,'elapsed_ms',extract(epoch from clock_timestamp()-started)*1000);
 INSERT INTO parkvault_qa_20260905.results VALUES('balance_'||n,r,clock_timestamp());
 RETURN r;
END $$;
