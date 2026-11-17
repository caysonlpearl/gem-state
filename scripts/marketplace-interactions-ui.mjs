import assert from "node:assert/strict";
import { createServer } from "vite";
import { resolve } from "node:path";
import { readFile, mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  new URL("../apps/mobile/node_modules/playwright/index.mjs", import.meta.url)
);
const server = await createServer({ configFile: resolve("tests/marketplace-ui/vite.config.ts") });
const results = [],
  errors = [];
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  for (const width of [320, 390, 1280]) {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      permissions: ["clipboard-read", "clipboard-write"],
    });
    page.on("pageerror", (error) => errors.push(error.message));
    let releasePhoto;
    const photoGate = new Promise((resolve) => (releasePhoto = resolve));
    await page.route("**/delayed-test-photo.png", async (route) => {
      await photoGate;
      await route.fulfill({
        contentType: "image/jpeg",
        body: await readFile("public/images/mock-vehicles/toyota-tacoma.jpg"),
      });
    });
    await page.goto("http://127.0.0.1:4190", { waitUntil: "domcontentloaded" });
    await page.locator('[data-test="delayed-photo"] [data-photo-state="loading"]').waitFor();
    await page.getByRole("img", { name: "Photo unavailable" }).waitFor();
    releasePhoto();
    await page.locator('[data-test="delayed-photo"] [data-photo-state="ready"]').waitFor();
    const search = page.getByRole("combobox", { name: "Search fixture" });
    await search.fill("Tacoma");
    assert.equal(await page.getByRole("listbox").getByRole("option").count(), 5);
    await search.press("ArrowDown");
    await search.press("ArrowDown");
    await search.press("Enter");
    await page.getByRole("status").filter({ hasText: "Listing: car-0" }).waitFor();
    await search.fill("Vehicles");
    await page.getByRole("option", { name: "Vehicles Category" }).click();
    await page.getByRole("status").filter({ hasText: "Category: cars-trucks" }).waitFor();
    await search.fill("Tacoma");
    await search.press("Enter");
    await search.fill("");
    await page.getByRole("option", { name: "Tacoma Recent search" }).waitFor();
    await search.press("Escape");
    assert.equal(await page.getByRole("listbox").count(), 0);
    await page.getByRole("button", { name: "Toggle personalization" }).click();
    await search.focus();
    assert.equal(await page.getByRole("listbox").getByRole("option").count(), 0);
    await search.blur();
    await page.getByRole("button", { name: "Copy VIN" }).click();
    await page.getByRole("button", { name: "Copied", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "Fixture VIN 123");
    const save = page.getByRole("button", { name: "Save 2022 Toyota Tacoma TRD Sport" });
    await save.click();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    assert.equal(await save.getAttribute("aria-pressed"), "false");
    await save.click();
    await page.getByRole("button", { name: "Switch account" }).click();
    await page.getByRole("button", { name: "Undo", exact: true }).last().click();
    assert.equal(await save.getAttribute("aria-pressed"), "false");
    await page.getByRole("button", { name: "About Bluebird QA Motors" }).click();
    await page.getByRole("link", { name: "View dealership and inventory" }).waitFor();
    await page.keyboard.press("Escape");
    assert.equal(
      await page.getByRole("complementary", { name: "Selected for comparison" }).count(),
      0,
    );
    const compareBox = await page
      .getByRole("button", { name: "Add 2022 Toyota Tacoma TRD Sport to comparison" })
      .boundingBox();
    assert.ok(
      compareBox && Math.abs(compareBox.width - compareBox.height) <= 1,
      "Compact compare controls stay circular at every breakpoint",
    );
    for (const year of [2022, 2023, 2024])
      await page
        .getByRole("button", { name: `Add ${year} Toyota Tacoma TRD Sport to comparison` })
        .click();
    await page
      .getByRole("button", { name: "Add 2025 Toyota Tacoma TRD Sport to comparison" })
      .click();
    await page
      .getByText("Compare up to 3 listings. Remove one to add another.", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Compare", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("heading", { name: "Compare vehicles" }).waitFor();
    assert.equal(await dialog.getByRole("link").count(), 3);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Switch account" }).click();
    assert.equal(
      await page.getByRole("complementary", { name: "Selected for comparison" }).count(),
      0,
    );
    const secondPhoto = page.getByRole("button", {
      name: width < 640 ? "Go to photo 2" : "Show vehicle photo 2",
      exact: true,
    });
    await secondPhoto.click();
    assert.equal(await secondPhoto.getAttribute("aria-current"), "true");
    await page.getByRole("button", { name: "Open listing photo", exact: true }).click();
    await page.getByRole("button", { name: "Zoom in" }).waitFor();
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Open listing photo", exact: true }).waitFor();
    const progress = page.getByRole("navigation", { name: "Listing progress" });
    await progress.getByRole("button", { name: "Photos" }).click();
    assert.equal(
      await progress.getByRole("button", { name: "Photos" }).getAttribute("aria-current"),
      "step",
    );
    assert.equal(
      await page
        .getByRole("region", { name: "Listing photos", exact: true })
        .evaluate((node) => node === document.activeElement),
      true,
    );
    await progress.getByRole("button", { name: "Review" }).click();
    await page.getByRole("region", { name: "Review and submit" }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Submit listing", exact: true }).count(),
      1,
    );
    const rail = page.locator('[aria-label="Fixture listings"]');
    await rail.evaluate((node) => (node.scrollLeft = 0));
    await page.waitForTimeout(50);
    const overflow = await rail.evaluate((node) => node.scrollWidth > node.clientWidth + 2);
    assert.equal(await rail.getAttribute("data-edges"), overflow ? "right" : "");
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.ok(
      parseFloat(
        await page
          .locator(".marketplace-photo img")
          .first()
          .evaluate((node) => getComputedStyle(node).transitionDuration),
      ) <= 0.001,
    );

    results.push({
      width,
      searchKeyboard: true,
      consent: true,
      copy: true,
      saveUndo: true,
      accountIsolation: true,
      comparison: true,
      lightboxZoom: true,
      photoStates: true,
      postingProgress: true,
      overflow: false,
    });
    await page.close();
  }
  assert.deepEqual(errors, []);
  await mkdir("/tmp/bluebird-marketplace-polish", { recursive: true });
  await writeFile(
    "/tmp/bluebird-marketplace-polish/results.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log(JSON.stringify({ results, errors }));
} finally {
  await browser?.close();
  await server.close();
}
