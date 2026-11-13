import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as contract from "../src/lib/mobile-storefront-contract.ts";
import {
  mobileGeneralDealerContexts,
  mobileSellerIdentity,
  mobileReviewVisible,
  mobileReviewRelationship,
} from "../src/lib/mobile-storefront.server.ts";
import { storefrontDestination, storefrontAuthDestination } from "../src/lib/storefront-url.ts";
import { nativeListingDestination } from "../apps/mobile/src/listing-links.ts";
import { mobileLinkTarget } from "../src/lib/mobile-contract.ts";
import { storefrontFixture, storefrontActors } from "./support/mobile-storefront-fixture.mjs";
const f = storefrontFixture();
test("public storefront projections retain eligible inventory and reviews and exclude private/future fields recursively", () => {
  const seller = structuredClone(f.seller);
  seller.privateCredentials = "PRIVATE";
  seller.listings[0].privateAddress = "PRIVATE";
  seller.listings[0].imageUrls.push("javascript:alert(1)");
  seller.reviews[0].reviewerEmail = "PRIVATE";
  seller.reviews.push({ ...seller.reviews[0], comment: "Rifle ammunition purchase" });
  const safe = contract.mobilePublicSeller(seller);
  assert(!JSON.stringify(safe).includes("PRIVATE"));
  assert.equal(safe.reviews.length, 1);
  assert.equal(safe.listings[0].categorySlug, f.seller.listings[0].categorySlug);
  assert(safe.listings[0].imageUrls.every((u) => u.startsWith("https://")));
  const d = contract.mobilePublicDealer(
    {
      ...f.dealer,
      privateKey: "PRIVATE",
      website: "javascript:alert(1)",
      email: "user@example.invalid?query",
      phone: "javascript:alert(1)",
    },
    [],
  );
  assert(!JSON.stringify(d).includes("PRIVATE"));
  assert.equal(d.website, null);
  assert.equal(d.email, null);
  assert.equal(d.phone, null);
  assert.equal(
    contract.mobilePublicDealer({ ...f.dealer, website: "https://www.guns.com" }, []).website,
    null,
  );
  const good = {
    status: "active",
    approved_at: "2026-11-12",
    expires_at: "2036-01-01",
    is_demo: false,
    products: {
      name: "Desk",
      description: "Local desk",
      status: "published",
      categories: { slug: "furniture" },
    },
  };
  assert.equal(contract.mobileStorefrontAskAllowed(good), true);
  for (const patch of [
    { status: "pending" },
    { is_demo: true },
    { expires_at: "2000-01-01" },
    { products: { ...good.products, status: "draft" } },
    { products: { ...good.products, categories: { slug: "firearms" } } },
    { products: { ...good.products, name: "Rifle ammunition" } },
  ])
    assert(!contract.mobileStorefrontAskAllowed({ ...good, ...patch }));
});
test("storefront links, pagination and one-use login destinations preserve native pages and reject untrusted query scope", () => {
  assert.equal(
    nativeListingDestination("/sellers/$slug", { slug: "Fixture-Seller" }),
    "/sellers/fixture-seller",
  );
  assert.equal(
    nativeListingDestination("/dealers/fixture-motors", {}, { page: 2 }),
    "/dealers/fixture-motors?page=2",
  );
  assert.equal(
    storefrontDestination("/dealers/fixture-motors", { page: 2 }, "dealer-inventory"),
    "/dealers/fixture-motors?page=2&section=dealer-inventory",
  );
  assert.equal(
    storefrontAuthDestination("/sellers/fixture-seller?review=true"),
    "/sellers/fixture-seller?review=true",
  );
  assert.equal(
    mobileLinkTarget("https://onbluebird.com/dealers/fixture-motors?page=2"),
    "/dealers/fixture-motors?page=2",
  );
  for (const path of [
    "/sellers/foo?mobileCatalog=false",
    "https://evil.invalid/sellers/foo",
    "/sellers/foo?review=true&review=true",
    "/dealers/foo?page=0",
    "/dealers/foo?section=billing",
    "//evil.invalid/sellers/foo",
  ])
    assert.equal(storefrontAuthDestination(path), null, path);
});
function query(data, error = null) {
  const filters = [];
  const q = {
    filters,
    select: () => q,
    in: (k, v) => {
      filters.push([k, v]);
      return q;
    },
    or: (v) => {
      filters.push(["or", v]);
      return q;
    },
    eq: (k, v) => {
      filters.push([k, v]);
      return q;
    },
    abortSignal: () => q,
    retry: () => q,
    maybeSingle: async () => ({ data, error }),
    then: (r) => Promise.resolve({ data, error }).then(r),
  };
  return q;
}
test("general native dealer contexts require trusted mapping and exact already-authorized participants", async () => {
  const a = storefrontActors.buyer,
    b = storefrontActors.seller,
    id = storefrontActors.conversation;
  const rows = [{ id, listingId: null, buyerId: a, sellerId: b }];
  let calls = 0;
  const db = {
    from(table) {
      calls++;
      assert.equal(table, "mobile_dealer_conversations");
      return query([
        { conversation_id: id, dealer_id: storefrontActors.dealer, buyer_id: a, seller_id: b },
        {
          conversation_id: "forged",
          dealer_id: storefrontActors.dealer,
          buyer_id: a,
          seller_id: b,
        },
      ]);
    },
  };
  assert.deepEqual([...(await mobileGeneralDealerContexts(db, a, rows, false))], []);
  assert.equal(calls, 0);
  assert.deepEqual([...(await mobileGeneralDealerContexts(db, a, rows, true))], [id]);
  assert.deepEqual(
    [...(await mobileGeneralDealerContexts(db, storefrontActors.other, rows, true))],
    [],
  );
  assert.deepEqual(
    [
      ...(await mobileGeneralDealerContexts(
        {
          from: () =>
            query([
              {
                conversation_id: id,
                dealer_id: storefrontActors.dealer,
                buyer_id: b,
                seller_id: a,
              },
            ]),
        },
        a,
        rows,
        true,
      )),
    ],
    [],
  );
  await assert.rejects(
    mobileGeneralDealerContexts(
      { from: () => query(null, { message: "private diagnostic" }) },
      a,
      rows,
      true,
    ),
    (e) => e.status === 503,
  );
});
test("seller/review actions derive their target from a public slug and keep reads and blocked-member failures explicit", async () => {
  const seen = [];
  const db = {
    from(t) {
      const q = query(
        t === "seller_storefronts"
          ? {
              user_id: storefrontActors.seller,
              slug: f.seller.slug,
              display_name: f.seller.displayName,
              bio: f.seller.bio,
            }
          : t === "seller_reviews"
            ? f.seller.reviews[0]
            : [],
      );
      seen.push({ table: t, q });
      return q;
    },
  };
  assert.equal((await mobileSellerIdentity(db, f.seller.slug)).userId, storefrontActors.seller);
  await mobileReviewVisible(db, storefrontActors.seller, storefrontActors.review);
  assert(
    seen.some((r) =>
      r.q.filters.some(([k, v]) => k === "seller_id" && v === storefrontActors.seller),
    ),
  );
  await mobileReviewRelationship(db, storefrontActors.buyer, storefrontActors.seller);
  await assert.rejects(
    mobileReviewRelationship(
      { from: () => query([{ conversation_participants: [{ blocked_at: "2026-11-12" }] }]) },
      storefrontActors.buyer,
      storefrontActors.seller,
    ),
    (e) => e.status === 403,
  );
  await assert.rejects(
    mobileSellerIdentity({ from: () => query(null, {}) }, f.seller.slug),
    (e) => e.status === 503,
  );
  await assert.rejects(
    mobileReviewVisible(
      { from: () => query(null) },
      storefrontActors.seller,
      storefrontActors.review,
    ),
    (e) => e.status === 404,
  );
});
function serverModule(file, modules) {
  const code = ts.transpileModule(
    readFileSync(new URL("../src/lib/" + file, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const exports = {};
  const create = () => {
    let validator = (v) => v;
    const builder = {
      middleware: () => builder,
      validator: (fn) => {
        validator = fn;
        return builder;
      },
      handler:
        (fn) =>
        async (args = {}) =>
          fn({ data: validator(args.data ?? {}), context: {} }),
    };
    return builder;
  };
  new Function("require", "exports", code)(
    (name) =>
      name === "@tanstack/react-start" ? { createServerFn: create } : (modules[name] ?? {}),
    exports,
  );
  return exports;
}
test("the actual public seller handler filters app inventory before signing photos and computes app-specific counts without changing website scope", async () => {
  const good = {
    id: "good",
    seller_id: f.seller.userId,
    status: "active",
    approved_at: "2026-11-12",
    expires_at: "2036-01-01",
    is_demo: false,
    product_id: "product",
    variant_id: "variant",
    price_cents: 100,
    currency: "USD",
    item_condition: "used_good",
    seller_note: null,
    created_at: "2026-11-01",
    products: {
      slug: "desk",
      name: "Desk",
      description: "Local desk",
      status: "published",
      categories: { slug: "furniture" },
    },
    product_variants: { color: "Blue" },
    listing_media: [{ storage_path: "allowed-photo", position: 0 }],
  };
  const restricted = {
    ...good,
    id: "restricted",
    products: { ...good.products, categories: { slug: "firearms" } },
    listing_media: [{ storage_path: "restricted-photo", position: 0 }],
  };
  const signed = [];
  let fail = false;
  const db = {
    rpc: async () => ({ data: { managed: false } }),
    from(table) {
      let select = "",
        limit;
      const q = {
        select: (v) => {
          select = v;
          return q;
        },
        eq: () => q,
        not: () => q,
        gt: () => q,
        order: () => q,
        in: () => q,
        limit: (v) => {
          limit = v;
          return q;
        },
        maybeSingle: async () => ({
          data: {
            user_id: f.seller.userId,
            slug: f.seller.slug,
            display_name: f.seller.displayName,
            bio: "Local seller",
            member_since: "2024-01-01",
            active_listing_count: 2,
          },
        }),
        then: (resolve) =>
          Promise.resolve({
            data:
              table === "asks"
                ? [good, restricted]
                : table === "seller_reviews"
                  ? [
                      {
                        id: "r1",
                        rating: 4,
                        comment: "Helpful seller",
                        created_at: "2026-11-01",
                        reviewer_id: "member",
                      },
                      {
                        id: "r2",
                        rating: 5,
                        comment: "Rifle ammunition purchase",
                        created_at: "2026-11-01",
                        reviewer_id: "member",
                      },
                    ]
                  : [{ id: "member", display_name: "Public name" }],
            error: fail && table === "asks" ? {} : null,
          }).then(resolve),
      };
      return q;
    },
  };
  const mod = serverModule("seller.functions.ts", {
    "./supabase-public.server": { publicServerClient: () => db },
    "@/integrations/supabase/client.server": { supabaseAdmin: db },
    "./mobile-storefront-contract.ts": contract,
    "./classifieds.functions": {
      signListingThumbnails: async (paths) => {
        signed.push(...paths);
        return new Map(paths.map((p) => [p, "https://images.example.invalid/" + p]));
      },
    },
    "./photo-storage-access": {
      getPhotoStorageModule: async () => ({
        signPrivatePhotoUrls: async (_, paths) => {
          signed.push(...paths);
          return new Map(paths.map((p) => [p, "https://images.example.invalid/" + p]));
        },
      }),
    },
  });
  const native = await mod.getPublicSeller({ data: { slug: f.seller.slug, mobileCatalog: true } });
  assert.equal(native.listings.length, 1);
  assert.equal(native.activeListingCount, 1);
  assert.equal(native.reviewCount, 1);
  assert.equal(native.ratingAverage, 4);
  assert.equal(native.reviews[0].reviewerName, "Public name");
  assert(!signed.includes("restricted-photo"));
  signed.length = 0;
  const website = await mod.getPublicSeller({ data: { slug: f.seller.slug } });
  assert.equal(website.listings.length, 2);
  assert.equal(website.activeListingCount, 2);
  assert.equal(website.reviewCount, 2);
  assert(signed.includes("restricted-photo"));
  fail = true;
  signed.length = 0;
  await assert.rejects(
    mod.getPublicSeller({ data: { slug: f.seller.slug, mobileCatalog: true } }),
    /temporarily unavailable/,
  );
  assert.equal(signed.length, 0);
});

test("the actual dealer profile handler uses the app cache-only catalog and respects contact preferences; website browsing keeps its original scope", async () => {
  const { z } = await import("zod");
  const calls = [];
  let present = true,
    pref = true,
    prefFailure = false;
  const row = {
    id: f.dealer.id,
    legal_name: f.dealer.legalName,
    display_name: f.dealer.displayName,
    slug: f.dealer.slug,
    owner_user_id: actorsSeller(),
    phone: f.dealer.phone,
    email: f.dealer.email,
    website: f.dealer.website,
    address_line1: f.dealer.addressLine1,
    city: f.dealer.city,
    state: f.dealer.state,
    postal_code: f.dealer.postalCode,
    logo_url: null,
    description: f.dealer.description,
  };
  const db = {
    from(table) {
      const q = {
        select: () => q,
        eq: () => q,
        not: () => q,
        abortSignal: () => q,
        retry: () => q,
        maybeSingle: async () => ({
          data:
            table === "dealer_profiles"
              ? present
                ? row
                : null
              : { allow_internal_messages: pref },
          error: table === "account_contact_preferences" && prefFailure ? {} : null,
        }),
      };
      return q;
    },
  };
  const page = { listings: f.dealer.listings, total: 2, page: 1, pageSize: 1, incomplete: false };
  const mod = serverModule("dealer.functions.ts", {
    zod: { z },
    "@/lib/supabase-public.server": { publicServerClient: () => db },
    "@/integrations/supabase/client.server": { supabaseAdmin: db },
    "./mobile-storefront-contract.ts": contract,
    "./classifieds.functions": {
      loadMobileBrowseInventory: async (input) => {
        calls.push({ kind: "native", input });
        return page;
      },
    },
    "@/lib/classifieds.functions": {
      browseClassifieds: async ({ data }) => {
        calls.push({ kind: "website", input: data });
        return page;
      },
    },
    "./dealer-feed.server": {
      dealerFeedStorefront: async (...args) => {
        calls.push({ kind: "publishedFeed", args });
        return f.dealer;
      },
    },
  });
  const native = await mod.getPublicDealer({
    data: { slug: f.dealer.slug, mobileCatalog: true, page: 1 },
  });
  assert.equal(native.messagingEnabled, true);
  assert.equal(native.ownerUserId, storefrontActors.seller);
  assert.equal(calls[0].kind, "native");
  assert.equal(calls[0].input.mobileCatalog, true);
  assert.equal(calls[0].input.dealerSlug, f.dealer.slug);
  pref = false;
  const website = await mod.getPublicDealer({ data: { slug: f.dealer.slug } });
  assert.equal(website.messagingEnabled, false);
  assert.equal(calls[1].kind, "website");
  assert(!Object.hasOwn(calls[1].input, "mobileCatalog"));
  page.incomplete = true;
  await assert.rejects(
    mod.getPublicDealer({ data: { slug: f.dealer.slug, mobileCatalog: true } }),
    /temporarily unavailable/,
  );
  page.incomplete = false;
  prefFailure = true;
  const before = calls.length;
  await assert.rejects(
    mod.getPublicDealer({ data: { slug: f.dealer.slug, mobileCatalog: true } }),
    /temporarily unavailable/,
  );
  assert.equal(calls.length, before);
  present = false;
  prefFailure = false;
  await mod.getPublicDealer({ data: { slug: f.dealer.slug, mobileCatalog: true } });
  assert.deepEqual(calls.at(-1).args, [f.dealer.slug, 1, true]);
  function actorsSeller() {
    return storefrontActors.seller;
  }
});

test("native dealership notifications include only the mapped conversation and keep blocks, owner isolation and unscoped website chats excluded", async () => {
  const { mobileNotificationInbox } = await import("../src/lib/mobile-notifications.ts");
  const { memberNotification } = await import("../src/lib/notification-model.ts");
  const a = storefrontActors.buyer,
    b = storefrontActors.seller,
    id = storefrontActors.conversation;
  const row = {
    id,
    listing_id: null,
    buyer_id: a,
    seller_id: b,
    last_message_at: "2026-11-13T12:00:00Z",
    conversation_participants: [
      { user_id: a, last_read_at: null, blocked_at: null },
      { user_id: b, last_read_at: null, blocked_at: null },
    ],
  };
  const item = memberNotification({
    id: storefrontActors.review,
    kind: "message",
    title: "New marketplace message",
    body: "A new dealership inquiry",
    order_id: null,
    entity_type: "conversation",
    entity_id: id,
    destination_url: "/account?section=messages&conversation=" + id,
    read_at: null,
    created_at: "2026-11-13T12:00:00Z",
  });
  const unmapped = mobileNotificationInbox([item], a, [row], new Map());
  assert.equal(unmapped.unread, 0);
  assert.equal(unmapped.unreadMessages, 0);
  const mapped = mobileNotificationInbox([item], a, [row], new Map(), new Map(), new Set([id]));
  assert.equal(mapped.unread, 1);
  assert.equal(mapped.unreadMessages, 1);
  assert.equal(mapped.items[0].destinationUrl, "/messages/" + id);
  assert.equal(
    mobileNotificationInbox(
      [item],
      storefrontActors.other,
      [row],
      new Map(),
      new Map(),
      new Set([id]),
    ).items.length,
    0,
  );
  const blocked = structuredClone(row);
  blocked.conversation_participants[1].blocked_at = "2026-11-13";
  assert.equal(
    mobileNotificationInbox([item], a, [blocked], new Map(), new Map(), new Set([id])).items.length,
    0,
  );
});
