import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { inventoryDatabase } from "./helpers/account-deletion-inventory-database.mjs";
import { memberPhotoReceipt } from "./helpers/account-deletion-photo-database.mjs";
import { createAccountDeletionReferenceInventory } from "../src/lib/account-deletion-inventory.server.ts";

const signal = () => AbortSignal.timeout(15000);
const adapter = (db) =>
  createAccountDeletionReferenceInventory({
    rpc(name, args) {
      const task = Promise.resolve().then(async () => {
        const values = Object.values(args);
        const result = await db.query(
          `select public.${name}(${values.map((_, i) => "$" + (i + 1)).join(",")}) as result`,
          values,
        );
        return { data: result.rows[0].result, error: null };
      });
      task.abortSignal = () => task;
      return task;
    },
  });
async function member(db) {
  const id = randomUUID();
  await db.query("insert into auth.users(id) values($1)", [id]);
  return id;
}
async function claim(db, user) {
  await db.query("select mobile_request_deletion($1)", [user]);
  await db.exec("update account_deletion_controls set worker_enabled=true");
  return (await db.query("select * from claim_account_deletion()")).rows[0];
}
async function scanAll(db, job, limit = 2) {
  const api = adapter(db),
    pages = [];
  for (let i = 0; i < 150; i++) {
    const page = await api.scan(job, signal(), limit);
    assert(page.read <= limit);
    pages.push(page);
    if (page.passDone) return pages;
  }
  throw Error("Inventory pass did not finish within the fixture bound");
}

test("reference normalization retains exact keys, decodes only trusted URL paths, and drops access tokens", async () => {
  const db = await inventoryDatabase();
  try {
    const normalize = async (bucket, value) =>
      (
        await db.query("select account_deletion_media_reference($1,$2) as reference", [
          bucket,
          value,
        ])
      ).rows[0].reference;
    assert.deepEqual(
      await normalize(
        "profile-avatars",
        "https://udxxfuticbxwiehoepeg.supabase.co/storage/v1/object/sign/profile-avatars/user/a%20b%25.jpg?token=PRIVATE#OTHER",
      ),
      { state: "resolved", bucket: "profile-avatars", path: "user/a b%.jpg" },
    );
    assert.deepEqual(
      await normalize("catalog-media", "/api/public/catalog-media/product/image.jpg?token=PRIVATE"),
      { state: "resolved", bucket: "catalog-media", path: "product/image.jpg" },
    );
    assert.equal(
      (
        await normalize(
          "catalog-media",
          "https://www.onbluebird.com/api/public/catalog-media/product/image.jpg",
        )
      ).path,
      "product/image.jpg",
    );
    assert.equal((await normalize("profile-avatars", "user/a%20b.jpg")).path, "user/a%20b.jpg");
    for (const path of [
      "../private",
      "user/../private",
      "user//private",
      "file:///private",
      "data:image/private",
      "x\\private",
      "a?secret",
      "a#secret",
      "a\nprivate",
    ]) {
      assert.equal((await normalize("profile-avatars", path)).state, "unresolved", path);
    }
    assert.equal(
      (
        await normalize(
          "profile-avatars",
          "https://udxxfuticbxwiehoepeg.supabase.co/storage/v1/object/sign/shopper-documents/a?token=PRIVATE",
        )
      ).state,
      "unresolved",
    );
    assert.deepEqual(await normalize(null, "https://foreign.example/private?token=PRIVATE"), {
      state: "external",
    });
    assert.deepEqual(await normalize(null, "legacy/no-known-bucket"), { state: "unresolved" });
  } finally {
    await db.close();
  }
});

test("every database source executes in bounded pages without authorizing deletion or advancing its phase", async () => {
  const db = await inventoryDatabase();
  try {
    assert.equal(
      (await db.query("select worker_enabled from account_deletion_controls")).rows[0]
        .worker_enabled,
      false,
    );
    const user = await member(db),
      job = await claim(db, user);
    const pages = await scanAll(db, job);
    assert.equal(pages.length, 28);
    assert.equal(new Set(pages.map((p) => p.source)).size, 28);
    assert(pages.every((p) => p.read === 0 && !Object.hasOwn(p, "done")));
    assert.equal(
      (await db.query("select phase from account_deletion_jobs where id=$1", [job.id])).rows[0]
        .phase,
      "inventory",
    );
    assert.deepEqual(await adapter(db).scan(job, signal()), { passDone: true, read: 0, added: 0 });
    assert.deepEqual(
      (await db.query("select account_access_coverage() as coverage")).rows[0].coverage,
      { unguarded_functions: 0, unguarded_tables: 0, helper_privilege_gaps: 0 },
    );
  } finally {
    await db.close();
  }
});

test("member media discovery excludes private content and another business's configuring operator", async () => {
  const db = await inventoryDatabase();
  try {
    const user = await member(db),
      other = await member(db),
      owned = randomUUID(),
      unrelated = randomUUID();
    const product = randomUUID(),
      image = randomUUID(),
      model = randomUUID();
    const ownSource = randomUUID(),
      wrongSource = randomUUID(),
      ownRecord = randomUUID(),
      wrongRecord = randomUUID();
    const excludedMedia = randomUUID();
    await db.query("insert into profiles(id,avatar_url) values($1,$2),($3,$4)", [
      user,
      `https://udxxfuticbxwiehoepeg.supabase.co/storage/v1/object/sign/profile-avatars/${user}/avatar.jpg?token=PRIVATE-TOKEN`,
      other,
      `${other}/other.jpg`,
    ]);
    await db.query(
      "insert into dealer_profiles(id,owner_user_id,logo_url) values($1,$2,$3),($4,$5,$6)",
      [owned, user, `${other}/shared-logo.jpg`, unrelated, other, `${other}/wrong-logo.jpg`],
    );
    await db.query(
      "insert into dealer_inventory_sources(id,dealer_id,owner_user_id) values($1,$2,$3),($4,$5,$6)",
      [ownSource, owned, other, wrongSource, unrelated, user],
    );
    await db.query("insert into dealer_inventory_records(id,source_id) values($1,$2),($3,$4)", [
      ownRecord,
      ownSource,
      wrongRecord,
      wrongSource,
    ]);
    await db.query(
      "insert into dealer_inventory_media(id,record_id,media_url) values($1,$2,$3),($4,$5,$6)",
      [
        randomUUID(),
        ownRecord,
        "https://feed.example/shared.jpg?token=PRIVATE-FEED",
        excludedMedia,
        wrongRecord,
        "https://feed.example/wrong.jpg",
      ],
    );
    await db.query("insert into products(id,created_by) values($1,$2)", [product, user]);
    await db.query("insert into product_images(id,product_id,storage_path) values($1,$2,$3)", [
      image,
      product,
      `${product}/shared-product.jpg`,
    ]);
    await db.query(
      "insert into product_models(id,product_id,storage_path,poster_path) values($1,$2,$3,$4)",
      [
        model,
        product,
        "https://models.example/model.glb?token=PRIVATE-MODEL",
        `/api/public/catalog-media/${product}/poster.jpg`,
      ],
    );
    await db.query(
      "insert into conversation_messages(id,sender_id,conversation_id,attachment_path,body) values($1,$2,$3,$4,$5)",
      [randomUUID(), user, randomUUID(), `${user}/message.jpg`, "PRIVATE-MESSAGE-BODY"],
    );
    await db.query(
      "insert into job_applications(id,applicant_id,resume_path,cover_letter) values($1,$2,$3,$4)",
      [randomUUID(), user, `${user}/resume.pdf`, "PRIVATE-COVER-LETTER"],
    );
    await db.query(
      "insert into shopper_applications(id,user_id,id_document_path,applicant_note) values($1,$2,$3,$4)",
      [randomUUID(), user, `${user}/id.pdf`, "PRIVATE-IDENTITY-CONTENT"],
    );
    const job = await claim(db, user);
    await scanAll(db, job);
    const rows = (
      await db.query(
        "select source,record_key,snapshot from account_deletion_media_observations where job_id=$1",
        [job.id],
      )
    ).rows;
    const serialized = JSON.stringify(rows);
    assert(!/PRIVATE-|other[.]jpg|wrong-logo|wrong[.]jpg/.test(serialized));
    assert(!rows.some((r) => r.record_key === excludedMedia));
    assert(rows.some((r) => r.source === "dealer_inventory_media"));
    assert(rows.some((r) => r.snapshot.relationship === "business_shared"));
    assert(
      rows.some(
        (r) =>
          r.snapshot.relationship === "authored_shared_catalog" &&
          r.snapshot.reference.path === `${product}/shared-product.jpg`,
      ),
    );
    assert(
      rows.some(
        (r) =>
          r.source === "product_models_poster" &&
          r.snapshot.reference.path === `${product}/poster.jpg`,
      ),
    );
    for (const source of [
      "profiles",
      "conversation_messages",
      "job_applications",
      "shopper_applications",
    ])
      assert(
        rows.some((r) => r.source === source),
        source,
      );
    assert(!/authorized|exclusive_owner|erase_allowed/.test(serialized));
  } finally {
    await db.close();
  }
});

test("rescans preserve replaced receipts, removed legacy references and every observed Storage version", async () => {
  const db = await inventoryDatabase();
  try {
    const user = await member(db),
      other = await member(db),
      product = randomUUID(),
      image = randomUUID(),
      object = randomUUID();
    await db.query("insert into products(id,created_by) values($1,$2)", [product, user]);
    await db.query(
      "insert into product_images(id,product_id,storage_path) values($1,$2,'legacy/shared.jpg')",
      [image, product],
    );
    const receipt = memberPhotoReceipt(user);
    receipt.path = "legacy/shared.jpg";
    await db.query("select record_private_photo($1)", [receipt]);
    await db.exec(
      "insert into storage.buckets(id,versioning_status) values('listing-media','ENABLED'),('catalog-media','ENABLED')",
    );
    await db.query(
      "insert into storage.objects(id,bucket_id,name,owner,version,archived_at,is_versioned) values($1,'listing-media','legacy/shared.jpg',$2,'v-old',now(),true),($3,'catalog-media','legacy/shared.jpg',$2,'catalog-old',now(),true)",
      [randomUUID(), other, object],
    );
    // A legacy catalog reference is a different bucket and must not be assumed
    // to identify the listing receipt. A separately owned/prefixed copy can.
    await db.query(
      "insert into listing_media(id,storage_path,ask_id) values($1,'legacy/shared.jpg',$2)",
      [randomUUID(), randomUUID()],
    );
    const ask = (await db.query("select ask_id from listing_media")).rows[0].ask_id;
    await db.query("insert into asks(id,seller_id) values($1,$2)", [ask, user]);
    const job = await claim(db, user);
    await scanAll(db, job, 1);
    await db.query("update product_images set storage_path='legacy/replacement.jpg' where id=$1", [
      image,
    ]);
    await db.exec("delete from listing_media");
    receipt.sha256 = "d".repeat(64);
    receipt.r2_key = `original/v1/${"a".repeat(64)}/${"d".repeat(64)}`;
    // Simulate a privileged legacy repair replacing its metadata; the ordinary
    // immutable upload RPC correctly refuses to replace a different hash.
    await db.query(
      "update photo_object_receipts set sha256=$1,r2_key=$2 where bucket=$3 and path=$4",
      [receipt.sha256, receipt.r2_key, receipt.bucket, receipt.path],
    );
    await db.query(
      "update storage.objects set version='catalog-new',archived_at=null where id=$1",
      [object],
    );
    assert.equal(await adapter(db).restart(job, signal()), true);
    const pages = await scanAll(db, job, 1);
    assert(pages.some((p) => p.read === 1 && !p.sourceDone));
    const rows = (
      await db.query(
        "select source,snapshot,first_generation,last_generation from account_deletion_media_observations where job_id=$1",
        [job.id],
      )
    ).rows;
    const receipts = rows.filter((r) => r.source === "photo_object_receipts");
    assert.equal(receipts.length, 2);
    assert.deepEqual(
      new Set(receipts.map((r) => r.snapshot.original.sha256)),
      new Set(["b".repeat(64), "d".repeat(64)]),
    );
    assert(
      rows.some(
        (r) => r.snapshot.reference.path === "legacy/shared.jpg" && r.first_generation === 1,
      ),
    );
    assert(
      rows.some(
        (r) => r.snapshot.reference.path === "legacy/replacement.jpg" && r.first_generation === 2,
      ),
    );
    assert(rows.some((r) => r.snapshot.version === "catalog-old" && r.snapshot.archived_at));
    assert(rows.some((r) => r.snapshot.version === "catalog-new"));
    const count = rows.length;
    assert.equal(await adapter(db).restart(job, signal()), true);
    const replay = await scanAll(db, job, 1);
    assert.equal(
      replay.reduce((sum, p) => sum + p.added, 0),
      0,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from account_deletion_media_observations where job_id=$1",
          [job.id],
        )
      ).rows[0].n,
      count,
    );
  } finally {
    await db.close();
  }
});

test("wrong identity, stale lease, paused worker and a lost lease during a page cannot checkpoint inventory", async () => {
  const db = await inventoryDatabase();
  try {
    const user = await member(db),
      other = await member(db);
    await db.query("insert into profiles(id,avatar_url) values($1,$2)", [
      user,
      `${user}/avatar.jpg`,
    ]);
    const job = await claim(db, user),
      api = adapter(db);
    await assert.rejects(api.scan({ ...job, user_id: other }, signal()), /inventory_unavailable/);
    await assert.rejects(
      api.scan({ ...job, lease_token: randomUUID() }, signal()),
      /inventory_unavailable/,
    );
    await db.exec("update account_deletion_controls set worker_enabled=false");
    await assert.rejects(api.scan(job, signal()), /inventory_unavailable/);
    await db.exec("update account_deletion_controls set worker_enabled=true");
    await db.exec(`create function expire_inventory_fixture() returns trigger language plpgsql as $$begin
      update account_deletion_jobs set lease_until=clock_timestamp()-interval '1 second' where id=new.job_id;
      return new;end$$;
      create trigger expire_inventory_fixture before insert on account_deletion_media_observations for each row execute function expire_inventory_fixture();`);
    await assert.rejects(api.scan(job, signal()), /inventory_unavailable/);
    assert.equal(
      (await db.query("select count(*)::int n from account_deletion_inventory_runs")).rows[0].n,
      0,
    );
    assert.equal(
      (await db.query("select count(*)::int n from account_deletion_media_observations")).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query("select account_deletion_lease_current($1,$2,$3,'inventory') as current", [
          job.id,
          user,
          job.lease_token,
        ])
      ).rows[0].current,
      true,
    );
  } finally {
    await db.close();
  }
});

test("unfinished uploads, evidence copies, claim transfers and migration journals keep only file metadata", async () => {
  const db = await inventoryDatabase();
  try {
    const user = await member(db),
      other = await member(db),
      path = `${user}/pending.jpg`,
      run = randomUUID();
    const original = `original/v1/${"a".repeat(64)}/${"b".repeat(64)}`;
    const thumbnail = `thumbnail/v1/${"a".repeat(64)}/${"c".repeat(64)}`;
    await db.query(
      "insert into photo_upload_tickets(id,user_id,path,mode,payload,expires_at,verification_lease_until) values($1,$2,$3,'r2',$4,now()+interval '1 hour',now()+interval '1 minute')",
      [
        randomUUID(),
        user,
        path,
        {
          evidence: true,
          bytes: 100,
          contentType: "image/jpeg",
          sha256: "b".repeat(64),
          key: original,
          thumbnailKey: thumbnail,
          thumbnail: { bytes: 50, contentType: "image/webp", sha256: "c".repeat(64) },
          ignored: "PRIVATE-UPLOAD-SECRET",
        },
      ],
    );
    await db.query(
      "insert into seller_claim_transfers(id,claimant_id,manifest,lease_until) values($1,$2,$3,now()+interval '1 minute')",
      [
        randomUUID(),
        user,
        [
          {
            bucket: "listing-media",
            old: `${other}/claim-old.jpg`,
            new: `${user}/claim-new.jpg`,
            ignored: "PRIVATE-CLAIM-SECRET",
          },
        ],
      ],
    );
    await db.query(
      "insert into photo_migration_runs(id,created_by,project_ref,inventory_sha256,captured_at,total_groups,total_source_bytes) values($1,$2,'udxxfuticbxwiehoepeg',$3,now(),1,200)",
      [run, other, "f".repeat(64)],
    );
    await db.query(
      "insert into photo_migration_items(run_id,ordinal,entries,source_bytes,status,lease_until) values($1,0,$2,200,'running',now()+interval '1 minute')",
      [
        run,
        [
          {
            bucket: "listing-media",
            path: `${user}/migration.jpg`,
            bytes: 100,
            etag: "PRIVATE-ETAG",
          },
          { bucket: "listing-media", path: `${other}/unrelated-migration.jpg`, bytes: 100 },
        ],
      ],
    );
    const job = await claim(db, user);
    await scanAll(db, job, 1);
    const rows = (
      await db.query(
        "select source,snapshot from account_deletion_media_observations where job_id=$1",
        [job.id],
      )
    ).rows;
    const upload = rows.find((r) => r.source === "photo_upload_tickets").snapshot;
    const evidence = rows.find((r) => r.source === "photo_upload_ticket_evidence").snapshot;
    assert.equal(upload.original.key, original);
    assert.equal(upload.thumbnail.key, thumbnail);
    assert(upload.expires_at && upload.verification_lease_until);
    assert.equal(evidence.reference.bucket, "ask-evidence");
    assert.equal(evidence.original.key, original);
    assert(
      !Object.hasOwn(evidence, "thumbnail"),
      "evidence uploads have no thumbnail in that bucket",
    );
    assert(
      rows.some(
        (r) =>
          r.source === "seller_claim_transfers_old" &&
          r.snapshot.reference.path === `${other}/claim-old.jpg`,
      ),
    );
    assert(
      rows.some(
        (r) =>
          r.source === "seller_claim_transfers_new" &&
          r.snapshot.reference.path === `${user}/claim-new.jpg`,
      ),
    );
    const migration = rows.filter((r) => r.source === "photo_migration_items");
    assert.equal(migration.length, 1);
    assert.equal(migration[0].snapshot.status, "running");
    assert(!/PRIVATE-|unrelated-migration/.test(JSON.stringify(rows)));
  } finally {
    await db.close();
  }
});

test("private inventory survives Auth deletion and blocks premature minimal-receipt completion", async () => {
  const db = await inventoryDatabase();
  try {
    const user = await member(db),
      job = await claim(db, user);
    await scanAll(db, job);
    await db.query("delete from auth.users where id=$1", [user]);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from account_deletion_inventory_runs where job_id=$1",
          [job.id],
        )
      ).rows[0].n,
      1,
    );
    await db.query("update account_deletion_jobs set phase='verification' where id=$1", [job.id]);
    await assert.rejects(
      db.query("select advance_account_deletion($1,$2,'verification',true)", [
        job.id,
        job.lease_token,
      ]),
      /Private deletion inventory still exists/,
    );
    assert.equal(
      (await db.query("select user_id from account_deletion_jobs where id=$1", [job.id])).rows[0]
        .user_id,
      user,
    );
  } finally {
    await db.close();
  }
});

test("guests/members cannot read or run inventory and the service cannot tamper directly with receipts", async () => {
  const db = await inventoryDatabase();
  try {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(
        db.query("select * from account_deletion_media_observations"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select scan_account_deletion_media_inventory(null,null,null,1)"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select account_deletion_media_reference('listing-media','private')"),
        /permission denied/,
      );
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    await assert.rejects(
      db.query("delete from account_deletion_media_observations"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select account_deletion_media_reference('listing-media','private')"),
      /permission denied/,
    );
    await db.exec("reset role");
  } finally {
    await db.close();
  }
});

test("the adapter redacts provider errors, respects cancellation, and rejects unbounded or private responses", async () => {
  const job = {
    id: randomUUID(),
    user_id: randomUUID(),
    lease_token: randomUUID(),
    phase: "inventory",
    lease_until: new Date(Date.now() + 60000).toISOString(),
  };
  let calls = 0;
  const api = createAccountDeletionReferenceInventory({
    rpc() {
      calls++;
      return {
        abortSignal: async () => {
          throw Error("PRIVATE-URL?token=PRIVATE");
        },
      };
    },
  });
  await assert.rejects(
    api.scan(job, signal()),
    (error) =>
      error.message === "inventory_unavailable" && !JSON.stringify(error).includes("PRIVATE"),
  );
  const stopped = AbortSignal.abort();
  await assert.rejects(api.scan(job, stopped), /inventory_unavailable/);
  assert.equal(calls, 1);
  for (const limit of [0, 101, NaN, 1.2])
    await assert.rejects(api.scan(job, signal(), limit), /inventory_unavailable/);
  await assert.rejects(api.scan({ ...job, phase: "media" }, signal()), /inventory_unavailable/);
  const malformed = createAccountDeletionReferenceInventory({
    rpc() {
      return {
        abortSignal: async () => ({
          data: { pass_done: true, read: 0, added: 0, path: "PRIVATE" },
          error: null,
        }),
      };
    },
  });
  await assert.rejects(malformed.scan(job, signal()), /inventory_unavailable/);
});
