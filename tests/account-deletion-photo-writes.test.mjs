import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  deletionPhotoWriterDatabase,
  memberPhotoReceipt,
} from "./helpers/account-deletion-photo-database.mjs";

const unavailable = /Photo account is unavailable/;
async function member(db) {
  const id = randomUUID();
  await db.query("insert into auth.users(id) values($1)", [id]);
  return id;
}
const record = (db, user, suffix) =>
  db.query("select record_private_photo($1)", [memberPhotoReceipt(user, suffix)]);
function ticket(user) {
  return {
    id: randomUUID(),
    user_id: user,
    path: `${user}/${randomUUID()}.jpg`,
    mode: "r2",
    payload: {
      bytes: 100,
      contentType: "image/jpeg",
      sha256: "b".repeat(64),
      evidence: true,
      key: "original",
      thumbnailKey: "thumbnail",
      thumbnail: { bytes: 50, sha256: "c".repeat(64), contentType: "image/webp" },
    },
    reservations: [
      { id: randomUUID().replaceAll("-", "").repeat(2), bytes: 100 },
      { id: randomUUID().replaceAll("-", "").repeat(2), bytes: 150 },
    ],
  };
}

test("real upload RPCs and receipts stop after a request, with no partial budget or ticket writes", async () => {
  const db = await deletionPhotoWriterDatabase();
  try {
    const user = await member(db),
      other = await member(db),
      t = ticket(user);
    await db.query("select begin_private_photo_upload($1)", [t]);
    await db.query("select lease_private_photo_upload($1,$2)", [t.id, user]);
    await record(db, user);
    await db.query("select mobile_request_deletion($1)", [user]);
    await assert.rejects(
      db.query("update photo_upload_tickets set verified_at=now() where id=$1", [t.id]),
      unavailable,
    );
    await assert.rejects(
      db.query("select begin_private_photo_upload($1)", [ticket(user)]),
      unavailable,
    );
    await assert.rejects(record(db, user), unavailable);
    await assert.rejects(record(db, user, "new.jpg"), unavailable);
    await assert.rejects(
      db.query("update photo_upload_tickets set verification_lease_until=null where id=$1", [t.id]),
      unavailable,
    );
    assert.equal((await db.query("select count(*)::int n from photo_upload_tickets")).rows[0].n, 1);
    assert.equal(
      (await db.query("select count(*)::int n from photo_storage_reservations")).rows[0].n,
      2,
    );
    assert.equal(
      (await db.query("select count(*)::int n from photo_object_receipts")).rows[0].n,
      1,
    );
    await record(db, other);
    assert.equal(
      (await db.query("select worker_enabled from account_deletion_controls")).rows[0]
        .worker_enabled,
      false,
    );
  } finally {
    await db.close();
  }
});

test("new cross-account references stop while existing shared rows can be edited, replaced or removed", async () => {
  const db = await deletionPhotoWriterDatabase();
  try {
    const user = await member(db),
      other = await member(db),
      path = `${user}/photo.jpg`,
      otherPath = `${other}/photo.jpg`;
    const tables = ["listing_media", "ask_media"];
    const ids = new Map();
    for (const table of tables) {
      const id = randomUUID();
      ids.set(table, id);
      await db.query(`insert into ${table}(id,storage_path) values($1,$2)`, [id, path]);
    }
    const imported = randomUUID();
    await db.query(
      "insert into fb_marketplace_import_items(id,seller_id,public_paths,evidence_paths) values($1,$2,$3,$3)",
      [imported, other, [path]],
    );
    await db.query("select mobile_request_deletion($1)", [user]);
    for (const table of tables) {
      await assert.rejects(
        db.query(`insert into ${table}(id,storage_path) values($1,$2)`, [randomUUID(), path]),
        unavailable,
      );
      await db.query(
        `update ${table} set label='retained shared reference',storage_path=storage_path where id=$1`,
        [ids.get(table)],
      );
      await db.query(`update ${table} set storage_path=$2 where id=$1`, [
        ids.get(table),
        otherPath,
      ]);
      await assert.rejects(
        db.query(`update ${table} set storage_path=$2 where id=$1`, [ids.get(table), path]),
        unavailable,
      );
      await db.query(`delete from ${table} where id=$1`, [ids.get(table)]);
    }
    await db.query(
      "update fb_marketplace_import_items set public_paths=public_paths,evidence_paths=evidence_paths,label='same' where id=$1",
      [imported],
    );
    await db.query(
      "update fb_marketplace_import_items set public_paths='{}',evidence_paths=null where id=$1",
      [imported],
    );
    for (const column of ["public_paths", "evidence_paths"])
      await assert.rejects(
        db.query(`update fb_marketplace_import_items set ${column}=$2 where id=$1`, [
          imported,
          [path],
        ]),
        unavailable,
      );
    await db.query(
      "update fb_marketplace_import_items set public_paths=$2,evidence_paths=$2 where id=$1",
      [imported, [otherPath]],
    );
    assert.equal(
      (await db.query("select seller_id from fb_marketplace_import_items where id=$1", [imported]))
        .rows[0].seller_id,
      other,
    );
  } finally {
    await db.close();
  }
});

test("real background migration leases cannot restart a deleting member's photo; old failures can settle", async () => {
  const db = await deletionPhotoWriterDatabase();
  try {
    const user = await member(db),
      admin = await member(db),
      run = randomUUID(),
      lease = randomUUID();
    const groups = [
      {
        source: { bytes: 100 },
        expectedSourceMetadata: [
          {
            bucket: "listing-media",
            path: `${user}/photo.jpg`,
            bytes: 100,
            etag: "d".repeat(32),
            contentType: "image/jpeg",
            updatedAt: "2026-11-01T00:00:00Z",
          },
        ],
      },
    ];
    await db.query("select prepare_photo_migration($1,$2,$3,$4,$5,$6)", [
      run,
      admin,
      "abcdefghijklmnopqrst",
      "a".repeat(64),
      "2026-11-01T00:00:00Z",
      groups,
    ]);
    const claim = () =>
      db.query("select lease_photo_migration_item($1,$2,$3,$4,1,100,$5,false)", [
        run,
        admin,
        lease,
        "a".repeat(64),
        "2099-01-01T00:00:00Z",
      ]);
    await claim();
    await db.query("select mobile_request_deletion($1)", [user]);
    await assert.rejects(
      db.query("select reserve_photo_migration_download($1,0,$2,$3,$4,100,$5,100)", [
        run,
        lease,
        admin,
        "a".repeat(64),
        "2099-01-01T00:00:00Z",
      ]),
      unavailable,
    );
    await db.query("select fail_photo_migration_item($1,0,$2,$3,'copy-failed')", [
      run,
      lease,
      admin,
    ]);
    await assert.rejects(
      db.query("select lease_photo_migration_item($1,$2,$3,$4,1,100,$5,true)", [
        run,
        admin,
        randomUUID(),
        "a".repeat(64),
        "2099-01-01T00:00:00Z",
      ]),
      unavailable,
    );
    const row = (
      await db.query(
        "select status,attempts,lease_source_reserved from photo_migration_items where run_id=$1",
        [run],
      )
    ).rows[0];
    assert.deepEqual(row, { status: "failed", attempts: 1, lease_source_reserved: false });
    assert.equal(
      (await db.query("select source_bytes_reserved from photo_migration_runs where id=$1", [run]))
        .rows[0].source_bytes_reserved,
      0,
    );
    await assert.rejects(
      db.query("select prepare_photo_migration($1,$2,$3,$4,$5,$6)", [
        randomUUID(),
        admin,
        "abcdefghijklmnopqrst",
        "b".repeat(64),
        "2026-11-01T00:00:00Z",
        groups,
      ]),
      unavailable,
    );
    assert.equal(
      (await db.query("select count(*)::int n from photo_migration_runs")).rows[0].n,
      1,
      "a rejected preparation rolls back the run too",
    );
  } finally {
    await db.close();
  }
});

test("claim transfers cannot attach pending source/destination paths or retarget a pending claimant", async () => {
  const db = await deletionPhotoWriterDatabase();
  try {
    const user = await member(db),
      other = await member(db),
      transfer = randomUUID();
    await db.query("insert into seller_claim_transfers(id,claimant_id,manifest) values($1,$2,$3)", [
      transfer,
      user,
      [{ bucket: "listing-media", old: "legacy/photo.jpg", new: `${user}/photo.jpg` }],
    ]);
    await db.query("select mobile_request_deletion($1)", [user]);
    await assert.rejects(
      db.query("update seller_claim_transfers set status='complete' where id=$1", [transfer]),
      unavailable,
    );
    await assert.rejects(
      db.query("update seller_claim_transfers set claimant_id=$2,manifest='[]' where id=$1", [
        transfer,
        other,
      ]),
      unavailable,
    );
    for (const key of ["old", "new"]) {
      const m = {
        bucket: "listing-media",
        old: `${other}/before.jpg`,
        new: `${other}/after.jpg`,
        [key]: `${user}/photo.jpg`,
      };
      await assert.rejects(
        db.query("insert into seller_claim_transfers(id,claimant_id,manifest) values($1,$2,$3)", [
          randomUUID(),
          other,
          [m],
        ]),
        unavailable,
      );
    }
    await db.query("insert into seller_claim_transfers(id,claimant_id) values($1,$2)", [
      randomUUID(),
      other,
    ]);
    await db.query("delete from seller_claim_transfers where id=$1", [transfer]);
  } finally {
    await db.close();
  }
});

test("private guards deny caller execution but service writes still run triggers; legacy paths are not ownership proof", async () => {
  const db = await deletionPhotoWriterDatabase();
  try {
    const user = await member(db);
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(
        db.query("select assert_member_photo_writer($1)", [user]),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select assert_member_photo_path($1)", [`${user}/photo.jpg`]),
        /permission denied/,
      );
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    await record(db, user);
    await db.exec("reset role");
    await db.query("select mobile_request_deletion($1)", [user]);
    await db.exec("set role service_role");
    await assert.rejects(record(db, user), unavailable);
    const unknown = randomUUID();
    await assert.rejects(record(db, unknown), unavailable);
    const legacy = { ...memberPhotoReceipt(user), path: "legacy/photo.jpg" };
    await db.query("select record_private_photo($1)", [legacy]);
    await db.exec("reset role");
    assert.deepEqual((await db.query("select account_access_coverage() c")).rows[0].c, {
      unguarded_functions: 0,
      unguarded_tables: 0,
      helper_privilege_gaps: 0,
    });
    assert.equal(
      (await db.query("select count(*)::int n from photo_object_receipts")).rows[0].n,
      2,
    );
  } finally {
    await db.close();
  }
});

test("banned, removed and job-only pending accounts cannot add receipts, including uppercase UUID prefixes", async () => {
  const db = await deletionPhotoWriterDatabase();
  try {
    for (const state of ["banned", "deleted", "job"]) {
      const user = await member(db);
      if (state === "banned")
        await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1", [
          user,
        ]);
      if (state === "deleted")
        await db.query("update auth.users set deleted_at=now() where id=$1", [user]);
      if (state === "job")
        await db.query("insert into account_deletion_jobs(user_id) values($1)", [user]);
      await assert.rejects(record(db, user.toUpperCase()), unavailable);
    }
    const live = await member(db);
    await record(db, live);
  } finally {
    await db.close();
  }
});

test("catalog and order namespaces do not require an unrelated UUID folder to be an Auth account", async () => {
  const db = await deletionPhotoWriterDatabase();
  try {
    const author = await member(db),
      product = randomUUID(),
      order = randomUUID();
    await db.exec("set role service_role");
    await db.query("insert into product_images(id,storage_path) values($1,$2)", [
      randomUUID(),
      `${product}/image.jpg`,
    ]);
    await db.query("insert into product_models(id,storage_path,poster_path) values($1,$2,$3)", [
      randomUUID(),
      `${product}/model.glb`,
      `/api/public/catalog-media/${product}/poster.webp`,
    ]);
    await db.query(
      "insert into order_evidence(id,order_id,uploaded_by,storage_path) values($1,$2,$3,$4)",
      [randomUUID(), order, author, `${order}/legacy-receipt.jpg`],
    );
    await db.exec("reset role");
    await db.query("select mobile_request_deletion($1)", [author]);
    // Catalog ids and licenses have separate ownership. Even a coincident UUID
    // must not become a deleting account's personal folder by assumption.
    await db.query("insert into product_images(id,storage_path) values($1,$2)", [
      randomUUID(),
      `${author}/catalog-image.jpg`,
    ]);
    await db.query("insert into product_models(id,storage_path,poster_path) values($1,$2,$3)", [
      randomUUID(),
      `/api/public/catalog-media/${author}/model.glb`,
      `${author}/catalog-poster.jpg`,
    ]);
    assert.equal((await db.query("select count(*)::int n from product_images")).rows[0].n, 2);
    assert.equal((await db.query("select count(*)::int n from product_models")).rows[0].n, 2);
  } finally {
    await db.close();
  }
});

test("request, suggestion and order media bind actual authors, including legacy keys and parent-only retargeting", async () => {
  const db = await deletionPhotoWriterDatabase();
  try {
    const target = await member(db),
      other = await member(db),
      request = randomUUID(),
      otherRequest = randomUUID(),
      suggestion = randomUUID(),
      otherSuggestion = randomUUID();
    await db.query("insert into sourcing_requests(id,buyer_id) values($1,$2),($3,$4)", [
      request,
      target,
      otherRequest,
      other,
    ]);
    await db.query("insert into product_suggestions(id,submitted_by) values($1,$2),($3,$4)", [
      suggestion,
      target,
      otherSuggestion,
      other,
    ]);
    const relations = [
      { table: "request_media", column: "request_id", target: request, other: otherRequest },
      {
        table: "product_suggestion_media",
        column: "suggestion_id",
        target: suggestion,
        other: otherSuggestion,
      },
      { table: "order_evidence", column: "uploaded_by", target, other },
    ];
    const ids = new Map();
    for (const r of relations) {
      const id = randomUUID();
      ids.set(r.table, id);
      await db.query(`insert into ${r.table}(id,${r.column},storage_path) values($1,$2,$3)`, [
        id,
        r.target,
        `legacy/${r.table}.jpg`,
      ]);
    }
    await db.query("select mobile_request_deletion($1)", [target]);
    for (const r of relations) {
      const id = ids.get(r.table);
      await assert.rejects(
        db.query(
          `insert into ${r.table}(id,${r.column},storage_path) values($1,$2,'legacy/late.jpg')`,
          [randomUUID(), r.target],
        ),
        unavailable,
      );
      await db.query(
        `update ${r.table} set label='retained evidence',storage_path=storage_path where id=$1`,
        [id],
      );
      await assert.rejects(
        db.query(`update ${r.table} set ${r.column}=$2 where id=$1`, [id, r.other]),
        unavailable,
      );
      const active = randomUUID();
      await db.query(
        `insert into ${r.table}(id,${r.column},storage_path) values($1,$2,'legacy/active.jpg')`,
        [active, r.other],
      );
      await assert.rejects(
        db.query(`update ${r.table} set ${r.column}=$2 where id=$1`, [active, r.target]),
        unavailable,
      );
      await assert.rejects(
        db.query(`insert into ${r.table}(id,${r.column},storage_path) values($1,$2,$3)`, [
          randomUUID(),
          r.other,
          `${target}/private.jpg`,
        ]),
        unavailable,
      );
      await db.query(`delete from ${r.table} where id=$1`, [id]);
    }
    await db.exec("set role service_role");
    await assert.rejects(
      db.query("select assert_known_member_photo_reference('legacy/file.jpg')"),
      /permission denied/,
    );
    await db.exec("reset role");
    assert.deepEqual((await db.query("select account_access_coverage() c")).rows[0].c, {
      unguarded_functions: 0,
      unguarded_tables: 0,
      helper_privilege_gaps: 0,
    });
  } finally {
    await db.close();
  }
});
