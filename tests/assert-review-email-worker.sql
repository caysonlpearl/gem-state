BEGIN; SET LOCAL statement_timeout='15s';
-- Durable review-email delivery. Worker credentials are one-use, short-lived
-- random capabilities; only the database scheduler may mint them.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
ALTER TABLE public.transactional_email_queue ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.transactional_email_queue ADD COLUMN IF NOT EXISTS lease_token uuid;
ALTER TABLE public.transactional_email_queue ADD COLUMN IF NOT EXISTS locked_until timestamptz;
ALTER TABLE public.transactional_email_queue DROP CONSTRAINT IF EXISTS transactional_email_queue_status_check;
ALTER TABLE public.transactional_email_queue ADD CONSTRAINT transactional_email_queue_status_check
  CHECK(status IN ('pending','sending','sent','failed','skipped'));

CREATE TABLE public.review_worker_tokens (
  token_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
ALTER TABLE public.review_worker_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.review_worker_tokens FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.review_worker_tokens TO service_role;

CREATE FUNCTION public.consume_review_worker_token(_token text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE removed integer;
BEGIN
  IF length(_token)<>64 THEN RETURN false; END IF;
  DELETE FROM public.review_worker_tokens
    WHERE token_hash=encode(extensions.digest(_token,'sha256'),'hex') AND expires_at>now();
  GET DIAGNOSTICS removed=ROW_COUNT;
  RETURN removed=1;
END $$;

CREATE FUNCTION public.claim_review_emails(_order_id uuid DEFAULT NULL)
RETURNS SETOF public.transactional_email_queue
LANGUAGE sql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
  WITH picked AS (
    SELECT id FROM public.transactional_email_queue
    WHERE template='seller_review_request' AND attempts<8 AND next_attempt_at<=now()
      AND (_order_id IS NULL OR order_id=_order_id)
      AND (status IN ('pending','failed') OR (status='sending' AND locked_until<now()))
    ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED
  )
  UPDATE public.transactional_email_queue q SET status='sending',attempts=q.attempts+1,
    lease_token=gen_random_uuid(),locked_until=now()+interval '5 minutes',updated_at=now()
  FROM picked WHERE q.id=picked.id RETURNING q.*;
$$;

CREATE FUNCTION public.dispatch_review_email_worker() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE token text;
BEGIN
  DELETE FROM public.review_worker_tokens WHERE expires_at<=now();
  IF NOT EXISTS(SELECT 1 FROM public.transactional_email_queue WHERE attempts<8
    AND next_attempt_at<=now() AND (status IN ('pending','failed') OR
      (status='sending' AND locked_until<now()))) THEN RETURN; END IF;
  token:=encode(extensions.gen_random_bytes(32),'hex');
  INSERT INTO public.review_worker_tokens VALUES
    (encode(extensions.digest(token,'sha256'),'hex'),now()+interval '2 minutes');
  PERFORM net.http_post(url:='https://getparkvault.com/api/internal/review-emails',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),
    body:='{}'::jsonb,timeout_milliseconds:=30000);
END $$;
REVOKE ALL ON FUNCTION public.consume_review_worker_token(text),public.claim_review_emails(uuid),public.dispatch_review_email_worker()
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_review_worker_token(text),public.claim_review_emails(uuid),public.dispatch_review_email_worker()
TO service_role;
-- Enable after the matching worker endpoint has been published.

DO $$
DECLARE id1 uuid; n integer; tok text:=repeat('a',64); test_order uuid:='76b64999-ee4a-4956-b595-d78191e81351';
BEGIN
  INSERT INTO public.review_worker_tokens VALUES(encode(extensions.digest(tok,'sha256'),'hex'),now()+interval '1 minute');
  IF public.consume_review_worker_token(repeat('b',64)) THEN RAISE EXCEPTION 'Invalid worker token accepted'; END IF;
  IF NOT public.consume_review_worker_token(tok) THEN RAISE EXCEPTION 'Valid worker token rejected'; END IF;
  IF public.consume_review_worker_token(tok) THEN RAISE EXCEPTION 'Replayed worker token accepted'; END IF;
  IF has_function_privilege('anon','public.claim_review_emails(uuid)','EXECUTE') OR
     has_function_privilege('authenticated','public.claim_review_emails(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Worker function exposed to browser users';
  END IF;
  UPDATE public.transactional_email_queue SET status='pending',attempts=0,next_attempt_at=now()
    WHERE order_id=test_order AND template='seller_review_request';
  SELECT count(*) INTO n FROM public.claim_review_emails(test_order);
  IF n<>1 THEN RAISE EXCEPTION 'Expected one queued test-order review, got %',n; END IF;
  SELECT count(*) INTO n FROM public.claim_review_emails(test_order);
  IF n<>0 THEN RAISE EXCEPTION 'Same email claimed twice'; END IF;
END $$;
ROLLBACK; SELECT 'email token and lease checks passed; no email sent; changes rolled back' AS result;
