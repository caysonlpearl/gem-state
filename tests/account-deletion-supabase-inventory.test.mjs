import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadPhotoModules } from "./photo-storage-fixture.mjs";

const { createAccountDeletionSupabaseInventory } = loadPhotoModules()(
  "./account-deletion-supabase-inventory.server",
);
const project = "udxxfuticbxwiehoepeg",
  url = `https://${project}.supabase.co`;
const serviceKey = [
  "e30",
  Buffer.from(JSON.stringify({ role: "service_role", ref: project })).toString("base64url"),
  "fixture-signature",
].join(".");
const config = { url, serviceKey };
const signal = () => AbortSignal.timeout(15000);
const unavailable = (error) =>
  error.code === "inventory_unavailable" &&
  error.message === "inventory_unavailable" &&
  error.cause === undefined;
const clean = (value) => JSON.parse(JSON.stringify(value));
function fixture({ respond, authorize } = {}) {
  const calls = [],
    checks = [];
  const provider = createAccountDeletionSupabaseInventory(
    config,
    async (target, s) => {
      assert(Object.isFrozen(target));
      s.throwIfAborted();
      checks.push(target);
      return authorize ? authorize(target, checks.length) : true;
    },
    async (request) => {
      assert.equal(request.url, `${url}/storage/v1/object/list-v2/listing-media`);
      assert.equal(request.method, "POST");
      assert.equal(request.redirect, "error");
      assert.equal(request.cache, "no-store");
      assert(request.signal instanceof AbortSignal);
      assert.equal(request.headers.get("authorization"), `Bearer ${serviceKey}`);
      const body = await request.json();
      calls.push(body);
      return respond
        ? respond(body, request)
        : Response.json({ objects: [], folders: [], hasNext: false });
    },
  );
  const target = {
    bucket: "listing-media",
    path: `${randomUUID()}/private photo.jpg`,
    storeFingerprint: provider.fingerprint("listing-media"),
  };
  return { provider, target, calls, checks };
}
const version = (key, extra = {}) => ({
  id: randomUUID(),
  name: key.split("/").at(-1),
  key,
  version: randomUUID(),
  metadata: { size: 100, private: "PRIVATE-METADATA" },
  is_versioned: true,
  is_delete_marker: false,
  archived_at: null,
  ...extra,
});

test("the actual SDK requests all versions/delete markers for exactly one authorized key and returns only metadata", async () => {
  let rows;
  const f = fixture({
    respond: () => Response.json({ objects: rows, folders: [], hasNext: false }),
  });
  rows = [
    version(f.target.path),
    version(f.target.path, { archived_at: "2026-11-13T20:00:00Z" }),
    version(f.target.path, { is_delete_marker: true, metadata: null }),
  ];
  assert.equal(f.calls.length, 0, "construction performs no request");
  const page = await f.provider.scan(f.target, signal(), null, 10);
  assert.deepEqual(f.calls, [
    {
      prefix: f.target.path,
      exactMatch: true,
      with_delimiter: false,
      limit: 10,
      noncurrentVersions: "include",
      deleteMarkers: "include",
      sortBy: { column: "name", order: "asc" },
    },
  ]);
  assert.equal(page.objects.length, 3);
  assert.equal(page.done, true);
  assert.equal(page.nextCursor, null);
  assert.equal(page.objects[1].archivedAt, "2026-11-13T20:00:00.000Z");
  assert.equal(page.objects[2].bytes, null);
  assert.equal(page.objects[2].deleteMarker, true);
  assert(!JSON.stringify(page).includes("PRIVATE"));
  assert(Object.isFrozen(page));
  assert(Object.isFrozen(page.objects));
  assert(page.objects.every(Object.isFrozen));
  assert.equal(f.checks.length, 2);
  assert.deepEqual(
    Object.keys(page.objects[0]).sort(),
    ["archivedAt", "bytes", "deleteMarker", "key", "objectId", "versionId", "versioned"].sort(),
  );
});

test("empty listings and paginated listings remain distinct and cursors are opaque", async () => {
  const token = "opaque+/=cursor";
  let count = 0;
  const f = fixture({
    respond: (body) => {
      count++;
      return Response.json({
        objects: [],
        folders: [],
        hasNext: count === 1,
        ...(count === 1 ? { nextCursor: token } : {}),
      });
    },
  });
  const first = await f.provider.scan(f.target, signal(), null, 2);
  assert.equal(first.done, false);
  assert.equal(first.nextCursor, token);
  assert.deepEqual(clean(await f.provider.scan(f.target, signal(), token, 2)), {
    objects: [],
    nextCursor: null,
    done: true,
  });
  assert.equal(f.calls[1].cursor, token);
});

test("configuration, target mutation and an unprivileged key cannot reroute an inventory request", async () => {
  for (const bad of [
    { url: "http://udxxfuticbxwiehoepeg.supabase.co", serviceKey },
    { url: "https://udxxfuticbxwiehoepeg.supabase.co.evil.example", serviceKey },
    { url: url + "/other", serviceKey },
    { url: url + "?secret=PRIVATE", serviceKey },
    {
      url,
      serviceKey: [
        "e30",
        Buffer.from(JSON.stringify({ role: "anon", ref: project })).toString("base64url"),
        "sig",
      ].join("."),
    },
    {
      url,
      serviceKey: [
        "e30",
        Buffer.from(JSON.stringify({ role: "service_role", ref: "other" })).toString("base64url"),
        "sig",
      ].join("."),
    },
  ])
    assert.throws(() => createAccountDeletionSupabaseInventory(bad, async () => true), unavailable);
  const f = fixture();
  await assert.rejects(
    f.provider.scan({ ...f.target, storeFingerprint: "wrong" }, signal()),
    unavailable,
  );
  await assert.rejects(f.provider.scan({ ...f.target, bucket: "unknown" }, signal()), unavailable);
  for (const limit of [0, 101, 1.5, NaN])
    await assert.rejects(f.provider.scan(f.target, signal(), null, limit), unavailable);
  for (const cursor of ["", "x\nprivate", "x".repeat(4097)])
    await assert.rejects(f.provider.scan(f.target, signal(), cursor), unavailable);
  assert.equal(f.calls.length, 0);
  const mutable = { ...config };
  const requests = [];
  const provider = createAccountDeletionSupabaseInventory(
    mutable,
    async () => true,
    async (request) => {
      requests.push(request);
      return Response.json({ objects: [], folders: [], hasNext: false });
    },
  );
  mutable.url = "https://foreign.example";
  mutable.serviceKey = "PRIVATE";
  await provider.scan(
    { ...f.target, storeFingerprint: provider.fingerprint("listing-media") },
    signal(),
  );
  assert.equal(requests[0].url, `${url}/storage/v1/object/list-v2/listing-media`);
});

test("malformed, out-of-scope, duplicated and oversized provider pages never become a completed scan", async () => {
  const variants = [
    (f) => ({ objects: [version("someone-else/private.jpg")], folders: [], hasNext: false }),
    (f) => ({
      objects: [version(f.target.path, { id: "not-an-id" })],
      folders: [],
      hasNext: false,
    }),
    (f) => ({
      objects: [version(f.target.path, { version: "https://PRIVATE" })],
      folders: [],
      hasNext: false,
    }),
    (f) => ({
      objects: [version(f.target.path, { metadata: { size: -1 } })],
      folders: [],
      hasNext: false,
    }),
    (f) => ({
      objects: [version(f.target.path, { archived_at: "not-a-date" })],
      folders: [],
      hasNext: false,
    }),
    (f) => ({
      objects: [version(f.target.path, { is_versioned: "yes" })],
      folders: [],
      hasNext: false,
    }),
    () => ({ objects: [], folders: [{ name: "unexpected" }], hasNext: false }),
    () => ({ objects: [], folders: [], hasNext: true }),
    () => ({ objects: [], folders: [], hasNext: false, nextCursor: "unexpected" }),
    (f) => {
      const row = version(f.target.path);
      return { objects: [row, row], folders: [], hasNext: false };
    },
    (f) => ({
      objects: [version(f.target.path), version(f.target.path)],
      folders: [],
      hasNext: false,
    }),
  ];
  for (const data of variants) {
    const f = fixture({ respond: () => Response.json(data(f)) });
    await assert.rejects(f.provider.scan(f.target, signal(), null, 1), unavailable);
  }
  const large = fixture({
    respond: () =>
      new Response(" ".repeat(1024 * 1024 + 1), {
        headers: { "content-type": "application/json" },
      }),
  });
  await assert.rejects(large.provider.scan(large.target, signal()), unavailable);
  const repeat = fixture({
    respond: () => Response.json({ objects: [], folders: [], hasNext: true, nextCursor: "same" }),
  });
  await assert.rejects(repeat.provider.scan(repeat.target, signal(), "same"), unavailable);
});

test("unknown legacy metadata is retained as unknown rather than silently claiming erasure", async () => {
  let row;
  const f = fixture({
    respond: () => Response.json({ objects: [row], folders: [], hasNext: false }),
  });
  row = { id: randomUUID(), name: f.target.path, metadata: null };
  const result = await f.provider.scan(f.target, signal());
  assert.deepEqual(clean(result.objects[0]), {
    objectId: row.id,
    key: f.target.path,
    versionId: null,
    bytes: null,
    archivedAt: null,
    deleteMarker: null,
    versioned: null,
  });
  assert.equal("erased" in result, false);
  assert.equal("authorized" in result, false);
});

test("authoritative literal object keys are passed unchanged in the JSON body", async () => {
  let row;
  const f = fixture({
    respond: () => Response.json({ objects: [row], folders: [], hasNext: false }),
  });
  f.target.path = "literal/../percent%20?query#fragment\\name.jpg";
  row = version(f.target.path);
  const result = await f.provider.scan(f.target, signal());
  assert.equal(f.calls[0].prefix, f.target.path);
  assert.equal(result.objects[0].key, f.target.path);
  await assert.rejects(
    f.provider.scan({ ...f.target, path: "bad\u0000key" }, signal()),
    unavailable,
  );
});

test("cancellation settles an unfinished metadata response body", async () => {
  const controller = new AbortController();
  let canceled = false;
  const f = fixture({
    respond: () =>
      new Response(
        new ReadableStream({
          start(stream) {
            stream.enqueue(new TextEncoder().encode("{"));
            setTimeout(() => controller.abort(), 1);
          },
          cancel() {
            canceled = true;
          },
        }),
        { headers: { "content-type": "application/json" } },
      ),
  });
  await assert.rejects(f.provider.scan(f.target, controller.signal), unavailable);
  assert.equal(canceled, true);
});

test("permission loss, provider errors and cancellation are coded without private data or retries", async () => {
  const denied = fixture({ authorize: async () => false });
  await assert.rejects(denied.provider.scan(denied.target, signal()), unavailable);
  assert.equal(denied.calls.length, 0);
  const revoked = fixture({ authorize: async (_, count) => count === 1 });
  await assert.rejects(revoked.provider.scan(revoked.target, signal()), unavailable);
  assert.equal(revoked.calls.length, 1);
  for (const respond of [
    () => {
      throw Error("PRIVATE?token=PRIVATE");
    },
    () => new Response("PRIVATE", { status: 403 }),
    () => new Response("invalid", { headers: { "content-type": "application/json" } }),
  ]) {
    const f = fixture({ respond });
    await assert.rejects(f.provider.scan(f.target, signal()), unavailable);
    assert.equal(f.calls.length, 1);
  }
  const stopped = fixture();
  await assert.rejects(stopped.provider.scan(stopped.target, AbortSignal.abort()), unavailable);
  assert.equal(stopped.calls.length, 0);
});
