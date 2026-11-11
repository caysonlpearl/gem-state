import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { dealerOnboardingSchema } from "../src/lib/dealer-onboarding-contract.ts";
import { onboardDealer } from "../src/lib/dealer-onboarding.server.ts";
import { safeAuthReturnPath } from "../src/lib/auth-return-path.ts";
const actor = "10000000-0000-4000-8000-000000000001",
  owner = "10000000-0000-4000-8000-000000000002",
  buyer = "10000000-0000-4000-8000-000000000003",
  outsider = "10000000-0000-4000-8000-000000000004";
const profile = {
  displayName: "Example Subaru",
  slug: "example-subaru",
  ownerEmail: "dealer@example.com",
  email: "sales@example.com",
  phone: "2085550100",
  website: "https://dealer.example",
  logoUrl: "https://images.example/logo.png",
  address: "1 Main St",
  city: "Twin Falls",
  state: "ID",
  postalCode: "83301",
  description: "Authorized dealer inventory",
};
test("dealer onboarding requires branding and contact details and validates safe sign-in returns", () => {
  assert.equal(dealerOnboardingSchema.parse(profile).displayName, profile.displayName);
  for (const key of ["ownerEmail", "email", "phone", "logoUrl", "address", "postalCode"])
    assert.throws(() => dealerOnboardingSchema.parse({ ...profile, [key]: "" }));
  assert.throws(() => dealerOnboardingSchema.parse({ ...profile, website: "javascript:alert(1)" }));
  assert.equal(safeAuthReturnPath("/dealers/example-subaru"), "/dealers/example-subaru");
  assert.equal(safeAuthReturnPath("https://evil.example/dealers/example-subaru"), "/account");
  assert.equal(
    safeAuthReturnPath("/listings/dealerfeed-" + buyer),
    "/listings/dealerfeed-" + buyer,
  );
});
test("new dealer login is unverified, passwordless and scoped to dealership ownership; existing users are reused", async () => {
  for (const existing of [true, false]) {
    const calls = [];
    const db = {
      rpc: async (name, args) => {
        calls.push([name, args]);
        return {
          data: name === "dealer_onboarding_owner" ? (existing ? owner : null) : owner,
          error: null,
        };
      },
      auth: {
        admin: {
          createUser: async (data) => {
            calls.push(["createUser", data]);
            return { data: { user: { id: owner } }, error: null };
          },
        },
      },
      from: () => ({ upsert: async () => ({ error: null }) }),
    };
    const result = await onboardDealer(db, actor, dealerOnboardingSchema.parse(profile));
    assert.equal(result.ownerUserId, owner);
    assert.equal(result.accountCreated, !existing);
    assert.equal(result.invitationSent, false);
    const create = calls.find((c) => c[0] === "createUser");
    assert.equal(Boolean(create), !existing);
    if (create) {
      assert.equal(create[1].email_confirm, false);
      assert.equal(create[1].password, undefined);
      assert.equal(create[1].app_metadata, undefined);
    }
    assert.ok(calls.find((c) => c[0] === "complete_dealer_onboarding" && c[1]._actor === actor));
  }
});
test("dealer ownership, private inventory, recipient routing, two-way messages and blocks use real PostgreSQL functions", async () => {
  const db = new PGlite();
  const sql = async (p) => readFile(new URL("../" + p, import.meta.url), "utf8");
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,banned_until timestamptz);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT current_setting('request.jwt.claim.role',true)$$;
 CREATE FUNCTION public.has_role(_user_id uuid,_role text) RETURNS boolean LANGUAGE sql AS $$SELECT _user_id='${actor}'::uuid AND _role='admin'$$;
 CREATE FUNCTION public.assert_import_operator(_actor uuid) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF auth.role()<>'service_role' OR NOT public.has_role(_actor,'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF; END$$;
 CREATE TABLE public.asks(id uuid PRIMARY KEY,variant_id uuid);CREATE TABLE public.products(id uuid PRIMARY KEY,name text);CREATE TABLE public.product_variants(id uuid PRIMARY KEY,product_id uuid);`);
    const foundation = await sql(
      "supabase/migrations/20260919120000_add_dealer_inventory_foundation.sql",
    );
    await db.exec(
      foundation.slice(0, foundation.indexOf("ALTER TABLE public.dealer_inventory_sources ENABLE")),
    );
    const ops = await sql("supabase/migrations/20260930180000_add_dealership_operations.sql");
    for (const name of ["dealer_profiles", "dealer_members"]) {
      const start = ops.indexOf("CREATE TABLE IF NOT EXISTS public." + name);
      await db.exec(ops.slice(start, ops.indexOf("\n);", start) + 3));
    }
    await db.exec(
      `ALTER TABLE dealer_inventory_sources ADD COLUMN dealer_id uuid;CREATE TABLE dealer_audit_events(dealer_id uuid,actor_user_id uuid,action text,target_type text,target_id text,metadata jsonb);CREATE TABLE account_contact_preferences(user_id uuid PRIMARY KEY,allow_internal_messages boolean DEFAULT true);CREATE TABLE rate_limit_events(user_id uuid,action text,created_at timestamptz DEFAULT now());CREATE TABLE notifications(id uuid DEFAULT gen_random_uuid(),user_id uuid,kind text,title text,body text,order_id uuid,entity_type text,entity_id uuid,destination_url text);`,
    );
    const accounts = await sql("supabase/migrations/20260918110000_add_account_center_tools.sql");
    await db.exec(
      accounts.slice(
        accounts.indexOf("create table if not exists public.conversations ("),
        accounts.indexOf("alter table public.conversations enable row level security;"),
      ),
    );
    await db.exec(
      `ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY; GRANT SELECT ON conversations,conversation_participants,conversation_messages TO authenticated;`,
    );
    await db.exec(
      accounts.slice(
        accounts.indexOf('drop policy if exists "Participants read conversations"'),
        accounts.indexOf('drop policy if exists "Members report conversations"'),
      ),
    );
    await db.exec(
      `CREATE TABLE partner_vehicle_reports(listing_id text CONSTRAINT partner_vehicle_reports_listing_id_check CHECK(length(listing_id)>0),status text);CREATE TABLE saved_partner_vehicles(listing_id text CONSTRAINT saved_partner_vehicles_listing_id_check CHECK(length(listing_id)>0));CREATE TABLE listing_view_counts(listing_id text CONSTRAINT listing_view_counts_listing_id_check CHECK(length(listing_id)>0));`,
    );
    for (const [id, email] of [
      [actor, "admin@example.com"],
      [owner, profile.ownerEmail],
      [buyer, "buyer@example.com"],
      [outsider, "outsider@example.com"],
    ])
      await db.query("INSERT INTO auth.users(id,email) VALUES ($1,$2)", [id, email]);
    await db.exec(
      await sql("supabase/migrations/20261110200000_authorized_dealer_feed_publication.sql"),
    );
    const source = (
      await db.query(
        `INSERT INTO dealer_inventory_sources(owner_user_id,name) VALUES ($1,'Dealer XML') RETURNING id`,
        [actor],
      )
    ).rows[0].id;
    await db.query(
      `INSERT INTO dealer_feed_publications(source_id,slug,display_name,website,city,state,authorized_by,authorization_reference,enabled) VALUES ($1,'example-subaru','Example Subaru','https://dealer.example','Twin Falls','ID',$2,'Written dealer approval',true)`,
      [source, actor],
    );
    const record = (
      await db.query(
        `INSERT INTO dealer_inventory_records(source_id,source_record_key,title,price_cents,city,state,content_hash) VALUES ($1,'one','2026 Subaru Forester',3500000,'Twin Falls','ID','one') RETURNING id`,
        [source],
      )
    ).rows[0].id;
    await db.exec(await sql("supabase/migrations/20261110220000_dealer_accounts_and_messages.sql"));
    await db.exec(
      await sql("supabase/migrations/20261111000000_dealer_pending_inbox_and_pricing.sql"),
    );
    await db.exec(await sql("supabase/migrations/20261111230000_dealer_price_or_photos.sql"));
    const harden = await sql(
      "supabase/migrations/20260920210000_harden_conversation_blocks_reports.sql",
    );
    await db.exec(
      harden.slice(
        0,
        harden.indexOf(
          "CREATE OR REPLACE FUNCTION public.send_conversation_message_with_attachment",
        ),
      ),
    );
    const identity = async (id, role = "authenticated") => {
      await db.query(
        "SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",
        [id ?? "", role],
      );
    };
    await identity(actor, "service_role");
    await assert.rejects(
      db.query("SELECT complete_dealer_onboarding($1,$2,$3::jsonb,$4)", [
        owner,
        outsider,
        JSON.stringify(profile),
        source,
      ]),
      /Administrator/,
    );
    const dealer = (
      await db.query("SELECT complete_dealer_onboarding($1,$2,$3::jsonb,$4) AS id", [
        owner,
        actor,
        JSON.stringify(profile),
        source,
      ])
    ).rows[0].id;
    assert.equal(
      (
        await db.query(
          "SELECT owner_user_id,agreements_accepted_at FROM dealer_profiles WHERE id=$1",
          [dealer],
        )
      ).rows[0].owner_user_id,
      owner,
    );
    assert.equal(
      (await db.query("SELECT agreements_accepted_at FROM dealer_profiles WHERE id=$1", [dealer]))
        .rows[0].agreements_accepted_at,
      null,
    );
    await db.query("UPDATE dealer_inventory_records SET raw_record=$1::jsonb WHERE id=$2", [
      JSON.stringify({ msrp: "39000", private_email: "private@example.com" }),
      record,
    ]);
    const awaiting = (await db.query("SELECT read_published_dealer_inventory() AS data")).rows[0]
      .data;
    assert.equal(
      awaiting.dealers[0].inbox_enabled,
      true,
      "authorized dealers accept private messages before owner activation",
    );
    assert.equal(awaiting.vehicles[0].msrp, 39000);
    assert.ok(!JSON.stringify(awaiting).includes("private@example.com"));
    await identity(buyer);
    const beforeActivation = (
      await db.query("SELECT start_dealer_conversation($1,$2,$3) AS id", [
        dealer,
        record,
        "Hello dealership",
      ])
    ).rows[0].id;
    assert.ok(beforeActivation);
    assert.equal(
      (await db.query("SELECT seller_id FROM conversations WHERE id=$1", [beforeActivation]))
        .rows[0].seller_id,
      owner,
    );
    assert.equal(awaiting.dealers[0].owner_activated, false);
    await identity(outsider);
    await db.exec("SET ROLE authenticated");
    assert.equal(
      (
        await db.query("SELECT * FROM conversation_messages WHERE conversation_id=$1", [
          beforeActivation,
        ])
      ).rows.length,
      0,
    );
    await db.exec("RESET ROLE");
    await db.query("UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1", [owner]);
    const publication = (await db.query("SELECT read_published_dealer_inventory() AS data")).rows[0]
      .data;
    assert.equal(publication.dealers[0].logo_url, profile.logoUrl);
    assert.equal(publication.dealers[0].email, profile.email);
    assert.equal(publication.dealers[0].owner_user_id, owner);
    assert.equal(publication.dealers[0].inbox_enabled, true);
    await identity(outsider);
    assert.deepEqual((await db.query("SELECT my_dealer_inventory() AS data")).rows[0].data, []);
    await identity(owner);
    await db.exec("SET ROLE authenticated");
    assert.equal(
      (
        await db.query("SELECT body FROM conversation_messages WHERE conversation_id=$1", [
          beforeActivation,
        ])
      ).rows[0].body,
      "Hello dealership",
      "saved messages appear in the owner inbox after activation",
    );
    await db.exec("RESET ROLE");
    assert.equal(
      (await db.query("SELECT my_dealer_inventory() AS data")).rows[0].data[0].records.length,
      1,
    );
    await assert.rejects(
      db.query("SELECT start_dealer_conversation($1,$2,$3)", [dealer, record, "Hello dealership"]),
      /message yourself/,
    );
    await identity(buyer);
    const start = async (dealerId, recordId) =>
      (
        await db.query("SELECT start_dealer_conversation($1,$2,$3) AS id", [
          dealerId,
          recordId,
          "Is this vehicle still available?",
        ])
      ).rows[0].id;
    const thread = await start(null, record);
    assert.equal(
      (await db.query("SELECT seller_id FROM conversations WHERE id=$1", [thread])).rows[0]
        .seller_id,
      owner,
    );
    assert.equal(
      await start(null, record),
      thread,
      "repeat messages stay in the same dealer-owned conversation",
    );
    const general = await start(dealer, null);
    assert.notEqual(general, thread);
    assert.equal(
      (await db.query("SELECT user_id FROM notifications WHERE entity_id=$1 LIMIT 1", [thread]))
        .rows[0].user_id,
      owner,
    );
    await identity(outsider);
    await db.exec("SET ROLE authenticated");
    assert.equal((await db.query("SELECT * FROM conversations")).rows.length, 0);
    assert.equal((await db.query("SELECT * FROM conversation_messages")).rows.length, 0);
    await db.exec("RESET ROLE");
    await identity(owner);
    await db.query("SELECT send_conversation_message($1,$2)", [thread, "Yes, it is available."]);
    assert.equal(
      (
        await db.query(
          "SELECT user_id FROM notifications WHERE entity_id=$1 AND body LIKE '%Yes, it is available.%'",
          [thread],
        )
      ).rows[0].user_id,
      buyer,
    );
    await db.query(
      "UPDATE conversation_participants SET blocked_at=now() WHERE conversation_id=$1 AND user_id=$2",
      [thread, owner],
    );
    await identity(buyer);
    await assert.rejects(start(null, record), /Messaging is unavailable/);
    await db.query(
      "UPDATE conversation_participants SET blocked_at=NULL WHERE conversation_id=$1",
      [thread],
    );
    await db.query("UPDATE dealer_inventory_records SET inventory_status='sold' WHERE id=$1", [
      record,
    ]);
    await assert.rejects(start(null, record), /no longer available/);
    await db.query("UPDATE dealer_feed_publications SET revoked_at=now() WHERE source_id=$1", [
      source,
    ]);
    await assert.rejects(start(dealer, null), /inbox is not available/);
    await identity(null);
    await assert.rejects(start(dealer, null), /Sign in required/);
  } finally {
    await db.close();
  }
});

test("dealer message email alerts resolve the account recipient and vehicle context without sending live email", async () => {
  const { build } = await import("esbuild");
  const deliveries = [];
  const fixture = {
    buyer_id: buyer,
    seller_id: owner,
    dealer_context_title: "2026 Subaru Forester",
    asks: null,
  };
  let alerts = true;
  let activated = true;
  globalThis.__dealerEmailTest = {
    deliveries,
    db: {
      auth: {
        admin: {
          getUserById: async (id) => ({
            data: {
              user: {
                email: id === owner ? profile.ownerEmail : "buyer@example.com",
                email_confirmed_at: activated ? new Date().toISOString() : null,
              },
            },
          }),
        },
      },
      from(table) {
        const query = {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          order() {
            return this;
          },
          limit() {
            return this;
          },
          async maybeSingle() {
            return {
              data:
                table === "conversations"
                  ? fixture
                  : table === "account_notification_preferences"
                    ? { message_alerts: alerts }
                    : { id: "fixture-message", body: "Is this available?" },
            };
          },
        };
        return query;
      },
    },
  };
  try {
    const compiled = await build({
      entryPoints: [new URL("../src/lib/email-notifications.server.ts", import.meta.url).pathname],
      bundle: true,
      write: false,
      platform: "node",
      format: "esm",
      plugins: [
        {
          name: "email-routing-fixtures",
          setup(builder) {
            builder.onResolve(
              { filter: /email-templates\/send-email|integrations\/supabase\/client.server/ },
              (args) => ({ path: args.path, namespace: "email-fixture" }),
            );
            builder.onLoad({ filter: /.*/, namespace: "email-fixture" }, (args) => ({
              contents: args.path.includes("send-email")
                ? "export async function sendTemplateEmail(template,to,options){globalThis.__dealerEmailTest.deliveries.push({template,to,...options});return{sent:true}}"
                : "export const supabaseAdmin=globalThis.__dealerEmailTest.db;",
            }));
          },
        },
      ],
    });
    const { emailMarketplaceMessage } = await import(
      "data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64")
    );
    await emailMarketplaceMessage("fixture-conversation", buyer);
    assert.equal(deliveries[0].to, profile.ownerEmail);
    assert.equal(deliveries[0].templateData.itemName, fixture.dealer_context_title);
    assert.equal(
      deliveries[0].templateData.conversationPath,
      "/account?section=messages&conversation=fixture-conversation",
    );
    await emailMarketplaceMessage("fixture-conversation", owner);
    assert.equal(deliveries[1].to, "buyer@example.com");
    activated = false;
    await emailMarketplaceMessage("fixture-conversation", buyer);
    assert.equal(deliveries.length, 2, "unclaimed dealer receives no email before activation");
    activated = true;
    alerts = false;
    await emailMarketplaceMessage("fixture-conversation", buyer);
    assert.equal(deliveries.length, 2, "notification opt-out is respected");
  } finally {
    delete globalThis.__dealerEmailTest;
  }
});

test("email setup checks target only the operator's verified mailbox and surface delivery failures", async () => {
  const { sendDealerEmailTest } = await import("../src/lib/dealer-email-test.server.ts");
  let receivedUser;
  let user = {
    email: "operator@example.com",
    email_confirmed_at: new Date().toISOString(),
    app_metadata: {},
  };
  const admin = {
    auth: {
      admin: {
        getUserById: async (id) => {
          receivedUser = id;
          return { data: { user }, error: null };
        },
      },
    },
  };
  const calls = [];
  const send = async (...args) => {
    calls.push(args);
    return { sent: true };
  };
  assert.deepEqual(await sendDealerEmailTest(admin, actor, send, "safe-reference"), {
    accepted: true,
    testId: "safe-reference",
  });
  assert.equal(receivedUser, actor);
  assert.equal(calls[0][1], "operator@example.com");
  assert.ok(calls[0][2].templateData.message.includes("safe-reference"));
  await assert.rejects(
    sendDealerEmailTest(admin, actor, async () => ({ sent: false }), "suppressed"),
    /did not accept/,
  );
  await assert.rejects(
    sendDealerEmailTest(
      admin,
      actor,
      async () => {
        throw Error("Provider unavailable");
      },
      "failed",
    ),
    /Provider unavailable/,
  );
  user = { ...user, email_confirmed_at: undefined };
  await assert.rejects(sendDealerEmailTest(admin, actor, send, "unverified"), /own verified/);
  assert.equal(calls.length, 1, "invalid accounts never trigger a send");
});
