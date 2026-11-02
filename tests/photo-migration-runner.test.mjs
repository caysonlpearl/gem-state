import test from "node:test";
import assert from "node:assert/strict";
import { buildPhotoMigrationPlan } from "../src/lib/photo-migration-plan.server.mjs";
import { loadPhotoModules, photoStorageFixture } from "./photo-storage-fixture.mjs";

const project = "abcdefghijklmnopqrst",
  id = "55555555-5555-4555-8555-555555555555";
function fixture() {
  const photos = photoStorageFixture("supabase");
  const inventory = {
    schemaVersion: 1,
    projectRef: project,
    capturedAt: "2026-11-01T00:00:00Z",
    objects: ["listing-media", "ask-evidence"].map((bucket) => ({
      bucket,
      path: photos.path,
      ...photos.metadata,
    })),
  };
  const plan = buildPhotoMigrationPlan(inventory, project);
  const row = {
    id,
    project_ref: project,
    created_at: inventory.capturedAt,
    inventory_sha256: plan.inventorySha256,
    total_groups: 1,
    total_source_bytes: photos.content.length,
    source_bytes_reserved: 0,
    confirmed_download_bytes: 0,
    completed_groups: 0,
    failed_groups: 0,
    running_groups: 0,
    last_failure: null,
  };
  const state = { permit: "", calls: [], failReserve: false, revokeAfterLease: false };
  const validPermit = () =>
    JSON.stringify({
      runId: id,
      inventorySha256: plan.inventorySha256,
      maxGroups: 1,
      maxSourceBytes: photos.content.length,
      expiresAt: "2099-01-01T00:00:00Z",
    });
  function query(fn) {
    const q = {
      abortSignal: () => q,
      retry: () => q,
      then: (resolve) => Promise.resolve(fn()).then(resolve),
    };
    return q;
  }
  const db = {
    from(table) {
      assert.equal(table, "photo_migration_runs");
      let single = false;
      const q = query(() => ({ data: single ? { ...row } : [{ ...row }], error: null }));
      for (const name of ["select", "eq", "order", "limit"]) q[name] = () => q;
      q.maybeSingle = () => {
        single = true;
        return q;
      };
      return q;
    },
    rpc(name, args) {
      return query(() => {
        state.calls.push({ name, args });
        if (name === "prepare_photo_migration") return { data: id, error: null };
        if (name === "lease_photo_migration_item") {
          row.running_groups = 1;
          return {
            data: {
              state: "leased",
              item: { ordinal: 0, source_bytes: photos.content.length, entries: inventory.objects },
            },
            error: null,
          };
        }
        if (name === "reserve_photo_migration_download") {
          assert.equal(photos.state.sourceDownloads, 0, "reservation must precede source GET");
          if (state.failReserve) return { data: null, error: { message: "budget reached" } };
          row.source_bytes_reserved += args._bytes;
        }
        if (name === "finish_photo_migration_item") {
          row.completed_groups++;
          row.running_groups = 0;
          row.confirmed_download_bytes += args._downloaded;
        }
        if (name === "fail_photo_migration_item") {
          row.failed_groups++;
          row.running_groups = 0;
          row.last_failure = args._reason;
        }
        return { data: null, error: null };
      });
    },
  };
  const { createPhotoMigrationRunner, photoMigrationPermit } = loadPhotoModules({
    "./photo-migration-plan.server.mjs": { buildPhotoMigrationPlan },
    "./photo-storage.server": { getPhotoStorage: async () => photos.store },
  })("./photo-migration.server");
  const runner = createPhotoMigrationRunner(db, "admin", {
    project: () => project,
    permit: () => state.permit,
    store: async () => {
      if (state.revokeAfterLease) state.permit = "";
      return photos.store;
    },
  });
  return { runner, state, photos, inventory, plan, validPermit, photoMigrationPermit };
}

test("metadata review uses the same canonical plan as the offline CLI and performs no photo operations", async () => {
  const f = fixture();
  const result = await f.runner.prepare(f.inventory);
  assert.equal(result.digest, f.plan.inventorySha256);
  assert.equal(result.permit, null);
  assert.equal(f.state.calls.length, 1);
  assert.equal(f.state.calls[0].args._digest, f.plan.inventorySha256);
  assert.equal(f.photos.state.sourceDownloads, 0);
  assert.equal(f.photos.state.receiptReads, 0);
  assert.equal(f.photos.state.puts.length, 0);
});
test("missing, malformed, expired, wrong-run and wrong-digest permits deny copying before leases or R2 operations", async () => {
  for (const change of [
    null,
    { runId: "66666666-6666-4666-8666-666666666666" },
    { inventorySha256: "f".repeat(64) },
    { expiresAt: "2000-01-01T00:00:00Z" },
    { maxGroups: 0 },
    { maxSourceBytes: 0 },
    { unexpected: true },
  ]) {
    const f = fixture();
    f.state.permit =
      change === null ? "not-json" : JSON.stringify({ ...JSON.parse(f.validPermit()), ...change });
    await assert.rejects(() => f.runner.step(id), /disabled/);
    assert.equal(f.state.calls.length, 0);
    assert.equal(f.photos.state.sourceDownloads, 0);
    assert.equal(f.photos.state.receiptReads, 0);
  }
});
test("approved runner leases one group, reserves source bytes before download and commits after all target checks", async () => {
  const f = fixture();
  f.state.permit = f.validPermit();
  const result = await f.runner.step(id);
  assert.equal(result.state, "copied");
  assert.equal(result.status.completedGroups, 1);
  assert.deepEqual(
    f.state.calls.map((c) => c.name),
    [
      "lease_photo_migration_item",
      "reserve_photo_migration_download",
      "finish_photo_migration_item",
    ],
  );
  assert.equal(f.photos.state.sourceDownloads, 1);
  assert.equal(f.photos.state.puts.length, 3);
  assert.equal(f.photos.state.records.size, 2);
  assert.equal(result.status.sourceBytesReserved, f.photos.content.length);
  assert.equal(result.status.confirmedDownloadBytes, f.photos.content.length);
});
test("reservation failures, target outages and revoked permits stop before downloading", async () => {
  for (const mode of ["failReserve", "unhealthy", "revokeAfterLease"]) {
    const f = fixture();
    f.state.permit = f.validPermit();
    if (mode === "unhealthy") f.photos.state.healthy = false;
    else f.state[mode] = true;
    const result = await f.runner.step(id);
    assert.equal(result.state, "stopped");
    assert.equal(result.status.failedGroups, 1);
    assert.equal(f.photos.state.sourceDownloads, 0);
    assert.equal(f.photos.state.puts.length, 0);
    assert.equal(f.state.calls.at(-1).name, "fail_photo_migration_item");
  }
});
test("failures after source download keep the reservation and never report a completed group", async () => {
  const f = fixture();
  f.state.permit = f.validPermit();
  f.photos.state.failVerify = true;
  const result = await f.runner.step(id);
  assert.equal(result.state, "stopped");
  assert.equal(result.status.sourceBytesReserved, f.photos.content.length);
  assert.equal(result.status.confirmedDownloadBytes, 0);
  assert.equal(result.status.completedGroups, 0);
  assert.equal(f.photos.state.records.size, 0);
});
test("all migration endpoints require auth and deny nonadmins before privileged state is loaded", async () => {
  const auth = { auth: true };
  function createServerFn() {
    const def = {};
    const q = {
      middleware(v) {
        def.middleware = v;
        return q;
      },
      validator(v) {
        def.validator = v;
        return q;
      },
      handler(v) {
        return { ...def, handler: v };
      },
    };
    return q;
  }
  const module = loadPhotoModules({
    "@tanstack/react-start": { createServerFn, createServerOnlyFn: (fn) => fn },
    "@/integrations/supabase/auth-middleware": { requireSupabaseAuth: auth },
    "@/integrations/supabase/client.server": new Proxy(
      {},
      {
        get() {
          throw new Error("Privileged state must not be accessed");
        },
      },
    ),
  })("./photo-migration.functions");
  for (const name of ["getPhotoMigrations", "preparePhotoMigration", "stepPhotoMigration"]) {
    assert.equal(module[name].middleware[0], auth);
    await assert.rejects(
      () =>
        module[name].handler({
          data: { id },
          context: {
            userId: "member",
            supabase: { rpc: async () => ({ data: false, error: null }) },
          },
        }),
      /Administrator/,
    );
  }
  assert.throws(
    () =>
      module.preparePhotoMigration.validator({
        ...fixture().inventory,
        objects: [{ ...fixture().inventory.objects[0], path: "../unsafe.jpg" }],
      }),
    /path/,
  );
});
