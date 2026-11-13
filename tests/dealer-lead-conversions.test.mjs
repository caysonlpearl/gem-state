import test from "node:test";
import assert from "node:assert/strict";
import { contactSchema, contactSearch, contactMessageRow } from "../src/lib/contact-contract.ts";
import { saveContactIntake } from "../src/lib/contact-intake.server.ts";

const dealer = {
  name: "Dealer QA",
  email: "dealer@example.com",
  subject: "Inventory connection",
  message: "Please help connect our dealership inventory.",
  interest: "dealership",
  dealershipName: "Example Motors",
  phone: "208-555-0100",
};
const ack = { ok: true, interest: "dealership", eventId: "example-event" };
async function pixelHarness(changes = {}) {
  const scripts = [];
  const w = {
    location: { hostname: "onbluebird.com", search: "?interest=dealership&oppref=example-ad" },
    navigator: { userAgent: "Test browser", doNotTrack: null },
    localStorage: { getItem: () => JSON.stringify({ version: "2026-11-12", advertising: true }) },
    document: {
      createElement: () => ({ dataset: {} }),
      head: { appendChild: (s) => scripts.push(s) },
    },
    ...changes,
  };
  const old = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: w });
  const module = await import(`../src/lib/dealer-ads.ts?case=${crypto.randomUUID()}`);
  return {
    ...module,
    w,
    scripts,
    restore() {
      if (old) Object.defineProperty(globalThis, "window", old);
      else delete globalThis.window;
    },
  };
}
test("only validated dealership submissions receive a dealership acknowledgement after storage succeeds", async () => {
  let writes = 0;
  const input = contactSchema.parse(dealer);
  const result = await saveContactIntake(input, async (row) => {
    writes++;
    assert.match(row.subject, /^\[Dealership\]/);
    assert.match(row.message, /Dealership: Example Motors/);
    assert.match(row.message, /Business phone: 208-555-0100/);
    return { error: null };
  });
  assert.equal(writes, 1);
  assert.equal(result.interest, "dealership");
  assert.match(result.eventId, /^[a-f0-9-]{36}$/);
  assert.deepEqual(Object.keys(result).sort(), ["eventId", "interest", "ok"]);
  await assert.rejects(
    saveContactIntake(input, async () => ({ error: new Error("database unavailable") })),
    /could not send/,
  );
  assert.throws(() => contactSchema.parse({ ...dealer, dealershipName: " " }), /dealership name/);
  assert.throws(() => contactSchema.parse({ ...dealer, email: "bad" }));
});
test("existing general contact requests retain their payload and never become dealer leads", async () => {
  const { interest, dealershipName, phone, ...general } = dealer;
  const parsed = contactSchema.parse(general);
  assert.equal(parsed.interest, "general");
  assert.deepEqual(contactMessageRow(parsed), general);
  const result = await saveContactIntake(parsed, async () => ({ error: null }));
  const h = await pixelHarness();
  try {
    assert.equal(h.trackDealerLead(result), false);
    assert.equal(h.scripts.length, 0);
  } finally {
    h.restore();
  }
});
test("saved dealership conversion queues the exact event and deduplicates repeated success effects", async () => {
  const h = await pixelHarness();
  try {
    assert.equal(h.trackDealerLead(ack), true);
    assert.equal(h.trackDealerLead(ack), false);
    assert.equal(h.scripts.length, 1);
    assert.equal(h.scripts[0].src, h.OPENAI_PIXEL_SCRIPT);
    assert.deepEqual(h.w.oaiq.q, [
      ["init", { pixelId: h.DEALER_ADS_PIXEL_ID }],
      [
        "measure",
        "lead_created",
        { type: "customer_action" },
        { event_id: ack.eventId, opt_out: true },
      ],
    ]);
    assert.equal(h.trackDealerLead({ ...ack, eventId: "second-event" }), true);
    assert.equal(h.scripts.length, 1);
    assert.equal(h.w.oaiq.q.filter((x) => x[0] === "init").length, 1);
    assert.doesNotMatch(JSON.stringify(h.w.oaiq.q), /dealer@example|Example Motors|208-555/);
  } finally {
    h.restore();
  }
});
test("privacy signals, test/preview visits, failed and non-dealer results do not load measurement", async () => {
  for (const changes of [
    { localStorage: { getItem: () => null } },
    {
      localStorage: {
        getItem: () => JSON.stringify({ version: "2026-11-12", advertising: false }),
      },
    },
    { navigator: { globalPrivacyControl: true } },
    { navigator: { doNotTrack: "1" } },
    { navigator: { userAgent: "HeadlessChrome" } },
    { location: { hostname: "onbluebird.com", search: "?interest=dealership&_qa=1" } },
    { location: { hostname: "preview.lovable.app", search: "" } },
  ]) {
    const h = await pixelHarness(changes);
    try {
      assert.equal(h.trackDealerLead(ack), false);
      assert.equal(h.scripts.length, 0);
    } finally {
      h.restore();
    }
  }
  const h = await pixelHarness();
  try {
    for (const result of [
      { ...ack, ok: false },
      { ...ack, interest: "general" },
      { ...ack, eventId: "" },
    ])
      assert.equal(h.trackDealerLead(result), false);
    assert.equal(h.scripts.length, 0);
  } finally {
    h.restore();
  }
});
test("SDK installation failures cannot change the accepted lead result", async () => {
  const h = await pixelHarness({
    document: {
      createElement: () => {
        throw new Error("blocked");
      },
    },
  });
  try {
    assert.equal(h.trackDealerLead(ack), false);
    assert.equal(ack.ok, true);
  } finally {
    h.restore();
  }
});
test("search validates dealership intent and preserves only the supported opaque ad reference", () => {
  assert.deepEqual(
    contactSearch({
      interest: "dealership",
      oppref: "opaque-reference",
      email: "private@example.com",
    }),
    { interest: "dealership", oppref: "opaque-reference" },
  );
  assert.equal(contactSearch({ interest: "invented" }).interest, undefined);
  assert.equal(contactSearch({ oppref: "x".repeat(2049) }).oppref, undefined);
  const row = contactMessageRow(
    contactSchema.parse({
      ...dealer,
      subject: "s".repeat(160),
      dealershipName: "n".repeat(160),
      phone: "p".repeat(40),
      message: "m".repeat(3500),
    }),
  );
  assert.ok(row.subject.length <= 160);
  assert.ok(row.message.length <= 4000);
  assert.match(row.message, /s{160}/);
});
