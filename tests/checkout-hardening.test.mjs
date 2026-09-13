import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const checkoutSource = await readFile(
  new URL("../src/lib/stripe-marketplace.functions.ts", import.meta.url),
  "utf8",
);
const optionsSource = await readFile(
  new URL("../src/components/market/SourcingOptionsPanel.tsx", import.meta.url),
  "utf8",
);
const migrationSource = await readFile(
  new URL("../supabase/migrations/20260907153000_launch_checkout_hardening.sql", import.meta.url),
  "utf8",
);
const webhookSource = await readFile(
  new URL("../src/lib/stripe-marketplace.server.ts", import.meta.url),
  "utf8",
);
const sellerSource = await readFile(
  new URL("../src/lib/seller.functions.ts", import.meta.url),
  "utf8",
);
const orderRouteSource = await readFile(
  new URL("../src/routes/_authenticated/orders.$orderId.tsx", import.meta.url),
  "utf8",
);

test("checkout uses the ParkVault-quoted address without collecting a second shipping address", () => {
  assert.doesNotMatch(checkoutSource, /shipping_address_collection/);
  assert.match(
    checkoutSource,
    /customer_update: \{ address: "never", name: "never", shipping: "never" \}/,
  );
  assert.match(checkoutSource, /payment_intent_data: \{[\s\S]*?shipping,/);
});

test("counteroffer checkout releases the exact listing reservation on startup failure", () => {
  const start = checkoutSource.indexOf("export const startCounterofferCheckout");
  const end = checkoutSource.indexOf("export async function cancelOfferAuthorization", start);
  const counter = checkoutSource.slice(start, end);
  assert.match(counter, /try \{/);
  assert.match(counter, /release_stripe_checkout_order/);
});

test("legacy unpaid shopper order paths are not exposed at launch", () => {
  assert.doesNotMatch(optionsSource, /requestSourcingOffer|Request this offer/);
  assert.match(migrationSource, /REVOKE EXECUTE ON FUNCTION public\.request_sourcing_ask/);
  assert.match(migrationSource, /REVOKE EXECUTE ON FUNCTION public\.accept_shopper_quote/);
});

test("an existing Stripe offer authorization cannot be overwritten", () => {
  assert.match(migrationSource, /existing\.stripe_payment_intent_id IS NOT NULL/);
  assert.match(migrationSource, /Withdraw your existing offer and release its card hold/);
});

test("a failed offer Checkout can retry without reusing an expired Stripe Session", () => {
  assert.match(migrationSource, /CREATE OR REPLACE FUNCTION public\.begin_listing_offer_checkout/);
  assert.match(migrationSource, /CREATE OR REPLACE FUNCTION public\.fail_listing_offer_checkout/);
  assert.match(checkoutSource, /checkoutAttempt: String\(checkoutAttempt\)/);
  assert.match(checkoutSource, /checkoutAttemptSuffix/);
  assert.match(checkoutSource, /\.eq\("stripe_checkout_attempt", checkoutAttempt\)/);
  assert.match(checkoutSource, /stripe_checkout_attempt: null/);
});

test("database expiry never releases a reservation with a Stripe Checkout Session", () => {
  assert.match(migrationSource, /AND stripe_checkout_session_id IS NULL/);
  assert.match(migrationSource, /o\.status <> 'awaiting_payment'/);
  assert.match(migrationSource, /Exact listing reservation is no longer owned by this order/);
  assert.match(checkoutSource, /persistCheckoutReservation/);
  assert.match(checkoutSource, /persistOfferCheckout/);
  assert.match(checkoutSource, /checkout\.sessions\.expire\(session\.id\)/);
  assert.match(checkoutSource, /CheckoutReservationSyncError/);
});

test("a completed sale queues and releases every competing offer authorization", () => {
  assert.match(migrationSource, /THEN 'cancel_pending'/);
  assert.match(migrationSource, /stripe_checkout_session_id IS NOT NULL/);
  assert.match(webhookSource, /releaseCompetingOfferAuthorizations/);
  assert.match(webhookSource, /parkvault-losing-offer-release-/);
  assert.match(webhookSource, /checkout\.sessions\.expire\(session\.id\)/);
});

test("unpaid reservations cannot open disputes", () => {
  assert.match(migrationSource, /IF o\.payment_authorized IS NOT TRUE/);
  assert.match(migrationSource, /A dispute can only be opened on a paid order before completion/);
});

test("shipping-label purchase is reserved and cost-capped before Shippo is charged", () => {
  const reservationIndex = sellerSource.indexOf('rpc("reserve_shipping_label_purchase"');
  const purchaseIndex = sellerSource.indexOf('shippoRequest<any>("/transactions"');
  assert.ok(reservationIndex >= 0 && reservationIndex < purchaseIndex);
  assert.match(migrationSource, /label_purchase_status = 'purchasing'/);
  assert.match(migrationSource, /IF _rate_cents > o\.shipping_cents/);
});

test("completed orders show reviews but do not offer an unusable dispute action", () => {
  assert.match(orderRouteSource, /\["delivered", "completed"\]\.includes\(data\.status\)/);
  assert.doesNotMatch(
    orderRouteSource,
    /showDispute=\{\["shipped", "delivered", "completed", "disputed"\]/,
  );
});
