import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { mobileCategories } from "../src/lib/mobile-contract.ts";
const { chromium } = await import(
  new URL("../apps/mobile/node_modules/playwright/index.mjs", import.meta.url)
);
const output = resolve(process.env.BLUEBIRD_MOBILE_EVIDENCE || "/tmp/bluebird-mobile-shopping-ui");
await mkdir(output, { recursive: true });
const port = Number(process.env.BLUEBIRD_MOBILE_TEST_PORT || 5188),
  origin = "http://127.0.0.1:" + port,
  api = "https://fixture.bluebird.invalid/api/mobile/v1/";
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
const results = [];
try {
  const deadline = Date.now() + 30000;
  while (true) {
    if (server.exitCode !== null) throw Error("Preview exited before startup");
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
    const page = await browser.newPage({ viewport }),
      errors = [],
      events = [],
      choices = new Map(),
      dismissed = new Map();
    let consentUnavailable = false;
    const cards = [
      {
        id: "dealerfeed-fixture-car",
        productId: "",
        title: "Fixture family car",
        categorySlug: "cars-trucks",
        categoryName: "Cars & Trucks",
        priceCents: 1000000,
        priceLabel: "$10,000",
        currency: "USD",
        city: "Boise",
        state: "ID",
        imageUrl: null,
        createdAt: new Date().toISOString(),
        canSave: true,
        canMessage: false,
      },
      {
        id: "dealerfeed-fixture-other",
        productId: "",
        title: "Fixture pickup",
        categorySlug: "cars-trucks",
        categoryName: "Cars & Trucks",
        priceCents: 2000000,
        priceLabel: "$20,000",
        currency: "USD",
        city: "Boise",
        state: "ID",
        imageUrl: null,
        createdAt: new Date().toISOString(),
        canSave: true,
        canMessage: false,
      },
    ];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route(api + "**", async (route) => {
      const request = route.request(),
        url = new URL(request.url()),
        path = url.pathname.replace("/api/mobile/v1/", ""),
        method = request.method(),
        id = request.headers()["x-bluebird-install"];
      const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,X-Bluebird-Install,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
        "Content-Type": "application/json",
      };
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
      let data;
      if (path === "bootstrap")
        data = {
          policyVersion: "2026-11-12",
          supabaseUrl: "https://fixture.supabase.co",
          supabaseKey: "sb_publishable_fixture",
          categories: mobileCategories,
          features: { push: false, advertising: false, paidUpgrades: false },
        };
      else if (path === "home")
        data = { motors: cards.map((card) => ({ ...card, state: "ID" })), recent: [] };
      else if (path === "shopping") {
        if (consentUnavailable)
          return route.fulfill({
            status: 503,
            headers,
            body: JSON.stringify({ error: { message: "Temporarily unavailable" } }),
          });
        data = {
          personalization: choices.get(id) === true,
          trackingAvailable: true,
          recommendationsAvailable: true,
          version: "2026-11-12",
        };
      } else if (path === "shopping/privacy") {
        choices.set(id, request.postDataJSON().personalization);
        data = { personalization: choices.get(id) };
      } else if (path === "shopping/clear") {
        dismissed.delete(id);
        data = { cleared: true };
      } else if (path === "recommendations")
        data = {
          recent: [],
          continuing: [],
          recommended: choices.get(id)
            ? cards.filter((card) => !dismissed.get(id)?.has(card.id))
            : [],
          model: "fixture-v1",
        };
      else if (path === "activity") {
        const batch = request.postDataJSON().events;
        events.push(...batch.map((event) => ({ ...event, install: id })));
        for (const event of batch)
          if (event.kind === "dismiss") {
            if (!dismissed.has(id)) dismissed.set(id, new Set());
            dismissed.get(id).add(event.listingId);
          }
        data = { accepted: batch.length };
      } else if (path === "listings") data = { items: cards, nextPage: null, incomplete: false };
      else if (path.startsWith("listings/"))
        data = {
          ...cards.find((card) => card.id === path.slice(9)),
          description: "A synthetic listing for privacy and navigation verification.",
        };
      else if (path === "similar") data = { cards: [], model: "fixture-v1" };
      else
        return route.fulfill({
          status: 404,
          headers,
          body: JSON.stringify({ error: { message: "Unexpected fixture endpoint " + path } }),
        });
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({ data, requestId: "fixture" }),
      });
    });
    await page.goto(origin);
    await page.getByRole("heading", { name: /^Find / }).waitFor();
    await page.waitForTimeout(3000);
    assert.equal(events.length, 0, "No activity before personalization permission");
    await page.getByRole("button", { name: "Open menu", exact: true }).click();
    await page.getByRole("button", { name: "Privacy choices", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox").click();
    await page.waitForFunction(() => document.querySelector("dialog input")?.checked === true);
    await page.waitForTimeout(1600);
    assert.equal(events.length, 0, "Listings behind privacy controls are not visible impressions");
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    await page.getByRole("heading", { name: "Recommended for you", exact: true }).waitFor();
    const request = page.waitForRequest(
      (request) => request.url().endsWith("/activity") && request.method() === "POST",
    );
    await request;
    await page.waitForTimeout(100);
    assert(
      events.some(
        (event) => event.kind === "impression" && event.context.source === "recommendation",
      ),
    );
    assert(events.every((event) => !Object.hasOwn(event.context, "fingerprint")));
    await page.screenshot({ path: resolve(output, "recommendations-" + viewport.width + ".png") });
    await page.getByRole("button", { name: "Dismiss Fixture family car", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelectorAll(".recommendations .listing-card").length === 1,
    );
    assert(events.some((event) => event.kind === "dismiss"));
    await page.reload();
    await page.getByRole("heading", { name: "Recommended for you", exact: true }).waitFor();
    assert.equal(
      await page.locator(".recommendations .listing-card").count(),
      1,
      "Acknowledged dismissals survive reload",
    );
    await page.getByRole("combobox", { name: "Category", exact: true }).click();
    await page.getByRole("option", { name: "Cars & Trucks", exact: true }).click();
    await page
      .getByRole("heading", { name: "Recommended for you", exact: true })
      .waitFor({ state: "hidden" });
    await page.getByRole("combobox", { name: "Category", exact: true }).click();
    await page.getByRole("option", { name: "All categories", exact: true }).click();
    await page.getByLabel("Sort listings", { exact: true }).selectOption("price_high");
    await page
      .getByRole("heading", { name: "Recommended for you", exact: true })
      .waitFor({ state: "hidden" });
    await page.getByLabel("Sort listings", { exact: true }).selectOption("newest");
    await page.getByRole("button", { name: "Open menu", exact: true }).click();
    await page.getByRole("button", { name: "Privacy choices", exact: true }).click();
    await dialog.getByRole("checkbox").click();
    await page.waitForFunction(() => document.querySelector("dialog input")?.checked === false);
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    await page
      .getByRole("heading", { name: "Recommended for you", exact: true })
      .waitFor({ state: "hidden" });
    await page.waitForTimeout(3000);
    const cutoff = events.length;
    await page.locator(".listing-card").first().click();
    await page.getByRole("heading", { name: "Fixture family car", exact: true }).waitFor();
    await page.waitForTimeout(3000);
    assert.equal(events.length, cutoff, "Withdrawn personalization stops new detail activity");
    await page.getByRole("button", { name: "Open menu", exact: true }).click();
    await page.getByRole("button", { name: "Privacy choices", exact: true }).click();
    const oldInstall = await page.evaluate(() =>
      localStorage.getItem("bluebird-mobile-install-v1"),
    );
    page.once("dialog", (dialog) => dialog.accept());
    await dialog.getByRole("button", { name: "Clear shopping history", exact: true }).click();
    await page.waitForFunction(
      (old) => localStorage.getItem("bluebird-mobile-install-v1") !== old,
      oldInstall,
    );
    assert.equal(await dialog.getByRole("checkbox").isChecked(), false);
    await page.screenshot({ path: resolve(output, "privacy-" + viewport.width + ".png") });
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    consentUnavailable = true;
    await page.reload();
    await page.getByRole("button", { name: "Open menu", exact: true }).click();
    await page.getByRole("button", { name: "Privacy choices", exact: true }).click();
    await dialog.getByText("Privacy choices could not be loaded.", { exact: true }).waitFor();
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    await page.locator('header a[href="#/"]').click();
    await page.getByRole("heading", { name: /^Find / }).waitFor();
    await page.locator(".listing-card").first().waitFor();
    assert.deepEqual(errors, []);
    results.push({
      viewport,
      activityBeforePermission: 0,
      visibleImpressions: true,
      acknowledgedDismissal: true,
      filtersAuthoritative: true,
      withdrawalStopsActivity: true,
      guestIdentifierReset: true,
      consentOutageKeepsBrowsing: true,
      horizontalOverflow: false,
      javascriptErrors: errors,
    });
    await page.close();
  }
  await writeFile(
    resolve(output, "shopping-results.json"),
    JSON.stringify(
      {
        mode: "Synthetic API fixtures in real Chromium; no real account writes or messages",
        results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ results }));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
