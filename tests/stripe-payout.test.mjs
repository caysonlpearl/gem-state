import test from "node:test";
import assert from "node:assert/strict";
import { sendOrderTransfer } from "../src/lib/stripe-payout.server.ts";

const payout = {
  orderId: "qa-order",
  orderNumber: "PV-QA",
  amountCents: 4050,
  currency: "USD",
  destination: "acct_qa",
  sourceCharge: "ch_qa",
  live: false,
  checkoutSessionId: "cs_test_qa",
  primaryPaymentIntentId: "pi_qa",
  paymentIntentIds: ["pi_qa"],
};
const transfer = {
  id: "tr_qa",
  amount: 4050,
  currency: "usd",
  destination: "acct_qa",
  livemode: false,
  amount_reversed: 0,
  metadata: { parkvault_order_id: "qa-order" },
};
function mock({
  existing = [],
  destinationExisting,
  charge = {},
  more = false,
  session = {},
  intent = {},
} = {}) {
  const calls = [];
  return {
    calls,
    checkout: {
      sessions: {
        retrieve: async () => ({
          livemode: false,
          status: "complete",
          payment_intent: "pi_qa",
          ...session,
        }),
      },
    },
    paymentIntents: {
      retrieve: async (id) => ({
        id,
        livemode: false,
        status: "succeeded",
        currency: "usd",
        metadata: { parkvault_order_id: "qa-order" },
        latest_charge: {
          id: "ch_qa",
          payment_intent: id,
          livemode: false,
          paid: true,
          captured: true,
          currency: "usd",
          amount: 5694,
          amount_refunded: 0,
          disputed: false,
          ...charge,
        },
        ...intent,
      }),
    },
    charges: {
      retrieve: async () => ({
        paid: true,
        captured: true,
        livemode: false,
        amount_refunded: 0,
        transfer_group: "group_from_checkout",
        ...charge,
      }),
    },
    transfers: {
      list: async (params) => ({
        data: params.destination ? (destinationExisting ?? existing) : existing,
        has_more: more,
      }),
      create: async (...args) => {
        calls.push(args);
        return transfer;
      },
    },
  };
}
test("source charge transfers omit conflicting transfer_group and use stable key", async () => {
  const api = mock();
  await sendOrderTransfer(api, payout);
  assert.equal(api.calls[0][0].source_transaction, "ch_qa");
  assert.equal("transfer_group" in api.calls[0][0], false);
  assert.equal(api.calls[0][1].idempotencyKey, "parkvault-payout-v2-qa-order");
});
test("previously successful transfer is reconciled without sending another", async () => {
  const api = mock({ existing: [transfer] });
  assert.equal((await sendOrderTransfer(api, payout)).id, "tr_qa");
  assert.equal(api.calls.length, 0);
});
test("source transfer is recovered by destination metadata when its group is unavailable", async () => {
  const api = mock({
    existing: [],
    destinationExisting: [transfer],
    charge: { transfer_group: null },
  });
  assert.equal((await sendOrderTransfer(api, payout)).id, "tr_qa");
  assert.equal(api.calls.length, 0);
});
test("mismatched or reversed transfer blocks retry", async () => {
  for (const change of [
    { amount: 4000 },
    { destination: "acct_other" },
    { amount_reversed: 1 },
    { livemode: true },
  ]) {
    const api = mock({ existing: [{ ...transfer, ...change }] });
    await assert.rejects(sendOrderTransfer(api, payout), /does not match/);
    assert.equal(api.calls.length, 0);
  }
});
test("wrong mode and refunded source payments cannot transfer", async () => {
  for (const charge of [{ livemode: true }, { amount_refunded: 100 }, { captured: false }]) {
    const api = mock({ charge });
    await assert.rejects(sendOrderTransfer(api, payout));
    assert.equal(api.calls.length, 0);
  }
});
test("shopper combined-balance transfer retains order group without source charge", async () => {
  const api = mock();
  await sendOrderTransfer(api, { ...payout, sourceCharge: undefined });
  assert.equal(api.calls[0][0].transfer_group, "PV-QA");
  assert.equal("source_transaction" in api.calls[0][0], false);
});
test("ambiguous history blocks creation", async () => {
  const api = mock({ more: true });
  await assert.rejects(sendOrderTransfer(api, payout), /reconciliation/);
  assert.equal(api.calls.length, 0);
});
test("shopper sandbox order cannot transfer in live mode without a source charge", async () => {
  const api = mock();
  await assert.rejects(
    sendOrderTransfer(api, { ...payout, sourceCharge: undefined, live: true }),
    /current Stripe mode/,
  );
  assert.equal(api.calls.length, 0);
});
test("shopper funding must match checkout, captured payment, currency and refund balance", async () => {
  for (const options of [
    { session: { payment_intent: "pi_other" } },
    { session: { livemode: true } },
    { intent: { status: "requires_capture" } },
    { intent: { currency: "eur" } },
    { charge: { disputed: true } },
    { charge: { amount_refunded: 2000 } },
  ]) {
    const api = mock(options);
    await assert.rejects(sendOrderTransfer(api, { ...payout, sourceCharge: undefined }));
    assert.equal(api.calls.length, 0);
  }
});
test("shopper receipt adjustments may combine captured payments but not another order's funds", async () => {
  const api = mock({ charge: { amount: 2500, amount_refunded: 100 } });
  await sendOrderTransfer(api, {
    ...payout,
    sourceCharge: undefined,
    paymentIntentIds: ["pi_qa", "pi_balance"],
  });
  assert.equal(api.calls.length, 1);
  const wrongOrder = mock({ intent: { metadata: { parkvault_order_id: "other-order" } } });
  await assert.rejects(
    sendOrderTransfer(wrongOrder, {
      ...payout,
      sourceCharge: undefined,
      paymentIntentIds: ["pi_balance"],
    }),
    /for this order/,
  );
  assert.equal(wrongOrder.calls.length, 0);
});
