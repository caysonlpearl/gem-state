import test from "node:test";
import assert from "node:assert/strict";
import { applyOfferResponse } from "../src/lib/offer-response.server.ts";

test("fee or permission failure does not release the existing hold", async () => {
  let released = false;
  await assert.rejects(
    applyOfferResponse({
      respond: async () => {
        throw new Error("fee calculation failed");
      },
      releaseHold: async () => {
        released = true;
      },
    }),
    /fee calculation failed/,
  );
  assert.equal(released, false);
});
test("response is committed before the hold is released", async () => {
  const steps = [];
  const result = await applyOfferResponse({
    respond: async () => {
      steps.push("save");
      return null;
    },
    releaseHold: async () => {
      steps.push("release");
    },
  });
  assert.deepEqual(steps, ["save", "release"]);
  assert.equal(result.authorizationReleasePending, false);
});
test("failed release reports saved response with release pending", async () => {
  const result = await applyOfferResponse({
    respond: async () => null,
    releaseHold: async () => {
      throw new Error("Stripe temporarily unavailable");
    },
  });
  assert.equal(result.authorizationReleasePending, true);
  assert.equal(result.orderId, null);
});
