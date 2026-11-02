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
  const state = {
    permit: "",
    calls: [],
    failReserve: false,
    revokeAfterLease: false,
    prepareDelay: 0,
    reads: 0,
    readErrors: new Set(),
    readOverride: undefined,
    finishAck: "ok",
    leaseAck: "ok",
    itemReads: 0,
    itemReadErrors: new Set(),
    itemOverride: undefined,
    leasedItem: null,
    failPreviewReservation: false,
    preparedAck: "ok",
  };
  const validPermit = () =>
    JSON.stringify({
      runId: id,
      inventorySha256: plan.inventorySha256,
      maxGroups: 1,
      maxSourceBytes: photos.content.length,
      expiresAt: "2099-01-01T00:00:00Z",
    });
  function query(fn) {
    let signal;
    const q = {
      abortSignal: (value) => {
        signal = value;
        return q;
      },
      retry: () => q,
      then: (resolve, reject) =>
        new Promise((done, fail) => {
          if (signal?.aborted) {
            fail(signal.reason);
            return;
          }
          const abort = () => fail(signal.reason);
          signal?.addEventListener("abort", abort, { once: true });
          Promise.resolve()
            .then(fn)
            .then(done, fail)
            .finally(() => signal?.removeEventListener("abort", abort));
        }).then(resolve, reject),
    };
    return q;
  }
  const db = {
    from(table) {
      assert.ok(["photo_migration_runs", "photo_migration_items"].includes(table));
      let single = false;
      const filters = {};
      const q = query(() => {
        if (table === "photo_migration_items") {
          state.itemReads++;
          assert.equal(filters.run_id, id);
          assert.equal(
            filters.lease_token,
            state.calls.find((c) => c.name === "lease_photo_migration_item").args._lease,
          );
          return {
            data:
              state.itemOverride === undefined
                ? state.leasedItem
                : typeof state.itemOverride === "function"
                  ? state.itemOverride(state.leasedItem)
                  : state.itemOverride,
            error: state.itemReadErrors.has(state.itemReads)
              ? { message: "database unavailable" }
              : null,
          };
        }
        state.reads++;
        return state.readErrors.has(state.reads)
          ? { data: null, error: { message: "database unavailable" } }
          : {
              data: single
                ? state.readOverride === undefined
                  ? { ...row }
                  : state.readOverride
                : [{ ...row }],
              error: null,
            };
      });
      for (const name of ["select", "order", "limit"]) q[name] = () => q;
      q.eq = (key, value) => {
        filters[key] = value;
        return q;
      };
      q.maybeSingle = () => {
        single = true;
        return q;
      };
      return q;
    },
    rpc(name, args) {
      return query(() => {
        state.calls.push({ name, args });
        if (name === "prepare_photo_migration")
          return state.prepareDelay
            ? new Promise((resolve) =>
                setTimeout(() => resolve({ data: id, error: null }), state.prepareDelay),
              )
            : { data: id, error: null };
        if (name === "reserve_photo_migration_preview") {
          if (state.failPreviewReservation)
            return { data: null, error: { message: "budget reached" } };
          row.source_bytes_reserved += photos.content.length;
          return {
            data: { ordinal: 0, sourceBytes: photos.content.length, entries: inventory.objects },
            error: null,
          };
        }
        if (name === "lease_photo_migration_item") {
          if (state.leaseAck !== "uncommitted") {
            row.running_groups = 1;
            state.leasedItem = {
              run_id: id,
              ordinal: 0,
              status: "running",
              lease_token: args._lease,
              lease_until: "2099-01-01T00:00:00Z",
              source_bytes: photos.content.length,
              lease_source_reserved: false,
              entries: inventory.objects,
            };
          }
          if (state.leaseAck !== "ok")
            return { data: null, error: { message: "acknowledgement lost" } };
          return {
            data: {
              state: "leased",
              item: state.leasedItem,
            },
            error: null,
          };
        }
        if (name === "acknowledge_photo_migration_prepared_source") {
          if (state.preparedAck !== "uncommitted") state.leasedItem.lease_source_reserved = true;
          if (state.preparedAck !== "ok")
            return { data: null, error: { message: "acknowledgement lost" } };
        }
        if (name === "reserve_photo_migration_download") {
          assert.equal(photos.state.sourceDownloads, 0, "reservation must precede source GET");
          if (state.failReserve) return { data: null, error: { message: "budget reached" } };
          row.source_bytes_reserved += args._bytes;
        }
        if (name === "finish_photo_migration_item") {
          if (state.finishAck !== "uncommitted") {
            row.completed_groups++;
            row.running_groups = 0;
            row.confirmed_download_bytes += args._downloaded;
            state.leasedItem.status = "complete";
          }
          if (state.finishAck !== "ok")
            return { data: null, error: { message: "acknowledgement lost" } };
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
    previewSource: () => {
      if (state.revokeAfterLease) state.permit = "";
      return { sign: (...args) => photos.store.sign(...args) };
    },
  });
  return { runner, state, row, photos, inventory, plan, validPermit, photoMigrationPermit };
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

test("metadata preparation can acknowledge a slow commit beyond the copy-control deadline", async () => {
  const f = fixture();
  f.state.prepareDelay = 6000;
  const result = await f.runner.prepare(f.inventory);
  assert.equal(result.id, id);
  assert.equal(f.state.calls.length, 1);
  assert.equal(f.photos.state.sourceDownloads, 0);
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

test("one transient state-read failure retries only the SELECT and copies once", async () => {
  const f = fixture();
  f.state.permit = f.validPermit();
  f.state.readErrors.add(1);
  const result = await f.runner.step(id);
  assert.equal(result.state, "copied");
  assert.equal(f.state.reads, 3);
  assert.equal(f.state.calls.filter((c) => c.name === "lease_photo_migration_item").length, 1);
  assert.equal(f.photos.state.sourceDownloads, 1);
});

test("two failed state reads stop before any lease, photo download or write", async () => {
  const f = fixture();
  f.state.permit = f.validPermit();
  f.state.readErrors = new Set([1, 2]);
  await assert.rejects(() => f.runner.step(id), /state could not be read/);
  assert.equal(f.state.reads, 2);
  assert.equal(f.state.calls.length, 0);
  assert.equal(f.photos.state.sourceDownloads, 0);
  assert.equal(f.photos.state.puts.length, 0);
});

test("missing or wrong-project reviews are not treated as transient read failures", async () => {
  for (const missing of [true, false]) {
    const f = fixture();
    f.state.permit = f.validPermit();
    f.state.readOverride = missing ? null : { ...f.row, project_ref: "wrong" };
    await assert.rejects(() => f.runner.step(id), /source project/);
    assert.equal(f.state.reads, 1);
    assert.equal(f.state.calls.length, 0);
    assert.equal(f.photos.state.sourceDownloads, 0);
  }
});

test("status-read failure after acknowledged completion never marks the copied pair failed", async () => {
  const f = fixture();
  f.state.permit = f.validPermit();
  f.state.readErrors = new Set([2, 3]);
  await assert.rejects(() => f.runner.step(id), /state could not be read/);
  assert.equal(f.row.completed_groups, 1);
  assert.equal(f.row.failed_groups, 0);
  assert.equal(
    f.state.calls.some((c) => c.name === "fail_photo_migration_item"),
    false,
  );
  assert.equal(f.photos.state.sourceDownloads, 1);
});

test("lost finish acknowledgement observes the exact committed lease without replaying completion", async () => {
  for (const outcome of ["committed", "uncommitted"]) {
    const f = fixture();
    f.state.permit = f.validPermit();
    f.state.finishAck = outcome;
    if (outcome === "committed") assert.equal((await f.runner.step(id)).state, "copied");
    else await assert.rejects(() => f.runner.step(id), /completion was not confirmed/);
    assert.equal(
      f.state.calls.some((c) => c.name === "fail_photo_migration_item"),
      false,
    );
    assert.equal(f.row.completed_groups, outcome === "committed" ? 1 : 0);
    assert.equal(f.row.running_groups, outcome === "committed" ? 0 : 1);
    assert.equal(f.photos.state.sourceDownloads, 1);
    assert.equal(f.state.itemReads, 1);
    assert.equal(f.state.calls.filter((c) => c.name === "finish_photo_migration_item").length, 1);
  }
});

test("lost lease acknowledgement observes its saved token and copies once without a second lease RPC", async () => {
  const f = fixture();
  f.state.permit = f.validPermit();
  f.state.leaseAck = "committed";
  f.state.itemReadErrors.add(1);
  assert.equal((await f.runner.step(id)).state, "copied");
  assert.equal(f.state.itemReads, 2);
  assert.equal(f.state.calls.filter((c) => c.name === "lease_photo_migration_item").length, 1);
  assert.equal(f.photos.state.sourceDownloads, 1);
  assert.equal(f.row.completed_groups, 1);
});

test("unconfirmed, mismatched, expired or out-of-range leases stop before all photo operations", async () => {
  for (const change of [
    null,
    { run_id: "wrong" },
    { lease_token: "wrong" },
    { status: "failed" },
    { lease_until: "2000-01-01T00:00:00Z" },
    { lease_until: null },
    { lease_until: "invalid" },
    { ordinal: 1 },
    { ordinal: -1 },
  ]) {
    const f = fixture();
    f.state.permit = f.validPermit();
    f.state.leaseAck = "committed";
    f.state.itemOverride = (item) => (change === null ? null : { ...item, ...change });
    await assert.rejects(() => f.runner.step(id), /lease was not confirmed/);
    assert.equal(f.state.calls.length, 1);
    assert.equal(f.photos.state.sourceDownloads, 0);
    assert.equal(f.photos.state.receiptReads, 0);
    assert.equal(f.photos.state.puts.length, 0);
  }
});

test("a lease that was never saved or cannot be observed is not replayed", async () => {
  for (const outcome of ["uncommitted", "unreadable"]) {
    const f = fixture();
    f.state.permit = f.validPermit();
    f.state.leaseAck = outcome === "uncommitted" ? outcome : "committed";
    if (outcome === "unreadable") f.state.itemReadErrors = new Set([1, 2]);
    await assert.rejects(
      () => f.runner.step(id),
      /lease was not confirmed|lease could not be read/,
    );
    assert.equal(f.state.calls.length, 1);
    assert.equal(f.photos.state.sourceDownloads, 0);
    assert.equal(f.photos.state.puts.length, 0);
  }
});

test("a permit revoked during lease confirmation stops before photo operations", async () => {
  const f = fixture();
  f.state.permit = f.validPermit();
  f.state.leaseAck = "committed";
  f.state.itemOverride = (item) => {
    f.state.permit = "";
    return item;
  };
  await assert.rejects(() => f.runner.step(id), /lease was not confirmed/);
  assert.equal(f.photos.state.sourceDownloads, 0);
  assert.equal(f.photos.state.puts.length, 0);
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
  for (const name of [
    "getPhotoMigrations",
    "preparePhotoMigration",
    "stepPhotoMigration",
    "preparePhotoMigrationPreview",
  ]) {
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

test("preview preparation reserves before issuing a short-lived source URL without copying or retrying", async () => {
  const f = fixture();
  f.state.permit = f.validPermit();
  const originalSign = f.photos.store.sign;
  f.photos.store.sign = async (...args) => {
    assert.equal(f.row.source_bytes_reserved, f.photos.content.length);
    assert.ok(args[2] > 0 && args[2] <= 60);
    assert.equal(args[3], false);
    return originalSign(...args);
  };
  const preview = await f.runner.preparePreview(id);
  assert.equal(preview.ordinal, 0);
  assert.equal(preview.bytes, f.photos.content.length);
  assert.equal(preview.sourceEtag, f.photos.metadata.etag);
  assert.equal(f.photos.state.sourceDownloads, 0);
  assert.equal(f.photos.state.puts.length, 0);
  assert.equal(f.state.calls.length, 1);
  assert.equal(f.state.calls[0].name, "reserve_photo_migration_preview");
});

test("missing approval, revoked approval or failed preview reservation never issues a source URL", async () => {
  for (const reason of ["missing", "reservation", "revoked"]) {
    const f = fixture();
    if (reason !== "missing") f.state.permit = f.validPermit();
    if (reason === "reservation") f.state.failPreviewReservation = true;
    if (reason === "revoked") f.state.revokeAfterLease = true;
    await assert.rejects(() => f.runner.preparePreview(id));
    assert.equal(f.photos.state.sourceSigns.length, 0);
    assert.equal(f.photos.state.sourceDownloads, 0);
  }
});

const smallPreview = (sourceEtag, ordinal = 0) => ({
  ordinal,
  sourceEtag,
  contentType: "image/png",
  base64:
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEElEQVR4AQEFAPr/AACVz/8EYQJkPACksAAAAABJRU5ErkJggg==",
});
test("explicit prepared-preview retry revalidates its small image and retains original copy verification", async () => {
  const f = fixture();
  f.state.permit = f.validPermit();
  const migrate = f.photos.store.migrate;
  f.photos.store.migrate = async (...args) => {
    assert.ok(args[2].bytes.length > 0);
    assert.equal(args[2].width, 1);
    assert.equal(args[2].height, 1);
    return migrate(...args);
  };
  const r = await f.runner.step(id, true, smallPreview(f.photos.metadata.etag));
  assert.equal(r.state, "copied");
  assert.equal(f.photos.state.sourceDownloads, 1);
  assert.equal(f.photos.state.records.size, 2);
});
test("prepared previews cannot widen a normal batch or apply to a different failed source", async () => {
  const f = fixture();
  f.state.permit = f.validPermit();
  await assert.rejects(
    () => f.runner.step(id, false, smallPreview(f.photos.metadata.etag)),
    /explicit retry/,
  );
  assert.equal(f.state.calls.length, 0);
  for (const p of [smallPreview(f.photos.metadata.etag, 5), smallPreview("b".repeat(32))]) {
    const g = fixture();
    g.state.permit = g.validPermit();
    assert.equal((await g.runner.step(id, true, p)).state, "stopped");
    assert.equal(g.photos.state.sourceDownloads, 0);
    assert.equal(g.photos.state.puts.length, 0);
  }
  const g = fixture();
  g.state.permit = g.validPermit();
  await assert.rejects(
    () =>
      g.runner.step(id, true, {
        ...smallPreview(g.photos.metadata.etag),
        base64: Buffer.alloc(524289).toString("base64"),
      }),
    /size limit/,
  );
  assert.equal(g.state.calls.length, 0);
});

test("prepared source reuses its charged body with one acknowledgement and no second GET or reservation", async () => {
  for (const ack of ["ok", "committed", "uncommitted"]) {
    const f = fixture();
    f.state.permit = f.validPermit();
    await f.runner.preparePreview(id);
    const charged = f.row.source_bytes_reserved;
    f.state.preparedAck = ack;
    const result = await f.runner.step(id, true, {
      ...smallPreview(f.photos.metadata.etag),
      sourceBase64: Buffer.from(f.photos.content).toString("base64"),
    });
    assert.equal(result.state, ack === "uncommitted" ? "stopped" : "copied");
    assert.equal(f.photos.state.sourceDownloads, 0);
    assert.equal(f.row.source_bytes_reserved, charged);
    assert.equal(
      f.state.calls.filter((c) => c.name === "acknowledge_photo_migration_prepared_source").length,
      1,
    );
    assert.equal(
      f.state.calls.filter((c) => c.name === "reserve_photo_migration_download").length,
      0,
    );
    if (ack !== "uncommitted") assert.equal(f.photos.state.records.size, 2);
    else assert.equal(f.photos.state.puts.length, 0);
  }
});

test("lost prepared-source acknowledgement requires the exact live reserved lease", async () => {
  for (const change of [
    { ordinal: 9 },
    { lease_source_reserved: false },
    { status: "complete" },
    { lease_token: "other" },
    { lease_until: "2020-01-01T00:00:00Z" },
    { lease_until: null },
    { source_bytes: 1 },
  ]) {
    const f = fixture();
    f.state.permit = f.validPermit();
    f.state.preparedAck = "committed";
    f.state.itemOverride = (item) => ({ ...item, ...change });
    const result = await f.runner.step(id, true, {
      ...smallPreview(f.photos.metadata.etag),
      sourceBase64: Buffer.from(f.photos.content).toString("base64"),
    });
    assert.equal(result.state, "stopped");
    assert.equal(f.photos.state.puts.length, 0);
    assert.equal(f.photos.state.sourceDownloads, 0);
  }
});

test("prepared source limits and length mismatches never fetch a replacement original", async () => {
  const f = fixture();
  f.state.permit = f.validPermit();
  await assert.rejects(
    () =>
      f.runner.step(id, true, {
        ...smallPreview(f.photos.metadata.etag),
        sourceBase64: Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64"),
      }),
    /size limit/,
  );
  assert.equal(f.state.calls.length, 0);
  const result = await f.runner.step(id, true, {
    ...smallPreview(f.photos.metadata.etag),
    sourceBase64: "AQID",
  });
  assert.equal(result.state, "stopped");
  assert.equal(f.photos.state.sourceDownloads, 0);
  assert.equal(f.photos.state.puts.length, 0);
});

test("verified targets finish with zero bytes and never acknowledge a prepared source twice", async () => {
  const f = fixture();
  const entries = f.inventory.objects.map(({ bucket, path, ...expected }) => ({
    bucket,
    path,
    expected,
  }));
  await f.photos.store.migrate(entries, f.photos.content.length);
  f.photos.state.sourceDownloads = 0;
  f.state.permit = f.validPermit();
  const result = await f.runner.step(id, true, {
    ...smallPreview(f.photos.metadata.etag),
    sourceBase64: Buffer.from(f.photos.content).toString("base64"),
  });
  assert.equal(result.state, "copied");
  assert.equal(
    f.state.calls.some(
      (c) =>
        c.name === "acknowledge_photo_migration_prepared_source" ||
        c.name === "reserve_photo_migration_download",
    ),
    false,
  );
  assert.equal(
    f.state.calls.find((c) => c.name === "finish_photo_migration_item").args._downloaded,
    0,
  );
  assert.equal(f.photos.state.sourceDownloads, 0);
});
