-- Hosted job applications: a resume + optional cover letter submitted
-- directly on Gem State for job listings using job_application_method =
-- 'gemlist'. Employers review candidates from their seller dashboard.

CREATE TABLE public.job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.asks(id) ON DELETE CASCADE,
  applicant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_path text NOT NULL,
  cover_letter text,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'reviewed', 'contacted', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_applications_cover_letter_length CHECK (
    cover_letter IS NULL OR char_length(cover_letter) <= 4000
  ),
  CONSTRAINT job_applications_one_per_applicant UNIQUE (listing_id, applicant_id)
);

CREATE INDEX job_applications_listing_idx ON public.job_applications (listing_id);
CREATE INDEX job_applications_applicant_idx ON public.job_applications (applicant_id);

ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Applicants read their own applications"
ON public.job_applications
FOR SELECT
TO authenticated
USING (applicant_id = auth.uid());

CREATE POLICY "Sellers read applications to their own listings"
ON public.job_applications
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.asks
    WHERE asks.id = job_applications.listing_id AND asks.seller_id = auth.uid()
  )
);

-- No direct INSERT/UPDATE policies: all writes go through the SECURITY
-- DEFINER RPCs below, matching the seller_reviews / seller_review_flags
-- pattern used elsewhere in this schema.
REVOKE ALL ON public.job_applications FROM anon, authenticated;
GRANT SELECT ON public.job_applications TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'job-application-resumes',
  'job-application-resumes',
  false,
  10485760,
  ARRAY['application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = excluded.allowed_mime_types;

DROP POLICY IF EXISTS "Job application resumes are private" ON storage.objects;
CREATE POLICY "Job application resumes are private"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'job-application-resumes' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'job-application-resumes' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE OR REPLACE FUNCTION public.submit_job_application(
  _listing_id uuid,
  _resume_path text,
  _cover_letter text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  ask record;
  category_slug text;
  trimmed_cover_letter text := nullif(btrim(coalesce(_cover_letter, '')), '');
  application_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF trimmed_cover_letter IS NOT NULL AND char_length(trimmed_cover_letter) > 4000 THEN
    RAISE EXCEPTION 'Cover letter must be 4000 characters or fewer';
  END IF;
  IF split_part(coalesce(_resume_path, ''), '/', 1) <> uid::text THEN
    RAISE EXCEPTION 'Resume path does not belong to the caller';
  END IF;

  SELECT a.* INTO ask FROM public.asks a WHERE a.id = _listing_id;
  IF ask.id IS NULL THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF ask.status <> 'active' OR ask.approved_at IS NULL THEN
    RAISE EXCEPTION 'This listing is not currently accepting applications';
  END IF;
  IF ask.seller_id = uid THEN RAISE EXCEPTION 'You cannot apply to your own listing'; END IF;

  SELECT c.slug INTO category_slug
  FROM public.products p JOIN public.categories c ON c.id = p.category_id
  WHERE p.id = ask.product_id;
  IF category_slug <> 'jobs' THEN RAISE EXCEPTION 'This listing is not a job listing'; END IF;

  IF (
    SELECT job_application_method FROM public.classified_listing_details
    WHERE listing_id = _listing_id
  ) <> 'gemlist' THEN
    RAISE EXCEPTION 'This employer accepts applications through their own site, not Gem State';
  END IF;

  INSERT INTO public.job_applications (listing_id, applicant_id, resume_path, cover_letter)
  VALUES (_listing_id, uid, _resume_path, trimmed_cover_letter)
  ON CONFLICT ON CONSTRAINT job_applications_one_per_applicant
  DO UPDATE SET
    resume_path = excluded.resume_path,
    cover_letter = excluded.cover_letter,
    status = 'submitted',
    updated_at = now()
  RETURNING id INTO application_id;

  INSERT INTO public.notifications (user_id, kind, title, body, entity_type, entity_id, destination_url)
  VALUES (
    ask.seller_id, 'job_application', 'New job application',
    'Someone applied to your job listing.', 'job_application', application_id,
    '/selling#applications'
  );

  RETURN application_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_job_application(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_job_application(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_job_application_status(
  _application_id uuid,
  _status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF _status NOT IN ('submitted', 'reviewed', 'contacted', 'rejected') THEN
    RAISE EXCEPTION 'Invalid application status';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.job_applications ja
    JOIN public.asks a ON a.id = ja.listing_id
    WHERE ja.id = _application_id AND a.seller_id = uid
  ) THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  UPDATE public.job_applications SET status = _status, updated_at = now() WHERE id = _application_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_job_application_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_job_application_status(uuid, text) TO authenticated;
