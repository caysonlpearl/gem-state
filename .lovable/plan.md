# Finishing the backend move

Where things stand: the site now runs on a brand-new backend with everything restored — all tables, rules, functions, the 12 categories, the 9 test listings, the 8 accounts, all 8 storage areas and all 18 photos. The build and all main pages pass.

What's left falls into two buckets.

## 1. Things only you can do

- **Shipping key** — the shipping provider key was never re-entered on this backend, so buying a label will fail. Needed before checkout works end to end.
- **Sign-in passwords** — the backup could not carry passwords, so all 8 accounts must sign in by email link once and set a new password.
- **Sign-in providers** — if Google sign-in was on before, it has to be switched on again here.
- **Email sending** — the sender domain still belongs to ParkVault and the email wording still says "ParkVault". Tell me the sender domain you want for Gem State Classifieds and I'll set it up and rewrite the wording.
- **Your own Supabase (optional)** — if the end goal is still your own account rather than the built-in backend, that switch happens in Project Settings, is irreversible, and should only be done with the backup in hand. The backup zip is already saved in your files.

## 2. Things I can do once you say go

- Re-check that the payment keys on this backend point at the right account and that the two payment notification endpoints are registered against the current site address.
- Walk the full set of flows against the live site and report results: sign in, post a listing, browse, listing page, make an offer, buy now, checkout, order page.
- Rewrite the remaining ParkVault wording on the sign-in page, onboarding, account area and order receipt.
- Update the roadmap to reflect the completed restore.

## Technical notes

- Secrets present: PARKVAULT_SITE_URL, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_CONNECT_WEBHOOK_SECRET. Missing: SHIPPO_API_TOKEN (used by `src/lib/seller.functions.ts` and the shipping label paths).
- `PARKVAULT_SITE_URL` must resolve to the current published address, since Stripe return URLs and webhook targets are built from it.
- `auth.users` rows exist with `encrypted_password` NULL; magic link / OTP only until each user resets.
- Verification will be done with a headless browser pass against the running app plus direct reads of the resulting rows.
