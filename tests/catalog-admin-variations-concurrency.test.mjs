import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { withListingTestPostgres } from "./helpers/postgres-test-cluster.mjs";
import { installDeletionPhotoWriterSchema } from "./helpers/account-deletion-photo-database.mjs";
import { installPrivateRecordSources } from "./helpers/account-deletion-private-database.mjs";
import {
  variationDatabase,
  variationActors,
  variationMigration,
} from "./helpers/catalog-admin-variation-database.mjs";
import { seedCatalog } from "./helpers/account-deletion-catalog-database.mjs";
import { fixtureMemberSession } from "./helpers/account-deletion-owned-listings-database.mjs";
test(
  "real PostgreSQL rehearses a 504-row key rewrite and serializes approvals with withdrawal and duplicate approval",
  {
    skip: process.env.BLUEBIRD_DELETION_PG !== "1" ? "Run with BLUEBIRD_DELETION_PG=1" : false,
    timeout: 60000,
  },
  async (t) =>
    withListingTestPostgres(async (connect) => {
      const a = await connect(),
        b = await connect(),
        db = { exec: (s) => a.query(s), query: (s, args) => a.query(s, args) };
      await installDeletionPhotoWriterSchema(db);
      await installPrivateRecordSources(db);
      await variationDatabase({ install: false, provided: db });
      const f = await variationActors(db);
      await a.query(
        "insert into products(slug,name,created_by,status)select 'synthetic-rewrite-'||i,'Synthetic capacity rehearsal',$1,'draft'from generate_series(1,502)i",
        [f.admin.seller],
      );
      await a.query(
        "insert into product_variants(product_id,sku_label)select id,'Option '||slug from products where slug like 'synthetic-rewrite-%'",
      );
      const before = (await a.query("select * from product_variants order by id")).rows;
      assert.equal(before.length, 504);
      const started = performance.now();
      await a.query(variationMigration());
      const elapsed = performance.now() - started;
      const after = (await a.query("select * from product_variants order by id")).rows;
      assert.deepEqual(
        after,
        before.map((r) => ({
          ...r,
          variation_key: r.sku_label
            ? "label:" + r.sku_label.trim().toLowerCase()
            : r.variation_key,
        })),
      );
      t.diagnostic(
        `Rehearsed ${before.length} synthetic variant rows in ${Math.round(elapsed)} ms; no provider requests or production writes.`,
      );
      const submit = async (author) =>
        (
          await a.query(
            "insert into product_suggestions(submitted_by,name,category_id,resort_codes,status)values($1,'Synthetic pending request',$2,ARRAY['TEST'],'submitted')returning id",
            [author.seller, author.category],
          )
        ).rows[0].id;
      const approve = (c, suggestion) =>
        c.query(
          "select admin_create_product(_name=>'Synthetic race approval',_slug=>$1,_category_id=>$2,_resort_codes=>ARRAY['TEST'],_variations=>ARRAY['Standard'],_suggestion_id=>$3)id",
          ["synthetic-" + randomUUID(), f.admin.category, suggestion],
        );
      const waitLock = async (c, pid) => {
        for (let i = 0; i < 70; i++) {
          if (
            (await c.query("select wait_event_type from pg_stat_activity where pid=$1", [pid]))
              .rows[0]?.wait_event_type === "Lock"
          )
            return;
          await pause(10);
        }
        throw Error("Expected live approval lock was not observed");
      };
      const first = await submit(f.author);
      await a.query("begin");
      await approve(a, first);
      const request = b.query("select mobile_request_deletion($1)", [f.author.seller]);
      await waitLock(a, b.processID);
      await a.query("commit");
      await request;
      await assert.rejects(approve(a, first), /Private account records unavailable/);
      const secondAuthor = await seedCatalog(db),
        second = await submit(secondAuthor);
      await b.query("begin");
      await b.query("select mobile_request_deletion($1)", [secondAuthor.seller]);
      const late = assert.rejects(approve(a, second), /Private account records unavailable/);
      await waitLock(b, a.processID);
      await b.query("commit");
      await late;
      assert.equal(
        (await a.query("select status from product_suggestions where id=$1", [second])).rows[0]
          .status,
        "submitted",
      );
      const thirdAuthor = await seedCatalog(db),
        third = await submit(thirdAuthor);
      await fixtureMemberSession({ query: (s, args) => b.query(s, args) }, f.admin.seller);
      await a.query("begin");
      const winner = (await approve(a, third)).rows[0].id;
      const count = (await a.query("select count(*)::int n from products")).rows[0].n;
      const duplicate = assert.rejects(approve(b, third), /already has an approved catalog page/);
      await waitLock(a, b.processID);
      await a.query("commit");
      await duplicate;
      assert.equal((await a.query("select count(*)::int n from products")).rows[0].n, count);
      assert.equal(
        (await a.query("select created_product_id from product_suggestions where id=$1", [third]))
          .rows[0].created_product_id,
        winner,
      );
      assert.equal(
        (await a.query("select count(*)::int n from admin_audit_log where entity_id=$1", [winner]))
          .rows[0].n,
        1,
      );
    }),
);
