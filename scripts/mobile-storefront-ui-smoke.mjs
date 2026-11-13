import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile, rm, mkdtemp } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as pause } from "node:timers/promises";
import {
  storefrontFixture,
  storefrontActors as actors,
} from "../tests/support/mobile-storefront-fixture.mjs";
import { mobileCategories } from "../src/lib/mobile-contract.ts";
const { chromium } = await import(
  new URL("../apps/mobile/node_modules/playwright/index.mjs", import.meta.url)
);
const output = resolve(
  process.env.BLUEBIRD_MOBILE_EVIDENCE || "/tmp/bluebird-mobile-storefront-ui",
);
await mkdir(output, { recursive: true });
const origin = "http://127.0.0.1:5197",
  apiOrigin = "https://fixture.bluebird.invalid";
const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5197", "--strictPort"],
  {
    cwd: resolve("apps/mobile"),
    env: { ...process.env, VITE_MOBILE_API_ORIGIN: apiOrigin },
    stdio: "ignore",
  },
);
process.once("exit", () => server.kill("SIGTERM"));
function session(user = actors.buyer) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token:
      [
        { alg: "HS256", typ: "JWT" },
        { sub: user, aud: "authenticated", role: "authenticated", exp },
      ]
        .map((x) => Buffer.from(JSON.stringify(x)).toString("base64url"))
        .join(".") + ".fixture",
    refresh_token: "fixture-refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    user: {
      id: user,
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
      throw Error("Storefront preview did not start");
    await pause(150);
  }
  const sharedFont = await fetch(
    origin +
      "/@fs" +
      resolve("node_modules/@fontsource-variable/sora/files/sora-latin-wght-normal.woff2"),
  );
  assert.equal(sharedFont.status, 200, "The app preview must serve the actual website font");
  assert((await sharedFont.arrayBuffer()).byteLength > 1000);
  const outside = await mkdtemp(join(tmpdir(), "bluebird-fs-boundary-"));
  try {
    const probe = join(outside, "unrelated-file.txt");
    await writeFile(probe, "synthetic fixture outside the app's shared asset directories");
    const denied = await fetch(origin + "/@fs" + probe);
    assert.equal(denied.status, 403, "Unrelated local files must remain unavailable");
    await denied.body?.cancel();
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
  browser = await chromium.launch(
    process.env.BLUEBIRD_BROWSER_CHANNEL ? { channel: process.env.BLUEBIRD_BROWSER_CHANNEL } : {},
  );
  for (const viewport of [
    { width: 320, height: 740 },
    { width: 390, height: 844 },
    { width: 1280, height: 900 },
  ]) {
    const learningEnabled = viewport.width === 390;
    const f = storefrontFixture(),
      writes = [],
      events = [],
      reviews = new Map(),
      receipts = new Map();
    let ready = true,
      profileFailure = false,
      reviewFailure = false,
      loseMessage = true,
      holdReview = false,
      held = false,
      release;
    const thread = {
      id: actors.conversation,
      listingId: null,
      listingTitle: "Fixture Motors inquiry",
      buyerId: actors.buyer,
      sellerId: actors.seller,
      memberRole: "buyer",
      otherMemberId: actors.seller,
      otherMemberName: "Fixture Motors",
      lastMessageAt: "2026-11-13T12:00:00Z",
      lastReadAt: null,
      unread: true,
      createdAt: "2026-11-13T12:00:00Z",
    };
    const conversationMessages = [
      {
        id: actors.review,
        conversationId: actors.conversation,
        senderId: actors.buyer,
        senderLabel: null,
        body: "PRIVATE dealership message never leaves its conversation",
        attachmentPath: null,
        attachmentContentType: null,
        attachmentSize: null,
        attachmentUrl: null,
        createdAt: "2026-11-13T12:00:00Z",
      },
    ];
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript((s) => {
      if (!localStorage.getItem("bluebird-mobile-auth") && !localStorage.getItem("fixture-guest"))
        localStorage.setItem("bluebird-mobile-auth", JSON.stringify(s));
    }, session());
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    };
    await page.route(/https:\/\/(?:images.example|fixture.images)\.invalid\/.*/, (r) =>
      r.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#dbedf5"/><text x="50" y="200" font-size="44">Bluebird inventory fixture</text></svg>',
      }),
    );
    await page.route("https://fixture.supabase.co/**", async (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const token = req.headers().authorization?.split(" ")[1];
      const user = token?.split(".")[1]
        ? JSON.parse(Buffer.from(token.split(".")[1], "base64url")).sub
        : actors.buyer;
      return route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify(req.url().includes("/token") ? session() : session(user).user),
      });
    });
    await page.route(apiOrigin + "/api/mobile/v1/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        path = url.pathname.replace("/api/mobile/v1/", ""),
        method = req.method();
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
      const token = req.headers().authorization?.split(" ")[1],
        actor = token?.split(".")[1]
          ? JSON.parse(Buffer.from(token.split(".")[1], "base64url")).sub
          : null;
      const body = req.postData() ? JSON.parse(req.postData()) : {};
      let data;
      try {
        if (path === "bootstrap")
          data = {
            apiVersion: 1,
            policyVersion: "2026-11-12",
            supabaseUrl: "https://fixture.supabase.co",
            supabaseKey: "sb_publishable_fixture_public_key",
            categories: mobileCategories,
            features: {
              storefronts: true,
              durableDealerMessages: ready,
              listingDetails: true,
              fullSearch: true,
              accountControls: true,
              notificationCenter: true,
              durableApplications: false,
              durablePosting: false,
              durableSavedSearches: false,
              conversationAttachments: false,
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
        else if (path === "seller")
          data = {
            exists: true,
            termsAccepted: true,
            displayName: f.seller.displayName,
            slug: f.seller.slug,
            bio: f.seller.bio,
            avatarUrl: "",
            defaultHandlingDays: 3,
          };
        else if (path === "account/contact-preferences")
          data = {
            allowEmail: true,
            allowPhone: false,
            allowText: false,
            showContactButtons: true,
            allowInternalMessages: true,
          };
        else if (path === "account/notification-preferences")
          data = {
            messageAlerts: true,
            listingActivity: true,
            savedSearchMatches: true,
            reviewRequests: true,
            listingUpgradeReceipts: true,
            productUpdates: false,
            marketingEmail: false,
          };
        else if (path === "notifications")
          data = { ownerId: actor, items: [], unread: 0, unreadMessages: 0 };
        else if (path === "shopping")
          data = {
            personalization: learningEnabled,
            trackingAvailable: true,
            recommendationsAvailable: true,
          };
        else if (path === "recommendations")
          data = { recent: [], continuing: [], recommended: [], model: "fixture" };
        else if (path === "similar") data = { cards: [], model: "fixture" };
        else if (path === "activity") {
          events.push(...(body.events ?? []));
          data = { accepted: body.events?.length ?? 0 };
        } else if (path === "home") data = { motors: [], recent: [] };
        else if (path === "search" || path === "listings" || path === "saved")
          data = { items: [], nextPage: null, total: 0, incomplete: false };
        else if (path === "saved-state") data = { saved: false };
        else if (path === "sellers/fixture-seller") {
          if (profileFailure) throw Error("Fixture profile outage");
          data = {
            ...f.seller,
            reviews: [
              ...f.seller.reviews,
              ...[...reviews.values()].map((r, i) => ({
                ...r,
                id: "a" + i,
                reviewerName: "Fixture shopper",
              })),
            ],
          };
        } else if (path === "dealers/fixture-motors") {
          if (profileFailure) throw Error("Fixture profile outage");
          const page = Number(url.searchParams.get("page") ?? 1);
          data = {
            ...f.dealer,
            page,
            listings: f.dealer.listings.map((c) => ({
              ...c,
              id: page === 1 ? c.id : "dealerfeed-20000000-0000-4000-8000-000000000002",
              title: page === 1 ? c.title : "Second page vehicle",
            })),
          };
        } else if (path === "sellers/fixture-seller/review" && method === "GET") {
          if (reviewFailure) throw Error("Fixture own-review outage");
          data = reviews.get(actor) ?? null;
        } else if (path === "sellers/fixture-seller/review" && method === "PUT") {
          assert(actor);
          assert.deepEqual(Object.keys(body).sort(), ["comment", "rating"]);
          if (holdReview) {
            holdReview = false;
            held = true;
            await new Promise((r) => (release = r));
          }
          reviews.set(actor, {
            id: actors.review,
            rating: body.rating,
            comment: body.comment,
            createdAt: "2026-11-13T12:00:00Z",
          });
          writes.push({ kind: "review", actor, ...body });
          data = { ok: true };
        } else if (/^sellers\/fixture-seller\/reviews\/[^/]+\/report$/.test(path)) {
          assert(actor);
          assert.deepEqual(Object.keys(body), ["reason"]);
          writes.push({ kind: "review_report", actor, ...body });
          data = { ok: true };
        } else if (path === "dealers/fixture-motors/conversations") {
          assert(actor);
          assert(ready);
          assert.deepEqual(Object.keys(body), ["body"]);
          const id = req.headers()["idempotency-key"];
          assert(id);
          const key = actor + ":" + id;
          if (!receipts.has(key)) {
            receipts.set(key, { conversationId: actors.conversation, messageId: actors.review });
            writes.push({ kind: "dealer_message", actor, ...body, key: id });
          }
          data = receipts.get(key);
          if (loseMessage) {
            loseMessage = false;
            return route.abort("failed");
          }
        } else if (/^listings\/[^/]+\/detail$/.test(path)) {
          data = Object.values(f.details).find(
            (d) => d.listing.id === decodeURIComponent(path.split("/")[1]),
          );
          if (!data) throw Error("Fixture listing unavailable");
        } else if (/^listings\/[^/]+\/price-insight$/.test(path)) data = null;
        else if (path === `conversations/${actors.conversation}`) {
          assert([actors.buyer, actors.seller].includes(actor));
          data = { ...thread, messages: conversationMessages };
        } else if (path === `conversations/${actors.conversation}/messages`) {
          assert(actor);
          conversationMessages.push({
            ...conversationMessages[0],
            id: crypto.randomUUID(),
            body: body.body,
          });
          writes.push({ kind: "dealer_reply", actor, ...body });
          data = { ok: true };
        } else if (path === `conversations/${actors.conversation}/read`) {
          thread.unread = false;
          data = { ok: true };
        } else if (path === `conversations/${actors.conversation}/report`) {
          writes.push({ kind: "conversation_report", actor, ...body });
          data = { ok: true };
        } else if (path === "conversations")
          data = receipts.size && [actors.buyer, actors.seller].includes(actor) ? [thread] : [];
        else throw Error("Unexpected fixture request " + method + " " + path);
        return route.fulfill({ status: 200, headers, body: JSON.stringify({ data }) });
      } catch (e) {
        return route.fulfill({
          status: 503,
          headers,
          body: JSON.stringify({ error: { message: e.message } }),
        });
      }
    });
    const openSeller = async () => {
      await page.goto(origin + "/#/sellers/fixture-seller");
      await page.getByRole("heading", { name: "Fixture Seller", exact: true }).waitFor();
    };
    const openDealer = async () => {
      await page.goto(origin + "/#/dealers/fixture-motors");
      await page
        .getByRole("heading", { name: "Fixture Motors Verified dealership", exact: true })
        .waitFor();
    };
    const noOverflow = async () =>
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
    await openSeller();
    await page.getByRole("heading", { name: "Leave a review", exact: true }).waitFor();
    const loadedFonts = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts]
        .filter((font) => font.status === "loaded")
        .map((font) => font.family);
    });
    for (const family of ["Manrope Variable", "Sora Variable"])
      assert(
        loadedFonts.some((font) => font.includes(family)),
        `Actual ${family} must load`,
      );
    assert.equal(await page.locator("main main").count(), 0);
    await noOverflow();
    await page.screenshot({ path: resolve(output, `seller-${viewport.width}.png`) });
    await page.getByRole("button", { name: "4 stars", exact: true }).click();
    await page
      .getByLabel("Comment (optional)")
      .fill("PRIVATE review body stays out of shopping analytics");
    await page.getByRole("button", { name: "Submit review", exact: true }).click();
    await page.getByRole("heading", { name: "Your review", exact: true }).waitFor();
    assert.equal(reviews.get(actors.buyer).rating, 4);
    await page.getByRole("button", { name: "Edit your review", exact: true }).click();
    await page.getByLabel("Comment (optional)").fill("Updated private review text");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByRole("heading", { name: "Your review", exact: true }).waitFor();
    assert.equal(writes.filter((w) => w.kind === "review").length, 2);
    await page.getByRole("button", { name: "Flag", exact: true }).first().click();
    await page.getByPlaceholder("Reason (optional)").fill("PRIVATE moderation reason");
    await noOverflow();
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.getByText("Flagged", { exact: true }).waitFor();
    assert.equal(writes.filter((w) => w.kind === "review_report").length, 1);
    await page
      .getByRole("button", { name: "View listing from Fixture Seller", exact: true })
      .click();
    await page
      .getByRole("heading", { name: f.details.general.listing.title, exact: true })
      .first()
      .waitFor();
    assert.match(await page.evaluate(() => location.hash), /^#\/listings\//);
    await page.evaluate(async () => {
      const { flushShopping } = await import("/src/shopping.ts");
      await flushShopping();
    });
    await page.getByRole("button", { name: "Go back", exact: true }).click();
    await page.getByRole("heading", { name: "Fixture Seller", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => location.hash), "#/sellers/fixture-seller");
    await openDealer();
    await noOverflow();
    assert.equal(await page.locator("main main").count(), 0);
    await page.screenshot({ path: resolve(output, `dealer-${viewport.width}.png`) });
    const firstHash = await page.evaluate(() => location.hash);
    await page.getByRole("link", { name: /View inventory/ }).click();
    assert.equal(await page.evaluate(() => location.hash), firstHash);
    await page.locator("#dealer-inventory").waitFor();
    await page.getByRole("link", { name: "Inventory page 2", exact: true }).click();
    await page
      .locator('a[href="#/listings/dealerfeed-20000000-0000-4000-8000-000000000002"]')
      .first()
      .waitFor();
    assert.match(await page.evaluate(() => location.hash), /page=2/);
    await page.getByRole("link", { name: "Previous", exact: true }).click();
    await page.getByRole("heading", { name: "2024 Ford F-150", exact: true }).first().waitFor();
    assert(!(await page.evaluate(() => location.hash)).includes("page=2"));
    await page.getByRole("button", { name: "Contact dealership", exact: true }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Message on Bluebird", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Message Fixture Motors", exact: true })
      .fill("PRIVATE dealership message never leaves its conversation");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: /fetch|network|failed/i })
      .first()
      .waitFor();
    assert.equal(writes.filter((w) => w.kind === "dealer_message").length, 1);
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Message saved to the dealership inbox." })
      .waitFor();
    assert.equal(writes.filter((w) => w.kind === "dealer_message").length, 1);
    await page.getByRole("link", { name: "Open conversation", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Reply", exact: true })
      .fill("PRIVATE direct dealership reply");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.getByText("PRIVATE direct dealership reply", { exact: true }).waitFor();
    assert.equal(writes.filter((w) => w.kind === "dealer_reply").length, 1);
    assert.equal(
      await page.locator('a[href*="/listings/"]').count(),
      0,
      "General dealer chat does not invent a listing context",
    );
    const reportConversation = page.getByRole("button", {
      name: "Report conversation",
      exact: true,
    });
    // Wait for pending navigation scroll restoration and a stable, unobstructed control.
    await reportConversation.click({ trial: true });
    let reportBounds,
      tabBounds,
      reportReachable = false;
    const reportDeadline = Date.now() + 5000;
    do {
      await reportConversation.evaluate((node) => {
        node.scrollIntoView({ block: "center", behavior: "instant" });
        return new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
      });
      reportBounds = await reportConversation.boundingBox();
      tabBounds = await page.locator('nav[aria-label="Primary"]').boundingBox();
      reportReachable = Boolean(
        reportBounds &&
        reportBounds.y >= 0 &&
        (!tabBounds || reportBounds.y + reportBounds.height <= tabBounds.y) &&
        (await reportConversation.evaluate((node) => {
          const r = node.getBoundingClientRect();
          return node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        })),
      );
      if (!reportReachable) await pause(50);
    } while (!reportReachable && Date.now() < reportDeadline);
    if (viewport.width < 1024) assert(tabBounds, "Phone navigation remains visible");
    assert(reportReachable, JSON.stringify({ viewport, reportBounds, tabBounds }));
    await reportConversation.click();
    await page
      .getByPlaceholder("Reason for reporting")
      .fill("PRIVATE dealership moderation report");
    await page.getByRole("button", { name: "Submit report", exact: true }).click();
    await page
      .getByText("Report submitted. Bluebird moderators can now review this conversation;", {
        exact: false,
      })
      .waitFor();
    assert.equal(writes.filter((w) => w.kind === "conversation_report").length, 1);
    ready = false;
    await page.reload();
    await openDealer();
    await page.getByRole("button", { name: "Contact dealership", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Message on Bluebird", exact: true })
      .click();
    await page
      .getByText("Dealership messaging is temporarily unavailable.", { exact: false })
      .waitFor();
    assert.equal(await page.locator("#dealer-message").count(), 0);
    await page.getByRole("button", { name: "Close", exact: true }).last().click();
    ready = true;
    reviewFailure = true;
    await openSeller();
    await page.getByRole("button", { name: "Retry your review", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Submit review", exact: true }).count(), 0);
    reviewFailure = false;
    await page.getByRole("button", { name: "Retry your review", exact: true }).click();
    await page.getByRole("heading", { name: "Your review", exact: true }).waitFor();
    await page.getByRole("button", { name: "Edit your review", exact: true }).click();
    await page.getByLabel("Comment (optional)").fill("PRIVATE account A delayed review");
    holdReview = true;
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    for (let n = 0; n < 50 && !held; n++) await pause(25);
    assert(held);
    await page.evaluate(async (s) => {
      const { auth } = await import("/src/client.ts");
      await auth.auth.setSession(s);
    }, session(actors.other));
    await page.getByRole("heading", { name: "Leave a review", exact: true }).waitFor();
    await page.getByLabel("Comment (optional)").fill("PRIVATE account B independent review");
    await page.getByRole("button", { name: "Submit review", exact: true }).click();
    await page.getByRole("heading", { name: "Your review", exact: true }).waitFor();
    assert(reviews.has(actors.other));
    release();
    await pause(200);
    assert.equal(await page.getByRole("heading", { name: "Your review", exact: true }).count(), 1);
    assert(
      (
        await page
          .getByRole("heading", { name: "Your review", exact: true })
          .locator("..")
          .innerText()
      ).includes("PRIVATE account B independent review"),
    );
    profileFailure = true;
    await page.reload();
    await page.getByRole("button", { name: "Retry storefront", exact: true }).waitFor();
    profileFailure = false;
    await page.getByRole("button", { name: "Retry storefront", exact: true }).click();
    await page.getByRole("heading", { name: "Fixture Seller", exact: true }).waitFor();
    await page.evaluate(async (s) => {
      const { auth } = await import("/src/client.ts");
      await auth.auth.setSession(s);
    }, session(actors.seller));
    await page.getByRole("heading", { name: "Fixture Seller", exact: true }).waitFor();
    assert.equal(
      await page.getByRole("heading", { name: "Leave a review", exact: true }).count(),
      0,
    );
    assert.equal(await page.getByRole("heading", { name: "Your review", exact: true }).count(), 0);
    await page.goto(origin + "/#/account/profile");
    await page.getByRole("link", { name: "View public profile", exact: true }).click();
    await page.getByRole("heading", { name: "Fixture Seller", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => location.hash), "#/sellers/fixture-seller");
    await openDealer();
    await page.getByRole("button", { name: "Contact dealership", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Message on Bluebird", exact: true })
      .click();
    await page.getByRole("link", { name: "Open dealership inbox", exact: true }).waitFor();
    assert.equal(await page.locator("#dealer-message").count(), 0);
    await page.getByRole("button", { name: "Close", exact: true }).last().click();
    await openSeller();
    await page.evaluate(async () => {
      localStorage.setItem("fixture-guest", "true");
      const { auth } = await import("/src/client.ts");
      await auth.auth.signOut({ scope: "local" });
    });
    await page.getByRole("link", { name: "Sign in", exact: true }).first().waitFor();
    await page.getByRole("link", { name: "Sign in", exact: true }).first().click();
    await page.getByLabel("Email", { exact: true }).fill("fixture@example.invalid");
    await page.getByLabel("Password", { exact: true }).fill("fixture-password");
    await page.locator("main").getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("heading", { name: "Fixture Seller", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => location.hash), "#/sellers/fixture-seller");
    await page.evaluate(async () => {
      const { flushShopping } = await import("/src/shopping.ts");
      await flushShopping();
    });
    assert.equal(
      events.length > 0,
      learningEnabled,
      "Shopping activity follows its own permission",
    );
    assert(!JSON.stringify(events).includes("PRIVATE"));
    await noOverflow();
    assert(!errors.length, errors.join("\n"));
    results.push({
      viewport: viewport.width,
      sellerProfile: true,
      sharedWebsiteFontsLoaded: true,
      dealerProfile: true,
      sharedInventoryCards: true,
      listingBackReturnsToSeller: true,
      inventoryPagination: true,
      inventoryAnchorPreservesRoute: true,
      reviewSubmitEditReport: true,
      failedOwnReviewReadStopsWrites: true,
      profileFailureRetry: true,
      dealerLostResponseRetry: true,
      dealerConversationReadReplyReport: true,
      reportClearOfNavigation: true,
      dealerReadinessGate: true,
      accountSwitchIsolation: true,
      guestLoginReturn: true,
      ownProfileAndDealerInbox: true,
      accountPublicProfileLink: true,
      oneMain: true,
      overflow: false,
      privateContentExcludedFromLearning: true,
      learningEnabled,
    });
    await context.close();
  }
  await rm(resolve(output, "failure.png"), { force: true });
  await rm(resolve(output, "failure.json"), { force: true });
  await writeFile(resolve(output, "results.json"), JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ storefronts: "passed", results, errors }));
} catch (e) {
  const page = browser
    ?.contexts()
    .flatMap((c) => c.pages())
    .at(-1);
  if (page) {
    await page.screenshot({ path: resolve(output, "failure.png") }).catch(() => {});
    await writeFile(
      resolve(output, "failure.json"),
      JSON.stringify(
        {
          error: e.stack,
          url: page.url(),
          body: await page
            .locator("body")
            .innerText()
            .catch(() => ""),
          errors,
        },
        null,
        2,
      ),
    );
  }
  throw e;
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
