-- Phase 2 conversation-report workflow. Reports remain private to members and
-- become an operator queue with explicit assignment, notes, and resolution.

ALTER TABLE public.conversation_reports
  ADD COLUMN IF NOT EXISTS admin_note text,
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.conversation_reports
  DROP CONSTRAINT IF EXISTS conversation_reports_status_check;
ALTER TABLE public.conversation_reports
  ADD CONSTRAINT conversation_reports_status_check
  CHECK (status IN ('open', 'under_review', 'reviewed', 'dismissed'));

ALTER TABLE public.conversation_reports
  DROP CONSTRAINT IF EXISTS conversation_reports_admin_note_length;
ALTER TABLE public.conversation_reports
  ADD CONSTRAINT conversation_reports_admin_note_length
  CHECK (admin_note IS NULL OR char_length(admin_note) <= 1000);

CREATE INDEX IF NOT EXISTS conversation_reports_status_created_idx
  ON public.conversation_reports (status, created_at DESC);

DROP POLICY IF EXISTS "Admins read conversation reports" ON public.conversation_reports;
CREATE POLICY "Admins read conversation reports"
ON public.conversation_reports
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update conversation reports" ON public.conversation_reports;
CREATE POLICY "Admins update conversation reports"
ON public.conversation_reports
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.admin_resolve_conversation_report(
  _report_id uuid,
  _action text,
  _admin_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  clean_note text := nullif(btrim(coalesce(_admin_note, '')), '');
BEGIN
  IF uid IS NULL OR NOT public.has_role(uid, 'admin') THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;
  IF _action NOT IN ('assign', 'reviewed', 'dismissed') THEN
    RAISE EXCEPTION 'Action must be assign, reviewed or dismissed';
  END IF;
  IF clean_note IS NOT NULL AND char_length(clean_note) > 1000 THEN
    RAISE EXCEPTION 'Keep the note under 1,000 characters';
  END IF;

  UPDATE public.conversation_reports
  SET status = CASE WHEN _action = 'assign' THEN 'under_review' ELSE _action END,
      admin_note = COALESCE(clean_note, admin_note),
      assigned_to = CASE WHEN _action = 'assign' THEN uid ELSE assigned_to END,
      resolved_at = CASE WHEN _action = 'assign' THEN NULL ELSE now() END,
      resolved_by = CASE WHEN _action = 'assign' THEN NULL ELSE uid END
  WHERE id = _report_id
    AND (_action = 'assign' OR status IN ('open', 'under_review'));
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation report not found'; END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_resolve_conversation_report(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_resolve_conversation_report(uuid, text, text) TO authenticated;

-- Listing reports use the same operator lifecycle and retain an immutable
-- action record so a later moderation review can reconstruct what happened.
CREATE TABLE IF NOT EXISTS public.classified_listing_report_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.classified_listing_reports(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('created', 'assigned', 'reviewed', 'dismissed')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT classified_listing_report_events_note_length CHECK (note IS NULL OR char_length(note) <= 1000)
);

CREATE INDEX IF NOT EXISTS classified_listing_report_events_report_idx
  ON public.classified_listing_report_events (report_id, created_at DESC);

ALTER TABLE public.classified_listing_reports
  DROP CONSTRAINT IF EXISTS classified_listing_reports_status_check;
ALTER TABLE public.classified_listing_reports
  ADD CONSTRAINT classified_listing_reports_status_check
  CHECK (status IN ('open', 'under_review', 'reviewed', 'dismissed'));

ALTER TABLE public.classified_listing_report_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.classified_listing_report_events FROM anon, authenticated;
GRANT ALL ON public.classified_listing_report_events TO service_role;

DROP POLICY IF EXISTS "Admins read listing report events" ON public.classified_listing_report_events;
CREATE POLICY "Admins read listing report events"
ON public.classified_listing_report_events
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.record_classified_listing_report_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.classified_listing_report_events (report_id, actor_id, action)
  VALUES (NEW.id, NEW.reporter_id, 'created');
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS classified_listing_report_created_event
  ON public.classified_listing_reports;
CREATE TRIGGER classified_listing_report_created_event
AFTER INSERT ON public.classified_listing_reports
FOR EACH ROW EXECUTE FUNCTION public.record_classified_listing_report_created();

CREATE OR REPLACE FUNCTION public.admin_update_classified_listing_report(
  _report_id uuid,
  _action text,
  _note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  clean_note text := nullif(btrim(coalesce(_note, '')), '');
BEGIN
  IF uid IS NULL OR NOT public.has_role(uid, 'admin') THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;
  IF _action NOT IN ('assign', 'reviewed', 'dismissed') THEN
    RAISE EXCEPTION 'Action must be assign, reviewed or dismissed';
  END IF;
  IF clean_note IS NOT NULL AND char_length(clean_note) > 1000 THEN
    RAISE EXCEPTION 'Keep the note under 1,000 characters';
  END IF;

  UPDATE public.classified_listing_reports
  SET status = CASE WHEN _action = 'assign' THEN 'under_review' ELSE _action END,
      resolved_at = CASE WHEN _action = 'assign' THEN NULL ELSE now() END,
      resolved_by = CASE WHEN _action = 'assign' THEN NULL ELSE uid END
  WHERE id = _report_id
    AND (_action = 'assign' OR status IN ('open', 'under_review'));
  IF NOT FOUND THEN RAISE EXCEPTION 'Listing report not found'; END IF;

  INSERT INTO public.classified_listing_report_events (report_id, actor_id, action, note)
  VALUES (_report_id, uid, CASE WHEN _action = 'assign' THEN 'assigned' ELSE _action END, clean_note);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_update_classified_listing_report(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_classified_listing_report(uuid, text, text) TO authenticated;
