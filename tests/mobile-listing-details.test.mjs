import test from "node:test";
import assert from "node:assert/strict";
import { mobileListingDetail } from "../src/lib/mobile-listing-detail.ts";
import {
  mobileListingStats,
  mobileOwnListingClaim,
} from "../src/lib/mobile-listing-detail.server.ts";
import {
  prepareMobileResume,
  commitMobileApplication,
} from "../src/lib/mobile-job-application.server.ts";
import { nativeListingDestination } from "../apps/mobile/src/listing-links.ts";
import { validateMobileResume } from "../src/lib/mobile-job-application-contract.ts";
import { detailFixture, detailActors } from "./support/mobile-detail-fixture.mjs";
const f = detailFixture();
test("rich listing projections retain category facts and permitted contacts while stripping unknown, raw and private data recursively", () => {
  for (const [name, d] of Object.entries(f)) {
    const text = JSON.stringify(d.listing);
    assert(!text.includes("PRIVATE NEVER EXPORT"));
    assert.equal(d.listing.title, d.raw.title);
    if (d.raw.home) assert.equal(d.listing.home.bedrooms, d.raw.home.bedrooms);
    if (d.raw.vehicle) assert.equal(d.listing.vehicle.vin, d.raw.vehicle.vin);
    if (d.raw.seller) assert.equal(d.listing.seller.contactEmail, d.raw.seller.contactEmail);
  }
  const raw = structuredClone(f.vehicle.raw);
  raw.externalVehicle = {
    sourceKind: "dealer",
    raw: { private_secret: "PRIVATE" },
    dealer: { name: "Public dealer", privateAccount: "PRIVATE" },
    media: { photoLinks: ["javascript:alert(1)", "https://images.example.invalid/car.jpg"] },
  };
  raw.seller.password = "PRIVATE";
  raw.seller.privateEmail = "PRIVATE";
  raw.seller.avatarUrl = "javascript:alert(1)";
  raw.communityListings = [
    f.general.raw,
    { ...f.general.raw, categorySlug: "firearms", title: "Rifle" },
  ];
  raw.communityFloorplans = [
    { name: "One", bedrooms: 2, bathrooms: 1, image: "javascript:alert(1)" },
    {
      name: "Two",
      bedrooms: 3,
      bathrooms: 2,
      image: "https://images.example.invalid/plan.jpg",
      private: "PRIVATE",
    },
  ];
  const safe = mobileListingDetail(raw);
  assert(!JSON.stringify(safe).includes("PRIVATE"));
  assert.equal(safe.seller.avatarUrl, null);
  assert.deepEqual(safe.externalVehicle.raw, {});
  assert.deepEqual(safe.externalVehicle.media.photoLinks, [
    "https://images.example.invalid/car.jpg",
  ]);
  assert.equal(safe.communityListings.length, 1);
  assert.equal(safe.communityFloorplans.length, 1);
  for (const change of [
    { categorySlug: "firearms" },
    { title: "Rifle ammunition" },
    { externalMerchandise: { source: "Guns.com" } },
    { isMock: true },
  ])
    assert.equal(mobileListingDetail({ ...f.general.raw, ...change }), null);
});
test("native internal detail destinations keep seller and make filters, preserve opaque IDs, and never reach website checkout", () => {
  assert.equal(nativeListingDestination("/checkout"), null);
  assert.equal(nativeListingDestination("/account", {}, { section: "billing" }), null);
  assert.equal(
    nativeListingDestination("/sellers/$slug", { slug: "fixture-seller" }),
    "/sellers/fixture-seller",
  );
  assert.match(nativeListingDestination("/cars/ford/f-150"), /make=Ford/);
  assert.match(nativeListingDestination("/idaho/boise/homes"), /category=other-real-estate/);
  assert.equal(nativeListingDestination("/idaho/firearms"), null);
  const city = new URLSearchParams(
    nativeListingDestination("/idaho/coeur-dalene/homes").split("?")[1],
  );
  assert.equal(city.get("city"), "Coeur d'Alene");
  assert.equal(city.get("radiusMiles"), "25");
  assert.equal(city.get("state"), "ID");
  const region = new URLSearchParams(
    nativeListingDestination("/idaho/magic-valley/homes").split("?")[1],
  );
  assert.equal(region.get("region"), "Magic Valley");
  assert.equal(region.get("city"), null);
  const trade = new URLSearchParams(nativeListingDestination("/idaho/plumbers").split("?")[1]);
  assert.equal(trade.get("serviceSubcategory"), "Plumbers");
  assert.equal(nativeListingDestination("/idaho/not-a-real-city/homes"), null);
  assert.equal(nativeListingDestination("/idaho/magic-valley/plumbers"), null);
  assert.equal(
    nativeListingDestination("/listings/marketcheck-dealer-ABC123"),
    "/listings/marketcheck-dealer-ABC123",
  );
  assert.equal(nativeListingDestination("/listings/avantlink-12"), null);
});
function queryResult(data, count = 0, error = null) {
  const q = {
    select() {
      return q;
    },
    eq() {
      return q;
    },
    limit() {
      return q;
    },
    abortSignal() {
      return q;
    },
    retry() {
      return q;
    },
    maybeSingle: async () => ({ data, error }),
    then: (resolve) => Promise.resolve({ data, count, error }).then(resolve),
  };
  return q;
}
test("public detail counts are read-only aggregates, retain an unavailable state on failure, and do not derive a visitor fingerprint", async () => {
  const calls = [];
  const db = {
    from(table) {
      calls.push(table);
      return queryResult(table === "listing_view_counts" ? [{ views: 17 }] : null, 4);
    },
    rpc() {
      throw Error("View recording is forbidden");
    },
  };
  assert.deepEqual(await mobileListingStats(db, f.general.listing), { views: 17, favorites: 4 });
  assert.deepEqual(calls, ["listing_view_counts", "watchlist"]);
  assert.equal(
    await mobileListingStats(
      { from: () => queryResult(null, 0, { message: "offline" }) },
      f.general.listing,
    ),
    null,
  );
});
test("claim status derives the current owner and listing business, and read failures do not become a missing claim", async () => {
  const calls = [],
    client = {
      from(table) {
        calls.push(table);
        const q = queryResult({ status: "pending", created_at: "2026-11-12" });
        q.eq = (k, v) => {
          calls.push([k, v]);
          return q;
        };
        return q;
      },
    };
  assert.deepEqual(await mobileOwnListingClaim(client, detailActors.buyer, f.service.listing), {
    status: "pending",
    createdAt: "2026-11-12",
  });
  assert(calls.some((c) => Array.isArray(c) && c[0] === "user_id" && c[1] === detailActors.buyer));
  await assert.rejects(
    mobileOwnListingClaim(
      { from: () => queryResult(null, 0, {}) },
      detailActors.buyer,
      f.service.listing,
    ),
    (e) => e.status === 503,
  );
  await assert.rejects(
    mobileOwnListingClaim(client, detailActors.buyer, f.general.listing),
    (e) => e.status === 404,
  );
});
const request = (body, id = "60000000-0000-4000-8000-000000000001") =>
  new Request(
    "https://onbluebird.com/api/mobile/v1/listings/" + f.job.listing.id + "/application",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": id },
      body: JSON.stringify(body),
    },
  );
test("resume preparation derives an immutable private path and treats upload uncertainty as retryable, without trusting file names or owners", async () => {
  const seen = [],
    storage = {
      info: async () => ({ data: null, error: { status: 404 } }),
      createSignedUploadUrl: async (path, options) => {
        seen.push({ path, options });
        return { data: { token: "fixture-upload-token" } };
      },
    };
  const client = {
    storage: {
      from(bucket) {
        assert.equal(bucket, "job-application-resumes");
        return storage;
      },
    },
  };
  const body = { contentType: "application/pdf", size: 1200 },
    r = await prepareMobileResume(request(body), client, detailActors.buyer, f.job.listing.id);
  assert.equal(
    r.path,
    `${detailActors.buyer}/${f.job.listing.id}/60000000-0000-4000-8000-000000000001.pdf`,
  );
  assert.equal(seen[0].options.upsert, false);
  storage.info = async () => ({ data: { size: 1200, contentType: "application/pdf" } });
  const ready = await prepareMobileResume(
    request(body),
    client,
    detailActors.buyer,
    f.job.listing.id,
  );
  assert.equal(ready.uploaded, true);
  assert.equal(seen.length, 1);
  await assert.rejects(
    prepareMobileResume(
      request({ ...body, userId: "victim" }),
      client,
      detailActors.buyer,
      f.job.listing.id,
    ),
  );
  storage.info = async () => ({ error: { status: 503 } });
  await assert.rejects(
    prepareMobileResume(request(body), client, detailActors.buyer, f.job.listing.id),
    (e) => e.status === 503,
  );
  for (const file of [
    { type: "text/html", size: 10 },
    { type: "toString", size: 1 },
    { type: "application/pdf", size: 11 * 1024 * 1024 },
  ])
    assert.throws(() => validateMobileResume(file));
});
test("application commits use the original request key, strict input and a single transaction, and expose useful retry states", async () => {
  const calls = [],
    client = {
      rpc: async (name, args) => {
        calls.push({ name, args });
        return { data: { ok: true, applicationId: "fixture", replayed: false } };
      },
    };
  const body = {
    resumePath: `${detailActors.buyer}/${f.job.listing.id}/60000000-0000-4000-8000-000000000001.pdf`,
    coverLetter: "Private cover letter",
  };
  await commitMobileApplication(request(body), client, f.job.listing.id);
  assert.equal(calls[0].name, "mobile_commit_job_application");
  assert.equal(calls[0].args._request, "60000000-0000-4000-8000-000000000001");
  assert.equal(calls[0].args._listing, f.job.listing.id);
  assert(!("user_id" in calls[0].args));
  await assert.rejects(
    commitMobileApplication(request({ ...body, userId: "victim" }), client, f.job.listing.id),
  );
  assert.equal(calls.length, 1);
  await assert.rejects(
    commitMobileApplication(
      request(body),
      {
        rpc: async () => ({
          error: { message: "Application retry does not match original request" },
        }),
      },
      f.job.listing.id,
    ),
    (e) => e.status === 409,
  );
});
