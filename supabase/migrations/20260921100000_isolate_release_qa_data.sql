-- Keep synthetic QA fixtures out of the public marketplace before MVP release.
-- This targets only the exact records created for verification; seller-authored
-- listings and normal saved searches are untouched.

WITH release_qa_asks AS (
  SELECT a.id, a.product_id
  FROM public.asks a
  JOIN public.products p ON p.id = a.product_id
  WHERE lower(btrim(p.name)) IN (
    'mvp test cordless drill',
    'qa messaging test',
    'resend delivery qa',
    'qa pet listing - do not contact'
  )
)
-- asks.status has no "pending_review" value (only active/matched/cancelled/
-- expired) -- an un-approved-but-still-active listing is how "pending
-- review" is represented everywhere else in this schema, so clearing
-- approved_at is what actually hides it from the public marketplace.
UPDATE public.asks AS a
SET approved_at = NULL,
    is_demo = TRUE,
    updated_at = now()
FROM release_qa_asks AS qa
WHERE a.id = qa.id;

WITH release_qa_asks AS (
  SELECT a.product_id
  FROM public.asks a
  JOIN public.products p ON p.id = a.product_id
  WHERE lower(btrim(p.name)) IN (
    'mvp test cordless drill',
    'qa messaging test',
    'resend delivery qa',
    'qa pet listing - do not contact'
  )
)
UPDATE public.products AS p
SET status = 'pending_review'::public.product_status
FROM release_qa_asks AS qa
WHERE p.id = qa.product_id;

-- These were created solely to exercise the saved-search UI and alert worker.
-- Cascade cleanup removes their synthetic match rows without touching the
-- member's other saved searches.
DELETE FROM public.saved_searches
WHERE name IN (
  'QA saved alert pet',
  'QA draft filter cars 2',
  'QA full filter cars'
);
