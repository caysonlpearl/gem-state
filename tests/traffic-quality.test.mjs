import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { isKnownAutomatedAgent } from "../src/lib/analytics-policy.ts";
import {
  isInternalAnalyticsBrowser,
  markInternalAnalyticsBrowser,
} from "../src/lib/analytics-browser.ts";
import { classifyTrafficSource } from "../src/lib/traffic-source.ts";
import { eligibleTrafficEvents, summarizeTraffic } from "../src/lib/traffic-summary.ts";
import { loadStaffTrafficExclusions } from "../src/lib/traffic-exclusions.server.ts";

const source = fs.readFileSync(new URL("../src/lib/analytics.ts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("analytics.ts", source, ts.ScriptTarget.Latest, true);
const script = ts.transpileModule(
  parsed.statements
    .filter((s) => !ts.isImportDeclaration(s))
    .map((s) => s.getText(parsed))
    .join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText;
const storage = (values = []) => {
  const map = new Map(values);
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
};
function browser(local = storage()) {
  return {
    location: { search: "", hostname: "onbluebird.com", pathname: "/", host: "onbluebird.com" },
    localStorage: local,
    sessionStorage: storage([
      [
        "bb_visit",
        JSON.stringify({ id: "visit", source: "direct", channel: "direct", landing: "/" }),
      ],
    ]),
    matchMedia: () => ({ matches: false }),
  };
}
const settle = () => new Promise(setImmediate);
function harness({ local, user = null, role = false, webdriver = false } = {}) {
  const records = [],
    checks = [],
    listeners = new Map();
  let currentUser = user,
    currentRole = role;
  const target = browser(local);
  const document = {
    visibilityState: "visible",
    referrer: "",
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name, fn) => {
      if (listeners.get(name) === fn) listeners.delete(name);
    },
  };
  const supabase = {
    auth: {
      getSession: async () => ({
        data: { session: currentUser ? { user: { id: currentUser } } : null },
      }),
    },
    rpc: async (_, args) => {
      checks.push(args);
      return currentRole === "error"
        ? { data: null, error: { message: "offline" } }
        : { data: currentRole === true && args._role === "admin", error: null };
    },
    from: () => ({
      insert: async (row) => {
        records.push(row);
        return { error: null };
      },
    }),
  };
  const context = {
    exports: {},
    window: target,
    document,
    navigator: { userAgent: "Mozilla/5.0 Chrome/153 Safari/537.36", webdriver },
    crypto: { randomUUID: () => "browser-id" },
    console: { warn() {} },
    isKnownAutomatedAgent,
    isInternalAnalyticsBrowser,
    markInternalAnalyticsBrowser,
    classifyTrafficSource,
    listingBusinessProps: () => ({}),
    loadSupabase: async () => supabase,
  };
  vm.runInNewContext(script, context);
  return {
    api: context.exports,
    target,
    records,
    checks,
    document,
    listeners,
    setUser: (u, r) => {
      currentUser = u;
      currentRole = r;
    },
  };
}

test("testing markers persist to other tabs and documents, even after sign-out", async () => {
  const local = storage(),
    a = harness({ local });
  a.target.location.search = "?_qa=1";
  await a.api.trackEvent("listing_viewed", { listing_id: "a" });
  assert.equal(a.records[0].props.is_internal, true);
  const b = harness({ local });
  await b.api.trackEvent("listing_viewed", { listing_id: "b" });
  assert.equal(b.records[0].props.is_internal, true);
  assert.equal(local.getItem("bb_internal_traffic"), "1");
});
test("a staff role marks the browser durably; anonymous activity after logout stays excluded", async () => {
  const h = harness({ user: "operator", role: true });
  await h.api.trackEvent("page_view");
  h.setUser(null, false);
  await h.api.trackEvent("listing_viewed", { listing_id: "a" });
  assert.ok(h.records.every((r) => r.props.is_internal));
  assert.equal(h.target.localStorage.getItem("bb_internal_traffic"), "1");
});
test("normal signed-in visitors share concurrent role checks without being marked internal", async () => {
  const h = harness({ user: "buyer", role: false });
  await Promise.all([
    h.api.trackEvent("page_view"),
    h.api.trackEvent("listing_viewed", { listing_id: "a" }),
  ]);
  assert.equal(h.checks.length, 2);
  assert.ok(h.records.every((r) => r.props.is_internal === false));
  assert.equal(h.target.localStorage.getItem("bb_internal_traffic"), null);
});
test("a failed role check excludes that event without permanently excluding an ordinary browser", async () => {
  const h = harness({ user: "buyer", role: "error" });
  await h.api.trackEvent("page_view");
  assert.equal(h.records[0].props.is_internal, true);
  assert.equal(h.target.localStorage.getItem("bb_internal_traffic"), null);
  h.setUser("buyer", false);
  await h.api.trackEvent("page_view");
  assert.equal(h.records[1].props.is_internal, false);
});
test("automation-controlled browsers and known preview/AI fetch agents are marked", async () => {
  const h = harness({ webdriver: true });
  await h.api.trackEvent("page_view");
  assert.equal(h.records[0].props.is_bot, true);
  for (const agent of [
    "GoogleOther",
    "ChatGPT-User",
    "Claude-User",
    "facebookexternalhit",
    "BingPreview",
    "Playwright",
    "HeadlessChrome",
  ])
    assert.ok(isKnownAutomatedAgent(agent), agent);
  assert.equal(isKnownAutomatedAgent("Mozilla/5.0 Chrome/153 Safari/537.36"), false);
});
test("engagement needs visible trusted input, is saved once, and removes listeners", async () => {
  const h = harness();
  const cleanup = h.api.startTrafficEngagement();
  h.listeners.get("pointerdown")({ isTrusted: false });
  await settle();
  assert.equal(h.records.length, 0);
  h.document.visibilityState = "hidden";
  h.listeners.get("wheel")({ isTrusted: true });
  await settle();
  assert.equal(h.records.length, 0);
  h.document.visibilityState = "visible";
  h.listeners.get("wheel")({ isTrusted: true });
  await settle();
  assert.equal(h.records.filter((r) => r.name === "visit_engaged").length, 1);
  assert.equal(h.records[0].props.traffic_policy, 2);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.target.sessionStorage.getItem("bb_engaged_visit"), "visit");
  cleanup();
  h.api.startTrafficEngagement();
  assert.equal(h.listeners.size, 0);
});
test("blocked storage never interrupts browser marking or analytics", () => {
  const target = { location: { search: "?_qa=1" } };
  Object.defineProperty(target, "localStorage", {
    get() {
      throw Error("blocked");
    },
  });
  Object.defineProperty(target, "sessionStorage", {
    get() {
      throw Error("blocked");
    },
  });
  assert.doesNotThrow(() => markInternalAnalyticsBrowser(target));
  assert.equal(isInternalAnalyticsBrowser(target), true);
});

const e = (name, visit, browserId, extra = {}, user_id = null) => ({
  name,
  user_id,
  session_id: browserId,
  props: { traffic_visit: visit, site_host: "onbluebird.com", traffic_policy: 2, ...extra },
});
const options = { staffIds: new Set(["staff"]), domain: "onbluebird.com", windowDays: 30 };
test("staff/browser markers exclude other tabs and anonymous sessions, including server historical markers", () => {
  const events = [
    e("visit_started", "before", "operator-browser"),
    e("listing_viewed", "before", "operator-browser", { listing_id: "a" }),
    e("pilot_console_viewed", "admin", "operator-browser", {}, "staff"),
    e("visit_started", "older", "known-old-browser"),
    e("visit_started", "buyer", "real-browser"),
  ];
  const result = summarizeTraffic(events, {
    ...options,
    excludedBrowserIds: new Set(["known-old-browser"]),
  });
  assert.equal(result.totals.visits, 1);
  assert.equal(result.totals.listingViews, 0);
  assert.equal(result.audience.excludedSessions, 2);
});
test("listing reloads deduplicate within a session while another session or listing can count", () => {
  const events = [
    e("visit_started", "a", "browser"),
    e("listing_viewed", "a", "browser", { listing_id: "one" }),
    e("listing_viewed", "a", "browser", { listing_id: "one", event_id: "different" }),
    e("listing_viewed", "a", "browser", { listing_id: "two" }),
    e("visit_started", "b", "browser"),
    e("listing_viewed", "b", "browser", { listing_id: "one" }),
  ];
  const result = summarizeTraffic(events, options);
  assert.equal(result.totals.listingViews, 3);
  assert.equal(result.totals.visits, 2);
  assert.equal(result.audience.visitors, 1);
  assert.equal(events.length, 6, "original records are not deleted or mutated");
});
test("engaged audience is distinct from passive traffic and can use historical input-performance evidence", () => {
  const events = [
    e("visit_started", "a", "one"),
    e("listing_viewed", "a", "one", { listing_id: "x" }),
    e("web_vital", "a", "one", { metric: "INP", value: 42 }),
    e("visit_started", "b", "two"),
    e("listing_viewed", "b", "two", { listing_id: "x" }),
    e("visit_engaged", "b", "two", { signal: "interaction" }),
    e("visit_started", "c", "three", { country: "BR", traffic_channel: "direct" }),
    e("listing_viewed", "c", "three", { listing_id: "x" }),
  ];
  const result = summarizeTraffic(events, options);
  assert.equal(result.audience.visitors, 3);
  assert.equal(result.audience.engagedVisitors, 2);
  assert.equal(result.audience.engagedListingViews, 2);
  assert.equal(result.totals.listingViews, 3);
  assert.equal(
    eligibleTrafficEvents(events, options).length,
    events.length,
    "country and direct traffic are not bot evidence",
  );
});

test("historical staff-marker reader pages all event types and fails closed on read errors", async () => {
  const calls = [];
  let broken = false;
  const rows = Array.from({ length: 500 }, (_, i) => ({
    id: String(i),
    session_id: "operator",
    props: { traffic_visit: "old-" + i },
  }));
  const query = {};
  for (const method of ["select", "in", "gte", "lt", "order"])
    query[method] = (...args) => {
      calls.push([method, ...args]);
      return query;
    };
  query.range = async (a, b) => {
    calls.push(["range", a, b]);
    return broken
      ? { error: { message: "offline" }, data: null }
      : { error: null, data: a === 0 ? rows : [] };
  };
  const client = {
    from: (name) => {
      assert.equal(name, "analytics_events");
      return query;
    },
  };
  const result = await loadStaffTrafficExclusions(
    client,
    new Set(["staff"]),
    Date.parse("2026-11-13T00:00:00Z"),
  );
  assert.equal(result.excludedBrowserIds.size, 1);
  assert.equal(result.excludedVisitIds.size, 500);
  assert.deepEqual(
    calls.filter((c) => c[0] === "range"),
    [
      ["range", 0, 499],
      ["range", 500, 999],
    ],
  );
  assert.ok(calls.some((c) => c[0] === "in" && c[1] === "user_id"));
  assert.ok(
    !calls.some((c) => c[0] === "in" && c[1] === "name"),
    "admin-only events must remain available as exclusion evidence",
  );
  broken = true;
  await assert.rejects(loadStaffTrafficExclusions(client, new Set(["staff"])), /Could not verify/);
});

test("an unavailable role check does not permanently taint a normal browser's other sessions", () => {
  const events = [
    e("visit_started", "uncertain", "buyer", {
      is_internal: true,
      internal_reason: "role_check_unavailable",
    }),
    e("visit_started", "later", "buyer"),
  ];
  const result = summarizeTraffic(events, options);
  assert.equal(result.totals.visits, 1);
  assert.equal(result.audience.visitors, 1);
});
