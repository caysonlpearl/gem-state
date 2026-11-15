import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { withListingTestPostgres } from "./helpers/postgres-test-cluster.mjs";
import { installListingManagementFixture } from "./helpers/mobile-listing-management-database.mjs";
test(
  "native writes serialize same-request retries, stale edits and deletion session revocation in both orders",
  {
    skip:
      process.env.BLUEBIRD_DELETION_PG !== "1"
        ? "Run the dedicated PostgreSQL gate with BLUEBIRD_DELETION_PG=1"
        : false,
    timeout: 60000,
  },
  async () =>
    withListingTestPostgres(async (connect) => {
      const a = await connect(),
        b = await connect();
      await installListingManagementFixture({
        exec: (sql) => a.query(sql),
        query: (sql, params) => a.query(sql, params),
      });
      const actor = randomUUID(),
        s1 = randomUUID(),
        s2 = randomUUID();
      const seed = async (user, sessions) => {
        await a.query("reset role");
        await a.query("insert into auth.users(id) values($1)", [user]);
        for (const s of sessions)
          await a.query(
            "insert into auth.sessions(id,user_id,not_after) values($1,$2,now()+interval '1 day')",
            [s, user],
          );
        await a.query(
          "insert into shopping_accounts(user_id,terms_version) values($1,'2026-11-12')",
          [user],
        );
        const product = (
          await a.query(
            "insert into products(name,description,category_id) select 'A bicycle','A local bicycle description.',id from categories where slug='general' returning id",
          )
        ).rows[0].id;
        const id = (
          await a.query("insert into asks(seller_id,product_id) values($1,$2) returning id", [
            user,
            product,
          ])
        ).rows[0].id;
        await a.query(
          "insert into classified_listing_details(listing_id,city,region,state) values($1,'Boise','Treasure Valley','ID')",
          [id],
        );
        return id;
      };
      const claim = async (c, user, session) => {
        await c.query("reset role");
        await c.query("select set_config('request.jwt.claims',$1,false)", [
          JSON.stringify({ sub: user, session_id: session, role: "authenticated" }),
        ]);
        await c.query("set role authenticated");
      };
      const snapshot = async (c, id) =>
        (await c.query("select public.mobile_listing_editor_snapshot($1) result", [id])).rows[0]
          .result;
      const payload = {
        title: "An updated bicycle",
        description: "An updated local bicycle description.",
        category: "general",
        priceCents: 4500,
        condition: "used_good",
        city: "Boise",
        region: "Treasure Valley",
        state: "ID",
        fulfillmentMode: "local_pickup",
        publicMediaPaths: [],
        itemDetails: {},
      };
      const write = (c, id, version, request = randomUUID(), patch = {}) =>
        c
          .query("select public.mobile_manage_listing($1,$2,'edit',$3,$4) result", [
            request,
            id,
            version,
            { ...payload, ...patch },
          ])
          .then((r) => r.rows[0].result);
      const blocked = async (pending) => {
        let ended = false;
        pending.then(
          () => (ended = true),
          () => (ended = true),
        );
        await pause(30);
        assert.equal(ended, false, "Second operation should wait for the first transaction");
      };
      const id = await seed(actor, [s1, s2]);
      await claim(a, actor, s1);
      await claim(b, actor, s2);
      let before = await snapshot(a, id);
      const request = randomUUID();
      await a.query("begin");
      const committed = await write(a, id, before.version, request);
      const replay = write(b, id, before.version, request);
      await blocked(replay);
      await a.query("commit");
      assert.equal((await replay).replayed, true);
      assert.equal((await replay).version, committed.version);
      before = await snapshot(a, id);
      await a.query("begin");
      await write(a, id, before.version, randomUUID(), { title: "An independent edit" });
      const stale = write(b, id, before.version);
      const rejected = assert.rejects(stale, /Listing changed/);
      await blocked(stale);
      await a.query("commit");
      await rejected;
      // Write first: deletion's marker and session revocation cannot commit ahead of it.
      before = await snapshot(a, id);
      await a.query("begin");
      await write(a, id, before.version);
      await b.query("reset role");
      const deletion = b.query("select public.mobile_request_deletion($1)", [actor]);
      await blocked(deletion);
      await a.query("commit");
      await deletion;
      await claim(a, actor, s1);
      await assert.rejects(write(a, id, before.version), /Account access|Sign in/);
      // Deletion first: a check begun against the earlier visible session waits,
      // then rejects after that session is removed, without leaving a receipt.
      const other = randomUUID(),
        s3 = randomUUID(),
        otherId = await seed(other, [s3]);
      await claim(a, other, s3);
      const original = await snapshot(a, otherId);
      await b.query("begin");
      await b.query("select public.mobile_request_deletion($1)", [other]);
      const denied = write(a, otherId, original.version);
      const denyAssertion = assert.rejects(denied, /Account access|Sign in/);
      await blocked(denied);
      await b.query("commit");
      await denyAssertion;
      await a.query("reset role");
      assert.equal(
        (
          await a.query("select count(*)::int n from mobile_message_receipts where user_id=$1", [
            other,
          ])
        ).rows[0].n,
        0,
      );
      assert.deepEqual(
        (await a.query("select public.account_access_coverage() result")).rows[0].result,
        { unguarded_functions: 0, unguarded_tables: 0, helper_privilege_gaps: 0 },
      );
    }),
);
