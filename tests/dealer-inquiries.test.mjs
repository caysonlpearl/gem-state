import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isInternalAnalyticsQuery } from "../src/lib/analytics-policy.ts";
import { PGlite } from "@electric-sql/pglite";
import { dealerInquirySchema, dealerLandingSearch } from "../src/lib/dealer-inquiry-contract.ts";
import {
  acceptDealerInquiry,
  processDealerInquiryNotifications,
} from "../src/lib/dealer-inquiry.server.ts";
const input = () =>
  dealerInquirySchema.parse({
    requestKey: crypto.randomUUID(),
    dealershipName: "Example Motors",
    website: "example.com",
    name: "Dealer QA",
    email: "dealer@example.com",
  });
test("short dealer inquiry normalizes websites, validates every required field, rejects unsafe URLs and honeypots", () => {
  assert.equal(input().website, "https://example.com");
  for (const changes of [
    { dealershipName: "" },
    { name: "" },
    { website: "javascript:alert(1)" },
    { website: "https://user:pass@example.com" },
    { email: "invalid" },
    { companyFax: "spam" },
    { notes: "a".repeat(2001) },
  ])
    assert.equal(dealerInquirySchema.safeParse({ ...input(), ...changes }).success, false);
  assert.deepEqual(
    dealerLandingSearch({
      oppref: "opaque",
      utm_campaign: "dealer",
      _qa: "1",
      email: "private",
      arbitrary: "no",
    }),
    { oppref: "opaque", utm_campaign: "dealer", _qa: "1" },
  );
});
test("router numeric QA values survive dealer redirects without enabling ad conversions", () => {
  assert.equal(isInternalAnalyticsQuery("?_qa=%221%22"), true);
  assert.deepEqual(dealerLandingSearch({ _qa: 1, _verify: true, utm_source: "test" }), {
    utm_source: "test",
    _qa: "1",
    _verify: "1",
  });
});
test("acknowledgements exist only after storage and expose no form fields", async () => {
  const lead = input();
  let args;
  const client = {
    rpc: async (name, payload) => {
      assert.equal(name, "accept_dealer_inquiry");
      args = payload;
      return { data: { id: "stored-id", created: true }, error: null };
    },
  };
  assert.deepEqual(await acceptDealerInquiry(lead, "hashed-ip", client), {
    ok: true,
    interest: "dealership",
    eventId: "stored-id",
    created: true,
  });
  assert.equal(args._payload.requestKey, undefined);
  assert.equal(args._payload.companyFax, undefined);
  assert.match(args._fingerprint, /^[a-f0-9]{64}$/);
  await assert.rejects(
    acceptDealerInquiry(lead, "hash", {
      rpc: async () => ({ error: { message: "database unavailable" } }),
    }),
    /could not save/,
  );
});
test("notification failures preserve leads for retry; success is provider acceptance, and writes are fenced by lease token", async () => {
  for (const fail of [false, true]) {
    let patch;
    const conditions = [];
    const lead = {
      id: crypto.randomUUID(),
      email: "dealer@example.com",
      notification_attempts: 1,
      notification_token: crypto.randomUUID(),
    };
    const chain = {
      eq: (key, value) => {
        conditions.push([key, value]);
        return chain;
      },
      then: (resolve) => Promise.resolve(resolve({ error: null })),
    };
    const client = {
      rpc: async () => ({ data: [lead], error: null }),
      from: (name) => {
        assert.equal(name, "dealer_inquiries");
        return {
          update: (values) => {
            patch = values;
            return chain;
          },
        };
      },
    };
    const result = await processDealerInquiryNotifications(undefined, {
      client,
      send: async () => {
        if (fail) throw new Error("outage");
      },
    });
    assert.equal(patch.notification_status, fail ? "pending" : "sent");
    assert.equal(result.sent, fail ? 0 : 1);
    assert.deepEqual(conditions, [
      ["id", lead.id],
      ["notification_token", lead.notification_token],
    ]);
  }
});
test("actual migration enforces idempotency, rate limits, private RLS, status-only admin writes and exclusive notification claims", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
 create function public.has_role(uuid,text) returns boolean language sql stable as $$ select $1='00000000-0000-0000-0000-000000000001'::uuid and $2='admin' $$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/20261109233000_dealer_inquiries.sql", import.meta.url),
        "utf8",
      ),
    );
    const lead = input();
    const accept = async (
      key = lead.requestKey,
      email = lead.email,
      ip = "ip",
      fingerprint = "fingerprint",
    ) =>
      (
        await db.query("select public.accept_dealer_inquiry($1,$2,$3,$4) as result", [
          key,
          fingerprint,
          ip,
          JSON.stringify({ ...lead, email }),
        ])
      ).rows[0].result;
    const first = await accept();
    const retry = await accept();
    assert.equal(first.created, true);
    assert.deepEqual(retry, { id: first.id, created: false });
    await assert.rejects(accept(lead.requestKey, lead.email, "ip", "changed"), /Request changed/);
    await accept(crypto.randomUUID());
    await accept(crypto.randomUUID());
    await assert.rejects(accept(crypto.randomUUID()), /Please wait/);
    assert.equal(
      (await db.query("select * from claim_dealer_inquiry_notifications()")).rows.length,
      3,
    );
    assert.equal(
      (await db.query("select * from claim_dealer_inquiry_notifications()")).rows.length,
      0,
    );
    await db.exec("set role anon");
    await assert.rejects(db.query("select * from dealer_inquiries"), /permission denied/);
    await assert.rejects(accept(), /permission denied/);
    await db.exec(
      "reset role;set role authenticated;select set_config('test.user','00000000-0000-0000-0000-000000000002',false)",
    );
    assert.equal((await db.query("select * from dealer_inquiries")).rows.length, 0);
    await assert.rejects(accept(), /permission denied/);
    await db.exec("select set_config('test.user','00000000-0000-0000-0000-000000000001',false)");
    assert.equal((await db.query("select * from dealer_inquiries")).rows.length, 3);
    await db.query("update dealer_inquiries set status='contacted' where id=$1", [first.id]);
    await assert.rejects(
      db.query("update dealer_inquiries set email='hijack@example.com'"),
      /permission denied/,
    );
    await assert.rejects(
      db.query(
        "insert into dealer_inquiries(request_key,fingerprint,abuse_key,dealership_name,website,name,email) values(gen_random_uuid(),'x','x','x','x','x','x')",
      ),
      /permission denied/,
    );
    await db.exec("reset role");
    for (let i = 0; i < 5; i++)
      await accept(crypto.randomUUID(), `test${i}@example.com`, "limited-ip");
    await assert.rejects(
      accept(crypto.randomUUID(), "more@example.com", "limited-ip"),
      /Please wait/,
    );
  } finally {
    await db.close();
  }
});

test("private-inbox-only mode does not claim records or attempt email when sending is not enabled", async () => {
  const old = process.env.DEALER_INQUIRY_EMAIL_ENABLED;
  delete process.env.DEALER_INQUIRY_EMAIL_ENABLED;
  try {
    assert.deepEqual(await processDealerInquiryNotifications(), {
      sent: 0,
      attempted: 0,
      paused: true,
    });
  } finally {
    if (old === undefined) delete process.env.DEALER_INQUIRY_EMAIL_ENABLED;
    else process.env.DEALER_INQUIRY_EMAIL_ENABLED = old;
  }
});
