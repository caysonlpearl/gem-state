import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { randomUUID } from "node:crypto";
const { chromium } = await import(
  new URL("../apps/mobile/node_modules/playwright/index.mjs", import.meta.url)
);
const output = resolve(process.env.BLUEBIRD_MOBILE_EVIDENCE || "/tmp/bluebird-mobile-posting-ui");
await mkdir(output, { recursive: true });
const port = 5192,
  origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  {
    cwd: resolve("apps/mobile"),
    env: { ...process.env, VITE_MOBILE_API_ORIGIN: "https://fixture.bluebird.invalid" },
    stdio: "ignore",
  },
);
const owner = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
function session(actor) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token:
      [
        { alg: "HS256", typ: "JWT" },
        { sub: actor, aud: "authenticated", role: "authenticated", exp: expires },
      ]
        .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
        .join(".") + ".fixture",
    refresh_token: "fixture-refresh",
    token_type: "bearer",
    expires_at: expires,
    expires_in: 3600,
    user: {
      id: actor,
      aud: "authenticated",
      email: "fixture@example.invalid",
      app_metadata: { provider: "email" },
      user_metadata: { display_name: "Fixture shopper" },
    },
  };
}
let browser;
const errors = [],
  results = [];
try {
  const deadline = Date.now() + 30000;
  for (;;) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    if (Date.now() > deadline) throw Error("Preview did not start");
    await pause(150);
  }
  browser = await chromium.launch(
    process.env.BLUEBIRD_BROWSER_CHANNEL ? { channel: process.env.BLUEBIRD_BROWSER_CHANNEL } : {},
  );
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 740 },
    { width: 768, height: 1024 },
  ]) {
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.error(e.message);
    });
    await page.addInitScript(
      ({ a, b, first }) => {
        localStorage.setItem(
          "bluebird-mobile-auth",
          JSON.stringify(sessionStorage.getItem("fixture.other") ? b : a),
        );
      },
      { a: session(owner), b: session(other), first: owner },
    );
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    };
    let setup = {
        exists: false,
        termsAccepted: false,
        displayName: "",
        slug: "",
        bio: "",
        avatarUrl: "",
        shipFromName: "Fixture shipping name",
        shippingFromAddress1: "",
        shippingFromAddress2: "",
        shippingFromCity: "",
        shippingFromState: "",
        shippingFromPostalCode: "",
        defaultHandlingDays: 3,
      },
      loseResponse = true,
      replayDenied = true,
      enabled = true;
    const uploads = [],
      saves = [],
      posts = [],
      receipts = new Map(),
      vins = [];
    await page.route("https://fixture.supabase.co/**", async (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const path = decodeURIComponent(new URL(req.url()).pathname);
      if (path.startsWith("/storage/v1/object/")) {
        uploads.push(path);
        return route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify({ Key: path.split("/object/")[1], Id: randomUUID() }),
        });
      }
      if (path === "/auth/v1/user")
        return route.fulfill({ status: 200, headers, body: JSON.stringify(session(owner).user) });
      throw Error("Unexpected Supabase fixture " + path);
    });
    await page.route("https://fixture.bluebird.invalid/api/mobile/v1/**", async (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const path = new URL(req.url()).pathname.split("/v1/")[1],
        method = req.method(),
        body = method === "GET" ? null : req.postDataJSON();
      const fail = (status, message) =>
        route.fulfill({
          status,
          headers,
          body: JSON.stringify({ error: { code: "unavailable", message } }),
        });
      let data;
      if (path === "bootstrap")
        data = {
          policyVersion: "2026-11-12",
          supabaseUrl: "https://fixture.supabase.co",
          supabaseKey: "sb_publishable_fixture",
          categories: [
            { slug: "general", name: "General", group: "classifieds" },
            { slug: "furniture", name: "Furniture", group: "classifieds" },
            { slug: "firearms", name: "Firearms", group: "classifieds" },
            { slug: "cars-trucks", name: "Cars & Trucks", group: "motors" },
            { slug: "other-real-estate", name: "Homes", group: "classifieds" },
            { slug: "jobs", name: "Jobs", group: "classifieds" },
            { slug: "services", name: "Services", group: "classifieds" },
            { slug: "pets", name: "Pets", group: "classifieds" },
          ],
          features: {
            push: false,
            advertising: false,
            paidUpgrades: false,
            conversationAttachments: false,
            durablePosting: enabled,
          },
        };
      else if (path === "account")
        data = {
          account: { displayName: "Fixture shopper" },
          consent: { terms_version: "2026-11-12", shopping_alerts: false },
        };
      else if (path === "shopping")
        data = { personalization: false, trackingAvailable: true, recommendationsAvailable: true };
      else if (path === "home") data = { motors: [], recent: [] };
      else if (path === "saved") data = { items: [] };
      else if (path === "conversations") data = [];
      else if (path === "activity") data = {};
      else if (path === "seller" && method === "GET") data = setup;
      else if (path === "seller" && method === "POST") {
        saves.push(body);
        setup = { ...setup, ...body, exists: true, termsAccepted: true };
        data = {};
      } else if (path === "vehicles/vin") {
        vins.push(body);
        data = {
          vin: body.vin,
          fields: {
            make: "TOYOTA",
            model: "Tacoma",
            year: "2019",
            bodyStyle: "Pickup",
            drivetrain: "4WD",
            transmission: "Automatic",
            fuelType: "Gasoline",
          },
          source: "nhtsa_vpic",
        };
      } else if (path === "photos/mode") data = { mode: "supabase" };
      else if (path === "listings" && method === "POST") {
        const key = req.headers()["idempotency-key"];
        assert(key);
        posts.push({ key, body });
        if (!receipts.has(key)) receipts.set(key, { listingId: randomUUID() });
        if (loseResponse) {
          loseResponse = false;
          return fail(503, "Fixture lost response. Retry submission.");
        }
        if (replayDenied) {
          replayDenied = false;
          return fail(403, "Fixture permission changed. Sign in again.");
        }
        data = receipts.get(key);
      } else throw Error("Unexpected API fixture " + method + " " + path);
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ data }) });
    });
    console.log("Opening fixture", viewport.width);
    await page.goto(origin + "/#/post");
    await page.getByRole("heading", { name: "Set up your shop", exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole("link", { name: "Create your first listing", exact: true })
        .getAttribute("aria-disabled"),
      "true",
    );
    await page.getByLabel("Seller display name", { exact: true }).fill("Fixture seller");
    await page.getByLabel("Seller handle", { exact: true }).fill("fixture-seller");
    await page.getByLabel("Short bio", { exact: true }).fill("Fixture public seller biography.");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Save seller profile", exact: true }).click();
    await page
      .getByText("Seller profile saved. You can now create listings.", { exact: true })
      .waitFor();
    assert.equal(saves.length, 1);
    assert.equal(saves[0].shipFromName, "Fixture shipping name");
    assert.equal(saves[0].defaultHandlingDays, 3);
    await page.screenshot({ path: resolve(output, `shared-seller-setup-${viewport.width}.png`) });
    await page.getByRole("link", { name: "Create your first listing", exact: true }).click();
    await page.getByRole("heading", { name: "Create a listing", exact: true }).waitFor();
    const form = page.locator("form").last();
    const tab = (name) => form.getByRole("button", { name, exact: true });
    await tab("Vehicle").click();
    await page.getByPlaceholder("Enter 17-character VIN").fill("1HGCM82633A004352");
    await page.getByRole("button", { name: "Auto-fill details", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Vehicle details filled from the VIN" })
      .waitFor();
    assert.equal(vins.length, 1);
    assert.equal(await form.getByLabel("Make / brand", { exact: true }).inputValue(), "Toyota");
    assert.equal(await form.getByLabel("Year", { exact: true }).inputValue(), "2019");
    await page.screenshot({ path: resolve(output, `shared-vehicle-form-${viewport.width}.png`) });
    await tab("Home").click();
    await form.getByText("Property basics", { exact: true }).waitFor();
    await form.getByLabel(/^Property type/).waitFor();
    await tab("Job").click();
    await form.getByText("Job basics", { exact: true }).waitFor();
    assert.equal(await form.getByLabel("Employer name", { exact: true }).count(), 1);
    await tab("Service").click();
    await form.getByText("Service basics", { exact: true }).waitFor();
    assert.equal(await form.getByLabel("Service area", { exact: true }).count(), 1);
    await tab("Pet").click();
    await form.getByText("Pet basics", { exact: true }).waitFor();
    assert.equal(await form.getByLabel(/^Breed \/ variety/).count(), 1);
    await tab("Item").click();
    await form.getByLabel(/^Category/).selectOption("general");
    await form.getByLabel(/^Item type/).fill("Table");
    assert.equal(await form.getByRole("option", { name: "Firearms", exact: true }).count(), 0);
    await form.getByLabel("Title", { exact: true }).fill("Fixture oak table");
    await form.getByLabel("Price (USD)", { exact: true }).fill("125.50");
    await form
      .getByLabel("Item description", { exact: true })
      .fill("A fixture oak table with enough detail to validate this listing.");
    await form.getByLabel(/^City/).fill("Imaginaryfixturetown");
    await form.getByLabel("Title", { exact: true }).click();
    assert.equal(await form.getByLabel(/^City/).evaluate((el) => el.validity.valid), false);
    await form.getByLabel(/^City/).fill("Twin Falls");
    await form.getByLabel("Title", { exact: true }).click();
    assert.equal(await form.getByLabel(/^Region \/ area/).inputValue(), "Magic Valley");
    await page.reload();
    await page.getByRole("heading", { name: "Create a listing", exact: true }).waitFor();
    assert.equal(await form.getByLabel("Title", { exact: true }).inputValue(), "Fixture oak table");
    assert.equal(await form.getByLabel(/^City/).inputValue(), "Twin Falls");
    await form
      .locator("input[type=file]")
      .setInputFiles({
        name: "fixture.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.from(
          "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EB//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EB//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EB//2Q==",
          "base64",
        ),
      });
    await form
      .getByRole("checkbox", {
        name: "I took these photos or have permission to publish them.",
        exact: true,
      })
      .check();
    await page.screenshot({ path: resolve(output, `shared-listing-form-${viewport.width}.png`) });
    await form.getByRole("button", { name: "Submit listing", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Fixture lost response" }).waitFor();
    assert.equal(posts.length, 1);
    assert.equal(uploads.length, 2);
    assert.equal(await form.getByLabel("Title", { exact: true }).isDisabled(), true);
    await page.reload();
    await form.getByRole("button", { name: "Retry submission", exact: true }).waitFor();
    assert.equal(await form.getByLabel("Title", { exact: true }).inputValue(), "Fixture oak table");
    assert.equal(await form.getByLabel("Title", { exact: true }).isDisabled(), true);
    await page.screenshot({ path: resolve(output, `shared-pending-post-${viewport.width}.png`) });
    await form.getByRole("button", { name: "Retry submission", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Fixture permission changed" }).waitFor();
    assert.equal(await form.getByLabel("Title", { exact: true }).isDisabled(), true);
    await page.reload();
    await form.getByRole("button", { name: "Retry submission", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Listing submitted for Bluebird review." })
      .waitFor();
    assert.equal(receipts.size, 1);
    assert.deepEqual(posts[0], posts[1]);
    assert.deepEqual(posts[0], posts[2]);
    assert.equal(uploads.length, 2);
    assert.equal(posts[0].body.priceCents, 12550);
    assert.equal(posts[0].body.city, "Twin Falls");
    assert.equal(posts[0].body.region, "Magic Valley");
    assert.equal(posts[0].body.publicMediaPaths[0], posts[0].body.evidencePaths[0]);
    assert.equal(
      await page.evaluate(() =>
        sessionStorage.getItem("bb-draft-posting-11111111-1111-4111-8111-111111111111"),
      ),
      null,
    );
    await page.getByRole("button", { name: "Create a listing", exact: true }).click();
    assert.equal(await form.getByLabel("Title", { exact: true }).inputValue(), "");
    enabled = false;
    await page.reload();
    await page.getByRole("heading", { name: "Create a listing", exact: true }).waitFor();
    await form.getByLabel("Title", { exact: true }).fill("Disabled fixture");
    await form.getByLabel(/^Category/).selectOption("general");
    await form.getByLabel(/^Item type/).fill("Table");
    await form.getByLabel("Price (USD)", { exact: true }).fill("20");
    await form
      .getByLabel("Item description", { exact: true })
      .fill("A fixture description for the disabled database gate.");
    await form.getByLabel(/^City/).fill("Boise");
    await form.getByLabel("Title", { exact: true }).click();
    await form.getByRole("button", { name: "Submit listing", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Posting is temporarily unavailable. Your draft is still here." })
      .waitFor();
    assert.equal(uploads.length, 2);
    assert.equal(posts.length, 3);
    await page.evaluate(() => sessionStorage.setItem("fixture.other", "true"));
    await page.reload();
    await page.getByRole("heading", { name: "Create a listing", exact: true }).waitFor();
    assert.equal(await form.getByLabel("Title", { exact: true }).inputValue(), "");
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    results.push({
      viewport,
      sharedSellerSetup: true,
      preservedSellerSettings: true,
      allSixWebsiteForms: true,
      vinAutofill: true,
      cityRegionValidation: true,
      draftRestoration: true,
      accountDraftIsolation: true,
      ineligibleCategoryAbsent: true,
      lostResponseRecoveryAfterReload: true,
      sameReceiptAndPhotos: true,
      oneLogicalListing: true,
      pendingReviewConfirmation: true,
      missingDatabaseGatePreventsUploads: true,
      horizontalOverflow: false,
    });
    await page.close();
  }
  assert.deepEqual(errors, []);
  const report = {
    mode: "Synthetic authenticated browser fixture; no real accounts, files or listings created",
    results,
    javascriptErrors: errors,
  };
  await writeFile(resolve(output, "posting-results.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
