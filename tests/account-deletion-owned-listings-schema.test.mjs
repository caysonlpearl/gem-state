import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  ownedListingDatabase,
  ownedListingSchema,
  seedListing,
  fixtureMemberSession,
} from "./helpers/account-deletion-owned-listings-database.mjs";
async function fixture(t) {
  const db = await ownedListingDatabase();
  t.after(() => db.close());
  return db;
}
test("owned listing fixture preserves captured core columns and real trigger bodies", async (t) => {
  const db = await fixture(t);
  for (const row of ownedListingSchema.rows) {
    const columns = (
      await db.query(
        'select a.attname name,format_type(a.atttypid,a.atttypmod)type,a.attnotnull "notNull"from pg_attribute a where a.attrelid=$1::regclass and a.attnum>0 and not a.attisdropped order by a.attname',
        ["public." + row.source],
      )
    ).rows;
    assert.deepEqual(
      columns,
      row.metadata.columns
        .map(({ name, type, notNull }) => ({ name, type, notNull }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      row.source,
    );
    for (const hook of row.metadata.triggers ?? []) {
      const stored = (
        await db.query(
          "select p.prosrc,t.tgenabled from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid=$1::regclass and t.tgname=$2",
          ["public." + row.source, hook.name],
        )
      ).rows[0];
      assert.equal(createHash("md5").update(stored.prosrc).digest("hex"), hook.bodyMd5);
      assert.equal(stored.tgenabled, hook.enabled);
    }
  }
  for (const fn of ownedListingSchema.jobFunctions) {
    const stored = (
      await db.query("select md5(prosrc) hash from pg_proc where oid=$1::regprocedure", [
        fn.signature,
      ])
    ).rows[0];
    assert.equal(stored.hash, fn.bodyMd5, fn.signature);
  }
  assert.deepEqual((await db.query("select account_access_coverage() coverage")).rows[0].coverage, {
    unguarded_tables: 0,
    unguarded_functions: 0,
    helper_privilege_gaps: 0,
  });
  assert.deepEqual(
    (
      await db.query(
        "select account_deletion_private_barrier_current()private,account_deletion_profile_barrier_current()profile,account_deletion_conversation_barrier_current()conversation,account_deletion_inquiry_barrier_current()inquiry",
      )
    ).rows,
    [{ private: true, profile: true, conversation: true, inquiry: true }],
  );
});
test("real listing-media callbacks update the parent counters, with unrelated seller state intact", async (t) => {
  const db = await fixture(t),
    f = await seedListing(db),
    media = randomUUID(),
    evidence = randomUUID();
  await db.query(
    "insert into listing_media(id,ask_id,storage_path,rights_attested_at)values($1,$2,$3,now())",
    [media, f.listing, `${f.seller}/public.jpg`],
  );
  await db.query("insert into ask_media(id,ask_id,storage_path)values($1,$2,$3)", [
    evidence,
    f.listing,
    `${f.seller}/evidence.jpg`,
  ]);
  const read = () =>
    db.query(
      "select public_media_count,evidence_count,seller_id,price_cents from asks where id=$1",
      [f.listing],
    );
  assert.deepEqual((await read()).rows, [
    { public_media_count: 1, evidence_count: 1, seller_id: f.seller, price_cents: 100 },
  ]);
  await db.query("delete from listing_media where id=$1", [media]);
  assert.deepEqual((await read()).rows, [
    { public_media_count: 0, evidence_count: 1, seller_id: f.seller, price_cents: 100 },
  ]);
  await db.query("delete from ask_media where id=$1", [evidence]);
  assert.deepEqual((await read()).rows, [
    { public_media_count: 0, evidence_count: 0, seller_id: f.seller, price_cents: 100 },
  ]);
});
test("captured application functions submit and replace a resume without changing its original applicant", async (t) => {
  const db = await fixture(t),
    f = await seedListing(db);
  await fixtureMemberSession(db, f.buyer);
  const apply = (resume) =>
    db.query("select submit_job_application($1,$2,'Synthetic cover letter')id", [
      f.listing,
      `${f.buyer}/${resume}`,
    ]);
  const id = (await apply("first.pdf")).rows[0].id;
  assert.equal((await apply("second.pdf")).rows[0].id, id);
  assert.deepEqual(
    (
      await db.query(
        "select applicant_id,listing_id,resume_path,status from job_applications where id=$1",
        [id],
      )
    ).rows,
    [
      {
        applicant_id: f.buyer,
        listing_id: f.listing,
        resume_path: `${f.buyer}/second.pdf`,
        status: "submitted",
      },
    ],
  );
  await fixtureMemberSession(db, f.seller);
  await db.query("select update_job_application_status($1,'reviewed')", [id]);
  assert.equal(
    (await db.query("select status from job_applications where id=$1", [id])).rows[0].status,
    "reviewed",
  );
});
