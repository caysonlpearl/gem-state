import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadPhotoModules } from "./photo-storage-fixture.mjs";
import {
  storageProviderDatabase,
  storageProviderBridge,
} from "./helpers/account-deletion-storage-provider-database.mjs";

const { createAccountDeletionStorageInventory } = loadPhotoModules()(
  "./account-deletion-storage-inventory.server",
);
const config = {
  url: "https://udxxfuticbxwiehoepeg.supabase.co",
  serviceKey: "sb_secret_" + "a".repeat(32),
};
const signal = () => AbortSignal.timeout(15000);
const unavailable = (e) =>
  e.code === "inventory_unavailable" &&
  e.message === "inventory_unavailable" &&
  e.cause === undefined;
async function setup({ after, fetcher, paths = 1 } = {}) {
  const db = await storageProviderDatabase(),
    user = randomUUID(),
    versions = [];
  await db.query("insert into auth.users(id) values($1)", [user]);
  await db.exec(
    "insert into storage.buckets(id,versioning_status) values('listing-media','ENABLED')",
  );
  for (let i = 0; i < paths; i++) {
    const path = `${user}/photo-${String(i).padStart(3, "0")}.jpg`;
    for (const archived of [true, false]) {
      const row = {
        id: randomUUID(),
        name: path,
        key: path,
        version: randomUUID(),
        metadata: { size: 100, ignored: "PRIVATE-METADATA" },
        archived_at: archived ? "2026-11-13T12:00:00Z" : null,
        is_delete_marker: false,
        is_versioned: true,
      };
      await db.query(
        "insert into storage.objects(id,bucket_id,name,owner,version,metadata,archived_at,is_delete_marker,is_versioned) values($1,'listing-media',$2,$3,$4,$5,$6,false,true)",
        [row.id, path, user, row.version, row.metadata, row.archived_at],
      );
      versions.push(row);
    }
  }
  await db.query("select mobile_request_deletion($1)", [user]);
  await db.exec("update account_deletion_controls set worker_enabled=true");
  const job = (await db.query("select * from claim_account_deletion()")).rows[0];
  const bridge = storageProviderBridge(db, after),
    requests = [];
  const provider = createAccountDeletionStorageInventory(bridge, config, async (request) => {
    const body = await request.json();
    requests.push(body);
    return fetcher
      ? fetcher(body, { db, job, versions, requests })
      : Response.json({
          objects: versions.filter((v) => v.key === body.prefix),
          folders: [],
          hasNext: false,
        });
  });
  return { db, job, bridge, provider, versions, requests };
}
async function untilProvider(f) {
  for (let i = 0; i < 40; i++) {
    const result = await f.provider.step(f.job, signal());
    if (result.stage === "supabase_versions") return result;
  }
  throw Error("Synthetic reference scan did not finish");
}
const prepare = (f) =>
  f.db
    .query("select prepare_account_deletion_storage_inventory($1,$2,$3) p", [
      f.job.id,
      f.job.user_id,
      f.job.lease_token,
    ])
    .then((r) => r.rows[0].p);
const commit = (f, args) =>
  f.db.query(
    "select commit_account_deletion_storage_page($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) p",
    Object.values(args),
  );

test("reference discovery, real SDK listing and durable version pages run together without phase advancement", async () => {
  const f = await setup();
  try {
    assert.equal(f.requests.length, 0);
    const result = await untilProvider(f);
    assert.equal(result.objects, 2);
    assert.equal(result.passDone, false);
    assert.equal("done" in result, false);
    const final = await f.provider.step(f.job, signal());
    assert.equal(final.passDone, true);
    assert.equal(f.requests.length, 1);
    const rows = (
      await f.db.query(
        "select snapshot from account_deletion_media_observations where source='supabase_storage_provider'",
      )
    ).rows;
    assert.equal(rows.length, 2);
    assert(rows.some((r) => r.snapshot.archived_at));
    assert(!JSON.stringify(rows).includes("PRIVATE"));
    assert.equal(
      (await f.db.query("select phase from account_deletion_jobs")).rows[0].phase,
      "inventory",
    );
    assert.equal(
      (await f.db.query("select count(*)::int n from storage.objects")).rows[0].n,
      2,
      "inventory never removes a file record",
    );
  } finally {
    await f.db.close();
  }
});

test("lost commit acknowledgement resumes the next cursor and exact replay never rewinds progress", async () => {
  let lost = false;
  const f = await setup({
    after: async (name) => {
      if (name === "commit_account_deletion_storage_page" && !lost) {
        lost = true;
        throw Error("PRIVATE lost acknowledgement");
      }
    },
    fetcher: (body, { versions }) =>
      Response.json({
        objects: [versions[body.cursor ? 1 : 0]],
        folders: [],
        hasNext: !body.cursor,
        ...(!body.cursor ? { nextCursor: "opaque-next" } : {}),
      }),
  });
  try {
    await assert.rejects(untilProvider(f), unavailable);
    const first = f.bridge.calls.find(
      (c) => c.name === "commit_account_deletion_storage_page",
    ).args;
    assert.equal(
      (await f.db.query("select page_number from account_deletion_storage_scans")).rows[0]
        .page_number,
      1,
    );
    await f.provider.step(f.job, signal());
    assert.equal(f.requests[1].cursor, "opaque-next");
    assert.equal(
      (await f.db.query("select count(*)::int n from account_deletion_storage_pages")).rows[0].n,
      2,
    );
    assert.equal((await commit(f, first)).rows[0].p, true);
    assert.equal(
      (await f.db.query("select page_number from account_deletion_storage_scans")).rows[0]
        .page_number,
      2,
    );
    await assert.rejects(
      commit(f, { ...first, _objects: [{ ...first._objects[0], bytes: 101 }] }),
      /Deletion inventory unavailable/,
    );
    assert.equal(
      (
        await f.db.query(
          "select count(*)::int n from account_deletion_media_observations where source='supabase_storage_provider'",
        )
      ).rows[0].n,
      2,
    );
  } finally {
    await f.db.close();
  }
});

test("a provider silently omitting a known archived version cannot complete or advance its page", async () => {
  const f = await setup({
    fetcher: (_, context) =>
      Response.json({ objects: [context.versions[1]], folders: [], hasNext: false }),
  });
  try {
    await assert.rejects(untilProvider(f), unavailable);
    assert.equal(
      (await f.db.query("select page_number,done from account_deletion_storage_scans")).rows[0]
        .page_number,
      0,
    );
    assert.equal(
      (await f.db.query("select count(*)::int n from account_deletion_storage_pages")).rows[0].n,
      0,
    );
    assert.equal(
      (
        await f.db.query(
          "select count(*)::int n from account_deletion_media_observations where source='supabase_storage_provider'",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (await f.db.query("select phase from account_deletion_jobs")).rows[0].phase,
      "inventory",
    );
  } finally {
    await f.db.close();
  }
});

test("an operator pause or new reference generation invalidates in-flight provider results", async () => {
  const f = await setup({
    fetcher: async (_, context) => {
      await context.db.exec("update account_deletion_controls set worker_enabled=false");
      return Response.json({ objects: context.versions, folders: [], hasNext: false });
    },
  });
  try {
    await assert.rejects(untilProvider(f), unavailable);
    assert.equal(
      (await f.db.query("select count(*)::int n from account_deletion_storage_pages")).rows[0].n,
      0,
    );
    await f.db.exec("update account_deletion_controls set worker_enabled=true");
    const target = (await prepare(f)).target;
    await f.db.query("select restart_account_deletion_media_inventory($1,$2,$3)", [
      f.job.id,
      f.job.user_id,
      f.job.lease_token,
    ]);
    assert.equal(
      (
        await f.db.query("select account_deletion_storage_task_current($1,$2,$3,$4,$5,$6) p", [
          f.job.id,
          f.job.user_id,
          f.job.lease_token,
          target.id,
          target.generation,
          target.page,
        ])
      ).rows[0].p,
      false,
    );
  } finally {
    await f.db.close();
  }
});

test("cursor cycles and direct ledger tampering do not checkpoint provider progress", async () => {
  const f = await setup({
    fetcher: (body) =>
      Response.json({
        objects: [],
        folders: [],
        hasNext: true,
        nextCursor: !body.cursor ? "a" : body.cursor === "a" ? "b" : "a",
      }),
  });
  try {
    await untilProvider(f);
    await f.provider.step(f.job, signal());
    await assert.rejects(f.provider.step(f.job, signal()), unavailable);
    assert.equal(
      (await f.db.query("select cursor,page_number from account_deletion_storage_scans")).rows[0]
        .cursor,
      "b",
    );
    assert.equal(
      (await f.db.query("select count(*)::int n from account_deletion_storage_pages")).rows[0].n,
      2,
    );
    for (const role of ["anon", "authenticated"]) {
      await f.db.exec(`set role ${role}`);
      await assert.rejects(
        f.db.query("select * from account_deletion_storage_scans"),
        /permission denied/,
      );
      await assert.rejects(
        f.db.query("select prepare_account_deletion_storage_inventory(null,null,null)"),
        /permission denied/,
      );
      await f.db.exec("reset role");
    }
    await f.db.exec("set role service_role");
    await assert.rejects(
      f.db.query("delete from account_deletion_storage_pages"),
      /permission denied/,
    );
    await f.db.exec("reset role");
  } finally {
    await f.db.close();
  }
});

test("target preparation is bounded and one step performs at most one provider page request", async () => {
  const f = await setup({ paths: 51 });
  try {
    await untilProvider(f);
    assert.equal(f.requests.length, 1);
    assert.equal(
      (await f.db.query("select count(*)::int n from account_deletion_storage_scans")).rows[0].n,
      50,
    );
    await f.provider.step(f.job, signal());
    assert.equal(f.requests.length, 2);
    assert.equal(
      (await f.db.query("select count(*)::int n from account_deletion_storage_scans")).rows[0].n,
      51,
    );
  } finally {
    await f.db.close();
  }
});

test("current owned Storage metadata fills a missing historical-reference snapshot", async () => {
  let f,
    dropped = false;
  f = await setup({
    after: async (name, args, result) => {
      if (name === "scan_account_deletion_media_inventory" && result.pass_done && !dropped) {
        dropped = true;
        // Only remove synthetic discovery observations, never a Storage object.
        await f.db.query(
          "delete from account_deletion_media_observations where job_id=$1 and source='storage_objects'",
          [f.job.id],
        );
      }
    },
  });
  try {
    await untilProvider(f);
    assert.equal(dropped, true);
    assert.equal(
      (
        await f.db.query(
          "select count(*)::int n from account_deletion_media_observations where source='supabase_storage_provider'",
        )
      ).rows[0].n,
      2,
    );
    assert.equal((await f.db.query("select count(*)::int n from storage.objects")).rows[0].n, 2);
  } finally {
    await f.db.close();
  }
});
