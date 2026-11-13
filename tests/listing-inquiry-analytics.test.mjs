import {
  isInternalAnalyticsBrowser,
  markInternalAnalyticsBrowser,
} from "../src/lib/analytics-browser.ts";
import { listingBusinessProps } from "../src/lib/business-context.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { isInternalAnalyticsQuery, isKnownAutomatedAgent } from "../src/lib/analytics-policy.ts";
import { classifyTrafficSource } from "../src/lib/traffic-source.ts";
import { eligibleTrafficEvents } from "../src/lib/traffic-summary.ts";
import { summarizeEditorialTraffic } from "../src/lib/editorial-traffic.ts";

// Exercise the actual message-form callbacks and analytics writer together.
// The server acknowledgement and analytics store are local fakes. No message,
// email, listing, browser session or production analytics record is created.
const component = readFileSync(
  new URL("../src/components/classifieds/ListingActions.tsx", import.meta.url),
  "utf8",
);
const parsed = ts.createSourceFile("ListingActions.tsx", component, ts.ScriptTarget.Latest, true);
let mutation;
function find(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === "inquiryMutation")
    mutation = node.initializer.arguments[0];
  ts.forEachChild(node, find);
}
find(parsed);
assert.ok(mutation, "Run the production message-form mutation, not a copied implementation");
const callbacks = ts.transpileModule(`globalThis.callbacks = (${mutation.getText(parsed)});`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const analytics = readFileSync(new URL("../src/lib/analytics.ts", import.meta.url), "utf8");
const analyticsAst = ts.createSourceFile("analytics.ts", analytics, ts.ScriptTarget.Latest, true);
const analyticsScript = ts.transpileModule(
  analyticsAst.statements
    .filter((s) => !ts.isImportDeclaration(s))
    .map((s) => s.getText(analyticsAst))
    .join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText;
const listing = { id: "offline-listing", categorySlug: "furniture", isMock: false };

function boundary({ start, originAge = 0, internal = false, brokenAnalytics = false } = {}) {
  const records = [],
    notices = [],
    calls = [],
    ui = [];
  const storage = new Map([
    [
      "bb_visit",
      JSON.stringify({
        id: "offline-visit",
        source: "google",
        channel: "search",
        landing: "/guides/offline",
      }),
    ],
    [
      "bluebird_editorial_origin",
      JSON.stringify({
        article: "guide:offline",
        placement: "guide_intro",
        category: "furniture",
        at: Date.now() - originAge,
      }),
    ],
  ]);
  const storageApi = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, v),
  };
  const runtime = {
    exports: {},
    window: {
      location: {
        pathname: "/listings/offline-listing",
        search: internal ? "?_qa=1" : "",
        hostname: "onbluebird.com",
      },
      localStorage: storageApi,
      sessionStorage: storageApi,
      matchMedia: () => ({ matches: false }),
    },
    navigator: { userAgent: "Offline test" },
    crypto: { randomUUID: () => "offline-session" },
    console: { warn() {} },
    listingBusinessProps,
    isInternalAnalyticsQuery,
    isInternalAnalyticsBrowser,
    markInternalAnalyticsBrowser,
    isKnownAutomatedAgent,
    classifyTrafficSource,
    loadSupabase: async () => ({
      rpc: async () => ({ data: false, error: null }),
      auth: { getSession: async () => ({ data: { session: { user: { id: "offline-buyer" } } } }) },
      from: (table) => {
        assert.equal(table, "analytics_events");
        return {
          insert: async (row) => {
            if (brokenAnalytics) throw new Error("Offline store unavailable");
            records.push(row);
            return { error: null };
          },
        };
      },
    }),
  };
  vm.runInNewContext(analyticsScript, runtime);
  const context = {
    listing,
    message: "Private offline message text",
    DEFAULT_MESSAGE: "Default fixture message",
    start: async (input) => {
      calls.push(input);
      return start ? start(input) : { conversationId: "offline-conversation" };
    },
    trackSellerContact: runtime.exports.trackSellerContact,
    trackCompletedInquiry: runtime.exports.trackCompletedInquiry,
    toast: { success: (text) => notices.push(text), error: (text) => notices.push(text) },
    setMessage: (value) => ui.push(["message", value]),
    setContactOpen: (value) => ui.push(["contactOpen", value]),
  };
  vm.runInNewContext(callbacks, context);
  return { callbacks: context.callbacks, records, notices, calls, ui };
}
const settleAnalytics = () => new Promise(setImmediate);

test("pending message acknowledgement cannot record a completed inquiry", async () => {
  let acknowledge;
  const b = boundary({
    start: () =>
      new Promise((resolve) => {
        acknowledge = resolve;
      }),
  });
  const pending = b.callbacks.mutationFn();
  await settleAnalytics();
  assert.equal(b.calls.length, 1);
  assert.equal(b.calls[0].data.listingId, listing.id);
  assert.equal(b.records.length, 0);
  assert.equal(b.notices.length, 0);
  acknowledge({ conversationId: "offline-conversation" });
  const result = await pending;
  assert.equal(
    b.records.length,
    0,
    "Acknowledgement must pass through the production success callback",
  );
  b.callbacks.onSuccess(result);
  await settleAnalytics();
  assert.equal(b.records.filter((r) => r.name === "inquiry_completed").length, 1);
});

test("rejected messages produce no contact success or completed-inquiry event", async () => {
  const b = boundary({
    start: async () => {
      throw new Error("Fixture server rejection");
    },
  });
  await assert.rejects(b.callbacks.mutationFn(), /Fixture server rejection/);
  b.callbacks.onError(new Error("Fixture server rejection"));
  await settleAnalytics();
  assert.equal(b.records.length, 0);
  assert.equal(b.ui.length, 0, "Keep the failed message available to its sender");
  assert.match(b.notices[0], /could not send/i);
});

test("accepted messages retain article, placement, organic visit and stable acknowledgement without message content", async () => {
  const b = boundary();
  b.callbacks.onSuccess(await b.callbacks.mutationFn());
  await settleAnalytics();
  assert.deepEqual(
    b.records.map((r) => r.name),
    ["seller_contacted", "inquiry_completed"],
  );
  for (const row of b.records) {
    assert.equal(row.props.media_article, "guide:offline");
    assert.equal(row.props.media_placement, "guide_intro");
    assert.equal(row.props.media_category, "furniture");
    assert.equal(row.props.traffic_channel, "search");
    assert.equal(row.props.listing_id, listing.id);
    assert.equal(row.props.is_internal, false);
    assert.equal(row.is_demo, false);
    assert.equal(JSON.stringify(row).includes("Private offline message text"), false);
    assert.equal("body" in row.props, false);
  }
  assert.equal(b.records[1].props.event_id, "message:offline-conversation");
  assert.deepEqual(b.ui, [
    ["message", "Default fixture message"],
    ["contactOpen", false],
  ]);
  // Repeated observation of the same acknowledgement counts only once.
  b.callbacks.onSuccess({ conversationId: "offline-conversation" });
  await settleAnalytics();
  const rows = summarizeEditorialTraffic(
    eligibleTrafficEvents(b.records, { domain: "onbluebird.com", staffIds: new Set() }),
  );
  assert.equal(rows[0].inquiries, 1);
});

test("expired article attribution is omitted and internal tests stay outside public conversion totals", async () => {
  const expired = boundary({ originAge: 3 * 60 * 60_000 });
  expired.callbacks.onSuccess(await expired.callbacks.mutationFn());
  await settleAnalytics();
  assert.ok(expired.records.every((row) => !("media_article" in row.props)));
  const internal = boundary({ internal: true });
  internal.callbacks.onSuccess(await internal.callbacks.mutationFn());
  await settleAnalytics();
  assert.ok(internal.records.every((row) => row.props.is_internal));
  assert.equal(
    eligibleTrafficEvents(internal.records, { domain: "onbluebird.com", staffIds: new Set() })
      .length,
    0,
  );
});

test("analytics failure does not turn an accepted seller message into a failed interaction", async () => {
  const b = boundary({ brokenAnalytics: true });
  b.callbacks.onSuccess(await b.callbacks.mutationFn());
  await settleAnalytics();
  assert.equal(b.records.length, 0);
  assert.equal(b.notices[0], "Message sent to the seller.");
  assert.deepEqual(b.ui.at(-1), ["contactOpen", false]);
});
