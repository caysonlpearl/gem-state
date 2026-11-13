import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { z } from "zod";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { dealerPerformanceView } from "../src/lib/dealer-performance.ts";

const mine = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
function compile(path, require) {
  const exports = {};
  vm.runInNewContext(
    ts.transpile(readFileSync(new URL(path, import.meta.url), "utf8"), {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    }),
    { exports, require },
  );
  return exports;
}
test("dealer analytics authorize the authenticated membership before any privileged read", async () => {
  let loads = 0;
  const headers = [];
  const functions = compile("../src/lib/dealer-performance.functions.ts", (name) => {
    if (name === "@tanstack/react-start")
      return {
        createServerFn: () => {
          let validate;
          const b = {
            middleware: () => b,
            validator(fn) {
              validate = fn;
              return b;
            },
            handler: (fn) => (args) => fn({ ...args, data: validate(args.data) }),
          };
          return b;
        },
      };
    if (name === "@tanstack/react-start/server")
      return { setResponseHeader: (...args) => headers.push(args) };
    if (name === "zod") return { z };
    if (name.endsWith("auth-middleware")) return { requireSupabaseAuth: {} };
    if (name.endsWith("client.server")) {
      loads++;
      return { supabaseAdmin: {} };
    }
    if (name === "./dealer-performance.server")
      return { loadDealerPerformance: (_db, id, days) => ({ id, days }) };
    throw Error(name);
  });
  const context = {
    userId: "owner",
    supabase: {
      rpc: async (name) => ({
        data: name === "my_dealer_inventory" ? [{ id: mine }] : false,
        error: null,
      }),
    },
  };
  await assert.rejects(
    functions.getMyDealerPerformance({ data: { dealerId: other, days: 30 }, context }),
    /Access to this dealership/,
  );
  await assert.rejects(
    functions.getDealerPerformancePreview({ data: { dealerId: mine, days: 30 }, context }),
    /Administrator/,
  );
  assert.equal(loads, 0);
  assert.equal(
    (await functions.getMyDealerPerformance({ data: { dealerId: mine, days: 7 }, context })).id,
    mine,
  );
  const failing = {
    supabase: { rpc: async () => ({ data: [{ id: mine }], error: { message: "lookup failed" } }) },
  };
  await assert.rejects(
    functions.getMyDealerPerformance({ data: { dealerId: mine, days: 30 }, context: failing }),
    /Access to this dealership/,
  );
  const admin = { userId: "admin", supabase: { rpc: async () => ({ data: true, error: null }) } };
  assert.equal(
    (
      await functions.getDealerPerformancePreview({
        data: { dealerId: other, days: 90 },
        context: admin,
      })
    ).id,
    other,
  );
  assert.ok(
    headers.every(([key, value]) => key === "Cache-Control" && value === "private, no-store"),
  );
  assert.throws(() =>
    functions.getMyDealerPerformance({ data: { dealerId: mine, days: 365 }, context }),
  );
});

test("owner reports exclude other businesses, aliases and internal sales assumptions", () => {
  const report = {
    period: { since: "start", until: "end", days: 30 },
    trackingStartedAt: "2026-11-12",
    aliases: { secret: "other" },
    businesses: [
      {
        key: "dealer:mine",
        dealerSlug: "mine",
        name: "My dealer",
        listingViews: 5,
        listings: [],
        conversionPercent: 10,
        modeledSales: 2,
      },
      {
        key: "dealer:other",
        dealerSlug: "other",
        name: "Other private business",
        listingViews: 999,
        listings: [],
      },
    ],
  };
  const result = dealerPerformanceView(report, "mine");
  assert.equal(result.business.listingViews, 5);
  assert.ok(!JSON.stringify(result).includes("Other private"));
  assert.ok(!("conversionPercent" in result.business));
  assert.ok(!("modeledSales" in result.business));
  assert.ok(!("aliases" in result));
  assert.equal(dealerPerformanceView(report, "missing").business, null);
});

test("the shared profile preview shows real controls but cannot invoke a save", () => {
  const component = compile("../src/components/dealers/DealerProfileForm.tsx", (name) => {
    if (name === "react") return { useState: () => [false, () => {}] };
    if (name === "./DealerLogoEditor")
      return {
        DealerLogoEditor: () => jsx.jsx("div", { children: "Dealership logo upload" }),
      };
    assert.equal(name, "react/jsx-runtime");
    return jsx;
  }).DealerProfileForm;
  let saves = 0;
  const draft = {
    legalName: "Twin Falls Subaru",
    displayName: "Twin Falls Subaru",
    slug: "twin-falls-subaru",
    phone: "2087011944",
    email: "",
    website: "https://twinfalls-subaru.com",
    addressLine1: "1725 Parkview Dr",
    addressLine2: "",
    city: "Twin Falls",
    state: "ID",
    postalCode: "83301",
    logoUrl: "https://example.com/logo.png",
    description: "Local dealer",
    acceptAgreements: true,
    priceInsightsEnabled: true,
    valuationDealerType: "franchise",
  };
  const props = {
    draft,
    set() {},
    onSave() {
      saves++;
    },
    preview: true,
    lockSlug: true,
  };
  const preview = component(props);
  preview.props.onSubmit({ preventDefault() {} });
  assert.equal(saves, 0);
  const output = renderToStaticMarkup(preview);
  for (const label of [
    "Business email",
    "Business phone",
    "Website",
    "Storefront description",
    "Show price insights",
    "Save business profile",
    "Preview only",
  ])
    assert.ok(output.includes(label), label);
  assert.match(output, /type="submit" disabled=""/);
  component({ ...props, preview: false }).props.onSubmit({ preventDefault() {} });
  assert.equal(saves, 1);
});
