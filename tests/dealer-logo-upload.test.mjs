import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { z } from "zod";
import * as jsx from "react/jsx-runtime";

function compile(path, require, extra = {}) {
  const exports = {};
  vm.runInNewContext(
    ts.transpile(readFileSync(new URL(path, import.meta.url), "utf8"), {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    }),
    { exports, require, ...extra },
  );
  return exports;
}
const upload = compile(
  "../src/lib/dealer-logo-upload.ts",
  () => {
    throw Error("unexpected dependency");
  },
  { crypto: { randomUUID: () => "unique-file" } },
);

test("dealer logo uploads use the signed-in owner folder and a MIME-derived filename", async () => {
  const calls = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "owner-id" } } }) },
    storage: {
      from(bucket) {
        assert.equal(bucket, "profile-avatars");
        return {
          upload: async (...args) => {
            calls.push(args);
            return {};
          },
          getPublicUrl: (path) => ({ data: { publicUrl: `https://images.example/${path}` } }),
        };
      },
    },
  };
  const file = { name: "untrusted-name.svg", type: "image/png", size: 42 };
  const result = await upload.uploadDealerLogo(file, client);
  assert.equal(calls[0][0], "owner-id/dealer-logo-unique-file.png");
  assert.equal(calls[0][1], file);
  assert.equal(calls[0][2].upsert, false);
  assert.equal(result, "https://images.example/owner-id/dealer-logo-unique-file.png");
});

test("invalid logos and expired sign-in never reach storage", async () => {
  let reads = 0,
    writes = 0;
  const client = {
    auth: {
      getUser: async () => {
        reads++;
        return { data: { user: null } };
      },
    },
    storage: {
      from: () => {
        writes++;
        throw Error("must not upload");
      },
    },
  };
  for (const file of [
    { type: "image/svg+xml", size: 2 },
    { type: "image/png", size: 0 },
    { type: "image/png", size: 5242881 },
  ])
    await assert.rejects(upload.uploadDealerLogo(file, client));
  assert.equal(reads, 0);
  await assert.rejects(
    upload.uploadDealerLogo({ type: "image/png", size: 20 }, client),
    /Sign in again/,
  );
  assert.equal(writes, 0);
});

test("failed uploads cannot produce a saved logo URL", async () => {
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) },
    storage: {
      from: () => ({
        upload: async () => ({ error: { message: "denied" } }),
        getPublicUrl: () => {
          throw Error("no URL after failure");
        },
      }),
    },
  };
  await assert.rejects(
    upload.uploadDealerLogo({ type: "image/webp", size: 20 }, client),
    /could not be uploaded/,
  );
});

test("profile save cannot race a pending logo upload", () => {
  let busy = false,
    saves = 0;
  const { DealerProfileForm } = compile(
    "../src/components/dealers/DealerProfileForm.tsx",
    (name) => {
      if (name === "react")
        return {
          useState: () => [
            busy,
            (value) => {
              busy = value;
            },
          ],
        };
      if (name === "react/jsx-runtime") return jsx;
      if (name === "./DealerLogoEditor") return { DealerLogoEditor: "DealerLogoEditor" };
      throw Error(name);
    },
  );
  const props = {
    draft: { acceptAgreements: true },
    set() {},
    onSave() {
      saves++;
    },
    lockSlug: true,
  };
  const first = DealerProfileForm(props);
  const logo = first.props.children.find((node) => node?.type === "DealerLogoEditor");
  logo.props.onBusyChange(true);
  DealerProfileForm(props).props.onSubmit({ preventDefault() {} });
  assert.equal(saves, 0);
  logo.props.onBusyChange(false);
  DealerProfileForm(props).props.onSubmit({ preventDefault() {} });
  assert.equal(saves, 1);
});

test("profile edits preserve existing agreement evidence, page address, and suspended status", async () => {
  let payload;
  const existing = {
    id: "dealer",
    slug: "existing-page",
    status: "suspended",
    agreements_accepted_at: "2026-10-01T00:00:00Z",
    agreements_version: "dealer-original",
  };
  const admin = {
    from(table) {
      const b = {
        select: () => b,
        eq: (field, value) => {
          assert.equal(field, "owner_user_id");
          assert.equal(value, "owner");
          return b;
        },
        maybeSingle: async () => ({ data: existing }),
        upsert: asyncable,
        single: async () => ({
          data: { id: "dealer", slug: payload.slug, status: payload.status },
        }),
        insert: async () => ({}),
      };
      function asyncable(data) {
        if (table === "dealer_profiles") payload = data;
        return b;
      }
      return b;
    },
  };
  const functions = compile("../src/lib/dealer.functions.ts", (name) => {
    if (name === "@tanstack/react-start")
      return {
        createServerFn() {
          let validate = (data) => data;
          const b = {
            middleware: () => b,
            validator: (fn) => ((validate = fn), b),
            handler: (fn) => (args) => fn({ ...args, data: validate(args.data) }),
          };
          return b;
        },
      };
    if (name === "zod") return { z };
    if (name.endsWith("auth-middleware")) return { requireSupabaseAuth: {} };
    if (name.endsWith("client.server")) return { supabaseAdmin: admin };
    if (name.endsWith("supabase-public.server") || name.endsWith("classifieds.functions"))
      return {};
    throw Error(name);
  });
  await functions.saveDealerSetup({
    data: {
      legalName: "Dealer LLC",
      displayName: "Dealer",
      slug: "changed-page",
      acceptAgreements: true,
    },
    context: { userId: "owner" },
  });
  assert.equal(payload.owner_user_id, "owner");
  assert.equal(payload.slug, existing.slug);
  assert.equal(payload.status, "suspended");
  assert.equal(payload.agreements_accepted_at, existing.agreements_accepted_at);
  assert.equal(payload.agreements_version, existing.agreements_version);
});
