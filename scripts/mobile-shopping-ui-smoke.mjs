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
    { width: 1280, height: 900 },
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
    cards[0].display = {
      vehicle: {
        year: 2024,
        make: "Ford",
        model: "Explorer",
        trim: "Limited",
        mileage: 38200,
        transmission: "Automatic",
        fuelType: "Gasoline",
        bodyStyle: "SUV",
      },
    };
    cards.push(
      {
        ...cards[0],
        id: "member-fixture-home",
        title: "Fixture home with a long title and additional facts",
        categorySlug: "other-real-estate",
        categoryName: "Homes",
        display: {
          home: {
            mode: "rent",
            propertyType: "House",
            bedrooms: 3,
            bathrooms: 2,
            squareFeet: 1800,
          },
        },
      },
      {
        ...cards[1],
        id: "rescuegroups-fixture-pet",
        title: "Luna",
        categorySlug: "pets",
        categoryName: "Pets",
        source: "RescueGroups.org",
        display: { vehicle: null },
      },
      {
        ...cards[1],
        id: "adzuna-fixture-hidden",
        title: "Fifth hidden job",
        categorySlug: "jobs",
        categoryName: "Jobs",
        source: "Adzuna",
        display: {
          vehicle: null,
          externalJob: {
            employerName: "Fixture Employer",
            sourceUrl: "https://fixture.example.invalid/job",
          },
        },
      },
    );
    const openPrivacy = async () => {
      const menu = page.getByRole("button", { name: "Open categories", exact: true });
      if (await menu.isVisible()) await menu.click();
      await page.getByRole("button", { name: "Privacy choices", exact: true }).click();
    };
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
          features: { fullSearch: true, push: false, advertising: false, paidUpgrades: false },
        };
      else if (path === "home")
        data = { motors: cards.slice(0, 2).map((card) => ({ ...card, state: "ID" })), recent: [] };
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
          recent: choices.get(id) ? cards.filter((card) => !dismissed.get(id)?.has(card.id)) : [],
          continuing: choices.get(id)
            ? cards.filter((card) => !dismissed.get(id)?.has(card.id))
            : [],
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
      } else if (path === "listings" || path === "search")
        data = {
          items: cards,
          nextPage: null,
          incomplete: false,
          total: cards.length,
          page: Number(url.searchParams.get("page") ?? 1),
          pageSize: 24,
        };
      else if (path.startsWith("listings/"))
        data = {
          ...cards.find((card) => card.id === path.slice(9)),
          description: "A synthetic listing for privacy and navigation verification.",
        };
      else if (path === "similar")
        data = {
          cards: cards.filter((card) => card.id !== url.searchParams.get("listingId")),
          model: "fixture-similar-fallback",
        };
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
    await page.getByRole("region", { name: "Marketplace homepage", exact: true }).waitFor();
    const homeVehicles = page.getByRole("region", { name: "Vehicles", exact: true });
    const homeCards = homeVehicles.locator(".listing-card");
    await homeCards.nth(1).waitFor();
    const firstHome = await homeCards.nth(0).boundingBox();
    const secondHome = await homeCards.nth(1).boundingBox();
    assert(firstHome && secondHome);
    assert(firstHome.width <= (viewport.width - 24 - 10) / 2 + 1);
    assert(secondHome.x + secondHome.width <= viewport.width - 11, "Two complete home cards fit");
    assert(
      firstHome.height < firstHome.width * 0.75 + 115,
      "Compact card text stays within its height budget",
    );
    if (viewport.width < 640) assert(firstHome.height < 250, "Phone home cards remain short");
    assert.equal(
      await homeCards.nth(0).getByRole("heading", { level: 3 }).innerText(),
      "2024 Ford Explorer",
    );
    const titleHeight = await homeCards
      .nth(0)
      .getByRole("heading", { level: 3 })
      .evaluate((title) => {
        const text = document.createRange();
        text.selectNodeContents(title);
        const lines = new Set(
          [...text.getClientRects()].filter((rect) => rect.width > 0).map((rect) => rect.top),
        ).size;
        return {
          height: title.getBoundingClientRect().height,
          line: parseFloat(getComputedStyle(title).lineHeight),
          lines,
        };
      });
    assert(titleHeight.lines >= 1 && titleHeight.lines <= 2, "Titles use at most two text lines");
    assert(
      titleHeight.height <= titleHeight.line * titleHeight.lines + 1,
      "A title must not reserve empty lines beyond its actual text",
    );
    const homeCardText = await homeCards.nth(0).innerText();
    assert(homeCardText.includes("$10,000") && homeCardText.includes("Boise, ID"));
    assert(
      !/Limited|38,200|Automatic|Contact seller|Today/.test(homeCardText),
      "Detailed facts stay inside the listing",
    );
    await page.screenshot({ path: resolve(output, `compact-home-${viewport.width}.png`) });
    await page.waitForTimeout(3000);
    assert.equal(events.length, 0, "No activity before personalization permission");
    await openPrivacy();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox").click();
    await page.waitForFunction(() => document.querySelector("dialog input")?.checked === true);
    await page.waitForTimeout(1600);
    assert.equal(events.length, 0, "Listings behind privacy controls are not visible impressions");
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    await page.getByRole("heading", { name: "Recommended for you", exact: true }).waitFor();
    const recommendation = page
      .getByRole("heading", { name: "Recommended for you", exact: true })
      .locator("..");
    const request = page.waitForRequest(
      (request) => request.url().endsWith("/activity") && request.method() === "POST",
    );
    await recommendation.scrollIntoViewIfNeeded();
    await request;
    await page.waitForTimeout(100);
    assert(
      events.some(
        (event) => event.kind === "impression" && event.context.source === "recommendation",
      ),
    );
    assert(events.every((event) => !Object.hasOwn(event.context, "fingerprint")));
    assert.equal(
      await page.getByRole("button", { name: /Dismiss |Not interested/ }).count(),
      0,
      "The owner's latest website correction removes these controls from the app too",
    );
    await page.mouse.move(0, 0);
    const geometry = [];
    for (const title of ["Recently viewed", "Continue shopping", "Recommended for you"]) {
      const row = page.getByRole("heading", { name: title, exact: true }).locator("..");
      assert.equal(
        await row.locator("article").count(),
        4,
        "Match the website's four-card row limit",
      );
      assert.equal(await row.getByText("Fifth hidden job", { exact: true }).count(), 0);
      assert.equal(
        await row.getByRole("link", { name: "Adzuna", exact: true }).count(),
        0,
        "Do not attribute a hidden fifth listing as if it was rendered",
      );
      assert.equal(
        await row.getByRole("link", { name: "RescueGroups.org", exact: true }).count(),
        1,
      );
      const boxes = await row.locator("article").evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return { x: box.x, y: box.y, bottom: box.bottom, width: box.width };
        }),
      );
      const columns = viewport.width >= 768 ? 4 : 2;
      for (let offset = 0; offset < boxes.length; offset += columns) {
        const line = boxes.slice(offset, offset + columns);
        assert.equal(new Set(line.map((box) => Math.round(box.y))).size, 1);
        assert.equal(
          new Set(line.map((box) => Math.round(box.bottom))).size,
          1,
          "Mixed listing cards stretch to the same bottom within every row",
        );
        assert.equal(new Set(line.map((box) => Math.round(box.x))).size, columns);
      }
      assert.equal(
        await row.locator("h2").evaluate((node) => getComputedStyle(node).fontSize),
        "18px",
      );
      assert.equal(
        await row
          .locator("h3")
          .first()
          .evaluate((node) => getComputedStyle(node).color),
        await page.locator("body").evaluate((node) => getComputedStyle(node).color),
        "The app's legacy link color must not replace the website card-title color",
      );
      geometry.push({ title, columns, boxes });
    }
    await page.screenshot({ path: resolve(output, "recommendations-" + viewport.width + ".png") });
    // Preserve older acknowledged choices without bringing the removed control back.
    const currentInstall = await page.evaluate(() =>
      localStorage.getItem("bluebird-mobile-install-v1"),
    );
    dismissed.set(currentInstall, new Set(["dealerfeed-fixture-other"]));
    await page.reload();
    await page.getByRole("heading", { name: "Recommended for you", exact: true }).waitFor();
    assert.equal(await recommendation.getByText("Fixture pickup", { exact: true }).count(), 0);
    assert.equal(await recommendation.getByText("Fifth hidden job", { exact: true }).count(), 1);
    assert.equal(
      await recommendation.getByRole("link", { name: "Adzuna", exact: true }).count(),
      1,
    );
    assert(
      !events.some((event) => event.kind === "dismiss"),
      "A page read never invents a dismissal",
    );
    await page.getByRole("button", { name: "See all vehicles", exact: true }).click();
    await page
      .getByRole("heading", { name: "Recommended for you", exact: true })
      .waitFor({ state: "hidden" });
    await page.goto(origin + "/#/search?sort=price_high");
    await page.locator("#sort").selectOption("price_high");
    await page
      .getByRole("heading", { name: "Recommended for you", exact: true })
      .waitFor({ state: "hidden" });
    await page.locator("#sort").selectOption("newest");
    await page.getByRole("link", { name: "Bluebird home", exact: true }).click();
    await page.getByRole("region", { name: "Marketplace homepage", exact: true }).waitFor();
    await openPrivacy();
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
    const similar = page
      .getByRole("heading", { name: "More like this", exact: true })
      .locator("..");
    await similar.waitFor();
    assert.equal(await similar.locator("article").count(), 4);
    assert.equal(await similar.getByRole("link", { name: "Adzuna", exact: true }).count(), 1);
    await similar.scrollIntoViewIfNeeded();
    await page.waitForTimeout(3000);
    assert.equal(events.length, cutoff, "Withdrawn personalization stops new detail activity");
    await openPrivacy();
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
    await openPrivacy();
    await dialog.getByText("Privacy choices could not be loaded.", { exact: true }).waitFor();
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    await page.getByRole("link", { name: "Bluebird home", exact: true }).click();
    await page.getByRole("region", { name: "Marketplace homepage", exact: true }).waitFor();
    await page.locator(".listing-card").first().waitFor();
    assert.deepEqual(errors, []);
    results.push({
      viewport,
      activityBeforePermission: 0,
      visibleImpressions: true,
      removedDismissalControls: true,
      priorChoicesRespected: true,
      sharedRowGeometry: geometry,
      visibleProviderCredits: true,
      filtersAuthoritative: true,
      withdrawalStopsActivity: true,
      nonpersonalizedSimilarFallback: true,
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
