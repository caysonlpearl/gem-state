import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const { chromium } = await import(
  new URL("../apps/mobile/node_modules/playwright/index.mjs", import.meta.url)
);
const output = resolve(process.env.BLUEBIRD_MOBILE_EVIDENCE || "/tmp/bluebird-mobile-ui");
await mkdir(output, { recursive: true });
const browser = await chromium.launch(
  process.env.BLUEBIRD_BROWSER_CHANNEL ? { channel: process.env.BLUEBIRD_BROWSER_CHANNEL } : {},
);
const errors = [],
  results = [];
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 740 },
    { width: 768, height: 1024 },
  ]) {
    const page = await browser.newPage({ viewport });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(process.env.BLUEBIRD_MOBILE_PREVIEW || "http://127.0.0.1:5174", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.getByRole("heading", { name: /^Find / }).waitFor();
    await page.getByRole("combobox", { name: "Category", exact: true }).click();
    await page.getByRole("option", { name: "Cars & Trucks", exact: true }).click();
    await page.locator(".listing-card").first().waitFor({ timeout: 60000 });
    const cards = await page.locator(".listing-card").count();
    await page.screenshot({ path: resolve(output, `browse-${viewport.width}.png`) });
    await page.evaluate(() => window.scrollTo(0, 150));
    const previousScroll = await page.evaluate(() => window.scrollY);
    await page.locator(".listing-card").first().click();
    await page
      .getByRole("button", { name: "Save listing", exact: true })
      .waitFor({ timeout: 60000 });
    await page.screenshot({ path: resolve(output, `listing-${viewport.width}.png`) });
    await page.getByRole("button", { name: "Go back", exact: true }).click();
    await page.getByRole("heading", { name: /^Find / }).waitFor();
    assert.equal(
      await page.getByRole("combobox", { name: "Category", exact: true }).innerText(),
      "Cars & Trucks",
    );
    await page.waitForFunction((y) => Math.abs(window.scrollY - y) < 3, previousScroll);
    await page.getByLabel("Search Bluebird", { exact: true }).fill("Subaru Outback");
    const queryResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/mobile/v1/listings?") &&
        new URL(response.url()).searchParams.get("q") === "Subaru Outback",
    );
    await page.getByRole("button", { name: "Search", exact: true }).click();
    assert.equal((await queryResponse).status(), 200);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("heading", { name: "Sign in to Bluebird Marketplace" }).waitFor();
    await page.getByRole("button", { name: "Need an account? Create one", exact: true }).click();
    assert.equal(await page.getByRole("checkbox").count(), 2);
    assert.equal(await page.getByRole("checkbox").nth(1).isChecked(), false);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({ path: resolve(output, `signup-${viewport.width}.png`) });
    results.push({
      viewport,
      cards,
      detailOpened: true,
      backRestoresCategoryAndScroll: true,
      searchWithSpaces: true,
      signupControls: 2,
      shoppingOptInInitiallyOff: true,
      horizontalOverflow: false,
    });
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(output, "results.json"),
    JSON.stringify(
      {
        mode: "read-only live catalog; no account writes or messages",
        results,
        javascriptErrors: errors,
        physicalDeviceTested: false,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ results, javascriptErrors: errors }));
} finally {
  await browser.close();
}
