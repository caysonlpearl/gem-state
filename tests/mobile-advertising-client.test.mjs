import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as contract from "../src/lib/mobile-advertising.ts";
const compiled = ts.transpileModule(
  readFileSync(new URL("../apps/mobile/src/advertising.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
function harness() {
  const enabled = [],
    events = [],
    state = { server: true, att: "authorized", unavailable: false };
  const sdk = {
    setEnabled: async ({ enabled: v }) => {
      enabled.push(v);
    },
    setConsent: async () => {},
    logEvent: async (event) => {
      events.push(event);
    },
  };
  const modules = {
    "@capacitor/core": {
      Capacitor: {
        isNativePlatform: () => true,
        isPluginAvailable: () => true,
        getPlatform: () => "ios",
      },
      registerPlugin: () => ({
        trackingStatus: async () => ({ status: state.att }),
        requestTracking: async () => ({ status: state.att }),
      }),
    },
    "@capacitor-firebase/analytics": {
      FirebaseAnalytics: sdk,
      ConsentStatus: { Granted: "granted", Denied: "denied" },
      ConsentType: {
        AdStorage: "ad_storage",
        AdUserData: "ad_user_data",
        AdPersonalization: "ad_personalization",
        AnalyticsStorage: "analytics_storage",
      },
    },
    "@capacitor-community/facebook-login": {
      FacebookLogin: {
        setAutoLogAppEventsEnabled: async () => {},
        setAdvertiserTrackingEnabled: async () => {},
        setAdvertiserIDCollectionEnabled: async () => {},
        logEvent: sdk.logEvent,
      },
    },
    "../../../src/lib/mobile-advertising": contract,
    "./client": {
      api: async () => {
        if (state.unavailable) throw Error("offline");
        return { advertising: state.server, platform: "ios", att: state.att };
      },
    },
  };
  const exports = {};
  new Function("require", "exports", compiled)((name) => modules[name], exports);
  exports.configureAdvertising(true);
  return { state, enabled, events, client: exports };
}
test("native measurement respects a server-side pause returned during opt-in", async () => {
  const h = harness();
  h.state.server = false;
  const consent = await h.client.setAdvertising(true, true);
  assert.equal(consent.advertising, false);
  assert(!h.enabled.includes(true));
  await h.client.trackAdvertising("listing_viewed", "general");
  assert.deepEqual(h.events, []);
});
test("native measurement checks current ATT immediately before export and deduplicates event ids", async () => {
  const h = harness();
  await h.client.setAdvertising(true, true);
  const id = "11111111-1111-4111-8111-111111111111";
  await h.client.trackAdvertising("listing_viewed", "general", id);
  await h.client.trackAdvertising("listing_viewed", "general", id);
  assert.equal(h.events.length, 2);
  h.state.att = "denied";
  await h.client.trackAdvertising(
    "listing_viewed",
    "general",
    "22222222-2222-4222-8222-222222222222",
  );
  assert.equal(h.events.length, 2);
  assert.equal(h.enabled.at(-1), false);
});

test("native advertising stops when current consent cannot be checked", async () => {
  const h = harness();
  await h.client.setAdvertising(true, true);
  h.state.unavailable = true;
  await h.client.trackAdvertising("listing_viewed", "general");
  assert.equal(h.events.length, 0);
  assert.equal(h.enabled.at(-1), false);
});
