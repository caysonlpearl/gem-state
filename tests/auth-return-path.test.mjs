import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import * as returnPaths from "../src/lib/auth-return-path.ts";

const listing = "/listings/11111111-1111-4111-8111-111111111111";

async function routeConfig(path, extra = {}) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const stubs = {
    "@tanstack/react-router": {
      createFileRoute: () => (config) => config,
      redirect: (options) => ({ redirect: options }),
    },
    "react/jsx-runtime": {},
    react: {},
    sonner: {},
    "@/config/brand": {},
    "@/integrations/supabase/client": {},
    "@/lib/auth-redirect": {},
    "@/lib/auth-return-path": returnPaths,
    ...extra,
  };
  const exports = {};
  new Function("require", "exports", code)((name) => {
    assert.ok(name in stubs, `Unmocked import ${name}`);
    return stubs[name];
  }, exports);
  return exports.Route;
}

test("only known internal routes and valid listing IDs survive the login redirect", () => {
  for (const path of [...returnPaths.AUTH_STATIC_REDIRECTS, listing, `${listing}/edit`]) {
    assert.equal(returnPaths.safeAuthReturnPath(path), path);
  }
  for (const value of [
    null,
    {},
    ["/selling"],
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/admin/not-real",
    `${listing}/delete`,
    `${listing}?next=https://evil.example`,
    `${listing}#fragment`,
    "/listings/------------------------------------",
    "/%2f%2fevil.example",
    "/selling\n",
  ]) {
    assert.equal(returnPaths.safeAuthReturnPath(value), "/account");
  }
});

test("the actual auth route preserves seller edit and admin return paths", async () => {
  const route = await routeConfig("src/routes/auth.tsx");
  for (const path of [
    `${listing}/edit`,
    "/admin/classifieds",
    "/admin/validation",
    "/create-listing",
    "/messages",
  ]) {
    assert.equal(route.validateSearch({ redirect: path }).redirect, path);
  }
  assert.equal(route.validateSearch({ redirect: "https://evil.example" }).redirect, undefined);
  assert.deepEqual(returnPaths.listingReturnTarget(`${listing}/edit`), {
    listingId: "11111111-1111-4111-8111-111111111111",
    edit: true,
  });
  assert.equal(returnPaths.listingReturnTarget(listing).edit, false);
  assert.equal(returnPaths.listingReturnTarget("/admin/classifieds"), null);
});

test("admin sign-in return does not weaken role checks or swallow service errors", async () => {
  let outcome = { isAdmin: true };
  const route = await routeConfig("src/routes/_authenticated/admin.tsx", {
    "@/lib/admin-access.functions": {
      getAdminAccess: async () => {
        if (outcome instanceof Error) throw outcome;
        return outcome;
      },
    },
  });
  const input = { location: { pathname: "/admin/classifieds" } };
  assert.deepEqual(await route.beforeLoad(input), { isAdmin: true });
  outcome = { isAdmin: false };
  await assert.rejects(route.beforeLoad(input), (error) => error.redirect?.to === "/account");
  outcome = new Error("Unauthorized: No authorization header provided");
  await assert.rejects(
    route.beforeLoad(input),
    (error) =>
      error.redirect?.to === "/auth" && error.redirect.search.redirect === "/admin/classifieds",
  );
  outcome = new Error("Database unavailable");
  await assert.rejects(route.beforeLoad(input), (error) => error === outcome);
});
