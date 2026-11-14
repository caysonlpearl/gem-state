import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadPhotoModules, photoStorageFixture } from "./photo-storage-fixture.mjs";
import { photoWriteIntentDatabase } from "./helpers/photo-write-intent-database.mjs";
import { r2FixtureConfig } from "./helpers/account-deletion-r2-database.mjs";
const load = loadPhotoModules();
const { createSupabasePhotoWritePlanner } = load("./photo-write-intents.server");
const { createPhotoStorage } = load("./photo-storage-core.server");
const { createSupabasePhotoReceipts } = load("./photo-storage.server");
const { createPrivatePhotoUpload } = load("./photo-upload.server");
const { createR2PhotoStore, photoSha256, photoObjectKey } = load("./r2-photo-storage.server");
const planningError = (e) =>
  e.message === "Photo write planning is unavailable. Retry your upload." && !e.cause;
async function setup({ rejectPlan = false, after } = {}) {
  const db = await photoWriteIntentDatabase(),
    user = randomUUID(),
    store = createR2PhotoStore(r2FixtureConfig()),
    calls = [];
  await db.query("insert into auth.users(id) values($1)", [user]);
  for (const bucket of ["listing-media", "ask-evidence"])
    await db.query("insert into account_deletion_r2_stores values($1,$2)", [
      bucket,
      store.fingerprint(bucket),
    ]);
  const bridge = {
    rpc(name, args) {
      assert(
        [
          "plan_private_photo_writes",
          "begin_private_photo_upload",
          "reserve_private_photo_bytes",
          "record_private_photo",
        ].includes(name),
      );
      const q = {
        abortSignal(signal) {
          signal.throwIfAborted();
          return q;
        },
        retry(value) {
          assert.equal(value, false);
          return q;
        },
        async then(resolve, reject) {
          try {
            calls.push({ name, args });
            if (rejectPlan && name === "plan_private_photo_writes")
              return resolve({ data: null, error: { message: "private@example.invalid" } });
            const values = Object.values(args).map((v) =>
              typeof v === "object" && v !== null ? JSON.stringify(v) : v,
            );
            const result = await db.query(
              `select public.${name}(${values.map((_, i) => "$" + (i + 1)).join(",")}) value`,
              values,
            );
            await after?.(name, args);
            return resolve({ data: result.rows[0].value, error: null });
          } catch (e) {
            return reject(e);
          }
        },
      };
      return q;
    },
  };
  return { db, user, store, bridge, calls };
}
test("server copies commit real SQL plans before physical PUTs and publish receipts only after verification", async () => {
  const f = await setup();
  try {
    const bytes = new TextEncoder().encode("synthetic original"),
      small = new TextEncoder().encode("synthetic thumbnail"),
      path = f.user + "/server.jpg",
      physical = new Map(),
      events = [];
    const r2 = {
      fingerprint: (bucket) => f.store.fingerprint(bucket),
      async put(bucket, key, body) {
        const row = (
          await f.db.query(
            "select * from private_photo_write_intents where bucket=$1 and path=$2 and sha256=$3",
            [bucket, path, photoSha256(body)],
          )
        ).rows[0];
        assert(row, "physical bytes need an existing durable plan");
        assert.equal(row.byte_size, body.length);
        assert.equal(row.store_fingerprint, f.store.fingerprint(bucket));
        events.push("put");
        physical.set(bucket + "/" + key, body.slice());
      },
      async verify(bucket, key, size, sha) {
        const actual = physical.get(bucket + "/" + key);
        assert.equal(actual.length, size);
        assert.equal(photoSha256(actual), sha);
        events.push("verify");
      },
    };
    const storage = createPhotoStorage({
      mode: "r2",
      source: {},
      receipts: createSupabasePhotoReceipts(f.bridge),
      r2,
      thumbnail: async () => ({ bytes: small, contentType: "image/webp", width: 1, height: 1 }),
    });
    await storage.upload(path, bytes, "image/jpeg", true);
    assert.equal(
      (await f.db.query("select count(*)::int n from private_photo_write_intents")).rows[0].n,
      3,
    );
    assert.equal(
      (await f.db.query("select count(*)::int n from photo_object_receipts")).rows[0].n,
      2,
    );
    assert.deepEqual(events, ["put", "verify", "put", "verify", "put", "verify"]);
    assert.deepEqual(
      f.calls.map((c) => c.name),
      [
        "reserve_private_photo_bytes",
        "plan_private_photo_writes",
        "record_private_photo",
        "reserve_private_photo_bytes",
        "plan_private_photo_writes",
        "record_private_photo",
      ],
    );
  } finally {
    await f.db.close();
  }
});
test("a failed plan sends no R2 bytes or verified receipts; mirror fallback preserves its retained source", async () => {
  const f = photoStorageFixture("r2");
  f.state.failPlan = true;
  await assert.rejects(f.store.upload(f.path, f.content, "image/jpeg", true), planningError);
  assert.equal(f.state.puts.length, 0);
  assert.equal(f.state.records.size, 0);
  const mirror = photoStorageFixture("mirror");
  mirror.state.failPlan = true;
  await mirror.store.upload(mirror.path, mirror.content, "image/jpeg", true);
  assert.equal(mirror.state.sourceUploads, 2);
  assert.equal(mirror.state.puts.length, 0);
  assert.equal(mirror.state.records.size, 0);
  assert.equal(mirror.state.warnings.length, 1);
});
test("native upload links require committed plans for all destinations and preserve the snapshotted ticket payload", async () => {
  const input = {
    extension: "jpg",
    bytes: 100,
    contentType: "image/jpeg",
    sha256: "a".repeat(64),
    evidence: true,
    thumbnail: { bytes: 10, sha256: "b".repeat(64), contentType: "image/webp" },
  };
  const f = await setup({
    after: async (name) => {
      if (name === "begin_private_photo_upload") {
        input.sha256 = "f".repeat(64);
        input.evidence = false;
        input.thumbnail.bytes = 99;
        input.thumbnail.sha256 = "e".repeat(64);
      }
    },
  });
  try {
    const signed = [];
    const r2 = {
      fingerprint: (b) => f.store.fingerprint(b),
      async signUpload(bucket, key, size, type, sha) {
        const rows = (
          await f.db.query(
            "select * from private_photo_write_intents where bucket=$1 and sha256=$2",
            [bucket, sha],
          )
        ).rows;
        assert.equal(rows.length, 1);
        assert.equal(rows[0].byte_size, size);
        assert.equal(key, photoObjectKey(rows[0].path, sha, key.startsWith("thumbnail/")));
        signed.push({ bucket, key, size, sha });
        return { url: "https://synthetic.invalid/upload", headers: {} };
      },
    };
    const ticket = await createPrivatePhotoUpload(f.bridge, r2, f.user, input, "r2");
    assert.equal(ticket.uploads.length, 3);
    assert.equal(signed.length, 3);
    assert.deepEqual(
      f.calls.map((c) => c.name),
      ["begin_private_photo_upload", "plan_private_photo_writes"],
    );
    assert.equal(signed[0].sha, "a".repeat(64));
    assert.equal(signed[2].sha, "b".repeat(64));
    assert.equal(signed[2].size, 10);
    assert.equal(
      (await f.db.query("select count(*)::int n from photo_object_receipts")).rows[0].n,
      0,
    );
  } finally {
    await f.db.close();
  }
});
test("an unavailable planner returns no native signed links, including when a ticket was already reserved", async () => {
  const f = await setup({ rejectPlan: true });
  try {
    let signs = 0;
    const input = {
      extension: "jpg",
      bytes: 100,
      contentType: "image/jpeg",
      sha256: "a".repeat(64),
      evidence: false,
      thumbnail: { bytes: 10, sha256: "b".repeat(64), contentType: "image/webp" },
    };
    await assert.rejects(
      createPrivatePhotoUpload(
        f.bridge,
        {
          fingerprint: (b) => f.store.fingerprint(b),
          signUpload: async () => {
            signs++;
          },
        },
        f.user,
        input,
        "r2",
      ),
      planningError,
    );
    assert.equal(signs, 0);
    assert.equal(
      (await f.db.query("select count(*)::int n from photo_upload_tickets")).rows[0].n,
      1,
    );
    assert.equal(
      (await f.db.query("select count(*)::int n from private_photo_write_intents")).rows[0].n,
      0,
    );
  } finally {
    await f.db.close();
  }
});
test("the planner snapshots an allowlisted payload, bounds writes and requires an explicit acknowledgement without retries", async () => {
  const intent = {
    bucket: "listing-media",
    path: "synthetic/photo.jpg",
    variant: "original",
    sha256: "a".repeat(64),
    bytes: 100,
    storeFingerprint: "b".repeat(64),
    private: "never forward",
  };
  let captured,
    retries = [];
  const planner = createSupabasePhotoWritePlanner({
    rpc(name, args) {
      assert.equal(name, "plan_private_photo_writes");
      captured = args;
      intent.path = "changed/photo.jpg";
      const q = {
        abortSignal: () => q,
        retry: (value) => {
          retries.push(value);
          return q;
        },
        then: (resolve) => Promise.resolve({ data: true, error: null }).then(resolve),
      };
      return q;
    },
  });
  await planner.plan([intent]);
  assert.equal(captured._intents[0].path, "synthetic/photo.jpg");
  assert.equal("private" in captured._intents[0], false);
  assert(Object.isFrozen(captured._intents[0]));
  assert.deepEqual(retries, [false]);
  for (const patch of [
    { bytes: 0 },
    { bytes: 52428801 },
    { storeFingerprint: "bad" },
    { variant: "thumbnail", bucket: "ask-evidence" },
  ]) {
    let calls = 0;
    const p = createSupabasePhotoWritePlanner({
      rpc: () => {
        calls++;
        throw Error();
      },
    });
    await assert.rejects(p.plan([{ ...intent, ...patch }]), planningError);
    assert.equal(calls, 0);
  }
  const p = createSupabasePhotoWritePlanner({
    rpc: () => {
      const q = {
        abortSignal: () => q,
        retry: () => q,
        then: (resolve) => Promise.resolve({ data: false, error: null }).then(resolve),
      };
      return q;
    },
  });
  await assert.rejects(p.plan([intent]), planningError);
});
test("a lost planning acknowledgement starts no PUT and resumes the same intent without duplicating its budget", async () => {
  let lost = false;
  const f = await setup({
    after: async (name) => {
      if (name === "plan_private_photo_writes" && !lost) {
        lost = true;
        throw Error("lost private response");
      }
    },
  });
  try {
    let puts = 0;
    const bytes = new TextEncoder().encode("original"),
      small = new TextEncoder().encode("small"),
      path = f.user + "/retry.jpg";
    const storage = createPhotoStorage({
      mode: "r2",
      source: {},
      receipts: createSupabasePhotoReceipts(f.bridge),
      r2: {
        fingerprint: (b) => f.store.fingerprint(b),
        put: async () => {
          puts++;
        },
        verify: async () => {},
      },
      thumbnail: async () => ({ bytes: small, contentType: "image/webp", width: 1, height: 1 }),
    });
    await assert.rejects(storage.upload(path, bytes, "image/jpeg", false), planningError);
    assert.equal(puts, 0);
    assert.equal(
      (await f.db.query("select count(*)::int n from private_photo_write_intents")).rows[0].n,
      2,
    );
    await storage.upload(path, bytes, "image/jpeg", false);
    assert.equal(puts, 2);
    assert.equal(
      (await f.db.query("select count(*)::int n from private_photo_write_intents")).rows[0].n,
      2,
    );
    assert.equal(
      (await f.db.query("select sum(byte_size)::int n from photo_storage_reservations")).rows[0].n,
      bytes.length + small.length,
    );
  } finally {
    await f.db.close();
  }
});
test("changing the caller's provider reference during planning cannot retarget the approved write", async () => {
  const destinations = [],
    bytes = new TextEncoder().encode("original"),
    small = new TextEncoder().encode("small");
  const original = {
    fingerprint: () => "a".repeat(64),
    put: async () => destinations.push("original"),
    verify: async () => {},
  };
  const changed = {
    fingerprint: () => "b".repeat(64),
    put: async () => destinations.push("changed"),
    verify: async () => {},
  };
  const deps = {
    mode: "r2",
    source: {},
    r2: original,
    thumbnail: async () => ({ bytes: small, contentType: "image/webp", width: 1, height: 1 }),
    receipts: {
      reserve: async () => {},
      plan: async () => {
        deps.r2 = changed;
      },
      record: async () => {},
    },
  };
  await createPhotoStorage(deps).upload("synthetic/member.jpg", bytes, "image/jpeg", false);
  assert.deepEqual(destinations, ["original", "original"]);
});
