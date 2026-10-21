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

test("login return retains only bounded account and duplicate-listing intent", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal(
    returnPaths.safeAuthReturnPath(`/create-listing?duplicateFrom=${id}`),
    `/create-listing?duplicateFrom=${id}`,
  );
  assert.equal(
    returnPaths.safeAuthReturnPath(`/account?section=messages&conversation=${id}`),
    `/account?conversation=${id}&section=messages`,
  );
  assert.equal(
    returnPaths.safeAuthReturnPath(`/account?conversation=${id}`),
    `/account?conversation=${id}&section=messages`,
  );
  assert.equal(returnPaths.safeAuthReturnPath("/account?section=saved"), "/account?section=saved");
  assert.deepEqual(returnPaths.authReturnSearch(`/create-listing?duplicateFrom=${id}`), {
    section: null,
    conversation: undefined,
    duplicateFrom: id,
  });
  for (const path of [
    "/account?section=admin",
    "/account?section=messages&section=saved",
    "/account?conversation=https://evil.example",
    "/account?next=//evil.example",
    "/create-listing?duplicateFrom=not-a-uuid",
    `/create-listing?duplicateFrom=${id}&next=/admin`,
    `/account?conversation=${id}#token`,
    `/account?conversation=${id}?next=/admin`,
    "/account?section=%0amessages",
    "/account?section=messages\\evil",
  ])
    assert.equal(returnPaths.safeAuthReturnPath(path), "/account", path);
});

test("the authenticated gate captures query intent before sending users to login", async () => {
  let navigated;
  const route = await routeConfig("src/routes/_authenticated/route.tsx", {
    "@tanstack/react-router": {
      createFileRoute: () => (config) => config,
      useNavigate: () => (options) => {
        navigated = options;
      },
      useRouterState: ({ select }) =>
        select({
          location: {
            pathname: "/account",
            searchStr: "?section=messages&conversation=11111111-1111-4111-8111-111111111111",
          },
        }),
    },
    "@/hooks/useAuth": { useAuth: () => ({ isSignedIn: false, loading: false }) },
    react: { useState: (initial) => [initial, () => {}], useEffect: (effect) => effect() },
    "react/jsx-runtime": { jsx: () => null, jsxs: () => null },
  });
  route.component();
  assert.equal(navigated.to, "/auth");
  assert.equal(
    navigated.search.redirect,
    "/account?conversation=11111111-1111-4111-8111-111111111111&section=messages",
  );
});

test("signed-in auth page navigates with typed conversation and duplicate search values", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  for (const [redirect, expected] of [
    [
      `/account?conversation=${id}&section=messages`,
      { to: "/account", search: { section: "messages", conversation: id } },
    ],
    [
      `/create-listing?duplicateFrom=${id}`,
      { to: "/create-listing", search: { duplicateFrom: id } },
    ],
  ]) {
    let navigated;
    const route = await routeConfig("src/routes/auth.tsx", {
      "@tanstack/react-router": {
        createFileRoute: () => (config) => ({ ...config, useSearch: () => ({ redirect }) }),
        useNavigate: () => (options) => {
          navigated = options;
        },
      },
      "@/config/brand": { brand: { name: "Bluebird" } },
      "@/integrations/supabase/client": {
        supabase: {
          auth: {
            getSession: async () => ({ data: { session: {} } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          },
        },
      },
      react: { useState: (initial) => [initial, () => {}], useEffect: (effect) => effect() },
      "react/jsx-runtime": { jsx: () => null, jsxs: () => null },
    });
    route.component();
    await Promise.resolve();
    assert.deepEqual(navigated, expected);
  }
});
