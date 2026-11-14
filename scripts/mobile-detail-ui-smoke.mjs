import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { detailFixture, detailActors } from "../tests/support/mobile-detail-fixture.mjs";
import { mobileCategories } from "../src/lib/mobile-contract.ts";
import {
  prepareMobileResume,
  commitMobileApplication,
} from "../src/lib/mobile-job-application.server.ts";
import { createMobileHandler } from "../src/lib/mobile-api.ts";
const { chromium } = await import(
  new URL("../apps/mobile/node_modules/playwright/index.mjs", import.meta.url)
);
const output = resolve(process.env.BLUEBIRD_MOBILE_EVIDENCE || "/tmp/bluebird-mobile-details-ui");
await mkdir(output, { recursive: true });
const origin = "http://127.0.0.1:5196",
  apiOrigin = "https://fixture.bluebird.invalid";
const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5196", "--strictPort"],
  {
    cwd: resolve("apps/mobile"),
    env: { ...process.env, VITE_MOBILE_API_ORIGIN: apiOrigin },
    stdio: "ignore",
  },
);
process.once("exit", () => server.kill("SIGTERM"));
const user = detailActors.buyer,
  other = "77777777-7777-4777-8777-777777777777";
function session(actor = user) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token:
      [
        { alg: "HS256", typ: "JWT" },
        { sub: actor, aud: "authenticated", role: "authenticated", exp },
      ]
        .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
        .join(".") + ".fixture",
    refresh_token: "fixture-refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    user: {
      id: actor,
      aud: "authenticated",
      email: "fixture@example.invalid",
      app_metadata: { provider: "email" },
      user_metadata: { display_name: "Fixture shopper" },
    },
  };
}
const errors = [],
  results = [];
let browser;
try {
  const deadline = Date.now() + 30000;
  for (;;) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    if (server.exitCode !== null || Date.now() > deadline)
      throw Error("Detail preview did not start");
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
    const f = detailFixture(),
      cards = Object.values(f).map((d) => ({
        id: d.listing.id,
        title: d.listing.title,
        productId: d.listing.productId,
        categorySlug: d.listing.categorySlug,
        categoryName: d.listing.categoryName,
        priceCents: d.listing.priceCents,
        currency: "USD",
        city: "Boise",
        state: "ID",
        imageUrl: d.listing.imageUrl,
        createdAt: d.listing.createdAt,
        canSave: d.canSave,
        display: {
          vehicle: d.listing.vehicle,
          home: d.listing.home,
          job: d.listing.job,
          service: d.listing.service,
          pet: d.listing.pet,
        },
      }));
    const byId = new Map(Object.values(f).map((d) => [d.listing.id, d]));
    const saved = new Set(),
      claims = new Map(),
      files = new Map(),
      receipts = new Map(),
      writes = [],
      requests = [];
    const learningEnabled = viewport.width === 390;
    let application = null,
      applicationOwner = null,
      ready = true,
      loseCommit = false,
      loseUpload = true,
      uploadCount = 0,
      detailFailure = false,
      claimFailure = false,
      holdMessage = false,
      releaseMessage,
      heldMessage = false;
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(
      ({ first, second }) => {
        if (!localStorage.getItem("fixture-guest") && !localStorage.getItem("bluebird-mobile-auth"))
          localStorage.setItem("bluebird-mobile-auth", JSON.stringify(first));
        window.fixtureSessions = { first, second };
        window.fixtureShares = [];
        navigator.share = async (data) => {
          window.fixtureShares.push(data);
        };
        navigator.canShare = () => true;
      },
      { first: session(), second: session(other) },
    );
    await page.route("https://fixture.images.invalid/**", (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="550"><rect width="800" height="550" fill="#dbedf5"/><text x="80" y="260" font-size="48">Bluebird listing fixture</text></svg>',
      }),
    );
    await page.route(/https:\/\/(?:www\.)?google\.com\/maps.*/, (route) =>
      route.fulfill({ contentType: "text/html", body: "<p>Fixture map</p>" }),
    );
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    };
    await page.route("https://fixture.supabase.co/**", async (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (req.url().includes("/storage/v1/")) {
        const path = decodeURIComponent(
          new URL(req.url()).pathname.split("/job-application-resumes/")[1],
        );
        const b = req.postDataBuffer();
        const form = await new Response(b, {
          headers: { "Content-Type": req.headers()["content-type"] },
        }).formData();
        const file = [...form.values()].find((value) => typeof value !== "string");
        assert(file);
        assert(!files.has(path), "A retry must reuse the existing immutable private object");
        files.set(path, { size: file.size, contentType: file.type });
        uploadCount++;
        if (loseUpload) {
          loseUpload = false;
          return route.abort("failed");
        }
        return route.fulfill({ status: 200, headers, body: JSON.stringify({ Key: path }) });
      }
      const token = req.headers().authorization?.split(" ")[1];
      const actor = token?.split(".")[1]
        ? JSON.parse(Buffer.from(token.split(".")[1], "base64url")).sub
        : user;
      return route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify(req.url().includes("/token") ? session() : session(actor).user),
      });
    });
    await page.route(apiOrigin + "/api/mobile/v1/**", async (route) => {
      const req = route.request(),
        u = new URL(req.url()),
        path = u.pathname.split("/v1/")[1],
        method = req.method();
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
      const token = req.headers().authorization?.split(" ")[1],
        actor = token ? JSON.parse(Buffer.from(token.split(".")[1], "base64url")).sub : null;
      let body = req.postData() ? JSON.parse(req.postData()) : undefined;
      requests.push({ path, method, actor, body });
      try {
        let data;
        if (path === "bootstrap")
          data = {
            policyVersion: "2026-11-12",
            supabaseUrl: "https://fixture.supabase.co",
            supabaseKey: "sb_publishable_fixture",
            categories: mobileCategories,
            features: {
              accountControls: true,
              fullSearch: true,
              notificationCenter: true,
              listingDetails: true,
              durableApplications: ready,
              conversationAttachments: false,
              durablePosting: false,
              durableSavedSearches: false,
              push: false,
              advertising: false,
              paidUpgrades: false,
            },
          };
        else if (path === "account")
          data = {
            account: {
              userId: actor,
              displayName: "Fixture shopper",
              email: "fixture@example.invalid",
              avatarUrl: null,
              onboardedAt: "2026-11-01",
              primaryIntent: "buying",
              homeResortCode: "ID",
              roles: ["user"],
              completion: 1,
            },
            consent: { terms_version: "2026-11-12", shopping_alerts: false },
          };
        else if (path === "notifications")
          data = { items: [], unread: 0, unreadMessages: 0, ownerId: actor };
        else if (path === "shopping")
          data = {
            personalization: learningEnabled,
            trackingAvailable: true,
            recommendationsAvailable: true,
          };
        else if (path === "recommendations")
          data = { recent: [], continuing: [], recommended: [], model: "fixture" };
        else if (path === "similar") data = { cards: [], model: "fixture" };
        else if (path === "activity") data = { accepted: body.events.length };
        else if (path === "home") data = { motors: cards.slice(1, 2), recent: cards.slice(0, 1) };
        else if (path === "search" || path === "listings")
          data = { items: cards, nextPage: null, incomplete: false, total: cards.length };
        else if (path === "saved" && method === "GET")
          data = { items: cards.filter((c) => saved.has(`${actor}:${c.id}`)) };
        else if (path === "saved" && method === "POST") {
          assert(actor);
          if (body.saved) saved.add(`${actor}:${body.listingId}`);
          else saved.delete(`${actor}:${body.listingId}`);
          writes.push({ kind: "save", ...body });
          data = {
            ok: true,
            stats: { views: 12, favorites: 3 + (saved.has(`${actor}:${body.listingId}`) ? 1 : 0) },
          };
        } else if (path === "saved-state")
          data = { saved: saved.has(`${actor}:${u.searchParams.get("listingId")}`) };
        else if (path === "reports") {
          assert(actor);
          writes.push({ kind: "report", ...body });
          data = { alreadyReported: false };
        } else if (path === "conversations" && method === "POST") {
          assert(actor);
          if (holdMessage) {
            holdMessage = false;
            heldMessage = true;
            await new Promise((r) => (releaseMessage = r));
          }
          writes.push({ kind: "message", actor, ...body, key: req.headers()["idempotency-key"] });
          data = { conversationId: "88888888-8888-4888-8888-888888888888" };
        } else if (/^listings\/[^/]+\/detail$/.test(path)) {
          if (detailFailure) throw Error("Fixture detail outage");
          data = byId.get(decodeURIComponent(path.split("/")[1]));
          assert(data);
        } else if (path.endsWith("/price-insight"))
          data = { status: "unavailable", reason: "service_unavailable" };
        else if (path.endsWith("/claim")) {
          assert(actor);
          if (claimFailure) throw Error("Fixture claim outage");
          if (method === "POST") {
            assert.deepEqual(Object.keys(body).sort(), ["contact", "note", "role"]);
            claims.set(`${actor}:${path}`, {
              status: "pending",
              createdAt: new Date().toISOString(),
            });
            writes.push({ kind: "claim", actor, ...body });
          }
          data = claims.get(`${actor}:${path}`) ?? null;
        } else if (path.endsWith("/application") && method === "GET") {
          assert(actor);
          data = applicationOwner === actor ? application : null;
        } else if (path.includes("/application") && method === "POST") {
          assert(actor);
          assert(ready);
          const listingId = path.split("/")[1];
          const client = {
            storage: {
              from() {
                return {
                  info: async (p) =>
                    files.has(p) ? { data: files.get(p) } : { error: { status: 404 } },
                  createSignedUploadUrl: async () => ({ data: { token: "fixture-upload-token" } }),
                };
              },
            },
            rpc: async (name, args) => {
              assert.equal(name, "mobile_commit_job_application");
              const receiptKey = `${actor}:${args._request}`;
              const prior = receipts.get(receiptKey);
              if (prior) {
                assert.equal(prior.input, JSON.stringify(args));
                return { data: { ...prior.result, replayed: true } };
              }
              assert(files.has(args._resume_path));
              applicationOwner = actor;
              application = {
                id: "99999999-9999-4999-8999-999999999999",
                status: "submitted",
                resumePath: args._resume_path,
                coverLetter: args._cover_letter,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              const result = { ok: true, applicationId: application.id, replayed: false };
              receipts.set(receiptKey, { input: JSON.stringify(args), result });
              writes.push({ kind: "application", actor });
              return { data: result };
            },
          };
          const handle = createMobileHandler(
            async (request) =>
              path.endsWith("/resume")
                ? prepareMobileResume(request, client, actor, listingId)
                : commitMobileApplication(request, client, listingId),
            true,
          );
          const response = await handle(
            new Request(req.url(), { method, headers: req.headers(), body: JSON.stringify(body) }),
          );
          if (loseCommit && !path.endsWith("/resume") && response.ok) {
            loseCommit = false;
            return route.fulfill({
              status: 503,
              headers,
              body: JSON.stringify({
                error: { message: "Fixture acknowledgement lost after commit" },
              }),
            });
          }
          return route.fulfill({
            status: response.status,
            headers: Object.fromEntries(response.headers),
            body: await response.text(),
          });
        } else throw Error("Unexpected fixture path " + method + " " + path);
        return route.fulfill({ status: 200, headers, body: JSON.stringify({ data }) });
      } catch (e) {
        return route.fulfill({
          status: 503,
          headers,
          body: JSON.stringify({ error: { message: e.message } }),
        });
      }
    });
    const open = async (name) => {
      await page.goto(origin + "/#/listings/" + f[name].listing.id);
      await page
        .getByRole("heading", {
          name: name === "vehicle" ? "2024 Ford F-150 XLT" : f[name].listing.title,
          exact: true,
        })
        .first()
        .waitFor();
    };
    for (const name of [
      "general",
      "vehicle",
      "rent",
      "buy",
      "job",
      "partnerJob",
      "service",
      "memberService",
      "pet",
      "ended",
      "partnerHome",
      "rescue",
      "build",
      "externalVehicle",
    ]) {
      await open(name);
      await page.getByText("Page stats", { exact: true }).first().waitFor();
      const navigation = page.getByRole("navigation", { name: "Primary", exact: true });
      assert(
        await navigation.getByRole("button", { name: "Open categories", exact: true }).isVisible(),
      );
      assert(await navigation.getByRole("button", { name: "Account", exact: true }).isVisible());
      const contactBar = page.getByRole("region", { name: "Listing contact actions", exact: true });
      if (await contactBar.isVisible()) {
        const contactBox = await contactBar.boundingBox();
        const navigationBox = await navigation.boundingBox();
        assert(
          contactBox && navigationBox && contactBox.y + contactBox.height <= navigationBox.y + 1,
          "Listing contact actions stay above bottom navigation",
        );
      }
      assert.equal(await page.locator("main main").count(), 0, "Native keeps one main landmark");
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
        name + " overflows at " + viewport.width,
      );
      await page.screenshot({ path: resolve(output, `${name}-${viewport.width}.png`) });
    }
    await open("general");
    const originalHash = await page.evaluate(() => location.hash);
    await page.locator('a[href="#main-content"]').focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => location.hash), originalHash);
    assert.equal(await page.evaluate(() => document.activeElement.id), "main-content");
    await open("vehicle");
    assert.equal(await page.getByRole("link", { name: /Get a CARFAX report/ }).count(), 0);
    await page.getByRole("tab", { name: "specifications", exact: true }).click();
    await page.getByText("1FTFW1E50PFA00000", { exact: true }).waitFor();
    await page.getByRole("tab", { name: "Location", exact: true }).click();
    await page.locator('iframe[title="Listing location map"]').waitFor();
    await open("buy");
    const homeHash = await page.evaluate(() => location.hash);
    await page.locator('a[href="#home-payment"]').first().click();
    assert.equal(await page.evaluate(() => location.hash), homeHash);
    await page.waitForFunction(() => {
      const target = document.getElementById("home-payment")?.getBoundingClientRect();
      return target && target.top >= 0 && target.top < innerHeight / 2;
    });
    for (const section of ["home-overview", "home-facts"]) {
      await page.locator(`nav[aria-label="Home information"] a[href="#${section}"]`).click();
      assert.equal(await page.evaluate(() => location.hash), homeHash);
      await page.locator(`#${section}`).waitFor();
    }
    await open("service");
    await page.getByRole("tab", { name: "Reviews", exact: true }).click();
    await page.getByText(/Rated 4.6 on Google from 5 reviews/).waitFor();
    await page.getByRole("button", { name: "Claim this business", exact: true }).click();
    let dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Business phone or email we can verify you at")
      .fill("owner@example.invalid");
    await dialog.getByRole("button", { name: "Send claim", exact: true }).click();
    await page.getByText("Your claim is being reviewed.", { exact: false }).waitFor();
    assert.equal(writes.filter((w) => w.kind === "claim").length, 1);
    await open("memberService");
    await page.getByRole("tab", { name: "Reviews", exact: true }).click();
    await page.getByText("Helpful service", { exact: true }).waitFor();
    await open("general");
    await page.getByRole("button", { name: "Save Garden patio table", exact: true }).click();
    await page
      .getByRole("button", { name: "Remove Garden patio table from saved listings", exact: true })
      .waitFor();
    assert(saved.has(`${user}:${f.general.listing.id}`));
    await page.getByTitle("Saved by 4 members", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Share listing", exact: true }).click();
    await page.waitForFunction(() => window.fixtureShares.length > 0);
    assert.equal(
      await page.evaluate(() => window.fixtureShares[0]?.url),
      apiOrigin + "/listings/garden-patio-table-boise-" + f.general.listing.id,
    );
    await page.getByRole("button", { name: "Flag this listing", exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog
      .getByRole("combobox", { name: /^Reason/ })
      .selectOption({ label: "Misleading information" });
    await dialog.getByRole("button", { name: "Submit report", exact: true }).click();
    await dialog.getByText("Report received.", { exact: true }).waitFor();
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    assert.equal(writes.filter((w) => w.kind === "report").length, 1);
    await page.getByRole("button", { name: "Contact seller", exact: true }).click();
    await page
      .getByLabel("Message Fixture seller", { exact: true })
      .fill("Is this fixture table still available?");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await page.getByText("Message sent to the seller.", { exact: true }).waitFor();
    assert.equal(writes.filter((w) => w.kind === "message").length, 1);
    await open("job");
    await page.getByRole("button", { name: "Apply now", exact: true }).first().click();
    await page.getByLabel("Resume (PDF or Word)", { exact: true }).setInputFiles({
      name: "private-fixture.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 private synthetic resume"),
    });
    await page.getByLabel("Cover letter", { exact: false }).fill("PRIVATE SYNTHETIC COVER LETTER");
    loseCommit = true;
    await page.getByRole("button", { name: "Submit application", exact: true }).click();
    await page.getByText("Fixture acknowledgement lost after commit", { exact: true }).waitFor();
    await page.evaluate(async () => {
      const { resetInstallIdentifier } = await import("/src/identity.ts");
      resetInstallIdentifier();
    });
    await page.getByRole("button", { name: "Submit application", exact: true }).click();
    await page.getByText("You applied on", { exact: false }).waitFor();
    assert.equal(writes.filter((w) => w.kind === "application").length, 1);
    assert.equal(files.size, 1);
    assert.equal(uploadCount, 1);
    await page.evaluate(async () => {
      const { flushShopping } = await import("/src/shopping.ts");
      await flushShopping();
    });
    const activity = requests.filter((r) => r.path === "activity");
    assert.equal(activity.length > 0, learningEnabled);
    assert.equal(
      requests.some((r) => r.path === "advertising"),
      false,
    );
    for (const sensitive of [
      "PRIVATE SYNTHETIC COVER LETTER",
      "private-fixture.pdf",
      "private synthetic resume",
      "Is this fixture table still available?",
      "owner@example.invalid",
    ])
      assert(!JSON.stringify(activity).includes(sensitive));
    assert.equal(
      requests.some((r) => r.path.includes("checkout") || r.path.includes("billing")),
      false,
    );
    detailFailure = true;
    await page.goto(origin + "/#/listings/" + f.general.listing.id);
    await page.getByRole("button", { name: "Retry listing", exact: true }).waitFor();
    assert.equal(
      await page.getByRole("heading", { name: "Garden patio table", exact: true }).count(),
      0,
    );
    detailFailure = false;
    await page.getByRole("button", { name: "Retry listing", exact: true }).click();
    await page.getByRole("heading", { name: "Garden patio table", exact: true }).waitFor();
    ready = false;
    await page.reload();
    await open("job");
    await page.getByRole("button", { name: "Apply now", exact: true }).first().click();
    await page.getByText("You applied on", { exact: false }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Update your application", exact: true }).isDisabled(),
      true,
    );
    assert.equal(await page.locator("input[type=file]").count(), 0);

    // A failed private read remains an error, without manufacturing an unclaimed business.
    claimFailure = true;
    await open("service");
    await page.getByRole("button", { name: "Retry claim status", exact: true }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Claim this business", exact: true }).count(),
      0,
    );
    claimFailure = false;
    await page.getByRole("button", { name: "Retry claim status", exact: true }).click();
    await page.getByText("Your claim is being reviewed.", { exact: false }).waitFor();
    await open("general");
    await page.getByRole("button", { name: "Contact seller", exact: true }).click();
    await page
      .getByLabel("Message Fixture seller", { exact: true })
      .fill("First shopper delayed fixture message");
    holdMessage = true;
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    const deadline = Date.now() + 5000;
    while (!heldMessage) {
      if (Date.now() > deadline) throw Error("Message did not reach the delayed response");
      await pause(30);
    }
    await page.evaluate(async () => {
      const { auth } = await import("/src/client.ts");
      await auth.auth.setSession(window.fixtureSessions.second);
    });
    await page.getByRole("button", { name: "Contact seller", exact: true }).waitFor();
    await page.getByRole("button", { name: "Contact seller", exact: true }).click();
    await page
      .getByLabel("Message Fixture seller", { exact: true })
      .fill("Second shopper independent fixture message");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await page.getByText("Message sent to the seller.", { exact: true }).waitFor();
    assert.equal(writes.filter((w) => w.kind === "message" && w.actor === other).length, 1);
    releaseMessage();
    await page.waitForTimeout(120);
    assert.equal(await page.locator("textarea#seller-message").count(), 0);
    assert.equal(writes.filter((w) => w.kind === "message" && w.actor === user).length, 2);
    // Guest contact uses the same sheet and returns through the app's existing auth presenter.
    await page.evaluate(async () => {
      const { auth } = await import("/src/client.ts");
      await auth.auth.signOut({ scope: "local" });
      localStorage.setItem("fixture-guest", "true");
    });
    await open("general");
    await page.getByRole("button", { name: "Sign in to contact seller", exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Continue with Apple", exact: true }).waitFor();
    await dialog.getByRole("link", { name: "Create an account", exact: true }).click();
    await page.getByRole("heading", { name: /Create an account to message the seller/ }).waitFor();
    assert.equal(await page.getByRole("checkbox").count(), 2);
    assert.equal(await page.getByRole("checkbox").nth(1).isChecked(), false);
    assert.equal(await page.evaluate(() => location.hash.startsWith("#/auth?mode=signup")), true);
    await page.evaluate(() => {
      location.hash = "/auth?mode=forgot";
    });
    await page.getByRole("heading", { name: /Reset your password/ }).waitFor();
    await open("general");
    await page.getByRole("button", { name: "Sign in to contact seller", exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Email", { exact: true }).fill("fixture@example.invalid");
    await dialog.getByLabel("Password", { exact: true }).fill("fixture-password-only");
    await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByLabel("Message Fixture seller", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => location.hash), "#/listings/" + f.general.listing.id);
    results.push({
      viewport: viewport.width,
      categories: 14,
      sharedLayouts: true,
      persistentBottomControls: true,
      contactActionsAboveNavigation: true,
      oneMainLandmark: true,
      skipLinkPreservesRoute: true,
      homeSectionLinksPreserveRoute: true,
      paidReportLinkExcluded: true,
      save: true,
      shareCanonicalUrl: true,
      report: true,
      message: true,
      claim: true,
      applicationLostResponseRetry: true,
      oneResumeUpload: true,
      lostUploadAcknowledgement: true,
      privateContentExcludedFromLearning: true,
      readinessGate: true,
      sourceFailureRetry: true,
      learningEnabled,
      claimFailureRetry: true,
      accountSwitchIsolation: true,
      guestContactLogin: true,
      signupChoices: true,
      identifierResetPreservesWriteReceipt: true,
      overflow: false,
    });
    await page.close();
  }
  assert.deepEqual(errors, []);
  await Promise.all(
    ["failure.json", ...[320, 390, 1280].map((w) => `failure-${w}.png`)].map((name) =>
      rm(resolve(output, name), { force: true }),
    ),
  );
  await writeFile(
    resolve(output, "results.json"),
    JSON.stringify({ results, errors }, null, 2) + "\n",
  );
  console.log(JSON.stringify({ listingDetails: "passed", results, errors }));
} catch (error) {
  for (const context of browser?.contexts() ?? [])
    for (const page of context.pages()) {
      await page
        .screenshot({ path: resolve(output, `failure-${page.viewportSize()?.width}.png`) })
        .catch(() => {});
      await writeFile(
        resolve(output, "failure.json"),
        JSON.stringify(
          {
            error: String(error),
            pageErrors: errors,
            text: (
              await page
                .locator("body")
                .innerText()
                .catch(() => "")
            ).slice(0, 6000),
          },
          null,
          2,
        ),
      );
    }
  throw error;
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
