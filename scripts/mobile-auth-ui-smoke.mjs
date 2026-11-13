import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
const { chromium } = await import(
  new URL("../apps/mobile/node_modules/playwright/index.mjs", import.meta.url)
);
const output = resolve(process.env.BLUEBIRD_MOBILE_EVIDENCE || "/tmp/bluebird-mobile-auth-ui");
await mkdir(output, { recursive: true });
const port = 5190,
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
let browser;
const results = [],
  errors = [];
try {
  const deadline = Date.now() + 30000;
  for (;;) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    if (Date.now() > deadline) throw Error("Preview did not start");
    await pause(150);
  }
  browser = await chromium.launch({ channel: process.env.BLUEBIRD_BROWSER_CHANNEL || "chrome" });
  for (const viewport of [
    { width: 320, height: 740 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
  ]) {
    const page = await browser.newPage({ viewport });
    page.on("pageerror", (e) => errors.push(e.message));
    const calls = [];
    await page.route("https://fixture.supabase.co/**", async (route) => {
      const request = route.request();
      const headers = {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json",
      };
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const path = new URL(request.url()).pathname,
        body = request.postDataJSON();
      calls.push({ path, body });
      // This fixture never reaches Supabase or sends an email.
      assert(["/auth/v1/otp", "/auth/v1/recover", "/auth/v1/signup"].includes(path), path);
      return route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify(
          path.endsWith("signup")
            ? {
                id: "11111111-1111-4111-8111-111111111111",
                email: "qa@example.invalid",
                identities: [],
              }
            : {},
        ),
      });
    });
    await page.route("https://fixture.bluebird.invalid/api/mobile/v1/**", (route) => {
      const path = new URL(route.request().url()).pathname.split("/v1/")[1];
      const data =
        path === "bootstrap"
          ? {
              policyVersion: "2026-11-12",
              categories: [],
              features: { push: false, advertising: false, paidUpgrades: false },
              supabaseUrl: "https://fixture.supabase.co",
              supabaseKey: "sb_publishable_fixture",
            }
          : path === "home"
            ? { motors: [], recent: [] }
            : path === "shopping"
              ? {
                  personalization: false,
                  trackingAvailable: true,
                  recommendationsAvailable: true,
                  version: "2026-11-12",
                }
              : { items: [] };
      return route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Headers": "*",
        },
        body: JSON.stringify({ data }),
      });
    });
    await page.goto(origin);
    await page.getByRole("heading", { name: /^Find / }).waitFor();
    const primary = page.getByRole("navigation", { name: "Primary", exact: true });
    assert.deepEqual(await primary.getByRole("link").allTextContents(), [
      "Home",
      "Search",
      "Sell",
      "Saved",
      "Messages",
    ]);
    await page.getByRole("button", { name: "Open menu", exact: true }).click();
    assert.equal(await page.getByRole("link", { name: /Firearms/ }).count(), 0);
    const groupRequest = page.waitForRequest(
      (request) => new URL(request.url()).searchParams.get("group") === "motors",
    );
    await page
      .getByRole("link", { name: "Vehicles Cars, trucks, RVs & trailers", exact: true })
      .click();
    await groupRequest;
    await page.waitForFunction(() => location.hash === "#/search");
    assert.equal(
      await page.getByRole("combobox", { name: "Category", exact: true }).innerText(),
      "Vehicles",
    );
    await primary.getByRole("link", { name: "Sell", exact: true }).click();
    await page
      .getByRole("heading", { name: "Sign in to post your listing", exact: true })
      .waitFor();
    await page.locator("header").getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByRole("heading", { name: "Sign in to Bluebird Marketplace", exact: true })
      .waitFor();
    await page.screenshot({ path: resolve(output, `shared-signin-${viewport.width}.png`) });
    assert.equal(
      await page.getByRole("navigation", { name: "Primary" }).count(),
      0,
      "Website hides bottom tabs during authentication",
    );
    await page.getByRole("button", { name: "Email me a sign-in link", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Enter your email address first." }).waitFor();
    assert.equal(calls.length, 0);
    await page.getByLabel("Email", { exact: true }).fill("qa@example.invalid");
    await page.getByRole("button", { name: "Email me a sign-in link", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "a sign-in link is on its way" }).waitFor();
    assert.equal(calls[0].path, "/auth/v1/otp");
    assert.equal(
      calls[0].body.create_user,
      false,
      "Sign-in link cannot create an account without signup choices",
    );
    await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
    await page.getByRole("heading", { name: "Reset your password", exact: true }).waitFor();
    await page.getByRole("button", { name: "Send reset email", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Password reset email sent." }).waitFor();
    assert.equal(calls[1].path, "/auth/v1/recover");
    await page.getByRole("button", { name: "Back to sign in", exact: true }).click();
    await page.getByRole("button", { name: "Need an account? Create one", exact: true }).click();
    assert.equal(await page.getByRole("checkbox").count(), 2);
    assert.equal(await page.getByRole("checkbox").nth(1).isChecked(), false);
    await page.getByRole("button", { name: "Continue with Google", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Please agree to the Terms of Service" })
      .waitFor();
    assert.equal(calls.length, 2, "Social signup requires the same explicit terms choice");
    await page.getByLabel("Display name", { exact: true }).fill("Fixture shopper");
    await page.getByLabel("Password", { exact: true }).fill("fixture-only-password");
    await page.getByRole("checkbox").first().check();
    await page.screenshot({ path: resolve(output, `shared-signup-${viewport.width}.png`) });
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await page.getByText("Check your email", { exact: true }).waitFor();
    assert.equal(calls[2].path, "/auth/v1/signup");
    assert.equal(calls[2].body.data.display_name, "Fixture shopper");
    assert.equal(calls[2].body.data.shopping_terms_version, "2026-11-12");
    assert.equal(calls[2].body.data.shopping_alerts, false);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    results.push({
      viewport,
      websitePhoneTabs: true,
      vehicleGroupMenuRetainsScope: true,
      appIneligibleCategoryAbsent: true,
      sellPreservesSignInIntent: true,
      sharedAuthModes: true,
      signInLinkDoesNotCreateAccount: true,
      requiredTermsForSocialSignup: true,
      optionalAlertsUnchecked: true,
      explicitSignupMetadata: true,
      confirmationRequired: true,
      horizontalOverflow: false,
    });
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(output, "auth-results.json"),
    JSON.stringify(
      {
        mode: "Synthetic browser fixture; no accounts/emails created",
        results,
        javascriptErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ results, javascriptErrors: errors }));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
