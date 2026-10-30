import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { employerKey, logoImageUrl } from "../src/lib/employer-logo-match.ts";
import { withCatalogReadDeadline } from "../src/lib/catalog-read-deadline.ts";
import { homepageCard } from "../src/lib/homepage-snapshot-contract.ts";
const source = readFileSync(
  new URL("../src/lib/employer-logos.server.ts", import.meta.url),
  "utf8",
);
const ast = ts.createSourceFile("logos.ts", source, ts.ScriptTarget.Latest, true);
function loader(rows, { secret = "", fail = false } = {}) {
  let searches = 0,
    reads = 0;
  const fn = ast.statements.find(
    (n) => ts.isFunctionDeclaration(n) && n.name?.text === "withEmployerLogos",
  );
  const query = {
    select() {
      return this;
    },
    in() {
      return this;
    },
    abortSignal() {
      return this;
    },
    retry() {
      return this;
    },
    then(resolve, reject) {
      reads++;
      return fail
        ? Promise.reject(Error("database unavailable")).then(resolve, reject)
        : Promise.resolve({ data: rows }).then(resolve, reject);
    },
    upsert() {
      throw Error("cache-only must not write");
    },
  };
  const context = vm.createContext({
    serverEnv: (name) => (name === "LOGO_DEV_PUBLISHABLE_KEY" ? "pk_test" : secret),
    employerKey,
    logoImageUrl,
    withCatalogReadDeadline,
    RECHECK_MS: 30 * 24 * 3600000,
    MAX_LOOKUPS_PER_REQUEST: 12,
    memo: new Map(),
    supabaseAdmin: { from: () => query },
    searchDomain: async () => {
      searches++;
      return "unexpected.example";
    },
  });
  const compiled = ts.transpile(
    fn
      .getText(ast)
      .replace("export async", "async")
      .replace(
        /const \{ supabaseAdmin \} = await import\("@\/integrations\/supabase\/client.server"\);/,
        "",
      ),
    { target: ts.ScriptTarget.ES2022 },
  );
  vm.runInContext(compiled, context);
  return {
    run: (cards) => context.withEmployerLogos(cards, { cacheOnly: true }),
    get searches() {
      return searches;
    },
    get reads() {
      return reads;
    },
  };
}
const job = (name) => ({
  id: name,
  job: { employerName: name },
  externalJob: { source: "Adzuna", url: "https://adzuna.com/example" },
});
test("saved employer logos work without a secret search key and never run external searches", async () => {
  const logo = loader([
    { name_key: "home depot", domain: "homedepot.com", checked_at: new Date().toISOString() },
  ]);
  const cards = await logo.run([job("The Home Depot Inc."), job("Unknown employer")]);
  assert.equal(new URL(cards[0].externalJob.logoUrl).pathname, "/homedepot.com");
  assert.equal(cards[1].externalJob.logoUrl, undefined);
  assert.equal(logo.reads, 1);
  assert.equal(logo.searches, 0);
});
test("expired matches and transient logo read failures preserve the ordinary card fallback", async () => {
  const stale = loader(
    [{ name_key: "home depot", domain: "homedepot.com", checked_at: new Date(0).toISOString() }],
    { secret: "present" },
  );
  assert.equal((await stale.run([job("Home Depot")]))[0].externalJob.logoUrl, undefined);
  assert.equal(stale.searches, 0);
  const failed = loader([], { fail: true });
  assert.equal((await failed.run([job("Home Depot")]))[0].id, "Home Depot");
  assert.equal(failed.searches, 0);
});
test("public homepage projection retains job and service logos", () => {
  const projected = homepageCard({
    ...job("Home Depot"),
    directory: { logoUrl: "https://img.logo.dev/service.example" },
    externalJob: {
      source: "Adzuna",
      url: "https://adzuna.com/example",
      logoUrl: "https://img.logo.dev/homedepot.com",
    },
  });
  assert.equal(projected.externalJob.logoUrl, "https://img.logo.dev/homedepot.com");
  assert.equal(projected.directory.logoUrl, "https://img.logo.dev/service.example");
});
test("the shared homepage builder applies both existing logo decorators", () => {
  const builder = readFileSync(
    new URL("../src/lib/homepage-snapshot-build.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(builder, /withEmployerLogos\(cards,\s*\{ cacheOnly: true \}\)/);
  assert.match(builder, /directoryCard\(row, logoFor\(row\)\)/);
});
