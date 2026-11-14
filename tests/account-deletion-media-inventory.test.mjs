import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadPhotoModules } from "./photo-storage-fixture.mjs";
import { storageProviderBridge } from "./helpers/account-deletion-storage-provider-database.mjs";
import {
  r2InventoryDatabase,
  r2FixtureConfig,
  r2ListXml,
  r2XmlResponse,
} from "./helpers/account-deletion-r2-database.mjs";
const load = loadPhotoModules();
const { createAccountDeletionMediaInventory } = load("./account-deletion-media-inventory.server");
const { createAccountDeletionR2Inventory } = load("./account-deletion-r2-inventory.server");
const { photoObjectKey, photoSha256 } = load("./r2-photo-storage.server");
const signal = () => AbortSignal.timeout(15000);
const unavailable = (e) =>
  e.code === "inventory_unavailable" && e.message === "inventory_unavailable" && !e.cause;
async function setup({
  response,
  after,
  pin = true,
  paths = 1,
  receipt = false,
  aliasPath = null,
  beforeDelete,
} = {}) {
  const db = await r2InventoryDatabase(),
    user = randomUUID(),
    r2 = r2FixtureConfig(),
    requests = [];
  const provider = createAccountDeletionR2Inventory(r2, async () => true);
  if (pin)
    for (const bucket of ["listing-media", "ask-evidence"])
      await db.query("insert into account_deletion_r2_stores values($1,$2)", [
        bucket,
        provider.fingerprint(bucket),
      ]);
  await db.query("insert into auth.users(id) values($1)", [user]);
  await db.exec("insert into storage.buckets(id) values('listing-media')");
  const objects = [];
  for (let i = 0; i < paths; i++) {
    const key = `${user}/photo-${String(i).padStart(3, "0")}.jpg`,
      id = randomUUID();
    await db.query(
      "insert into storage.objects(id,bucket_id,name,owner,version,metadata) values($1,'listing-media',$2,$3,'version-1',$4)",
      [id, key, user, { size: 100 }],
    );
    objects.push({ id, key, version: "version-1", metadata: { size: 100 } });
  }
  if (receipt)
    await db.query(
      "insert into photo_object_receipts(bucket,path,r2_key,sha256,byte_size,content_type,thumbnail_key,thumbnail_sha256,thumbnail_bytes,thumbnail_content_type) values('listing-media',$1,$2,$3,100,'image/jpeg',$4,$5,100,'image/webp')",
      [
        objects[0].key,
        photoObjectKey(aliasPath ?? objects[0].key, "b".repeat(64)),
        "b".repeat(64),
        photoObjectKey(aliasPath ?? objects[0].key, "c".repeat(64), true),
        "c".repeat(64),
      ],
    );
  await beforeDelete?.(db, objects, user);
  await db.query("select mobile_request_deletion($1)", [user]);
  await db.exec("update account_deletion_controls set worker_enabled=true");
  const job = (await db.query("select * from claim_account_deletion()")).rows[0];
  const bridge = storageProviderBridge(db, after);
  const inventory = createAccountDeletionMediaInventory(
    bridge,
    {
      supabase: {
        url: "https://udxxfuticbxwiehoepeg.supabase.co",
        serviceKey: "sb_secret_" + "a".repeat(32),
      },
      r2,
    },
    async (request) => {
      const url = new URL(request.url);
      requests.push(request);
      if (url.hostname.endsWith(".supabase.co")) {
        const body = await request.json();
        return Response.json({
          objects: objects.filter((v) => v.key === body.prefix),
          folders: [],
          hasNext: false,
        });
      }
      return response
        ? response(url, { db, job })
        : r2XmlResponse(
            r2ListXml(
              url,
              url.searchParams.get("prefix").startsWith("original")
                ? ["a".repeat(64), "b".repeat(64)]
                : ["c".repeat(64)],
            ),
          );
    },
  );
  return { db, job, inventory, bridge, requests, objects, r2 };
}
async function untilR2(f) {
  for (let i = 0; i < 100; i++) {
    const before = f.requests.length,
      progress = await f.inventory.step(f.job, signal());
    assert(f.requests.length - before <= 1, "one bounded provider page per step");
    if (progress.stage === "r2_hash_copies") return progress;
  }
  throw Error("Synthetic inventory did not reach R2");
}
const sql = "select commit_account_deletion_r2_page($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) p";
test("database references, Supabase versions and old/current R2 copies share one resumable discovery driver", async () => {
  const f = await setup({ receipt: true });
  try {
    const first = await untilR2(f);
    assert.equal(first.objects, 2);
    assert.equal(first.passDone, false);
    assert.equal("done" in first, false);
    assert.equal((await f.inventory.step(f.job, signal())).objects, 1);
    const finished = await f.inventory.step(f.job, signal());
    assert.equal(finished.stage, "r2_hash_copies");
    assert.equal(finished.passDone, true);
    assert.equal(
      (await f.db.query("select count(*)::int n from account_deletion_r2_objects")).rows[0].n,
      3,
    );
    const observations = (
      await f.db.query(
        "select snapshot from account_deletion_media_observations where source='r2_storage_provider'",
      )
    ).rows;
    assert.equal(observations.length, 3);
    assert(!JSON.stringify(observations).includes("PRIVATE-NAME"));
    assert.equal(
      (await f.db.query("select phase from account_deletion_jobs")).rows[0].phase,
      "inventory",
    );
    assert.equal((await f.db.query("select count(*)::int n from storage.objects")).rows[0].n, 1);
    await f.db.query("delete from auth.users where id=$1", [f.job.user_id]);
    assert.equal(
      (await f.db.query("select count(*)::int n from account_deletion_r2_objects")).rows[0].n,
      3,
    );
  } finally {
    await f.db.close();
  }
});
test("R2 page commits survive a lost acknowledgement, replay exactly and never rewind or accept changed pages", async () => {
  let lost = false,
    firstArgs;
  const f = await setup({
    receipt: true,
    response: (url) =>
      r2XmlResponse(
        r2ListXml(
          url,
          [url.searchParams.has("continuation-token") ? "b".repeat(64) : "a".repeat(64)],
          { next: url.searchParams.has("continuation-token") ? null : "next/+&=" },
        ),
      ),
    after: async (name, args) => {
      if (name === "commit_account_deletion_r2_page" && !lost) {
        lost = true;
        firstArgs = args;
        throw Error("ack lost");
      }
    },
  });
  try {
    await assert.rejects(untilR2(f), unavailable);
    let row = (await f.db.query("select * from account_deletion_r2_scans where variant='original'"))
      .rows[0];
    assert.equal(row.page_number, 1);
    assert.equal(row.cursor, "next/+&=");
    await f.inventory.step(f.job, signal());
    assert.equal((await f.db.query(sql, Object.values(firstArgs))).rows[0].p, true);
    row = (await f.db.query("select * from account_deletion_r2_scans where variant='original'"))
      .rows[0];
    assert.equal(row.page_number, 2);
    assert.equal(row.done, true);
    const changed = { ...firstArgs, _objects: [{ ...firstArgs._objects[0], bytes: 101 }] };
    await assert.rejects(f.db.query(sql, Object.values(changed)), /Deletion inventory unavailable/);
    assert.equal(
      (await f.db.query("select count(*)::int n from account_deletion_r2_pages")).rows[0].n,
      2,
    );
  } finally {
    await f.db.close();
  }
});
test("missing known R2 receipts cannot finish a scan and a rejected page leaves no partial observations", async () => {
  const f = await setup({
    receipt: true,
    response: (url) => r2XmlResponse(r2ListXml(url, ["a".repeat(64)])),
  });
  try {
    await assert.rejects(untilR2(f), unavailable);
    assert.equal(
      (await f.db.query("select count(*)::int n from account_deletion_r2_pages")).rows[0].n,
      0,
    );
    assert.equal(
      (await f.db.query("select count(*)::int n from account_deletion_r2_objects")).rows[0].n,
      0,
    );
    assert.equal(
      (
        await f.db.query(
          "select count(*)::int n from account_deletion_media_observations where source='r2_storage_provider'",
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await f.db.close();
  }
});
test("owner-pinned store identities are mandatory and cannot be changed by members or worker credentials", async () => {
  const f = await setup({ pin: false });
  try {
    await assert.rejects(untilR2(f), unavailable);
    assert.equal(f.requests.filter((r) => r.url.includes("cloudflarestorage")).length, 0);
    for (const role of ["anon", "authenticated", "service_role"]) {
      await f.db.exec(`set role ${role}`);
      await assert.rejects(
        f.db.exec("insert into account_deletion_r2_stores values('listing-media',repeat('a',64))"),
        /permission denied/,
      );
      await assert.rejects(
        f.db.exec("delete from account_deletion_r2_objects"),
        /permission denied/,
      );
      await assert.rejects(
        f.db.query("select * from account_deletion_r2_candidates($1,$2)", [
          f.job.id,
          f.job.user_id,
        ]),
        /permission denied/,
      );
      await f.db.exec("reset role");
    }
    const p = createAccountDeletionR2Inventory(f.r2, async () => true);
    for (const bucket of ["listing-media", "ask-evidence"])
      await f.db.query("insert into account_deletion_r2_stores values($1,$2)", [
        bucket,
        p.fingerprint(bucket),
      ]);
    await untilR2(f);
    await f.db.exec(
      "update account_deletion_r2_stores set store_fingerprint=repeat('f',64) where bucket='listing-media'",
    );
    const before = f.requests.length;
    await assert.rejects(f.inventory.step(f.job, signal()), unavailable);
    assert.equal(f.requests.length, before);
  } finally {
    await f.db.close();
  }
});
test("R2 inventory loses authority on operator pause, rescan or lease replacement during HTTP", async () => {
  for (const mutation of [
    "update account_deletion_controls set worker_enabled=false",
    "select restart_account_deletion_media_inventory($1,$2,$3)",
    "update account_deletion_jobs set lease_token=gen_random_uuid()",
  ]) {
    let f;
    f = await setup({
      response: async (url, { db, job }) => {
        if (mutation.includes("$1"))
          await db.query(mutation, [job.id, job.user_id, job.lease_token]);
        else await db.exec(mutation);
        return r2XmlResponse(r2ListXml(url, ["a".repeat(64)]));
      },
    });
    try {
      await assert.rejects(untilR2(f), unavailable);
      assert.equal(
        (await f.db.query("select count(*)::int n from account_deletion_r2_pages")).rows[0].n,
        0,
      );
    } finally {
      await f.db.close();
    }
  }
});
test("R2 pagination rejects cross-page key repetition, cursor cycles and out-of-scope writes transactionally", async () => {
  let firstArgs;
  const f = await setup({
    after: async (name, args) => {
      if (name === "commit_account_deletion_r2_page" && !firstArgs) firstArgs = args;
    },
    response: (url) =>
      r2XmlResponse(
        r2ListXml(url, ["a".repeat(64)], {
          next: url.searchParams.has("continuation-token") ? "cursor-b" : "cursor-a",
        }),
      ),
  });
  try {
    await untilR2(f);
    await assert.rejects(f.inventory.step(f.job, signal()), unavailable);
    assert.equal(
      (await f.db.query("select count(*)::int n from account_deletion_r2_pages")).rows[0].n,
      1,
    );
    const next = {
      ...firstArgs,
      _page: 1,
      _cursor: "cursor-a",
      _objects: [
        {
          ...firstArgs._objects[0],
          key: firstArgs._objects[0].key.slice(0, -64) + "b".repeat(64),
          sha256: "b".repeat(64),
        },
      ],
      _next_cursor: "cursor-a",
    };
    await assert.rejects(f.db.query(sql, Object.values(next)), /Deletion inventory unavailable/);
    const foreign = {
      ...next,
      _next_cursor: "next",
      _objects: [
        { ...next._objects[0], key: "original/v1/" + "f".repeat(64) + "/" + "b".repeat(64) },
      ],
    };
    await assert.rejects(f.db.query(sql, Object.values(foreign)), /Deletion inventory unavailable/);
  } finally {
    await f.db.close();
  }
});
test("R2 task preparation is bounded and later generations preserve older discoveries", async () => {
  const f = await setup({ paths: 26 });
  try {
    await untilR2(f);
    assert.equal(
      (await f.db.query("select count(*)::int n from account_deletion_r2_scans")).rows[0].n,
      50,
    );
    await f.inventory.step(f.job, signal());
    assert.equal(
      (await f.db.query("select count(*)::int n from account_deletion_r2_scans")).rows[0].n,
      52,
    );
    await f.db.query("select restart_account_deletion_media_inventory($1,$2,$3)", [
      f.job.id,
      f.job.user_id,
      f.job.lease_token,
    ]);
    const progress = await f.inventory.step(f.job, signal());
    assert.equal(progress.stage, "references");
    assert.equal(progress.passDone, false);
    assert(
      (await f.db.query("select count(*)::int n from account_deletion_r2_objects")).rows[0].n > 0,
    );
  } finally {
    await f.db.close();
  }
});
test("claimed-photo aliases discover their actual physical prefix while preserving another member's shared receipt", async () => {
  const other = randomUUID(),
    aliasPath = `${other}/old-claim-photo.jpg`,
    prefixHash = photoSha256(aliasPath);
  const f = await setup({
    receipt: true,
    aliasPath,
    beforeDelete: async (db) => {
      await db.query("insert into auth.users(id) values($1)", [other]);
      await db.query(
        "insert into photo_object_receipts(bucket,path,r2_key,sha256,byte_size,content_type,thumbnail_key,thumbnail_sha256,thumbnail_bytes,thumbnail_content_type) values('listing-media',$1,$2,$3,100,'image/jpeg',$4,$5,100,'image/webp')",
        [
          aliasPath,
          photoObjectKey(aliasPath, "b".repeat(64)),
          "b".repeat(64),
          photoObjectKey(aliasPath, "c".repeat(64), true),
          "c".repeat(64),
        ],
      );
    },
    response: (url) => {
      const prefix = url.searchParams.get("prefix");
      const hashes = prefix.includes(prefixHash)
        ? prefix.startsWith("original")
          ? ["a".repeat(64), "b".repeat(64)]
          : ["c".repeat(64)]
        : [];
      return r2XmlResponse(r2ListXml(url, hashes));
    },
  });
  try {
    await untilR2(f);
    let complete = false;
    for (let i = 0; i < 10; i++) {
      const p = await f.inventory.step(f.job, signal());
      if (p.stage === "r2_hash_copies" && p.passDone) {
        complete = true;
        break;
      }
    }
    assert.equal(complete, true);
    const tasks = (await f.db.query("select path,path_hash from account_deletion_r2_scans")).rows;
    assert.equal(tasks.length, 4);
    assert(tasks.some((t) => t.path === f.objects[0].key && t.path_hash === prefixHash));
    const copies = (await f.db.query("select key from account_deletion_r2_objects")).rows;
    assert.equal(copies.length, 3);
    assert(copies.every((o) => o.key.includes(prefixHash)));
    assert.equal(
      (
        await f.db.query("select count(*)::int n from photo_object_receipts where path=$1", [
          aliasPath,
        ])
      ).rows[0].n,
      1,
    );
    assert.equal(
      (await f.db.query("select count(*)::int n from auth.users where id=$1", [other])).rows[0].n,
      1,
    );
    const exported = (
      await f.db.query(
        "select snapshot from account_deletion_media_observations where source='r2_storage_provider'",
      )
    ).rows;
    assert(exported.every((o) => o.snapshot.reference.path === f.objects[0].key));
  } finally {
    await f.db.close();
  }
});
