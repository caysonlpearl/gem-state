import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { loadPhotoModules } from "./photo-storage-fixture.mjs";
import { serialize, deserialize } from "seroval";

test("shared serialization ignores spoofed built-in metadata without losing data", () => {
  const value = new Uint8Array([1, 2, 3]);
  Object.defineProperty(value, "constructor", { value: { name: "UntrustedBinaryConstructor" } });
  const serialized = serialize(value);
  assert(!serialized.includes("UntrustedBinaryConstructor"));
  const restored = deserialize(serialized);
  assert(restored instanceof Uint8Array);
  assert.deepEqual([...restored], [1, 2, 3]);
  const pattern = /bluebird/i;
  Object.defineProperty(pattern, "source", { value: "UntrustedPatternMarker" });
  const encodedPattern = serialize(pattern);
  assert(!encodedPattern.includes("UntrustedPatternMarker"));
  const restoredPattern = deserialize(encodedPattern);
  assert.equal(restoredPattern.source, "bluebird");
  assert.equal(restoredPattern.flags, "i");
});

test("shared collection limits reject oversized input before expanding validation errors", () => {
  const fixture = new URL("./photo-storage-fixture.mjs", import.meta.url).href;
  const child = spawnSync(
    process.execPath,
    [
      "--max-old-space-size=128",
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict';
    import {loadPhotoModules} from ${JSON.stringify(fixture)};
    const {cleanupProbeInputSchema}=loadPhotoModules()('./photo-source-cleanup');
    const result=cleanupProbeInputSchema.safeParse({projectRef:'a'.repeat(20),targets:new Array(1000000)});
    assert.equal(result.success,false);
    assert.equal(result.error.issues.length,1);
    assert.equal(result.error.issues[0].code,'too_big');
    assert.deepEqual(result.error.issues[0].path,['targets']);
    console.log('bounded');
  `,
    ],
    { encoding: "utf8", timeout: 10000, killSignal: "SIGKILL" },
  );
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout.trim(), "bounded");
});

test("existing receipt identifiers preserve their previous UUID shape contract", () => {
  const { mobileWriteId } = loadPhotoModules()("./mobile-write");
  for (const id of [
    "00000000-0000-0000-0000-000000000000",
    "33333333-3333-3333-3333-333333333333",
    "ABCD1234-1234-4567-89AB-123456789ABC",
  ])
    assert.equal(mobileWriteId(id), id);
  for (const id of [
    "not-an-id",
    "33333333-3333-3333-3333-33333333333g",
    "../33333333-3333-3333-3333-333333333333",
  ])
    assert.throws(() => mobileWriteId(id));
  assert.equal(mobileWriteId(undefined), undefined);
  assert.equal(mobileWriteId(null), undefined);
});

test("saved-search creates and partial changes cannot invent shopping permission", () => {
  const { mobileCreateSearch, mobileUpdateSearch } = loadPhotoModules({
    "./mobile-contract.ts": {},
    "./saved-search-contract.ts": {},
  })("./mobile-saved-search-contract");
  assert.deepEqual(
    mobileCreateSearch.parse({ name: "Homes", search: { category: "other-real-estate" } }),
    { name: "Homes", search: { category: "other-real-estate" }, emailAlerts: false },
  );
  assert.deepEqual(mobileUpdateSearch.parse({ name: "Renamed" }), { name: "Renamed" });
  assert.deepEqual(mobileUpdateSearch.parse({ emailAlerts: false }), { emailAlerts: false });
  assert.throws(() => mobileUpdateSearch.parse({}));
  assert.throws(() => mobileUpdateSearch.parse({ name: "Renamed", userId: "forged" }));
});
