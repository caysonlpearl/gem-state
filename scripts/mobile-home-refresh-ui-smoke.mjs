import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
const { chromium } = await import(
  new URL("../apps/mobile/node_modules/playwright/index.mjs", import.meta.url)
);
const output = resolve(process.env.BLUEBIRD_MOBILE_EVIDENCE || "/tmp/bluebird-mobile-home-refresh");
await mkdir(output, { recursive: true });
const origin = "http://127.0.0.1:5203";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "5203",
    "--strictPort",
  ],
  { cwd: resolve("apps/mobile"), stdio: "ignore" },
);
const card = (n, category, display = {}) => ({
  id: `${category}-${n}`,
  productId: "",
  title: `${category} find ${n}`,
  categorySlug: category,
  categoryName: category,
  priceCents: category === "cars-trucks" ? 1500000 : 7500,
  currency: "USD",
  city: "Boise",
  state: "ID",
  imageUrl: null,
  createdAt: "2026-11-14T10:00:00Z",
  canSave: false,
  canMessage: false,
  display: { discoverySellerKey: `seller-${category}-${n}`, ...display },
});
const motors = Array.from({ length: 24 }, (_, n) =>
  card(n, "cars-trucks", {
    vehicle: { year: 2024, make: "Ford", model: "Explorer", bodyStyle: "SUV" },
  }),
);
const recent = [
  ...Array.from({ length: 18 }, (_, n) => card(n, "home-garden")),
  ...Array.from({ length: 18 }, (_, n) =>
    card(n, "other-real-estate", {
      home: { mode: ["buy", "rent", "build"][n % 3], propertyType: "House", bedrooms: 3 },
    }),
  ),
  ...Array.from({ length: 8 }, (_, n) =>
    card(n, "services", { service: { subcategory: "Home cleaning" } }),
  ),
  ...Array.from({ length: 4 }, (_, n) => card(n, "pets", { pet: { species: "Dog" } })),
];
const jobs = Array.from({ length: 8 }, (_, n) =>
  card(n, "jobs", {
    job: {
      employmentType: "Part-time",
      employerName: `Employer ${n}`,
      payType: "Hourly",
      payMin: 20,
      payMax: 25,
    },
  }),
);
let browser;
const results = [],
  errors = [];
try {
  for (let limit = Date.now() + 30000; ;) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    if (Date.now() > limit || server.exitCode !== null) throw Error("Home preview did not start");
    await pause(100);
  }
  browser = await chromium.launch(
    process.env.BLUEBIRD_BROWSER_CHANNEL ? { channel: process.env.BLUEBIRD_BROWSER_CHANNEL } : {},
  );
  for (const width of [320, 390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: true });
    page.on("pageerror", (e) => errors.push(e.message));
    let reads = 0,
      fail = false,
      pending,
      release,
      aborted = 0;
    const calls = [];
    await page.route("https://onbluebird.com/**", async (route) => {
      const req = route.request();
      const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      };
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const path = new URL(req.url()).pathname.split("/v1/")[1];
      calls.push({ path, method: req.method(), headers: await req.allHeaders() });
      let data;
      if (path === "bootstrap")
        data = {
          policyVersion: "2026-11-12",
          supabaseUrl: "https://fixture.supabase.co",
          supabaseKey: "sb_publishable_fixture",
          categories: [],
          features: { fullSearch: true, push: false, advertising: false, paidUpgrades: false },
        };
      else if (path === "home") {
        reads++;
        if (pending) await pending;
        if (fail)
          return route.fulfill({
            status: 503,
            headers,
            body: JSON.stringify({ error: { message: "Listings could not refresh." } }),
          });
        data = {
          motors: motors.map((c) => ({
            ...c,
            display: {
              ...c.display,
              vehicle: { ...c.display.vehicle, model: `Explorer batch ${reads}` },
            },
          })),
          recent,
        };
      } else if (path === "shopping")
        data = { personalization: false, trackingAvailable: true, recommendationsAvailable: true };
      else if (path === "search")
        data = { items: jobs, total: jobs.length, page: 1, nextPage: null, incomplete: false };
      else if (path === "recommendations") data = { cards: [], model: "fallback" };
      else if (path === "saved") data = { items: [] };
      else throw Error(`Unexpected Home request: ${path}`);
      await route.fulfill({ status: 200, headers, body: JSON.stringify({ data }) }).catch(() => {
        aborted++;
      });
    });
    // Hold the initial public read: the actual bundled logo stays in front of
    // an inert app until content is ready, without a forced minimum display.
    pending = new Promise((r) => {
      release = r;
    });
    await page.goto(origin);
    await page.locator("#bluebird-launch img").waitFor();
    assert.equal(await page.locator("#root").getAttribute("inert"), "");
    release();
    pending = undefined;
    await page.locator("#bluebird-launch").waitFor({ state: "detached" });
    await page
      .getByRole("region", { name: "Local jobs", exact: true })
      .getByRole("heading", { level: 3 })
      .first()
      .waitFor();
    const headings = await page.locator(".mobile-home h2").allTextContents();
    assert.deepEqual(headings.slice(0, 4), [
      "Vehicles",
      "Fresh local finds",
      "Homes for sale",
      "New vehicle arrivals",
    ]);
    assert(headings.length >= 13, `Expected a longer real feed, got ${headings.length} sections`);
    await page.getByText("Find your next gem in the gem state", { exact: true }).waitFor();
    assert.equal(
      await page
        .locator(".mobile-home")
        .getByText(/Open Web Ninja|Adoptable pets from/)
        .count(),
      0,
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    if (process.env.BLUEBIRD_SKIP_HOME_SCREENSHOTS !== "true")
      await page.screenshot({ path: resolve(output, `home-${width}.png`) });
    const gesture = async (points, count = 1) =>
      page.evaluate(
        ({ points, count }) => {
          const target = document.querySelector(".mobile-home");
          for (const [i, point] of points.entries()) {
            const touches = Array.from(
              { length: count },
              (_, n) =>
                new Touch({ identifier: n, target, clientX: point[0] + n * 20, clientY: point[1] }),
            );
            target.dispatchEvent(
              new TouchEvent(i === 0 ? "touchstart" : "touchmove", {
                bubbles: true,
                cancelable: true,
                touches,
              }),
            );
          }
          target.dispatchEvent(
            new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [] }),
          );
        },
        { points, count },
      );
    await gesture([
      [80, 300],
      [240, 310],
    ]); // horizontal rail
    await gesture([
      [80, 300],
      [82, 340],
    ]); // below threshold
    await gesture(
      [
        [80, 300],
        [82, 490],
      ],
      2,
    ); // pinch
    await page.evaluate(() => window.scrollTo(0, 400));
    await gesture([
      [80, 300],
      [82, 490],
    ]); // not at top
    await pause(80);
    assert.equal(reads, 1, "Non-refresh gestures must not request inventory");
    await page.evaluate(() => window.scrollTo(0, 0));
    await gesture([
      [80, 300],
      [82, 490],
    ]);
    await page
      .getByRole("heading", { name: "2024 Ford Explorer batch 2", exact: true })
      .first()
      .waitFor();
    assert.equal(reads, 2);
    pending = new Promise((r) => {
      release = r;
    });
    await page.evaluate(() => window.dispatchEvent(new Event("bluebird-home-refresh")));
    await page.getByText("Refreshing listings…", { exact: true }).waitFor();
    await page.evaluate(() => window.dispatchEvent(new Event("bluebird-home-refresh")));
    await pause(80);
    assert.equal(reads, 3, "Only one refresh can be in flight");
    release();
    pending = undefined;
    await page.getByText("Refreshing listings…", { exact: true }).waitFor({ state: "hidden" });
    fail = true;
    await gesture([
      [80, 300],
      [82, 490],
    ]);
    await page.getByRole("button", { name: "Retry refresh", exact: true }).waitFor();
    await page
      .getByRole("heading", { name: "2024 Ford Explorer batch 3", exact: true })
      .first()
      .waitFor();
    fail = false;
    await page.getByRole("button", { name: "Retry refresh", exact: true }).click();
    await page
      .getByRole("heading", { name: "2024 Ford Explorer batch 5", exact: true })
      .first()
      .waitFor();
    await page
      .getByRole("region", { name: "Homes for rent", exact: true })
      .getByRole("button", { name: "See all", exact: true })
      .click();
    await page.waitForURL(/homeTab=rent/);
    assert.match(page.url(), /homeMode=results/);
    await page
      .getByRole("region", { name: "Marketplace homepage", exact: true })
      .waitFor({ state: "hidden" });
    await page.evaluate(() => window.dispatchEvent(new Event("bluebird-home-refresh")));
    await pause(80);
    assert.equal(reads, 5, "The gesture must be detached away from Home");
    for (const call of calls.filter((c) => c.path === "home"))
      for (const key of ["authorization", "cookie", "x-bluebird-install", "referer"])
        assert.equal(call.headers[key], undefined, key);
    assert(
      !calls.some((c) => c.method !== "GET" || /activity|advertising/.test(c.path)),
      "No tracking or writes from refresh",
    );
    results.push({
      width,
      sections: headings.length,
      logoHandoff: true,
      jobs: true,
      pull: true,
      ignoredGestures: true,
      singleFlight: true,
      retryPreservesFeed: true,
      navigationCleanup: true,
    });
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(output, "results.json"),
    JSON.stringify({ results, errors }, null, 2) + "\n",
  );
  console.log(JSON.stringify({ homeRefresh: "passed", results }));
} catch (error) {
  if (browser)
    for (const page of browser.contexts().flatMap((c) => c.pages())) {
      await writeFile(
        resolve(output, "failure.json"),
        JSON.stringify(
          {
            error: String(error),
            errors,
            url: page.url(),
            body: await page
              .locator("body")
              .innerText()
              .catch(() => ""),
          },
          null,
          2,
        ),
      );
      if (process.env.BLUEBIRD_SKIP_HOME_SCREENSHOTS !== "true")
        await page.screenshot({ path: resolve(output, "failure.png") }).catch(() => {});
    }
  throw error;
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
