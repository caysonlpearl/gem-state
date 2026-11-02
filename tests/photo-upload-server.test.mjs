import test from "node:test";
import assert from "node:assert/strict";
import { loadPhotoModules } from "./photo-storage-fixture.mjs";

function fixture() {
  const state = {
    leases: [],
    records: [],
    writes: [],
    checks: [],
    failVerify: false,
    ticket: null,
  };
  const db = {
    rpc(name, args) {
      assert.equal(name, "lease_private_photo_upload");
      state.leases.push(args);
      return query(() => ({ data: args._user === "owner" ? state.ticket : null, error: null }));
    },
    from(table) {
      assert.equal(table, "photo_upload_tickets");
      const write = { filters: [] };
      const q = query(() => {
        state.writes.push(write);
        return { error: null };
      });
      q.update = (value) => {
        write.value = value;
        return q;
      };
      q.eq = (name, value) => {
        write.filters.push([name, value]);
        return q;
      };
      return q;
    },
  };
  function query(result) {
    const q = {
      abortSignal: () => q,
      retry: () => q,
      then: (resolve) => Promise.resolve(result()).then(resolve),
    };
    return q;
  }
  const { completePrivatePhotoUpload } = loadPhotoModules({
    "./photo-storage.server": {
      createSupabasePhotoReceipts: () => ({
        record: async (receipt) => state.records.push(receipt),
      }),
      createSupabasePhotoSource: () => ({
        info: async () => {
          throw new Error("R2-only upload must not access source");
        },
      }),
    },
  })("./photo-upload.server");
  const small = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEElEQVR4AQEFAPr/AACVz/8EYQJkPACksAAAAABJRU5ErkJggg==",
    "base64",
  );
  state.ticket = {
    path: "owner/new.jpg",
    mode: "r2",
    expires_at: new Date(Date.now() + 100000).toISOString(),
    verified_at: null,
    payload: {
      bytes: 100,
      sha256: "b".repeat(64),
      contentType: "image/jpeg",
      evidence: true,
      key: "original",
      thumbnailKey: "thumbnail",
      thumbnail: { bytes: small.length, sha256: "c".repeat(64), contentType: "image/png" },
    },
  };
  const r2 = {
    verify: async (...args) => {
      state.checks.push(args);
      if (state.failVerify) throw new Error("checksum mismatch");
      return args[4] ? small : null;
    },
  };
  return { state, finish: (user = "owner") => completePrivatePhotoUpload(db, r2, user, "ticket") };
}

test("server finalization verifies evidence, original and preview before committing either receipt", async () => {
  const f = fixture();
  assert.equal((await f.finish()).path, "owner/new.jpg");
  assert.deepEqual(
    f.state.checks.map((c) => [c[0], c[1]]),
    [
      ["ask-evidence", "original"],
      ["listing-media", "original"],
      ["listing-media", "thumbnail"],
    ],
  );
  assert.equal(f.state.records.length, 2);
  assert.equal(f.state.records[0].thumbnailKey, null);
  assert.equal(f.state.records[1].thumbnailKey, "thumbnail");
  assert.deepEqual(f.state.writes[0].filters, [
    ["id", "ticket"],
    ["user_id", "owner"],
  ]);
});
test("wrong owners and expired tickets consume no R2 operations and commit nothing", async () => {
  for (const owner of ["other", "owner"]) {
    const f = fixture();
    if (owner === "owner") f.state.ticket.expires_at = "2000-01-01T00:00:00Z";
    await assert.rejects(() => f.finish(owner), /expired/);
    assert.equal(f.state.records.length, 0);
    assert.equal(f.state.checks.length, 0);
  }
});
test("checksum failures leave no receipt or completion marker; completed retries perform no reads", async () => {
  const f = fixture();
  f.state.failVerify = true;
  await assert.rejects(() => f.finish(), /checksum/);
  assert.equal(f.state.records.length, 0);
  assert.equal(f.state.writes.length, 0);
  const g = fixture();
  g.state.ticket.verified_at = new Date().toISOString();
  assert.equal((await g.finish()).path, "owner/new.jpg");
  assert.equal(g.state.checks.length, 0);
  assert.equal(g.state.writes.length, 0);
});
