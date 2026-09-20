-- A block is a relationship-level safety action: once either participant
-- blocks the conversation, the other participant must not be able to send
-- additional messages. Reports must remain available after blocking so a
-- member can still document the conversation for moderation.

CREATE OR REPLACE FUNCTION public.send_conversation_message(_conversation_id uuid, _body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  message_id uuid;
  recipient uuid;
  listing_title text := 'your listing';
  clean_body text := btrim(coalesce(_body, ''));
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF char_length(clean_body) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'Message must be between 1 and 5000 characters';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = _conversation_id AND user_id = uid AND blocked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'You are not a participant in this conversation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = _conversation_id AND user_id <> uid AND blocked_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Messaging is unavailable for this conversation';
  END IF;
  IF (SELECT count(*) FROM public.rate_limit_events
      WHERE user_id = uid AND action = 'conversation_message'
        AND created_at > now() - interval '1 minute') >= 30 THEN
    RAISE EXCEPTION 'You are sending messages too quickly. Try again shortly.';
  END IF;

  SELECT CASE WHEN buyer_id = uid THEN seller_id ELSE buyer_id END
    INTO recipient
  FROM public.conversations WHERE id = _conversation_id;
  IF recipient IS NULL THEN RAISE EXCEPTION 'Conversation not found'; END IF;

  SELECT coalesce(p.name, 'your listing') INTO listing_title
  FROM public.conversations c
  LEFT JOIN public.asks a ON a.id = c.listing_id
  LEFT JOIN public.product_variants v ON v.id = a.variant_id
  LEFT JOIN public.products p ON p.id = v.product_id
  WHERE c.id = _conversation_id;

  INSERT INTO public.conversation_messages (conversation_id, sender_id, body)
  VALUES (_conversation_id, uid, clean_body)
  RETURNING id INTO message_id;
  INSERT INTO public.rate_limit_events (user_id, action)
  VALUES (uid, 'conversation_message');
  INSERT INTO public.notifications
    (user_id, kind, title, body, order_id, entity_type, entity_id, destination_url)
  VALUES
    (recipient, 'message', 'New marketplace message',
     left('You have a new message about ' || listing_title || ': ' || clean_body, 280),
     null, 'conversation', _conversation_id, '/account?section=messages&conversation=' || _conversation_id)
  ON CONFLICT DO NOTHING;
  UPDATE public.conversations SET last_message_at = now(), closed_at = null WHERE id = _conversation_id;
  RETURN message_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.send_conversation_message_with_attachment(
  _conversation_id uuid,
  _body text,
  _attachment_path text,
  _attachment_content_type text,
  _attachment_size integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  message_id uuid;
  recipient uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF char_length(btrim(coalesce(_body, ''))) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'Message must be between 1 and 5000 characters';
  END IF;
  IF _attachment_path IS NOT NULL AND split_part(_attachment_path, '/', 1) <> uid::text THEN
    RAISE EXCEPTION 'Attachment path is not valid';
  END IF;
  IF _attachment_content_type IS NOT NULL AND _attachment_content_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') THEN
    RAISE EXCEPTION 'Attachment type is not allowed';
  END IF;
  IF _attachment_size IS NOT NULL AND _attachment_size NOT BETWEEN 1 AND 10485760 THEN
    RAISE EXCEPTION 'Attachment is too large';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = _conversation_id AND user_id = uid AND blocked_at IS NULL
  ) THEN RAISE EXCEPTION 'You are not a participant in this conversation'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = _conversation_id AND user_id <> uid AND blocked_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'Messaging is unavailable for this conversation'; END IF;

  SELECT CASE WHEN buyer_id = uid THEN seller_id ELSE buyer_id END INTO recipient
  FROM public.conversations WHERE id = _conversation_id;
  IF recipient IS NULL THEN RAISE EXCEPTION 'Conversation not found'; END IF;

  INSERT INTO public.conversation_messages
    (conversation_id, sender_id, body, attachment_path, attachment_content_type, attachment_size)
  VALUES (_conversation_id, uid, btrim(_body), _attachment_path, _attachment_content_type, _attachment_size)
  RETURNING id INTO message_id;
  INSERT INTO public.rate_limit_events (user_id, action) VALUES (uid, 'conversation_message');
  INSERT INTO public.notifications
    (user_id, kind, title, body, order_id, entity_type, entity_id, destination_url)
  VALUES
    (recipient, 'message', 'New marketplace message', 'You have a new message with an attachment.', null,
     'conversation', _conversation_id, '/account?section=messages&conversation=' || _conversation_id)
  ON CONFLICT DO NOTHING;
  UPDATE public.conversations SET last_message_at = now(), closed_at = null WHERE id = _conversation_id;
  RETURN message_id;
END;
$function$;

DROP POLICY IF EXISTS "Members report conversations" ON public.conversation_reports;
CREATE POLICY "Members report conversations"
ON public.conversation_reports
FOR INSERT
TO authenticated
WITH CHECK (
  reporter_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.conversations conversation
    WHERE conversation.id = conversation_reports.conversation_id
      AND (conversation.buyer_id = auth.uid() OR conversation.seller_id = auth.uid())
  )
);

GRANT EXECUTE ON FUNCTION public.send_conversation_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_conversation_message_with_attachment(uuid, text, text, text, integer) TO authenticated;
