-- Keep seeded vehicle listings suitable for a customer-facing marketplace.
-- This changes only the generated seed copy; seller-authored listing content is untouched.

UPDATE public.products
SET description = regexp_replace(
  description,
  '^(?:Fictional seed listing for MVP flow testing\.|MVP demo listing for flow testing\.|Example Idaho vehicle listing used to validate browsing and seller contact flows\.)\s*',
  ''
)
WHERE description ~ '^(Fictional seed listing for MVP flow testing\.|MVP demo listing for flow testing\.|Example Idaho vehicle listing used to validate browsing and seller contact flows\.)';

UPDATE public.products
SET description = replace(
  description,
  'Staged Idaho listing for marketplace testing; buyers should confirm',
  'Buyers should confirm'
)
WHERE description LIKE '%Staged Idaho listing for marketplace testing;%';

UPDATE public.asks
SET seller_note = 'Confirm item details and availability directly with the seller.'
WHERE seller_note IN (
  'Seed record for MVP testing; replace demo photo and copy before approval.',
  'MVP seed record; replace demo media and copy before launch.',
  'Example listing for marketplace testing. Confirm item details and availability directly with the seller.',
  'Staged listing for marketplace testing. Confirm item details and availability directly with the seller.'
);
