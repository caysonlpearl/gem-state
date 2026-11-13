import * as accountContracts from "../src/lib/mobile-account-contract.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { z } from "zod";
import * as contract from "../src/lib/mobile-contract.ts";
import * as protocol from "../src/lib/mobile-api.ts";
import * as mobileWrite from "../src/lib/mobile-write.ts";
import * as catalog from "../src/lib/mobile-catalog.ts";
const compiled = ts.transpileModule(
  readFileSync(new URL("../src/lib/mobile.server.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
function harness({
  deleted = false,
  valid = true,
  restricted = false,
  attachments = false,
  generalConversation = false,
  blocked = false,
  posting = false,
  terms = true,
} = {}) {
  const user = "11111111-1111-4111-8111-111111111111",
    writes = [];
  const db = {
    from(table) {
      const filters = [];
      const q = {
        select() {
          return q;
        },
        eq(k, v) {
          filters.push([k, v]);
          return q;
        },
        maybeSingle: async () => ({
          data:
            table === "mobile_account_deletions"
              ? deleted
                ? { status: "requested" }
                : null
              : table === "shopping_accounts"
                ? {
                    terms_version: terms ? contract.MOBILE_POLICY_VERSION : null,
                    shopping_alerts: false,
                  }
                : null,
        }),
        delete() {
          writes.push({ table, filters });
          return q;
        },
        then(resolve) {
          return Promise.resolve({ data: null, error: null }).then(resolve);
        },
      };
      return q;
    },
    rpc: async (name, args) => {
      writes.push({ name, args });
      return { error: null };
    },
  };
  const modules = {
    "@supabase/supabase-js": {
      createClient: () => ({
        auth: {
          getUser: async () => ({
            data: { user: valid ? { id: user } : null },
            error: valid ? null : { code: "invalid" },
          }),
        },
      }),
    },
    zod: { z },
    "@/config/supabase-public": {
      PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    },
    "./runtime-env.server": { serverEnv: () => undefined },
    "./mobile-api": protocol,
    "./mobile-write": mobileWrite,
    "./mobile-account-contract": accountContracts,
    "./mobile-messaging.server": {
      mobileAttachmentsReady: async () => attachments,
      mobilePostingReady: async () => posting,
    },
    "./conversation.functions": {
      getConversation: async ({ data }) => ({
        id: data.id,
        listingId: generalConversation ? null : "dealerfeed-test",
        messages: [],
      }),
      createConversationAttachmentUpload: async ({ data }) => {
        if (blocked) throw Error("Messaging is unavailable for this conversation.");
        writes.push({ kind: "prepare", ...data });
        return { path: "private-path", token: "private-token" };
      },
      sendConversationMessageWithAttachment: async ({ data }) => {
        writes.push({ kind: "attachment", ...data });
        return { messageId: "fixture" };
      },
      startConversation: async ({ data }) => {
        writes.push(data);
        return { conversationId: "one" };
      },
    },
    "./mobile-catalog": catalog,
    "./mobile-contract": contract,
    "./classifieds-display": {
      formatClassifiedPrice: () => "$1",
      adoptionPriceLabel: () => undefined,
      formatJobPay: () => "",
    },
    "./vehicle-shopping": { dealerContactPriceLabel: () => undefined },
    "@/integrations/supabase/client.server": { supabaseAdmin: db },
    "./homepage-snapshot.server": {
      readHomepageSnapshot: async () => ({
        sections: {
          current: {
            updatedAt: Date.now(),
            cards: [
              {
                id: "dealerfeed-snapshot",
                title: "A car",
                categorySlug: "cars-trucks",
                priceCents: 100,
                createdAt: new Date().toISOString(),
              },
            ],
          },
        },
      }),
    },
    "./account.functions": {
      getMyAccount: async () => ({ userId: user, onboardedAt: null }),
      saveMyProfile: async ({ data }) => {
        writes.push({ kind: "profile", ...data });
        return { ok: true };
      },
      updateMyAvatar: async ({ data }) => {
        writes.push({ kind: "avatar", ...data });
        return { ok: true };
      },
    },
    "./account-center.functions": {
      getMyContactPreferences: async () => ({
        allowEmail: true,
        allowPhone: false,
        allowText: false,
        showContactButtons: true,
        allowInternalMessages: true,
      }),
      getMyNotificationPreferences: async () => ({
        messageAlerts: true,
        listingActivity: true,
        savedSearchMatches: true,
        reviewRequests: true,
        listingUpgradeReceipts: true,
        productUpdates: false,
        marketingEmail: false,
      }),
      updateMyContactPreferences: async ({ data }) => {
        writes.push({ kind: "contact", ...data });
        return { ok: true };
      },
      updateMyNotificationPreferences: async ({ data }) => {
        writes.push({ kind: "preferences", ...data });
        return { ok: true };
      },
    },
    "./vehicle.functions": {
      decodeVehicleVin: async ({ data }) => {
        writes.push({ kind: "vin", ...data });
        return { vin: data.vin, fields: { make: "Ford", model: "F-150", year: "2024" } };
      },
    },
    "./classifieds.functions": {
      createClassifiedListing: async ({ data }) => {
        writes.push({ kind: "listing", ...data });
        return { listingId: "fixture-listing" };
      },
      loadMobileBrowseInventory: async () => {
        writes.push("catalog_read");
        return { listings: [], page: 1, pageSize: 24, total: 0 };
      },
      getClassifiedListing: async () => ({
        id: "dealerfeed-test",
        categorySlug: restricted ? "firearms" : "cars-trucks",
        title: "A listing",
        productId: "",
        priceCents: 100,
        currency: "USD",
        createdAt: new Date().toISOString(),
      }),
    },
  };
  const exports = {};
  new Function("require", "exports", compiled)((name) => {
    if (!modules[name]) throw Error("Unexpected dependency " + name);
    return modules[name];
  }, exports);
  const request = (path, method = "GET", body, token = "valid", headers = {}) =>
    exports.handleMobileRequest(
      new Request(`https://onbluebird.com/api/mobile/v1/${path}`, {
        method,
        headers: {
          ...headers,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
  return { request, writes, user };
}
test("mobile private routes reject absent or invalid identity before writing", async () => {
  const missing = harness();
  assert.equal(
    (
      await missing.request(
        "devices",
        "PUT",
        { token: "valid-device-token", platform: "ios" },
        null,
      )
    ).status,
    401,
  );
  assert.deepEqual(missing.writes, []);
  const invalid = harness({ valid: false });
  assert.equal(
    (await invalid.request("devices", "PUT", { token: "valid-device-token", platform: "ios" }))
      .status,
    401,
  );
  assert.deepEqual(invalid.writes, []);
});
test("native message retries forward the validated header and ignore a forged body receipt", async () => {
  const h = harness(),
    id = crypto.randomUUID();
  const response = await h.request(
    "conversations",
    "POST",
    { listingId: "dealerfeed-test", body: "Hello", requestId: "forged" },
    "valid",
    { "Idempotency-Key": id },
  );
  assert.equal(response.status, 200);
  assert.equal(h.writes[0].requestId, id);
  const invalid = await h.request(
    "conversations",
    "POST",
    { listingId: "dealerfeed-test", body: "Hello" },
    "valid",
    { "Idempotency-Key": "bad" },
  );
  assert.equal(invalid.status, 400);
  assert.equal(h.writes.length, 1);
});
test("mobile consent and device registration derive the caller, ignoring forged user ids", async () => {
  const h = harness();
  let r = await h.request("consent", "PUT", {
    userId: "victim",
    acceptTerms: true,
    shoppingAlerts: false,
    version: contract.MOBILE_POLICY_VERSION,
  });
  assert.equal(r.status, 200);
  assert.equal(h.writes[0].args._user, h.user);
  r = await h.request("devices", "PUT", {
    userId: "victim",
    token: "a-valid-device-token",
    platform: "android",
  });
  assert.equal(r.status, 200);
  assert.equal(h.writes[1].args._user, h.user);
});
test("pending deletion prevents permission reactivation and further marketplace writes", async () => {
  const h = harness({ deleted: true });
  for (const path of ["consent", "devices", "listings", "conversations"])
    assert.equal((await h.request(path, "PUT", {})).status, 409);
  assert.deepEqual(h.writes, []);
});
test("restricted detail is absent from the mobile API", async () => {
  const h = harness({ restricted: true });
  assert.equal((await h.request("listings/dealerfeed-test")).status, 404);
});
test("deletion requests verify confirmation and are tied to the authenticated account", async () => {
  const h = harness();
  assert.equal((await h.request("account/deletion", "POST", { confirm: "no" })).status, 400);
  assert.equal(
    (await h.request("account/deletion", "POST", { confirm: "DELETE", userId: "victim" })).status,
    200,
  );
  assert.equal(h.writes[0].name, "mobile_request_deletion");
  assert.equal(h.writes[0].args._user, h.user);
});

test("opening browse reads the published snapshot while explicit search/category/sort use the full catalog", async () => {
  const h = harness();
  const first = await h.request("listings");
  assert.equal(first.status, 200);
  const body = await first.json();
  assert.equal(body.data.selection, true);
  assert.equal(body.data.items.length, 1);
  assert.equal(h.writes.length, 0);
  for (const query of [
    "q=car",
    "category=cars-trucks",
    "sort=price_low",
    "priceMin=100",
    "city=Boise",
    "state=ID",
  ]) {
    const result = await h.request("listings?" + query);
    assert.equal(result.status, 200);
    assert.equal((await result.json()).data.selection, false);
  }
  assert.equal(h.writes.length, 6);
});

test("native attachment routes enforce readiness, authentication, catalog and a header retry receipt", async () => {
  const id = crypto.randomUUID(),
    key = crypto.randomUUID();
  const path = `conversations/${id}/attachments`;
  for (const options of [
    {},
    { restricted: true, attachments: true },
    { generalConversation: true, attachments: true },
    { deleted: true, attachments: true },
  ]) {
    const h = harness(options);
    const r = await h.request(path, "POST", {
      fileName: "note.pdf",
      contentType: "application/pdf",
      size: 10,
    });
    assert.equal(
      r.status,
      options.deleted ? 409 : options.restricted || options.generalConversation ? 404 : 503,
    );
    assert.deepEqual(h.writes, []);
  }
  const h = harness({ attachments: true });
  assert.equal((await h.request(path, "POST", {}, null)).status, 401);
  assert.equal(
    (
      await h.request(path, "POST", {
        conversationId: "forged",
        fileName: "note.pdf",
        contentType: "application/pdf",
        size: 10,
      })
    ).status,
    200,
  );
  assert.equal(h.writes[0].conversationId, id);
  const payload = {
    conversationId: "forged",
    requestId: "forged",
    body: "Hello",
    attachmentPath: "private-path",
    attachmentContentType: "application/pdf",
    attachmentSize: 10,
  };
  assert.equal((await h.request(path + "/send", "POST", payload)).status, 400);
  assert.equal(
    (await h.request(path + "/send", "POST", payload, "valid", { "Idempotency-Key": "bad" }))
      .status,
    400,
  );
  assert.equal(h.writes.length, 1);
  assert.equal(
    (await h.request(path + "/send", "POST", payload, "valid", { "Idempotency-Key": key })).status,
    200,
  );
  assert.equal(h.writes[1].conversationId, id);
  assert.equal(h.writes[1].requestId, key);
});

test("native attachment preparation returns the shared block state without issuing a token", async () => {
  const h = harness({ attachments: true, blocked: true }),
    id = crypto.randomUUID();
  const r = await h.request(`conversations/${id}/attachments`, "POST", {
    fileName: "fixture.pdf",
    contentType: "application/pdf",
    size: 42,
  });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error.code, "conversation_unavailable");
  assert.deepEqual(h.writes, []);
});

test("native VIN and durable posting validate inputs, scope retry headers and fail closed before writes", async () => {
  const key = crypto.randomUUID();
  const h = harness({ posting: true });
  assert.equal((await h.request("vehicles/vin", "POST", { vin: "not-valid" })).status, 400);
  assert.equal(h.writes.length, 0);
  assert.equal((await h.request("vehicles/vin", "POST", { vin: "1FTFW1E50JFA00001" })).status, 200);
  assert.equal(h.writes[0].kind, "vin");
  const payload = {
    title: "Fixture desk",
    description: "Local desk for sale",
    category: "furniture",
    requestId: "forged",
  };
  assert.equal(
    (await h.request("listings", "POST", payload, "valid", { "Idempotency-Key": key })).status,
    200,
  );
  assert.equal(h.writes[1].requestId, key);
  const off = harness();
  assert.equal(
    (await off.request("listings", "POST", payload, "valid", { "Idempotency-Key": key })).status,
    503,
  );
  assert.deepEqual(off.writes, []);
  assert.equal(
    (
      await h.request("listings", "POST", { ...payload, category: "firearms" }, "valid", {
        "Idempotency-Key": key,
      })
    ).status,
    400,
  );
  const noUser = harness();
  assert.equal(
    (await noUser.request("vehicles/vin", "POST", { vin: "1FTFW1E50JFA00001" }, null)).status,
    401,
  );
  assert.deepEqual(noUser.writes, []);
});

test("account updates use full allowlisted settings, require terms, and cannot select another owner", async () => {
  const h = harness();
  assert.equal((await h.request("account/contact-preferences")).status, 200);
  assert.equal((await h.request("account/notification-preferences")).status, 200);
  assert.equal(
    (
      await h.request("account/profile", "PUT", {
        displayName: "Fixture member",
        homeResortCode: "ID",
        primaryIntent: "buying",
      })
    ).status,
    200,
  );
  assert.deepEqual(h.writes[0], {
    kind: "profile",
    displayName: "Fixture member",
    homeResortCode: "ID",
    primaryIntent: "buying",
    markOnboarded: true,
  });
  assert.equal(
    (
      await h.request("account/profile", "PUT", {
        displayName: "Fixture",
        homeResortCode: "ID",
        primaryIntent: "buying",
        userId: "forged",
      })
    ).status,
    400,
  );
  assert.equal(
    (await h.request("account/contact-preferences", "PUT", { allowPhone: true })).status,
    400,
  );
  const settings = {
    allowEmail: false,
    allowPhone: true,
    allowText: false,
    showContactButtons: true,
    allowInternalMessages: false,
  };
  assert.equal((await h.request("account/contact-preferences", "PUT", settings)).status, 200);
  assert.deepEqual(h.writes[1], { kind: "contact", ...settings });
  const preferences = {
    messageAlerts: false,
    listingActivity: true,
    savedSearchMatches: false,
    reviewRequests: true,
    listingUpgradeReceipts: true,
    productUpdates: false,
    marketingEmail: false,
  };
  assert.equal(
    (await h.request("account/notification-preferences", "PUT", preferences)).status,
    200,
  );
  assert.deepEqual(h.writes[2], { kind: "preferences", ...preferences });
  assert.equal(
    (
      await h.request("account/notification-preferences", "PUT", {
        ...preferences,
        advertising: true,
      })
    ).status,
    400,
  );
  assert.equal((await h.request("account/avatar", "PUT", { path: null })).status, 200);
  const noTerms = harness({ terms: false });
  assert.equal(
    (
      await noTerms.request("account/profile", "PUT", {
        displayName: "Fixture member",
        homeResortCode: "ID",
        primaryIntent: "buying",
      })
    ).status,
    409,
  );
  assert.deepEqual(noTerms.writes, []);
  const denied = harness({ deleted: true });
  assert.equal(
    (
      await denied.request("account/profile", "PUT", {
        displayName: "Fixture member",
        homeResortCode: "ID",
        primaryIntent: "buying",
      })
    ).status,
    409,
  );
  assert.deepEqual(denied.writes, []);
  const missing = harness();
  assert.equal(
    (await missing.request("account/contact-preferences", "PUT", settings, null)).status,
    401,
  );
  assert.deepEqual(missing.writes, []);
});
test("all-device push revocation deletes only the bearer owner's registrations, including while deletion is pending", async () => {
  const h = harness({ deleted: true });
  assert.equal((await h.request("devices/all", "DELETE", { userId: "forged" })).status, 200);
  assert.deepEqual(h.writes, [{ table: "mobile_push_devices", filters: [["user_id", h.user]] }]);
  const denied = harness();
  assert.equal((await denied.request("devices/all", "DELETE", undefined, null)).status, 401);
  assert.deepEqual(denied.writes, []);
});
