-- Phase 2 conversation-report workflow. Reports remain private to members and
-- become an operator queue with explicit assignment, notes, and resolution.

ALTER TABLE public.conversation_reports
  ADD COLUMN IF NOT EXISTS admin_note text,
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

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
  IF _action NOT IN ('reviewed', 'dismissed') THEN
    RAISE EXCEPTION 'Action must be reviewed or dismissed';
  END IF;
  IF clean_note IS NOT NULL AND char_length(clean_note) > 1000 THEN
    RAISE EXCEPTION 'Keep the note under 1,000 characters';
  END IF;

  UPDATE public.conversation_reports
  SET status = _action,
      admin_note = clean_note,
      resolved_at = now(),
      resolved_by = uid
  WHERE id = _report_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation report not found'; END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_resolve_conversation_report(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_resolve_conversation_report(uuid, text, text) TO authenticated;
