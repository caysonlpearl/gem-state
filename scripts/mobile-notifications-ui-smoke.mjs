import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import {
  notificationFixture,
  notificationActors,
} from "../tests/support/mobile-notification-fixture.mjs";
import {
  loadMobileNotifications,
  markMobileNotificationsRead,
} from "../src/lib/mobile-notifications.server.ts";
import { createMobileHandler } from "../src/lib/mobile-api.ts";
import { mobileCategories } from "../src/lib/mobile-contract.ts";
const { chromium } = await import(
  new URL("../apps/mobile/node_modules/playwright/index.mjs", import.meta.url)
);
const output = resolve(
  process.env.BLUEBIRD_MOBILE_EVIDENCE || "/tmp/bluebird-mobile-notifications-ui",
);
await mkdir(output, { recursive: true });
const origin = "http://127.0.0.1:5195";
const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5195", "--strictPort"],
  {
    cwd: resolve("apps/mobile"),
    env: { ...process.env, VITE_MOBILE_API_ORIGIN: "https://fixture.bluebird.invalid" },
    stdio: "ignore",
  },
);
process.once("exit", () => server.kill("SIGTERM"));
const { a, b } = notificationActors;
const session = (actor) => {
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
    expires_at: exp,
    expires_in: 3600,
    user: {
      id: actor,
      aud: "authenticated",
      email: `${actor === a ? "first" : "second"}@example.invalid`,
      app_metadata: { provider: "email" },
      user_metadata: { display_name: "Fixture shopper" },
    },
  };
};
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
      throw Error("Notification preview did not start");
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
    const f = notificationFixture(),
      page = await browser.newPage({ viewport });
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(e.message));
    let ready = true,
      holdRead = false,
      held = false,
      release;
    const requests = [];
    await page.addInitScript(
      ({ first, second }) => {
        if (!localStorage.getItem("bluebird-mobile-auth"))
          localStorage.setItem("bluebird-mobile-auth", JSON.stringify(first));
        window.fixtureSessions = { first, second };
      },
      { first: session(a), second: session(b) },
    );
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    };
    await page.route("https://fixture.supabase.co/**", async (route) => {
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const token = route.request().headers().authorization?.split(" ")[1];
      const actor = token ? JSON.parse(Buffer.from(token.split(".")[1], "base64url")).sub : a;
      return route.fulfill({ status: 200, headers, body: JSON.stringify(session(actor).user) });
    });
    await page.route("https://fixture.bluebird.invalid/api/mobile/v1/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        path = url.pathname.split("/v1/")[1],
        method = req.method();
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
      const token = req.headers().authorization?.split(" ")[1],
        actor = token ? JSON.parse(Buffer.from(token.split(".")[1], "base64url")).sub : null;
      requests.push({ actor, path, method });
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
              notificationCenter: ready,
              push: false,
              advertising: false,
              paidUpgrades: false,
              conversationAttachments: false,
              durablePosting: false,
              durableSavedSearches: false,
            },
          };
        else if (path === "account")
          data = {
            account: {
              userId: actor,
              displayName: actor === a ? "First fixture" : "Second fixture",
              email: session(actor).user.email,
              avatarUrl: null,
              onboardedAt: "2026-11-01",
              primaryIntent: "buying",
              homeResortCode: "ID",
              roles: ["user"],
              completion: 1,
            },
            consent: { terms_version: "2026-11-12", shopping_alerts: false },
          };
        else if (path === "notifications" || path === "notifications/read") {
          assert(actor);
          const handle = createMobileHandler(
            async (request) =>
              path === "notifications"
                ? loadMobileNotifications(f.client(actor), f.db, actor)
                : markMobileNotificationsRead(request, f.client(actor), f.db, actor),
            true,
          );
          const response = await handle(
            new Request(req.url(), {
              method,
              headers: req.headers(),
              ...(req.postData() ? { body: req.postData() } : {}),
            }),
          );
          if (path === "notifications/read" && holdRead) {
            holdRead = false;
            held = true;
            await new Promise((resolve) => {
              release = resolve;
            });
          }
          return route.fulfill({
            status: response.status,
            headers: Object.fromEntries(response.headers),
            body: await response.text(),
          });
        } else if (path === "shopping")
          data = {
            personalization: false,
            trackingAvailable: true,
            recommendationsAvailable: true,
          };
        else if (path === "recommendations")
          data = { recent: [], continuing: [], recommended: [], model: "fixture" };
        else if (path === "home") data = { motors: [], recent: [] };
        else if (path === "saved") data = { items: [] };
        else if (path === "similar") data = { cards: [], model: "fixture" };
        else if (path === "saved-state") data = { saved: false };
        else if (path.startsWith("listings/"))
          data = {
            id: f.ids.ask,
            productId: f.ids.ask,
            title: "Useful fixture desk",
            categorySlug: "general",
            categoryName: "All items",
            priceCents: 10000,
            currency: "USD",
            city: "Boise",
            state: "ID",
            imageUrl: null,
            images: [],
            createdAt: new Date().toISOString(),
            description: "Fixture listing details.",
            available: true,
            canSave: false,
            canMessage: false,
            display: {},
          };
        else if (path === "conversations" || path.startsWith("conversations/")) {
          const row = f.tables.conversations.find((c) => c.id === f.ids.conversation);
          const me = row.conversation_participants.find((p) => p.user_id === actor);
          const summary = {
            id: row.id,
            listingId: row.listing_id,
            listingTitle: "Useful fixture desk",
            buyerId: a,
            sellerId: b,
            memberRole: actor === a ? "buyer" : "seller",
            otherMemberId: actor === a ? b : a,
            otherMemberName: "Fixture member",
            lastMessageAt: row.last_message_at,
            lastReadAt: me.last_read_at,
            unread: !me.last_read_at,
            createdAt: row.last_message_at,
          };
          if (path.endsWith("/read")) {
            me.last_read_at = new Date().toISOString();
            data = { ok: true };
          } else data = path === "conversations" ? [summary] : { ...summary, messages: [] };
        } else if (path === "activity" || path === "advertising")
          throw Error("Private notification UI must not export shopping or advertising activity");
        else throw Error(`Unexpected notification fixture ${method} ${path}`);
        return route.fulfill({ status: 200, headers, body: JSON.stringify({ data }) });
      } catch (error) {
        if (!String(error).includes("Fixture response lost")) errors.push(error.message);
        return route.fulfill({
          status: 503,
          headers,
          body: JSON.stringify({
            error: { code: "fixture_unavailable", message: "Fixture request unavailable" },
          }),
        });
      }
    });
    try {
      await page.goto(origin + "/#/account/notifications");
      await page.getByRole("heading", { name: "5 unread notifications", exact: true }).waitFor();
      assert.equal(
        await page.getByText("Restricted fixture notification", { exact: true }).count(),
        0,
      );
      assert.equal(await page.getByText("Blocked fixture message", { exact: true }).count(), 0);
      assert.equal(await page.getByText("Fixture paid upgrade", { exact: true }).count(), 0);
      assert.equal(await page.getByText("Second account notification", { exact: true }).count(), 0);
      await page.getByRole("button", { name: "Account", exact: true }).click();
      const menu = page.getByRole("menu", { name: "Account menu" });
      await menu.getByText("First fixture", { exact: true }).waitFor();
      assert.equal(
        await menu
          .getByRole("menuitem", { name: /Messages/ })
          .getByLabel("1 unread")
          .count(),
        1,
      );
      assert.equal(
        await menu
          .getByRole("menuitem", { name: /Notifications/ })
          .getByLabel("5 unread")
          .count(),
        1,
      );
      await page.keyboard.press("End");
      await page
        .getByRole("menuitem", { name: "Sign out", exact: true })
        .evaluate((el) => el.focus());
      await page.keyboard.press("Home");
      assert.equal(
        await menu
          .getByText("First fixture", { exact: true })
          .evaluate((el) => el.closest('[role="menuitem"]') === document.activeElement),
        true,
      );
      const hash = await page.evaluate(() => location.hash);
      await page.evaluate(async () => {
        const { dismissNativeOverlay } = await import("/src/native-back.ts");
        if (!dismissNativeOverlay()) throw Error("Account menu was not detected");
      });
      await menu.waitFor({ state: "hidden" });
      assert.equal(await page.evaluate(() => location.hash), hash);
      await page.getByLabel("Filter", { exact: true }).selectOption("message");
      assert.equal(await page.getByText("Fixture shopping update", { exact: true }).count(), 0);
      await page.getByLabel("Filter", { exact: true }).selectOption("all");
      const message = page
        .getByRole("listitem")
        .filter({ has: page.getByText("Fixture marketplace message", { exact: true }) });
      await message.getByRole("button", { name: "Mark read", exact: true }).click();
      await page.getByRole("heading", { name: "4 unread notifications", exact: true }).waitFor();
      f.loseNextRead();
      const shopping = page
        .getByRole("listitem")
        .filter({ has: page.getByText("Fixture shopping update", { exact: true }) });
      await shopping.getByRole("button", { name: "Mark read", exact: true }).click();
      await page.getByRole("button", { name: "Retry marking read", exact: true }).waitFor();
      const fresh = f.add(a, "security", "Arrived during read retry");
      await page.getByRole("button", { name: "Retry marking read", exact: true }).click();
      await page.getByRole("heading", { name: "4 unread notifications", exact: true }).waitFor();
      await page.getByText("Arrived during read retry", { exact: true }).waitFor();
      assert.equal(f.tables.notifications.find((n) => n.id === fresh.id).read_at, null);
      assert.equal(f.writes.length, 2);
      await page.getByRole("button", { name: "Mark all read", exact: true }).click();
      await page.getByRole("heading", { name: "0 unread notifications", exact: true }).waitFor();
      for (const key of ["foreign", "restrictedNotice", "blockedNotice", "paid"])
        assert.equal(f.tables.notifications.find((n) => n.id === f.rows[key].id).read_at, null);
      await message.getByRole("link", { name: "Open conversation" }).click();
      await page.waitForURL("**/#/messages/" + f.ids.conversation);
      await page
        .getByRole("region", { name: "Selected conversation" })
        .getByText("Useful fixture desk", { exact: true })
        .waitFor();
      await page.getByRole("button", { name: "Account", exact: true }).click();
      await page
        .getByRole("menu", { name: "Account menu" })
        .getByRole("menuitem", { name: /Messages/ })
        .getByLabel("1 unread")
        .waitFor({ state: "hidden" });
      await page
        .getByRole("menu")
        .getByRole("menuitem", { name: /Notifications/ })
        .click();
      await page.getByRole("heading", { name: "0 unread notifications", exact: true }).waitFor();
      await page.screenshot({
        path: resolve(output, `notifications-${viewport.width}.png`),
        fullPage: true,
      });
      for (let i = 0; i < 7; i++) f.add(a, "security", `Recent fixture ${i}`);
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page.getByRole("heading", { name: "7 unread notifications", exact: true }).waitFor();
      if (viewport.width >= 768) {
        await page.getByRole("button", { name: "Notifications, 7 unread", exact: true }).click();
        await page.getByRole("heading", { name: "2 unread notifications", exact: true }).waitFor();
        await page.screenshot({ path: resolve(output, `bell-${viewport.width}.png`) });
        await page
          .getByRole("dialog", { name: "Recent notifications" })
          .getByRole("button", { name: "Mark all read", exact: true })
          .click();
        await page.getByRole("heading", { name: "0 unread notifications", exact: true }).waitFor();
        await page.keyboard.press("Escape");
      } else {
        await page.getByRole("button", { name: "Account", exact: true }).click();
        assert.equal(
          await page
            .getByRole("menu")
            .getByRole("menuitem", { name: /Notifications/ })
            .getByLabel("7 unread")
            .count(),
          1,
        );
        await page
          .getByRole("menu")
          .getByRole("menuitem", { name: /Notifications/ })
          .click();
        await page.getByRole("button", { name: "Mark all read", exact: true }).click();
        await page.getByRole("heading", { name: "0 unread notifications", exact: true }).waitFor();
      }
      const beforeBackground = requests.filter((r) => r.path === "notifications").length;
      await page.evaluate(async () => {
        const { setShoppingForeground } = await import("/src/shopping-activity.ts");
        setShoppingForeground(false);
      });
      const late = f.add(a, "security", "First-account delayed read");
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page.waitForTimeout(100);
      assert.equal(requests.filter((r) => r.path === "notifications").length, beforeBackground);
      await page.evaluate(async () => {
        const { setShoppingForeground } = await import("/src/shopping-activity.ts");
        setShoppingForeground(true);
      });
      await page.getByRole("heading", { name: "1 unread notifications", exact: true }).waitFor();
      holdRead = true;
      await page.getByRole("button", { name: "Mark all read", exact: true }).click();
      const wait = Date.now() + 5000;
      while (!held) {
        if (Date.now() > wait) throw Error("Read did not reach the delayed response");
        await pause(30);
      }
      await page.evaluate(async () => {
        const { auth } = await import("/src/client.ts");
        await auth.auth.setSession(window.fixtureSessions.second);
      });
      await page.getByText("Second account notification", { exact: true }).waitFor();
      assert.equal(await page.getByText("First-account delayed read", { exact: true }).count(), 0);
      await page.getByRole("button", { name: "Mark all read", exact: true }).click();
      await page.getByRole("heading", { name: "0 unread notifications", exact: true }).waitFor();
      release();
      assert(f.tables.notifications.find((n) => n.id === late.id).read_at);
      assert.equal(f.writes.at(-1).actor, b);
      ready = false;
      const before = requests.filter((r) => r.path === "notifications").length;
      await page.reload();
      await page
        .getByText("Notifications are temporarily unavailable.", { exact: false })
        .waitFor();
      assert.equal(requests.filter((r) => r.path === "notifications").length, before);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false);
      results.push({
        viewport: viewport.width,
        sharedCenter: true,
        sharedHeaderMenu: true,
        safeCounts: true,
        markOneAndAll: true,
        lostResponseRetry: true,
        newArrivalNotConsumedByRetry: true,
        messageReadRefreshesBadge: true,
        previewReadsOnlyShown: true,
        accountSwitchIsolation: true,
        readinessGate: true,
        foregroundPollingOnly: true,
        overflow: false,
      });
    } finally {
      release?.();
      await page.close();
    }
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, "results.json"), JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ notificationScreens: "passed", results, errors }));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
