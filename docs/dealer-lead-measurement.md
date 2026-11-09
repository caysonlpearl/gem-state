# Dealership inquiry landing page and measurement

Use `https://onbluebird.com/for-dealers` for dealer-acquisition advertising. `/contact?interest=dealership` redirects here and keeps bounded campaign parameters, the OpenAI `oppref` reference, and internal QA flags. Generic contact messages retain their existing intake.

The four required fields are dealership name, website, contact name, and email. Phone, inventory provider/count and notes are optional. The setup explorer populates editable inventory details; it does not configure a feed. The interactive product example contains no actual inventory or provider calls.

`submitDealerInquiry` validates server-side and calls a service-only atomic reservation function. `dealer_inquiries` is private: anon has no privileges, authenticated members have no qualifying RLS access, administrators can read and change only the inquiry status. A stable per-attempt request key and payload fingerprint prevent retry duplicates and changed-payload reuse. Atomic per-address/email/global limits and a honeypot bound abuse. Only a salted address digest is retained, never the raw IP.

Successful storage returns the lead ID as the conversion event ID. The success screen removes all contact fields before loading the existing Bluebird pixel (`QwZ496FXpY5Z2pc8bAJS2Y`) and `lead_created` / `customer_action` event. Duplicate acknowledgements do not count again. No form fields are sent to ad measurement. Preview hosts, privacy signals, bots and `_qa=1` exclude measurement; SDK failures cannot alter accepted requests.

Email notifications are paused by default, as requested by the owner on November 9, 2026. The queue is not claimed and no email attempts run unless `DEALER_INQUIRY_EMAIL_ENABLED=true`. Enabling requires an owner-approved verified sender and `RESEND_FROM_EMAIL`; the current resend.dev test sender cannot deliver to the business inbox. Leads remain available in the private administrator inbox while sending is paused.

When enabled, notifications use existing Resend configuration, a fixed recipient of bluebirdmarketplaceid@gmail.com, and the dealership contact as Reply-To. A server request attempts notification after persistence. The authenticated `/api/internal/dealer-inquiries` endpoint and existing worker scheduler drain a durable, leased queue every 15 minutes. Each email has a stable HTTP Idempotency-Key. Failed requests back off; eight failed attempts become `failed` and remain visible in `/admin/dealer-inquiries`. “Sent” means provider acceptance, not independently verified mailbox delivery. The admin inbox links from `/admin`; status options are New, Contacted and Closed.

Required migrations: `20261109233000_dealer_inquiries.sql` then `20261109233100_dealer_inquiry_notifications_schedule.sql`. The schedule reuses the existing authenticated news job without exposing its credential or changing other jobs. It must be installed before activation. No account signup, pricing commitment, or feed publication occurs through the form.

## Research used on the page

Cox Automotive’s 2025 Car Buyer Journey Study, published January 13, 2026, reports 75% used third-party websites, 4.6 average sites visited, and 71% began unsure which vehicle to buy. These are U.S. industry findings, not Bluebird audience or sales statistics. The page links the original source and labels the distinction.

Source: https://www.coxautoinc.com/insights/cox-automotive-car-buyer-journey-study-finds-efficiency-digital-tools-and-ai-drive-record-satisfaction/

Pixel reference: https://developers.openai.com/ads/measurement-pixel
Resend idempotency: https://resend.com/docs/dashboard/emails/idempotency-keys

Live QA must retain `_qa=1`, use a clearly identified test inquiry, check the private inbox and owner mailbox, and mark the inquiry closed. Ad-platform receipt requires a genuine qualifying conversion; no synthetic conversion or campaign activation is part of QA.
