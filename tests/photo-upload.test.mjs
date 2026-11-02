import test from "node:test";
import assert from "node:assert/strict";
import { loadPhotoModules } from "./photo-storage-fixture.mjs";

const { createPhotoUploader } = loadPhotoModules()("./photo-upload");
function fixture(mode = "r2") {
  const calls = {
    source: [],
    put: [],
    begin: 0,
    finish: 0,
    thumbnail: 0,
    digest: 0,
    warnings: [],
    failPut: false,
    failFinish: false,
    failPrepare: false,
  };
  const file = new File(["photo"], "photo.jpg", { type: "image/jpeg" });
  const thumb = new Blob(["small"], { type: "image/webp" });
  const ticket = {
    id: "ticket",
    path: "owner/server.jpg",
    mode,
    uploads: [
      { bucket: "ask-evidence", kind: "original", url: "private-evidence", headers: {} },
      { bucket: "listing-media", kind: "original", url: "private-listing", headers: {} },
      { bucket: "listing-media", kind: "thumbnail", url: "private-thumbnail", headers: {} },
    ],
  };
  const uploader = createPhotoUploader({
    mode: async () => mode,
    uuid: () => "client",
    source: async (bucket, path, file) => {
      calls.source.push({ bucket, path, file });
    },
    thumbnail: async () => {
      calls.thumbnail++;
      if (calls.failPrepare) throw new Error("preview unavailable");
      return thumb;
    },
    digest: async () => {
      calls.digest++;
      return "a".repeat(64);
    },
    begin: async () => {
      calls.begin++;
      return ticket;
    },
    put: async (url, headers, body) => {
      if (calls.failPut) throw new Error("network");
      calls.put.push({ url, body });
    },
    finish: async () => {
      calls.finish++;
      if (calls.failFinish) throw new Error("checksum");
      return { path: ticket.path };
    },
    warn: (message) => calls.warnings.push(message),
  });
  return { uploader, calls, file, thumb, ticket };
}

test("ordinary create/edit uploads preserve the Supabase path without R2 work while disabled", async () => {
  const f = fixture("supabase");
  assert.equal(await f.uploader(f.file, "owner"), "owner/client.jpg");
  assert.equal(f.calls.source.length, 2);
  await f.uploader(f.file, "owner", false);
  assert.equal(f.calls.source.length, 3);
  assert.equal(f.calls.source[2].bucket, "listing-media");
  assert.equal(f.calls.begin, 0);
  assert.equal(f.calls.thumbnail, 0);
  assert.equal(f.calls.digest, 0);
});

test("R2 upload uses separate original/evidence/thumbnail slots and returns only after verification", async () => {
  const f = fixture();
  assert.equal(await f.uploader(f.file, "owner"), f.ticket.path);
  assert.equal(f.calls.source.length, 0);
  assert.equal(f.calls.put.length, 3);
  assert.equal(f.calls.finish, 1);
  assert.equal(f.calls.put[0].body, f.file);
  assert.equal(f.calls.put[1].body, f.file);
  assert.equal(f.calls.put[2].body, f.thumb);
});

test("R2 errors prevent a listing from receiving an unverified photo path", async () => {
  for (const fail of ["failPut", "failFinish"]) {
    const f = fixture();
    f.calls[fail] = true;
    await assert.rejects(() => f.uploader(f.file, "owner"), /could not be verified/);
    assert.equal(f.calls.source.length, 0);
  }
});

test("mirror errors preserve completed source uploads and readable legacy paths", async () => {
  const f = fixture("mirror");
  f.calls.failPut = true;
  assert.equal(await f.uploader(f.file, "owner"), f.ticket.path);
  assert.equal(f.calls.source.length, 2);
  assert.equal(f.calls.finish, 0);
  assert.equal(f.calls.warnings.length, 1);
});

test("an account change rejects a different owner's upload destination", async () => {
  const f = fixture();
  f.ticket.path = "other-owner/photo.jpg";
  await assert.rejects(() => f.uploader(f.file, "owner"), /account changed/);
  assert.equal(f.calls.put.length, 0);
  assert.equal(f.calls.source.length, 0);
});

test("mirror preparation failure retains the original native upload workflow", async () => {
  const f = fixture("mirror");
  f.calls.failPrepare = true;
  assert.equal(await f.uploader(f.file, "owner"), "owner/client.jpg");
  assert.equal(f.calls.source.length, 2);
  assert.equal(f.calls.begin, 0);
  assert.equal(f.calls.put.length, 0);
});

test("R2 reads keep new source copies by default and require an explicit R2-only write switch", () => {
  const env = {};
  const { currentPhotoUploadMode } = loadPhotoModules({
    "./runtime-env.server": { serverEnv: (name) => env[name] ?? "" },
  })("./photo-storage.server");
  assert.equal(currentPhotoUploadMode(), "supabase");
  env.BLUEBIRD_PHOTO_STORAGE_MODE = "r2";
  assert.equal(currentPhotoUploadMode(), "mirror");
  env.BLUEBIRD_PHOTO_UPLOAD_MODE = "r2";
  assert.equal(currentPhotoUploadMode(), "r2");
  env.BLUEBIRD_PHOTO_STORAGE_MODE = "supabase";
  assert.equal(currentPhotoUploadMode(), "supabase");
});

test("private upload RPCs require auth and admin diagnostics deny access before touching storage", async () => {
  const marker = { name: "auth" };
  function createServerFn() {
    const definition = {};
    const chain = {
      middleware(value) {
        definition.middleware = value;
        return chain;
      },
      validator(value) {
        definition.validator = value;
        return chain;
      },
      handler(value) {
        return { ...definition, handler: value };
      },
    };
    return chain;
  }
  const module = loadPhotoModules({
    "@tanstack/react-start": { createServerFn, createServerOnlyFn: (fn) => fn },
    "@/integrations/supabase/auth-middleware": { requireSupabaseAuth: marker },
    "@/integrations/supabase/client.server": new Proxy(
      {},
      {
        get() {
          throw new Error("storage must not be accessed");
        },
      },
    ),
  })("./photo-storage.functions");
  for (const name of [
    "getPhotoUploadMode",
    "beginPrivatePhotoUpload",
    "finishPrivatePhotoUpload",
    "checkPrivatePhotoStorage",
  ])
    assert.equal(module[name].middleware[0], marker);
  await assert.rejects(
    () =>
      module.checkPrivatePhotoStorage.handler({
        context: {
          userId: "not-admin",
          supabase: { rpc: async () => ({ data: false, error: null }) },
        },
      }),
    /Administrator/,
  );
  assert.throws(
    () => module.beginPrivatePhotoUpload.validator({ bytes: 100000000 }),
    /validation|too_big|Required/i,
  );
});
