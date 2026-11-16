import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
const { chromium } = await import(
  new URL("../apps/mobile/node_modules/playwright/index.mjs", import.meta.url)
);
const output = resolve(
  process.env.BLUEBIRD_MOBILE_EVIDENCE || "/tmp/bluebird-review-refinements-ui",
);
await mkdir(output, { recursive: true });
const servers = [];
async function serve(dir, port, preview = false) {
  const processHandle = spawn(
    process.execPath,
    [
      resolve("node_modules/vite/bin/vite.js"),
      ...(preview ? ["preview"] : []),
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd: dir,
      env: {
        ...process.env,
        VITE_MOBILE_API_ORIGIN: preview
          ? "https://onbluebird.com"
          : "https://fixture.bluebird.invalid",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  servers.push(processHandle);
  let logs = "";
  for (const stream of [processHandle.stdout, processHandle.stderr])
    stream.on("data", (chunk) => {
      logs = (logs + chunk.toString()).slice(-3000);
    });
  const origin = `http://127.0.0.1:${port}`;
  for (const end = Date.now() + 30000; ;) {
    try {
      if ((await fetch(origin)).ok) return origin;
    } catch {}
    if (processHandle.exitCode !== null || Date.now() > end)
      throw Error("Preview did not start: " + logs);
    await pause(100);
  }
}
const common = {
  productId: "",
  currency: "USD",
  city: "Boise",
  state: "ID",
  createdAt: "2026-11-16T00:00:00Z",
  canSave: false,
  canMessage: false,
  imageUrl: "https://fixture.images.invalid/service.svg",
};
const services = [
  "General service 1",
  "General service 2",
  "General service 3",
  "State Street Electric",
  "Tree Care",
  "Ritchie Plumbing and Maintenance",
  "General service 4",
].map((title, i) => ({
  ...common,
  id: `service-fixture-${i}`,
  title,
  priceCents: 0,
  categorySlug: "services",
  categoryName: "Local services",
  display: {
    directory: {
      source: "Foursquare",
      claimed: false,
      rating: title.startsWith("Ritchie") ? null : 4.8,
      reviewCount: title.startsWith("Ritchie") ? null : 127,
      logoUrl: null,
    },
    service: { subcategory: "Home maintenance", pricingType: "quote" },
  },
}));
const motors = [0, 1, 2].map((n) => ({
  ...common,
  id: `dealerfeed-fixture-${n}`,
  title: `2024 Ford Explorer ${n}`,
  priceCents: 2000000 + n * 100000,
  categorySlug: "cars-trucks",
  categoryName: "Cars & trucks",
  display: { vehicle: { year: 2024, make: "Ford", model: "Explorer" } },
}));
const goods = Array.from({ length: 8 }, (_, i) => ({
  ...common,
  id: `item-fixture-${i}`,
  title: `Local item ${i}`,
  priceCents: 1000,
  categorySlug: "furniture",
  categoryName: "Furniture",
  display: {},
}));
async function inspect(browser, origin, width, baseline = false) {
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://fixture.images.invalid/**", (r) =>
    r.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450"><rect width="600" height="450" fill="#d9e5e8"/><path d="M220 290L300 170L380 290Z" fill="#173b50"/></svg>',
    }),
  );
  await page.route(
    (u) => u.pathname.startsWith("/api/mobile/v1/"),
    (route) => {
      const path = new URL(route.request().url()).pathname.split("/v1/")[1];
      const data =
        path === "bootstrap"
          ? {
              policyVersion: "2026-11-12",
              categories: [],
              supabaseUrl: "https://fixture.supabase.co",
              supabaseKey: "sb_publishable_fixture",
              features: { fullSearch: true, push: false, advertising: false, paidUpgrades: false },
            }
          : path === "home"
            ? { motors, recent: [...goods, ...services] }
            : path === "shopping"
              ? {
                  personalization: false,
                  version: "2026-11-12",
                  trackingAvailable: true,
                  recommendationsAvailable: true,
                }
              : path === "activity"
                ? { accepted: 0 }
                : { items: [], nextPage: null, total: 0, page: 1, pageSize: 24 };
      return route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*",
        },
        body: JSON.stringify({ data }),
      });
    },
  );
  await page.goto(origin);
  await page.locator("#bluebird-launch").waitFor({ state: "detached" });
  await page.evaluate(() => document.fonts.ready);
  if (!baseline) {
    await page.getByText("Find your next gem in the gem state 😁", { exact: true }).waitFor();
    assert.notEqual(
      await page.locator(".native-search-field").evaluate((e) => getComputedStyle(e).boxShadow),
      "none",
    );
    await page.screenshot({
      path: resolve(output, `home-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
    const recommendations = page.getByRole("region", {
      name: "Vehicles we think you'll like",
      exact: true,
    });
    assert(await recommendations.isVisible());
  }
  const region = page.getByRole("region", { name: "Local services", exact: true });
  await region.waitFor();
  await region.locator(".listing-card").first().waitFor();
  await region.scrollIntoViewIfNeeded();
  const geometry = [];
  for (const card of await region.locator(".listing-card").all()) {
    const title = await card.getByRole("heading", { level: 3 }).innerText();
    const box = await card.boundingBox();
    if (!baseline && !title.startsWith("Ritchie")) {
      assert.equal(
        await card.getByLabel("4.8 out of 5 from 127 Google reviews", { exact: true }).count(),
        1,
      );
      assert.equal(await card.getByText("Call for a quote", { exact: true }).count(), 1);
    }
    geometry.push({ title, width: box.width, height: box.height });
  }
  await page.screenshot({
    path: resolve(output, `${baseline ? "baseline-" : ""}services-${width}.png`),
    animations: "disabled",
  });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
  );
  assert.deepEqual(errors, []);
  await page.close();
  return geometry;
}
let browser;
try {
  const current = await serve(resolve("apps/mobile"), 5214);
  const baseline = process.env.BLUEBIRD_BASELINE_MOBILE_DIR
    ? await serve(resolve(process.env.BLUEBIRD_BASELINE_MOBILE_DIR), 5215, true)
    : null;
  browser = await chromium.launch();
  const results = [];
  for (const width of [320, 390, 768, 1280]) {
    const before = baseline ? await inspect(browser, baseline, width, true) : null;
    const after = await inspect(browser, current, width);
    if (before)
      for (const card of after) {
        const original = before.find((c) => c.title === card.title);
        assert(original);
        assert(
          card.height <= original.height + 1,
          `${card.title} grew at ${width}: ${original.height} → ${card.height}`,
        );
      }
    results.push({ width, before, after, passed: true });
  }
  await writeFile(
    resolve(output, "verification.json"),
    JSON.stringify(
      { boundary: "Synthetic native browser UI, not real-device proof", results },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ results }));
} finally {
  await browser?.close();
  for (const s of servers) s.kill("SIGTERM");
}
