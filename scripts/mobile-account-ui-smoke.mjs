import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
const { chromium } = await import(
  new URL("../apps/mobile/node_modules/playwright/index.mjs", import.meta.url)
);
const output = resolve(process.env.BLUEBIRD_MOBILE_EVIDENCE || "/tmp/bluebird-mobile-account-ui");
await mkdir(output, { recursive: true });
const port = 5193,
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
  b = "22222222-2222-4222-8222-222222222222";
function session(actor) {
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
}
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
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
    { width: 320, height: 740 },
    { width: 390, height: 844 },
    { width: 1280, height: 900 },
  ]) {
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.error(e.message);
    });
    await page.addInitScript(
      ({ sessions, first }) => {
        if (sessionStorage.getItem("fixture.loggedout") !== "true")
          localStorage.setItem(
            "bluebird-mobile-auth",
            JSON.stringify(sessions[sessionStorage.getItem("fixture.actor") || first]),
          );
      },
      { sessions: { [a]: session(a), [b]: session(b) }, first: a },
    );
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    };
    const profile = (actor) => ({
      userId: actor,
      email: session(actor).user.email,
      emailVerified: true,
      phoneVerified: false,
      googleConnected: true,
      lastSignInAt: "2026-11-12T10:00:00Z",
      displayName: actor === a ? "First fixture" : "Second fixture",
      avatarUrl: null,
      homeResortCode: "ID",
      primaryIntent: "buying",
      onboardedAt: "2026-11-01T00:00:00Z",
      createdAt: "2026-09-01T00:00:00Z",
      roles: ["user"],
      completion: 1,
    });
    const members = new Map([
        [a, profile(a)],
        [b, profile(b)],
      ]),
      contacts = new Map(),
      preferences = new Map(),
      consents = new Map(),
      deletions = new Set();
    const defaultContact = {
      allowEmail: true,
      allowPhone: false,
      allowText: false,
      showContactButtons: true,
      allowInternalMessages: true,
    };
    const defaultPrefs = {
      messageAlerts: true,
      listingActivity: true,
      savedSearchMatches: true,
      reviewRequests: true,
      listingUpgradeReceipts: true,
      productUpdates: false,
      marketingEmail: false,
    };
    for (const actor of [a, b]) {
      contacts.set(actor, { ...defaultContact });
      preferences.set(actor, { ...defaultPrefs });
      consents.set(actor, { terms_version: "2026-11-12", shopping_alerts: false });
    }
    let accountControls = false,
      overviewReady = false,
      overviewOutage = false,
      activityOutage = false,
      preferenceReads = 0,
      contactOutage = true,
      profileFailure = true,
      contactFailure = true,
      alertFailure = true;
    const uploads = [],
      writes = [],
      authCalls = [],
      revocations = [],
      activity = [];
    await page.route("https://fixture.supabase.co/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const path = decodeURIComponent(url.pathname);
      if (path.startsWith("/storage/v1/object/public/profile-avatars/"))
        return route.fulfill({ status: 200, contentType: "image/png", body: png });
      if (path.startsWith("/storage/v1/object/profile-avatars/")) {
        uploads.push(path.split("profile-avatars/")[1]);
        return route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify({ Key: path, Id: "fixture-upload" }),
        });
      }
      if (path === "/auth/v1/recover") {
        authCalls.push({
          path,
          body: req.postDataJSON(),
          redirect: url.searchParams.get("redirect_to"),
        });
        return route.fulfill({ status: 200, headers, body: "{}" });
      }
      if (path === "/auth/v1/logout") {
        authCalls.push({ path, scope: url.searchParams.get("scope") });
        await page.evaluate(() => sessionStorage.setItem("fixture.loggedout", "true"));
        return route.fulfill({ status: 200, headers, body: "{}" });
      }
      if (path === "/auth/v1/user")
        return route.fulfill({ status: 200, headers, body: JSON.stringify(session(a).user) });
      throw Error("Unexpected Supabase fixture " + path);
    });
    await page.route("https://fixture.bluebird.invalid/api/mobile/v1/**", async (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const path = new URL(req.url()).pathname.split("/v1/")[1],
        method = req.method(),
        body = method === "GET" || method === "DELETE" ? null : req.postDataJSON();
      const authorization = req.headers().authorization,
        actor = authorization
          ? JSON.parse(
              Buffer.from(authorization.split(" ")[1].split(".")[1], "base64url").toString(),
            ).sub
          : null;
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
          categories: [],
          features: {
            accountControls,
            accountOverview: overviewReady,
            notificationCenter: overviewReady,
            push: false,
            advertising: false,
            paidUpgrades: false,
            conversationAttachments: false,
            durablePosting: false,
          },
        };
      else if (path === "account")
        data = { account: members.get(actor), consent: consents.get(actor) };
      else if (path === "account/overview") {
        if (overviewOutage) return fail(503, "Fixture overview unavailable.");
        data = {
          ownerId: actor,
          watchlistCount: actor === a ? 3 : 8,
          activeListings: 2,
          pendingListings: 1,
          completedSalesCount: 4,
        };
      } else if (path === "saved-searches") data = { items: [{ id: "fixture-search" }] };
      else if (path === "notifications") {
        if (activityOutage) return fail(503, "Fixture activity unavailable.");
        data = {
          ownerId: actor,
          unread: 2,
          unreadMessages: 1,
          items: [
            {
              id: "fixture-notice",
              title: actor === a ? "First account activity" : "Second account activity",
              body: "Fixture update",
              readAt: null,
              createdAt: "2026-11-12T12:00:00Z",
            },
          ],
        };
      } else if (path === "account/contact-preferences" && method === "GET") {
        preferenceReads++;
        if (contactOutage) return fail(503, "Fixture contact settings unavailable.");
        data = contacts.get(actor);
      } else if (path === "account/notification-preferences" && method === "GET")
        data = preferences.get(actor);
      else if (path === "seller")
        data = {
          exists: true,
          termsAccepted: true,
          displayName: "Fixture shop",
          slug: "fixture-shop",
          bio: "A fixture seller profile.",
          avatarUrl: "",
          defaultHandlingDays: 3,
        };
      else if (path === "shopping")
        data = {
          personalization: Boolean(actor),
          trackingAvailable: true,
          recommendationsAvailable: true,
        };
      else if (path === "recommendations")
        data = { recent: [], continuing: [], recommended: [], model: "fixture" };
      else if (path === "home") data = { motors: [], recent: [] };
      else if (path === "saved") data = { items: [] };
      else if (path === "conversations") data = [];
      else if (path === "activity") {
        activity.push(body);
        data = {};
      } else if (path === "account/deletion" && method === "GET")
        data = deletions.has(actor) ? { status: "requested" } : null;
      else if (path === "account/deletion" && method === "POST") {
        assert.equal(body.confirm, "DELETE");
        deletions.add(actor);
        writes.push({ path, actor, body });
        data = { status: "requested" };
      } else if (path === "account/profile" && method === "PUT") {
        if (profileFailure) {
          profileFailure = false;
          return fail(400, "Fixture profile save failed.");
        }
        members.set(actor, {
          ...members.get(actor),
          displayName: body.displayName,
          homeResortCode: body.homeResortCode,
          primaryIntent: body.primaryIntent,
        });
        writes.push({ path, actor, body });
        data = { ok: true };
      } else if (path === "account/avatar" && method === "PUT") {
        members.set(actor, {
          ...members.get(actor),
          avatarUrl: body.path
            ? "https://fixture.supabase.co/storage/v1/object/public/profile-avatars/" + body.path
            : null,
        });
        writes.push({ path, actor, body });
        data = { ok: true, avatarUrl: members.get(actor).avatarUrl };
      } else if (path === "account/contact-preferences" && method === "PUT") {
        if (contactFailure) {
          contactFailure = false;
          return fail(503, "Fixture contact save failed.");
        }
        contacts.set(actor, body);
        writes.push({ path, actor, body });
        data = { ok: true };
      } else if (path === "account/notification-preferences" && method === "PUT") {
        preferences.set(actor, body);
        writes.push({ path, actor, body });
        data = { ok: true };
      } else if (path === "consent" && method === "PUT") {
        if (alertFailure) {
          alertFailure = false;
          return fail(503, "Fixture shopping preference failed.");
        }
        consents.set(actor, { terms_version: body.version, shopping_alerts: body.shoppingAlerts });
        writes.push({ path, actor, body });
        data = consents.get(actor);
      } else if (path === "devices/all" && method === "DELETE") {
        revocations.push(actor);
        data = { removed: true };
      } else throw Error("Unexpected API fixture " + method + " " + path);
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ data }) });
    });
    await page.goto(origin + "/#/account");
    await page
      .getByRole("alert")
      .filter({ hasText: "Account controls are temporarily unavailable." })
      .waitFor();
    assert.equal(preferenceReads, 0);
    accountControls = true;
    await page.reload();
    await page
      .getByRole("alert")
      .filter({ hasText: "Fixture contact settings unavailable." })
      .waitFor();
    assert.equal(await page.getByRole("button", { name: "Save profile", exact: true }).count(), 0);
    assert.equal(writes.length, 0);
    contactOutage = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page
      .getByRole("heading", { name: "Build trust before the first message", exact: true })
      .waitFor();
    assert.equal(
      await page.getByLabel("Display name", { exact: true }).inputValue(),
      "First fixture",
    );
    await page.getByLabel("Display name", { exact: true }).fill("Updated fixture");
    await page.getByRole("checkbox", { name: /^Allow phone calls/ }).check();
    await page
      .locator("#profile-photo-upload")
      .setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: png });
    await page.getByRole("status").filter({ hasText: "Profile picture updated." }).waitFor();
    assert.equal(uploads.length, 1);
    assert(uploads[0].startsWith(a + "/avatar-"));
    assert.equal(
      await page.getByLabel("Display name", { exact: true }).inputValue(),
      "Updated fixture",
    );
    assert.equal(
      await page.getByRole("checkbox", { name: /^Allow phone calls/ }).isChecked(),
      true,
    );
    await page.getByRole("button", { name: "Save profile", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Fixture profile save failed." }).waitFor();
    assert.equal(
      await page.getByLabel("Display name", { exact: true }).inputValue(),
      "Updated fixture",
    );
    await page.getByRole("button", { name: "Save profile", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Profile saved." }).waitFor();
    const savedProfile = writes.find((w) => w.path === "account/profile");
    assert.deepEqual(savedProfile.body, {
      displayName: "Updated fixture",
      homeResortCode: "ID",
      primaryIntent: "buying",
    });
    assert.equal(savedProfile.actor, a);
    await page.getByRole("button", { name: "Save contact settings", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Fixture contact save failed." }).waitFor();
    assert.equal(
      await page.getByRole("checkbox", { name: /^Allow phone calls/ }).isChecked(),
      true,
    );
    await page.getByRole("button", { name: "Save contact settings", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Contact preferences saved." }).waitFor();
    assert.equal(contacts.get(a).allowPhone, true);
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Profile picture removed." }).waitFor();
    assert.equal(members.get(a).avatarUrl, null);
    assert.equal(
      await page.getByRole("link", { name: "View public profile", exact: true }).count(),
      0,
      "Unfiltered website storefront is not an app destination",
    );
    await page.getByRole("link", { name: "Edit seller profile", exact: true }).click();
    await page.getByRole("heading", { name: "Set up your shop", exact: true }).waitFor();
    assert.equal(new URL(page.url()).hash, "#/post/profile");
    await page.goto(origin + "/#/account/profile");
    await page
      .getByRole("heading", { name: "Build trust before the first message", exact: true })
      .waitFor();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: resolve(output, `shared-profile-${viewport.width}.png`),
      fullPage: true,
    });
    async function selectSettings() {
      const select = page.getByRole("combobox", { name: "Account section", exact: true });
      if (await select.isVisible()) await select.selectOption("settings");
      else
        await page
          .getByRole("navigation", { name: "Account sections", exact: true })
          .getByRole("button", { name: "Account & security", exact: true })
          .click();
      await page.getByRole("heading", { name: "Control your account", exact: true }).waitFor();
    }
    await selectSettings();
    assert.equal(
      await page.getByRole("checkbox", { name: /^Allow phone calls/ }).isChecked(),
      true,
    );
    assert.equal(
      await page.getByRole("checkbox", { name: "Listing upgrade receipts", exact: true }).count(),
      0,
    );
    const emailCard = page
      .getByRole("heading", { name: "Email notifications", exact: true })
      .locator("..");
    await emailCard
      .getByRole("checkbox", { name: "Bluebird product updates", exact: true })
      .check();
    await emailCard.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Email preferences saved." }).waitFor();
    assert.equal(preferences.get(a).productUpdates, true);
    assert.equal(preferences.get(a).listingUpgradeReceipts, true);
    assert.equal(consents.get(a).shopping_alerts, false);
    const alerts = page.getByRole("checkbox", {
      name: "Send me personalized emails, notifications and recommendations.",
      exact: true,
    });
    await alerts.click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Fixture shopping preference failed." })
      .waitFor();
    assert.equal(await alerts.isChecked(), false);
    await alerts.click();
    await page.getByRole("status").filter({ hasText: "Shopping preference saved." }).waitFor();
    assert.equal(await alerts.isChecked(), true);
    await alerts.click();
    await page.getByRole("status").filter({ hasText: "Shopping preference saved." }).waitFor();
    assert.equal(await alerts.isChecked(), false);
    await page.getByRole("button", { name: "Reset password", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Password reset email sent." }).waitFor();
    assert.equal(authCalls[0].body.email, "first@example.invalid");
    assert.equal(authCalls[0].redirect, origin + "/#/auth/callback");
    await page.screenshot({
      path: resolve(output, `shared-settings-${viewport.width}.png`),
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    overviewReady = true;
    overviewOutage = true;
    await page.goto(origin + "/#/account");
    await page.reload();
    await page.getByRole("alert").filter({ hasText: "Fixture overview unavailable." }).waitFor();
    assert.equal(
      await page.getByRole("heading", { name: "Seller snapshot", exact: true }).count(),
      0,
    );
    overviewOutage = false;
    await page.getByRole("button", { name: "Retry overview", exact: true }).click();
    await page
      .getByRole("heading", { name: "Welcome back, Updated fixture", exact: true })
      .waitFor();
    await page.getByText("First account activity", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Billing", exact: true }).count(), 0);
    assert.equal(
      await page.getByRole("button", { name: "Manage billing", exact: true }).count(),
      0,
    );
    assert.equal(
      await page.getByRole("link", { name: /Post a listing/ }).getAttribute("href"),
      "#/post",
    );
    assert.equal(
      await page
        .getByRole("link", { name: "Browse classifieds", exact: true })
        .getAttribute("href"),
      "#/search",
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({
      path: resolve(output, `shared-overview-${viewport.width}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "View saved listings", exact: true }).click();
    assert.equal(new URL(page.url()).hash, "#/saved");
    activityOutage = true;
    await page.goto(origin + "/#/account");
    await page.reload();
    await page.getByText("Activity unavailable", { exact: true }).waitFor();
    activityOutage = false;
    await page.getByRole("button", { name: "Retry activity", exact: true }).click();
    await page.getByText("First account activity", { exact: true }).waitFor();
    await selectSettings();
    await page.getByRole("button", { name: "Delete account", exact: true }).click();
    await page.getByLabel("Type DELETE to confirm", { exact: true }).fill("NO");
    await page.getByRole("button", { name: "Request account deletion", exact: true }).click();
    assert.equal(deletions.size, 0);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(deletions.size, 0);
    await page.getByRole("button", { name: "Delete account", exact: true }).click();
    await page.getByLabel("Type DELETE to confirm", { exact: true }).fill("DELETE");
    await page.getByRole("button", { name: "Request account deletion", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Bluebird will confirm completion." })
      .waitFor();
    assert.deepEqual([...deletions], [a]);
    await page.getByRole("button", { name: "Sign out of all devices", exact: true }).click();
    await page.getByRole("region", { name: "Marketplace homepage", exact: true }).waitFor();
    assert.deepEqual(revocations, [a]);
    assert.equal(authCalls.find((c) => c.path === "/auth/v1/logout").scope, "global");
    await page.evaluate((actor) => {
      sessionStorage.setItem("fixture.actor", actor);
      sessionStorage.removeItem("fixture.loggedout");
    }, b);
    await page.reload();
    await page.goto(origin + "/#/account");
    await page
      .getByRole("heading", { name: "Welcome back, Second fixture", exact: true })
      .waitFor();
    await page.getByText("Second account activity", { exact: true }).waitFor();
    assert.equal(await page.getByText("First account activity", { exact: true }).count(), 0);
    await page.goto(origin + "/#/account/profile");
    await page
      .getByRole("heading", { name: "Build trust before the first message", exact: true })
      .waitFor();
    assert.equal(
      await page.getByLabel("Display name", { exact: true }).inputValue(),
      "Second fixture",
    );
    assert.equal(
      await page.getByRole("checkbox", { name: /^Allow phone calls/ }).isChecked(),
      false,
    );
    await selectSettings();
    assert.equal(await page.getByText("second@example.invalid", { exact: true }).count(), 1);
    const phoneSignout = page.getByRole("button", { name: "Sign out", exact: true });
    await phoneSignout.last().click();
    await page.getByRole("region", { name: "Marketplace homepage", exact: true }).waitFor();
    assert.equal(authCalls.at(-1).scope, "local");
    assert.deepEqual(revocations, [a]);
    assert.deepEqual(activity, []);
    results.push({
      viewport,
      sharedProfileAndSettings: true,
      sharedOverview: true,
      overviewFailureAndActivityRetry: true,
      preferenceReadFailurePreventsOverwrite: true,
      profileAndContactFailurePreserveDrafts: true,
      avatarUploadAndRemoval: true,
      avatarRefreshPreservesUnsavedFields: true,
      sellerProfileLinkWorks: true,
      unfilteredStorefrontAbsent: true,
      paidControlsAbsent: true,
      shoppingConsentIndependent: true,
      failedConsentNotAcknowledged: true,
      passwordRecoveryCallback: true,
      deletionRequestRequiresConfirmation: true,
      deletionCompletionNotClaimed: true,
      globalPushRevocation: true,
      localAndGlobalSignoutDistinct: true,
      accountIsolation: true,
      privateShoppingExports: 0,
      horizontalOverflow: false,
    });
    await page.close();
  }
  assert.deepEqual(errors, []);
  const report = {
    mode: "Synthetic authenticated browser fixtures; no real accounts, profiles, files, emails or deletion requests",
    results,
    javascriptErrors: errors,
  };
  await writeFile(resolve(output, "account-results.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
