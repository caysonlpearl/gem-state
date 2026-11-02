import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const nodeRequire = createRequire(import.meta.url);
export function loadPhotoModules(overrides = {}) {
  const cache = new Map();
  function load(name) {
    if (overrides[name]) return overrides[name];
    if (name === "./photo-photon.server")
      return { photoProcessor: () => nodeRequire("@cf-wasm/photon") };
    if (cache.has(name)) return cache.get(name);
    if (!name.startsWith("./")) return nodeRequire(name);
    const exports = {};
    cache.set(name, exports);
    const source = readFileSync(new URL(`../src/lib/${name.slice(2)}.ts`, import.meta.url), "utf8");
    vm.runInNewContext(
      ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
      }).outputText,
      {
        exports,
        require: load,
        console,
        crypto,
        URL,
        Request,
        Response,
        Headers,
        ReadableStream,
        TextEncoder,
        TextDecoder,
        AbortSignal,
        Uint8Array,
        ArrayBuffer,
        Map,
        Set,
        Date,
        Promise,
        setTimeout,
        clearTimeout,
        fetch,
        process: { env: {} },
      },
    );
    return exports;
  }
  return load;
}

export function photoStorageFixture(mode = "r2") {
  const load = loadPhotoModules();
  const { createPhotoStorage } = load("./photo-storage-core.server");
  const { photoSha256, photoSourceMd5 } = load("./r2-photo-storage.server");
  const content = new TextEncoder().encode("original fixture bytes");
  const thumbnail = new TextEncoder().encode("thumb");
  const path = "seller/photo.jpg";
  const metadata = {
    bytes: content.length,
    contentType: "image/jpeg",
    etag: photoSourceMd5(content),
    updatedAt: "2026-11-01T00:00:00Z",
  };
  const state = {
    source: new Map([
      ...["listing-media", "ask-evidence"].map((bucket) => [`${bucket}/${path}`, content]),
    ]),
    records: new Map(),
    r2: new Map(),
    sourceSigns: [],
    sourceCopies: [],
    sourceDownloads: 0,
    sourceUploads: 0,
    receiptReads: 0,
    reservations: [],
    puts: [],
    checks: [],
    warnings: [],
    healthy: true,
    failVerify: false,
    failReserve: false,
    failReceipts: false,
    info: () => ({ ...metadata }),
  };
  const source = {
    async sign(bucket, paths, seconds, small) {
      state.sourceSigns.push({ bucket, paths, seconds, small });
      return new Map(paths.map((p) => [p, `source://${bucket}/${p}${small ? "?small" : ""}`]));
    },
    async upload(bucket, p, bytes) {
      state.sourceUploads++;
      state.source.set(`${bucket}/${p}`, bytes);
    },
    async copy(bucket, old, destination) {
      state.sourceCopies.push([bucket, old, destination]);
    },
    async info(bucket, p) {
      return state.info(bucket, p);
    },
    async download() {
      state.sourceDownloads++;
      return content;
    },
  };
  const receipts = {
    async read(bucket, paths) {
      state.receiptReads++;
      if (state.failReceipts) throw new Error("offline");
      return paths.map((p) => state.records.get(`${bucket}/${p}`)).filter(Boolean);
    },
    async record(record) {
      state.records.set(`${record.bucket}/${record.path}`, record);
    },
    async reserve(id, bytes) {
      if (state.failReserve) throw new Error("budget reached");
      state.reservations.push({ id, bytes });
    },
  };
  const r2 = {
    async available() {
      return state.healthy;
    },
    async sign(bucket, key) {
      return `private://${bucket}/${key}`;
    },
    async put(bucket, key, bytes) {
      state.puts.push([bucket, key]);
      state.r2.set(`${bucket}/${key}`, bytes);
    },
    async verify(bucket, key, size, hash) {
      state.checks.push([bucket, key]);
      const actual = state.r2.get(`${bucket}/${key}`);
      if (state.failVerify || !actual || actual.length !== size || photoSha256(actual) !== hash)
        throw new Error("checksum mismatch");
    },
  };
  const store = createPhotoStorage({
    mode,
    source,
    receipts,
    r2,
    now: () => 1793491200000,
    thumbnail: async () => ({
      bytes: thumbnail,
      contentType: "image/webp",
      width: 640,
      height: 400,
    }),
    warn: (message) => state.warnings.push(message),
  });
  return { store, state, path, content, thumbnail, metadata, load };
}
