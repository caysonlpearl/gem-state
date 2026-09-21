# Gem State Stripe setup

This setup covers the paid features currently enabled in Gem State Classifieds.
Payouts and seller identity onboarding are intentionally out of scope for this
phase.

## Active paid products

All listings are free to post. The only paid options are catalog-backed listing
upgrades:

- **Boosted listing** — $12.00 — refreshes the listing's position in relevant
  browse results.
- **Featured listing** — $10.00 — gives the listing featured placement for one
  day.

The prices live in `listing_upgrade_catalog`; do not create separate hard-coded
Stripe Products for these options unless the product model is intentionally
changed later. Checkout uses a server-created one-time Checkout Session and
applies the upgrade only after Stripe confirms payment.

## Stripe Dashboard setup

Use the Stripe Dashboard in the same mode as the application secret (Test mode
for QA, Live mode only when launching):

1. Set the public business name to **Gem State Classifieds**.
2. Add the website `https://gemstateclassifieds.com` and support email
   `support@gemstateclassifieds.com`.
3. Upload `public/images/brand/gem-state-classifieds-logo.png` as the Stripe
   business/checkout logo.
4. Use the Gem State palette for Checkout branding: deep teal `#14544B`,
   burnt amber `#D2681F`, and warm cream `#F3EAE0`.
5. Set the customer-facing statement descriptor to a recognizable Gem State
   value that satisfies Stripe's descriptor rules. Confirm the final legal
   business name and address in Stripe before saving.
6. Complete the account's legal business verification and payout details
   yourself. The listing-upgrade flow does not require sellers to connect a
   Stripe account.

## Webhook endpoint

Create one account-level webhook endpoint (not a Connect endpoint):

`https://your-deployed-gem-state-domain.example/api/stripe/webhook`

Replace the placeholder with the actual non-Lovable HTTPS host serving the
application. Enable these events:

- `checkout.session.completed`
- `checkout.session.expired`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `payment_intent.canceled`
- `payment_intent.payment_failed`
- `payment_intent.succeeded`

Copy the endpoint signing secret into the deployment as
`STRIPE_WEBHOOK_SECRET`. Keep the secret server-only. Do not configure a
Connect webhook for listing upgrades.

## Deployment variables

Set these server-only values on the actual host:

```text
STRIPE_SECRET_KEY=the_test_or_live_platform_secret
STRIPE_WEBHOOK_SECRET=the_account_webhook_signing_secret
GEM_STATE_SITE_URL=https://the_actual_deployed_gem_state_origin
```

Never expose any of these as `VITE_*` variables. The application identifies
Stripe requests as **Gem State Classifieds** and uses `GEM_STATE_SITE_URL` for
listing-upgrade success and cancel redirects.

## QA cards

In Test mode, use Stripe's official test cards to verify a successful payment,
decline, and authentication-required flow. Confirm that only the successful
case marks the purchase paid and applies the listing upgrade. Re-send the same
webhook event and confirm it does not apply the upgrade twice.
