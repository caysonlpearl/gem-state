import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as pause } from "node:timers/promises";
import { withListingTestPostgres } from "./helpers/postgres-test-cluster.mjs";
import { installDeletionPhotoWriterSchema } from "./helpers/account-deletion-photo-database.mjs";
import { installPrivateRecordSources } from "./helpers/account-deletion-private-database.mjs";
import { sourcingDatabase } from "./helpers/account-deletion-sourcing-database.mjs";
import { seedCatalog } from "./helpers/account-deletion-catalog-database.mjs";
import { fixtureMemberSession } from "./helpers/account-deletion-owned-listings-database.mjs";
test(
  "real PostgreSQL orders quote writes and acceptance against withdrawal, count repair and expiring leases",
  {
    skip: process.env.BLUEBIRD_DELETION_PG !== "1" ? "Run with BLUEBIRD_DELETION_PG=1" : false,
    timeout: 60000,
  },
  async () =>
    withListingTestPostgres(async (connect) => {
      const a = await connect(),
        b = await connect(),
        db = { exec: (s) => a.query(s), query: (s, args) => a.query(s, args) };
      await installDeletionPhotoWriterSchema(db);
      await installPrivateRecordSources(db);
      await sourcingDatabase({ provided: db });
      await a.query(
        "update market_settings set custom_sourcing_requests_enabled=true,shopper_quotes_enabled=true",
      );
      const actor = async () => {
        const f = await seedCatalog(db);
        await a.query("insert into sourcing_fixture_shoppers values($1)", [f.seller]);
        return f;
      };
      const as = (c, f) => fixtureMemberSession({ query: (s, args) => c.query(s, args) }, f.seller);
      const clear = () => a.query("select set_config('request.jwt.claims','{}',false)");
      const request = async (f) => {
        await as(a, f);
        const id = (
          await a.query("select create_sourcing_request($1,10000,'Synthetic race request')id", [
            f.variant,
          ])
        ).rows[0].id;
        await clear();
        return id;
      };
      const quote = async (c, f, id) => {
        await as(c, f);
        return (
          await c.query("select submit_shopper_quote($1,1000,200,100,7,'Synthetic race quote')id", [
            id,
          ])
        ).rows[0].id;
      };
      const waitLock = async (c, pid) => {
        for (let i = 0; i < 70; i++) {
          if (
            (await c.query("select wait_event_type from pg_stat_activity where pid=$1", [pid]))
              .rows[0]?.wait_event_type === "Lock"
          )
            return;
          await pause(10);
        }
        throw Error("Expected live sourcing lock was not observed");
      };
      const start = async (f) => {
        await clear();
        await a.query("select mobile_request_deletion($1)", [f.seller]);
        await a.query("update account_deletion_controls set worker_enabled=true");
        return (
          await a.query(
            "update account_deletion_jobs set phase='records',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where user_id=$1 returning *",
            [f.seller],
          )
        ).rows[0];
      };
      const purge = (f, j) =>
        a.query("select purge_account_deletion_sourcing($1,$2,$3,100)r", [
          j.id,
          f.seller,
          j.lease_token,
        ]);
      const first = await actor(),
        shopper = await actor(),
        firstRequest = await request(first);
      await b.query("begin");
      await quote(b, shopper, firstRequest);
      const earlier = a.query("select mobile_request_deletion($1)", [first.seller]);
      await waitLock(b, a.processID);
      await b.query("commit");
      await earlier;
      await assert.rejects(quote(b, shopper, firstRequest), /Private account records unavailable/);
      const second = await actor(),
        shopper2 = await actor(),
        secondRequest = await request(second);
      await a.query("begin");
      await a.query("select mobile_request_deletion($1)", [second.seller]);
      const late = assert.rejects(
        quote(b, shopper2, secondRequest),
        /Private account records unavailable/,
      );
      await waitLock(a, b.processID);
      await a.query("commit");
      await late;
      assert.equal(
        (await a.query("select quote_count from sourcing_requests where id=$1", [secondRequest]))
          .rows[0].quote_count,
        0,
      );

      // A pending quoting party cannot be accepted into a fresh financial order.
      const buyer = await actor(),
        deletingShopper = await actor(),
        r = await request(buyer),
        q = await quote(a, deletingShopper, r);
      await clear();
      await b.query("begin");
      await b.query("select mobile_request_deletion($1)", [deletingShopper.seller]);
      await as(a, buyer);
      const accept = assert.rejects(
        a.query("select accept_shopper_quote($1)", [q]),
        /Private account records unavailable/,
      );
      await waitLock(b, a.processID);
      await b.query("commit");
      await accept;
      await clear();
      assert.equal((await a.query("select count(*)::int n from orders")).rows[0].n, 0);

      // Cleanup locks the same actual parent as a newly submitted quote.
      const owner = await actor(),
        subject = await actor(),
        newShopper = await actor(),
        shared = await request(owner);
      await quote(a, subject, shared);
      await clear();
      const job = await start(subject);
      assert.equal((await purge(subject, job)).rows[0].r.source, "events");
      await a.query("begin");
      assert.equal((await purge(subject, job)).rows[0].r.source, "quotes");
      const newQuote = quote(b, newShopper, shared);
      await waitLock(a, b.processID);
      await a.query("commit");
      await newQuote;
      assert.equal(
        (await a.query("select quote_count from sourcing_requests where id=$1", [shared])).rows[0]
          .quote_count,
        1,
      );

      // An ordinary withdrawal first must be included in the cleaner's next count.
      const owner2 = await actor(),
        subject2 = await actor(),
        withdrawing = await actor(),
        shared2 = await request(owner2);
      await quote(a, subject2, shared2);
      await clear();
      const otherQuote = await quote(a, withdrawing, shared2);
      await clear();
      const job2 = await start(subject2);
      await purge(subject2, job2);
      await b.query("begin");
      await as(b, withdrawing);
      await b.query("select withdraw_shopper_quote($1)", [otherQuote]);
      const recount = purge(subject2, job2);
      await waitLock(b, a.processID);
      await b.query("commit");
      await recount;
      assert.equal(
        (await a.query("select quote_count from sourcing_requests where id=$1", [shared2])).rows[0]
          .quote_count,
        0,
      );
      assert.equal(
        (await a.query("select status from shopper_quotes where id=$1", [otherQuote])).rows[0]
          .status,
        "withdrawn",
      );

      const owner3 = await actor(),
        subject3 = await actor(),
        shared3 = await request(owner3);
      const q3 = await quote(a, subject3, shared3);
      await clear();
      const job3 = await start(subject3);
      await purge(subject3, job3);
      await b.query("begin");
      await b.query("select id from sourcing_requests where id=$1 for update", [shared3]);
      await a.query(
        "update account_deletion_jobs set lease_until=clock_timestamp()+interval '600 milliseconds'where id=$1",
        [job3.id],
      );
      const expired = assert.rejects(
        purge(subject3, job3),
        /Sourcing erasure unavailable|Private account records unavailable/,
      );
      await waitLock(b, a.processID);
      await pause(650);
      await b.query("commit");
      await expired;
      assert.equal(
        (await a.query("select count(*)::int n from shopper_quotes where id=$1", [q3])).rows[0].n,
        1,
      );
      assert.equal(
        (await a.query("select quote_count from sourcing_requests where id=$1", [shared3])).rows[0]
          .quote_count,
        1,
      );
      // Quote and history links retire in different bounded passes. Cleanup
      // for a second member must work while those links temporarily differ.
      const splitBuyer = await actor(),
        splitShopper = await actor(),
        thirdActor = await actor(),
        splitRequest = await request(splitBuyer);
      const splitQuote = await quote(a, splitShopper, splitRequest);
      await clear();
      const history = (
        await a.query(
          "insert into sourcing_events(request_id,quote_id,actor_id,event_type,note)values($1,$2,$3,'quote_submitted','Preserve third member history')returning id",
          [splitRequest, splitQuote, thirdActor.seller],
        )
      ).rows[0].id;
      const buyerJob = await start(splitBuyer);
      assert.equal((await purge(splitBuyer, buyerJob)).rows[0].r.source, "events");
      assert.equal((await purge(splitBuyer, buyerJob)).rows[0].r.source, "request_quotes");
      const shopperJob = await start(splitShopper);
      assert.equal((await purge(splitShopper, shopperJob)).rows[0].r.source, "events");
      await a.query("begin");
      assert.equal((await purge(splitShopper, shopperJob)).rows[0].r.source, "quote_links");
      await b.query("select set_config('request.jwt.claims','{}',false)");
      const buyerProgress = b.query("select purge_account_deletion_sourcing($1,$2,$3,100)r", [
        buyerJob.id,
        splitBuyer.seller,
        buyerJob.lease_token,
      ]);
      await waitLock(a, b.processID);
      await a.query("commit");
      assert.equal((await buyerProgress).rows[0].r.source, "request_events");
      assert.equal((await purge(splitShopper, shopperJob)).rows[0].r.pass_done, true);
      assert.equal((await purge(splitBuyer, buyerJob)).rows[0].r.pass_done, true);
      const preserved = (await a.query("select * from sourcing_events where id=$1", [history]))
        .rows[0];
      assert.equal(preserved.note, "Preserve third member history");
      assert.equal(preserved.request_id, null);
      assert.equal(preserved.quote_id, null);
      assert(preserved.request_unavailable_at && preserved.quote_unavailable_at);
    }),
);
