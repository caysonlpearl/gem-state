-- Keep existing seeded records honest and aligned with the direct-contact MVP.
-- This changes only the demo fixture copy; seller-owned listings are untouched.

UPDATE public.products
SET description = replace(
  replace(
    description,
    'Fictional seed listing for MVP flow testing.',
    'Example Idaho vehicle listing used to validate browsing and seller contact flows.'
  ),
  'Replace this text and photo with seller-owned details before approval.',
  'Buyers should confirm availability, condition, title and ownership directly with the seller.'
)
WHERE description LIKE 'Fictional seed listing for MVP flow testing.%';

UPDATE public.asks
SET seller_note =
  'Example listing for marketplace testing. Confirm item details and availability directly with the seller.'
WHERE seller_note = 'Seed record for MVP testing; replace demo photo and copy before approval.';
