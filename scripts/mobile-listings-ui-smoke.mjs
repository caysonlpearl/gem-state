import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
const { chromium } = await import(
  new URL("../apps/mobile/node_modules/playwright/index.mjs", import.meta.url)
);
const output = resolve(process.env.BLUEBIRD_MOBILE_EVIDENCE || "/tmp/bluebird-mobile-listings-ui");
await mkdir(output, { recursive: true });
const port = 5197,
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
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222",
  id = "33333333-3333-4333-8333-333333333333";
function session(owner) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token:
      [
        { alg: "HS256", typ: "JWT" },
        { sub: owner, aud: "authenticated", role: "authenticated", exp },
      ]
        .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
        .join(".") + ".fixture",
    refresh_token: "fixture",
    token_type: "bearer",
    expires_at: exp,
    expires_in: 3600,
    user: {
      id: owner,
      aud: "authenticated",
      email: "fixture@example.invalid",
      app_metadata: { provider: "email" },
      user_metadata: { display_name: "Fixture" },
    },
  };
}
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
let browser;
const results = [],
  errors = [];
try {
  for (let limit = Date.now() + 30000; ;) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    if (Date.now() > limit) throw Error("Preview did not start");
    await pause(150);
  }
  browser = await chromium.launch(
    process.env.BLUEBIRD_BROWSER_CHANNEL ? { channel: process.env.BLUEBIRD_BROWSER_CHANNEL } : {},
  );
  for (const viewport of [
    { width: 320, height: 740 },
    { width: 390, height: 844 },
    { width: 1280, height: 900 },
  ]) {
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(
      ({ first, sessions }) =>
        localStorage.setItem(
          "bluebird-mobile-auth",
          JSON.stringify(sessions[sessionStorage.getItem("fixture.actor") || first]),
        ),
      { first: a, sessions: { [a]: session(a), [b]: session(b) } },
    );
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    };
    let management = true,
      ready = true,
      outage = false,
      wrongOwner = false,
      drop = true,
      stale = false,
      version = "a".repeat(64),
      status = "active",
      approvedAt = "2026-11-14T10:00:00Z",
      title = "First account bicycle",
      price = 15000,
      defer = false,
      started = false,
      release;
    const calls = [],
      actions = [],
      receipts = new Map(),
      uploads = [],
      posts = [],
      activity = [];
    const editor = () => ({
      id,
      title,
      description: "A well cared for local bicycle ready for a new home.",
      category: "general",
      priceCents: price,
      condition: "used_good",
      sellerNote: "",
      itemDetails: { itemType: "Bicycle", brand: "Example" },
      state: "ID",
      city: "Boise",
      region: "Treasure Valley",
      postalCode: "83702",
      fulfillmentMode: "local_pickup",
      vehicle: null,
      pet: null,
      home: null,
      job: null,
      service: null,
      parcelLengthIn: "",
      parcelWidthIn: "",
      parcelHeightIn: "",
      parcelWeightLb: "",
      status,
      approvedAt,
      imageUrls: ["https://images.fixture.invalid/photo.png"],
    });
    await page.route("https://images.fixture.invalid/**", (r) =>
      r.fulfill({ status: 200, contentType: "image/png", body: png }),
    );
    await page.route("https://fixture.supabase.co/**", async (route) => {
      const req = route.request(),
        path = decodeURIComponent(new URL(req.url()).pathname);
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (path.startsWith("/storage/v1/object/")) {
        uploads.push(path);
        return route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify({ Key: path, Id: randomUUID() }),
        });
      }
      if (path === "/auth/v1/user")
        return route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify(
            session(
              JSON.parse(
                Buffer.from(
                  req.headers().authorization.split(" ")[1].split(".")[1],
                  "base64url",
                ).toString(),
              ).sub,
            ).user,
          ),
        });
      throw Error("Unexpected auth path " + path);
    });
    await page.route("https://fixture.bluebird.invalid/api/mobile/v1/**", async (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const path = new URL(req.url()).pathname.split("/v1/")[1],
        method = req.method(),
        body = req.postData() ? req.postDataJSON() : null;
      const actor = req.headers().authorization
        ? JSON.parse(
            Buffer.from(
              req.headers().authorization.split(" ")[1].split(".")[1],
              "base64url",
            ).toString(),
          ).sub
        : null;
      calls.push({ path, method, actor });
      const fail = (status, message, code = "unavailable") =>
        route.fulfill({ status, headers, body: JSON.stringify({ error: { code, message } }) });
      let data;
      if (path === "bootstrap")
        data = {
          policyVersion: "2026-11-12",
          supabaseUrl: "https://fixture.supabase.co",
          supabaseKey: "sb_publishable_fixture",
          categories: [
            { slug: "general", name: "General", group: "classifieds" },
            { slug: "firearms", name: "Firearms", group: "classifieds" },
          ],
          features: {
            accountListings: ready,
            listingManagement: management,
            accountControls: true,
            push: false,
            advertising: false,
            paidUpgrades: false,
            durablePosting: true,
          },
        };
      else if (path === "account")
        data = {
          account: { userId: actor, displayName: "Fixture", onboardedAt: "2026-11-01T00:00:00Z" },
          consent: { terms_version: "2026-11-12", shopping_alerts: false },
        };
      else if (path === "account/deletion") data = null;
      else if (path === "shopping")
        data = { personalization: true, trackingAvailable: true, recommendationsAvailable: true };
      else if (path === "recommendations") data = { recent: [], continuing: [], recommended: [] };
      else if (path === "home") data = { motors: [], recent: [] };
      else if (path === "saved") data = { items: [] };
      else if (path === "conversations") data = [];
      else if (path === "activity") {
        activity.push(body);
        data = {};
      } else if (path === "seller")
        data = {
          exists: true,
          termsAccepted: true,
          displayName: "Fixture shop",
          slug: "fixture-shop",
          bio: "",
          avatarUrl: "",
          defaultHandlingDays: 3,
        };
      else if (path === "account/listings") {
        if (outage) return fail(503, "Fixture owned listings unavailable.");
        const captured = actor;
        data = {
          ownerId: wrongOwner ? b : actor,
          sellerExists: true,
          unavailableMetrics: ["offers"],
          listings: [
            {
              id,
              variantId: id,
              productName: actor === a ? title : "Second account private item",
              productSlug: "fixture-item",
              productStatus: "active",
              variantLabel: "One variation",
              priceCents: price,
              currency: "USD",
              status,
              approvedAt,
              createdAt: "2026-11-14T10:00:00Z",
              expiresAt: "2026-12-14T10:00:00Z",
              matchedOrderId: null,
              views: 7,
              impressions: 20,
              leadCount: 2,
            },
          ],
        };
        if (defer && captured === a) {
          defer = false;
          started = true;
          await new Promise((resolve) => (release = resolve));
        }
      } else if (path === `account/listings/${id}/thumbnail`)
        data = { url: "https://images.fixture.invalid/photo.png" };
      else if (path === `account/listings/${id}/version`)
        data = { ownerId: actor, listingId: id, version, status, approvedAt };
      else if (path === `account/listings/${id}/editor`)
        data = { ownerId: actor, version, editor: editor() };
      else if (path === `account/listings/${id}/manage`) {
        const key = req.headers()["idempotency-key"];
        assert(key);
        actions.push({ key, body, actor });
        if (stale && !receipts.has(key)) {
          stale = false;
          version = "e".repeat(64);
          title = "Latest website bicycle";
          return fail(
            409,
            "This listing changed. Reload it before making another change.",
            "listing_changed",
          );
        }
        if (receipts.has(key)) {
          assert.deepEqual(receipts.get(key).body, body);
          data = { listingId: id, replayed: true };
        } else {
          assert.equal(body.version, version);
          version = (body.action === "archive" ? "b" : body.action === "relist" ? "c" : "d").repeat(
            64,
          );
          if (body.action === "archive") status = "cancelled";
          else {
            status = "active";
            approvedAt = null;
          }
          if (body.action === "edit") {
            title = body.input.title;
            price = body.input.priceCents;
          }
          receipts.set(key, { body });
          data = { listingId: id, replayed: false };
          if (drop) {
            drop = false;
            return fail(503, "Fixture result unconfirmed.");
          }
        }
      } else if (path === "photos/mode") data = { mode: "supabase" };
      else if (path === "listings" && method === "POST") {
        posts.push({ key: req.headers()["idempotency-key"], body, actor });
        data = { listingId: randomUUID() };
      } else throw Error("Unexpected API path " + method + " " + path);
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ data }) });
    });
    const goto = async () => {
      await page.goto(origin + "/#/account/listings");
      await page.getByRole("heading", { name: "Your listings", exact: true }).waitFor();
    };
    await goto();
    await page.getByRole("heading", { name: title, exact: true }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Promote listing", exact: true }).count(), 0);
    assert.equal(await page.getByText("Standard placement", { exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: /Import/ }).count(), 0);
    const row = () =>
      page
        .locator("article")
        .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    assert.equal(
      await row()
        .locator("dt")
        .filter({ hasText: "Offers" })
        .locator("..")
        .locator("dd")
        .textContent(),
      "—",
    );
    await page.getByLabel("Search listings", { exact: true }).fill("missing");
    await page.getByText("No listings in this view", { exact: true }).waitFor();
    await page.getByLabel("Search listings", { exact: true }).fill("");
    if (process.env.BLUEBIRD_SKIP_LISTING_SCREENSHOTS !== "true")
      await page.screenshot({
        path: resolve(output, `listings-${viewport.width}.png`),
        fullPage: true,
      });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await row().locator("summary").click();
    page.once("dialog", (d) => d.accept());
    await row().getByRole("button", { name: "Archive listing", exact: true }).click();
    await page.getByRole("button", { name: "Retry listing change", exact: true }).waitFor();
    await page.reload();
    await page.getByRole("button", { name: "Retry listing change", exact: true }).click();
    await page
      .getByText("Listing updated. The latest status is shown below.", { exact: true })
      .waitFor();
    assert.equal(actions.length, 2);
    assert.deepEqual(actions[0], actions[1]);
    assert.equal(receipts.size, 1);
    await page.getByRole("button", { name: "Inactive", exact: true }).click();
    await page.getByRole("heading", { name: title, exact: true }).waitFor();
    await row().locator("summary").click();
    await row().getByRole("button", { name: "Restore / relist", exact: true }).click();
    await page
      .getByText("Listing updated. The latest status is shown below.", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Awaiting approval", exact: true }).click();
    await row().getByText("Awaiting approval", { exact: true }).waitFor();
    // Edit uses website fields, retains existing photos, survives committed response loss.
    await row().locator("summary").click();
    await row().getByRole("link", { name: "Edit listing", exact: true }).click();
    await page.getByRole("heading", { name: "Edit listing", exact: true }).waitFor();
    await page.getByLabel("Title", { exact: true }).fill("Updated private bicycle");
    drop = true;
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Fixture result unconfirmed." }).waitFor();
    await page.reload();
    await page.getByRole("button", { name: "Retry submission", exact: true }).click();
    await page.getByRole("heading", { name: "Listing updated", exact: true }).waitFor();
    const edits = actions.filter((c) => c.body.action === "edit");
    assert.equal(edits.length, 2);
    assert.deepEqual(edits[0], edits[1]);
    assert.deepEqual(edits[0].body.input.publicMediaPaths, []);
    assert.equal(uploads.length, 0);
    await page.getByRole("button", { name: "Your listings", exact: true }).click();
    await page.getByRole("button", { name: "Awaiting approval", exact: true }).click();
    await page.getByRole("heading", { name: title, exact: true }).waitFor();
    await row().locator("summary").click();
    await row().getByRole("link", { name: "Edit listing", exact: true }).click();
    await page.getByLabel("Title", { exact: true }).fill("Stale private draft");
    await page.reload();
    assert.equal(
      await page.getByLabel("Title", { exact: true }).inputValue(),
      "Stale private draft",
    );
    stale = true;
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByRole("button", { name: "Reload latest listing", exact: true }).waitFor();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Reload latest listing", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector('input[minlength="3"]')?.value === "Latest website bicycle",
    );
    if (process.env.BLUEBIRD_SKIP_LISTING_SCREENSHOTS !== "true")
      await page.screenshot({
        path: resolve(output, `edit-listing-${viewport.width}.png`),
        fullPage: true,
      });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    // Duplicate copies fields, never old photos; requires a new owned photo and rights.
    await page.goto(origin + `/#/post/duplicate/${id}`);
    await page.getByText("Duplicate started from an existing listing", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("Title", { exact: true }).inputValue(), title);
    assert.equal(
      await page
        .locator("select")
        .filter({ has: page.locator('option[value="firearms"]') })
        .count(),
      0,
    );
    await page.getByRole("button", { name: "Submit listing", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Add at least one listing photo." }).waitFor();
    assert.equal(posts.length, 0);
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: "item.png", mimeType: "image/png", buffer: png });
    await page
      .getByRole("checkbox", { name: "I took these photos or have permission to publish them." })
      .check();
    await page.getByRole("button", { name: "Submit listing", exact: true }).click();
    await page.getByText("Listing submitted for Bluebird review.", { exact: true }).waitFor();
    assert.equal(posts.length, 1);
    assert(posts[0].body.publicMediaPaths.every((p) => p.startsWith(a + "/")));
    assert(uploads.length > 0);
    await page.getByRole("button", { name: "Create a listing", exact: true }).click();
    await page.getByLabel("Title", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("Title", { exact: true }).inputValue(), "");
    assert.equal(
      await page.getByText("Duplicate started from an existing listing", { exact: true }).count(),
      0,
    );

    // Read failures and cross-account delayed reads never expose the previous seller's data.
    outage = true;
    await page.goto(origin + "/#/account/listings");
    await page
      .getByRole("alert")
      .filter({ hasText: "Fixture owned listings unavailable." })
      .waitFor();
    outage = false;
    await page.getByRole("button", { name: "Reload listings", exact: true }).click();
    await page.getByRole("heading", { name: "Your listings", exact: true }).waitFor();
    wrongOwner = true;
    await page.reload();
    await page.getByRole("alert").filter({ hasText: "Your account changed." }).waitFor();
    wrongOwner = false;
    defer = true;
    await page.getByRole("button", { name: "Reload listings", exact: true }).click();
    for (let n = 0; n < 50 && !started; n++) await pause(20);
    assert(started);
    await page.evaluate(async (next) => {
      sessionStorage.setItem("fixture.actor", next.user.id);
      const { auth } = await import("/src/client.ts");
      await auth.auth.setSession(next);
    }, session(b));
    await page.getByRole("button", { name: "Awaiting approval", exact: true }).click();
    await page.getByRole("heading", { name: "Second account private item", exact: true }).waitFor();
    release();
    await pause(100);
    assert.equal(await page.getByRole("heading", { name: title, exact: true }).count(), 0);
    management = false;
    await page.reload();
    await page
      .getByText(
        "Listing changes are temporarily unavailable. You can still view listings and messages.",
        { exact: true },
      )
      .waitFor();
    await page.getByRole("button", { name: "Awaiting approval", exact: true }).click();
    await page.locator("article summary").click();
    assert.equal(await page.getByRole("link", { name: "Edit listing", exact: true }).count(), 0);
    ready = false;
    await page.reload();
    await page
      .getByText("Your listings are temporarily unavailable. Please retry shortly.", {
        exact: true,
      })
      .waitFor();
    assert(!activity.some((e) => JSON.stringify(e).includes("private")));
    assert(!calls.some((c) => /billing|checkout|import/.test(c.path)));
    results.push({
      viewport,
      actions: actions.length,
      commits: receipts.size,
      duplicatePosts: posts.length,
      uploads: uploads.length,
      checks: [
        "shared workspace",
        "missing metric state",
        "no paid/import actions",
        "archive confirmed retry",
        "relist to review",
        "edit confirmed retry",
        "retained photos",
        "persisted draft",
        "stale conflict reload",
        "duplicate new photos",
        "read retry",
        "owner mismatch",
        "account switch delayed response",
        "capability unavailable",
        "no private activity",
      ],
    });
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, "results.json"), JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ output, results }, null, 2));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
