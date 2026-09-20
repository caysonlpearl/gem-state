-- Route conversation reports through a security-definer function so a valid
-- participant can report even when the report row itself is otherwise private.

CREATE OR REPLACE FUNCTION public.report_conversation(
  _conversation_id uuid,
  _reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  report_id uuid;
  clean_reason text := btrim(coalesce(_reason, ''));
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;
  IF char_length(clean_reason) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'Tell us why you are reporting this conversation.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.conversations conversation
    WHERE conversation.id = _conversation_id
      AND (conversation.buyer_id = uid OR conversation.seller_id = uid)
  ) THEN
    RAISE EXCEPTION 'You are not a participant in this conversation';
  END IF;

  INSERT INTO public.conversation_reports (conversation_id, reporter_id, reason)
  VALUES (_conversation_id, uid, clean_reason)
  ON CONFLICT (conversation_id, reporter_id)
  DO UPDATE SET reason = EXCLUDED.reason, status = 'open';

  SELECT id INTO report_id
  FROM public.conversation_reports
  WHERE conversation_id = _conversation_id AND reporter_id = uid;
  RETURN report_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.report_conversation(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_conversation(uuid, text) TO authenticated;
