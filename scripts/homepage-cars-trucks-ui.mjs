#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const repo = fileURLToPath(new URL("../", import.meta.url));
const evidenceDir = resolve(
  process.env.BLUEBIRD_UI_EVIDENCE_DIR || join(tmpdir(), "bluebird-homepage-ui"),
);
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const server = await createServer({
  configFile: resolve(repo, "tests/homepage-ui/vite.config.ts"),
});
const report = {
  mounted:
    "production homepage, SiteHeader and Cars & Trucks server query; synthetic data and real TanStack router/query cache",
  viewports: [],
  blockedRequests: [],
  browserErrors: [],
  localDevSockets: 0,
  consoleWarnings: [],
};
let browser;
try {
  await mkdir(evidenceDir, { recursive: true });
  await server.listen();
  const origin = "http://127.0.0.1:4179";
  browser = await chromium.launch({ headless: true });
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 320, height: 740 },
  ]) {
    const context = await browser.newContext({ viewport, serviceWorkers: "block" });
    // Install before opening any page; even accidental backend imports cannot make external requests.
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (
        url.origin === origin &&
        !/^\/(api|_server)/.test(url.pathname) &&
        !["xhr", "fetch", "eventsource"].includes(route.request().resourceType())
      )
        return route.continue();
      report.blockedRequests.push(url.origin + url.pathname);
      await route.abort("blockedbyclient");
    });
    await context.routeWebSocket("**/*", (socket) => {
      const url = new URL(socket.url());
      // Vite's local development/error-reporting transport; no proxy or API is hosted.
      if (url.protocol === "ws:" && url.host === new URL(origin).host && url.pathname === "/") {
        report.localDevSockets++;
        socket.connectToServer();
        return;
      }
      report.blockedRequests.push(url.origin + url.pathname);
      socket.close();
    });
    await context.exposeBinding("__bluebirdReportCspViolation", (_source, violation) => {
      report.blockedRequests.push(`CSP ${String(violation).split("?")[0]}`);
    });
    await context.addInitScript(() => {
      addEventListener("securitypolicyviolation", (event) => {
        window.__bluebirdReportCspViolation(`${event.effectiveDirective}: ${event.blockedURI}`);
      });
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => {
      if (error.message !== "Synthetic offline request failure")
        report.browserErrors.push(error.message);
    });
    page.on("console", (message) => {
      if (
        ["error", "warning"].includes(message.type()) &&
        !report.consoleWarnings.includes(message.text())
      )
        report.consoleWarnings.push(message.text());
    });
    const check = { viewport, checks: [], screenshots: [] };
    report.viewports.push(check);
    const lead = page.locator(".homepage-lead-vehicles");
    const cards = () => lead.getByRole("link", { name: /^View listing: Synthetic car/ });
    const capture = async (name) => {
      const path = join(evidenceDir, `${viewport.width}-${name}.png`);
      await page.screenshot({ path, fullPage: false });
      check.screenshots.push(path);
    };
    const noOverflow = async () =>
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
    const readyCars = async () => {
      await page.waitForFunction(
        () =>
          document.querySelectorAll(
            '.homepage-lead-vehicles a[aria-label^="View listing: Synthetic car"]',
          ).length === 4,
      );
      assert.equal(await cards().count(), 4);
      assert.equal(
        await lead.getByRole("link", { name: /View listing: Synthetic noise/ }).count(),
        0,
      );
      await lead
        .getByRole("heading", { name: "Cars & trucks for sale in Idaho", exact: true })
        .waitFor();
      const calls = await page.evaluate(() => window.__bluebirdHomepageFixture.calls);
      assert.ok(calls.length > 0);
      assert.ok(
        calls.every(
          (input) => input.category === "cars-trucks" && !input.group && input.state === "ID",
        ),
      );
      const hrefs = await cards().evaluateAll((links) =>
        links.map((link) => link.getAttribute("href")),
      );
      assert.equal(new Set(hrefs).size, 4);
      // The later rows do not repeat the four featured cards.
      for (let i = 1; i <= 4; i++)
        assert.equal(
          await page
            .getByRole("link", { name: `View listing: Synthetic car ${i}`, exact: true })
            .count(),
          1,
        );
      const all = new URL(
        await lead
          .getByRole("link", { name: "All cars & trucks", exact: true })
          .getAttribute("href"),
        origin,
      );
      assert.equal(all.searchParams.get("category"), "cars-trucks");
      for (const [name, slug] of [
        ["Auto Parts", "auto-parts"],
        ["Trailers", "trailers"],
      ]) {
        const target = new URL(
          await lead.getByRole("link", { name: new RegExp(`^${name}`) }).getAttribute("href"),
          origin,
        );
        assert.equal(target.searchParams.get("category"), slug);
      }
      await noOverflow();
    };
    if (process.env.BLUEBIRD_UI_ALLOCATION_ONLY !== "1") {
      await page.clock.install();
      await page.goto(origin + "/?fixture=loading");
      await lead.getByRole("status").waitFor();
      assert.match(await lead.innerText(), /Loading Idaho cars and trucks/);
      assert.doesNotMatch(await lead.innerText(), /just getting started|couldn’t load/);
      await page.clock.fastForward(8100);
      await lead.getByText("Still loading cars and trucks.", { exact: false }).waitFor();
      await noOverflow();
      await capture("loading");
      await page.evaluate(() => window.__bluebirdHomepageFixture.release());
      await readyCars();
      await lead.scrollIntoViewIfNeeded();
      await capture("cars-trucks");
      await page.evaluate(() => scrollTo(0, 0));
      await capture("homepage");
      check.checks.push(
        "40 newer parts/trailers cannot displace 4 featured cars; original cards and category links remain; no repeated featured cards",
      );
      check.checks.push(
        "pending and slow loading are honest; success replaces skeleton without false empty state",
      );
      if (viewport.width >= 1024) {
        const header = page.locator("header");
        await header.getByRole("link", { name: "Vehicles", exact: true }).first().waitFor();
        const target = new URL(
          await header
            .getByRole("link", { name: "Vehicles", exact: true })
            .first()
            .getAttribute("href"),
          origin,
        );
        assert.equal(target.searchParams.get("group"), "motors");
        check.checks.push("five-category production header retains broader Vehicles destination");
      }
      await page.getByRole("combobox", { name: "City or ZIP code", exact: true }).fill("Boise");
      await page.getByRole("combobox", { name: "City or ZIP code", exact: true }).press("Tab");
      const local = new URL(
        await lead
          .getByRole("link", { name: "All cars & trucks", exact: true })
          .getAttribute("href"),
        origin,
      );
      assert.equal(local.searchParams.get("city"), "Boise");
      assert.equal(local.searchParams.get("radiusMiles"), "25");
      await readyCars();
      check.checks.push(
        "chosen Boise/25-mile location is retained in featured and category destinations",
      );

      await page.goto(origin + "/?fixture=empty");
      await lead.getByText("Bluebird is just getting started.", { exact: true }).waitFor();
      assert.equal(await cards().count(), 0);
      assert.doesNotMatch(await lead.innerText(), /Loading Idaho|couldn’t load/);
      await noOverflow();
      await lead.scrollIntoViewIfNeeded();
      await capture("empty");
      check.checks.push(
        "successful empty car query stays empty even though broader Motors contains parts/trailers",
      );

      await page.goto(origin + "/?fixture=error");
      await lead.getByText("Cars and trucks couldn’t load.", { exact: true }).waitFor();
      assert.equal(await cards().count(), 0);
      assert.doesNotMatch(await lead.innerText(), /just getting started/);
      await noOverflow();
      await lead.scrollIntoViewIfNeeded();
      await capture("error");
      await lead.getByRole("button", { name: "Try again", exact: true }).click();
      await readyCars();
      assert.equal((await page.evaluate(() => window.__bluebirdHomepageFixture.calls)).length, 2);
      check.checks.push(
        "request failure is distinct from empty; Try again recovers to real synthetic car results",
      );
    }

    const feed = page.locator('section[aria-labelledby="keep-browsing-heading"]');
    const feedIds = () =>
      feed
        .getByRole("link", { name: /^View listing: Synthetic car/ })
        .evaluateAll((links) =>
          links.map((link) => Number(link.getAttribute("aria-label").match(/car (\d+)$/)[1])),
        );
    const assertAllCars = async (expected) => {
      const ids = await page
        .getByRole("link", { name: /^View listing: Synthetic car/ })
        .evaluateAll((links) =>
          links.map((link) => Number(link.getAttribute("aria-label").match(/car (\d+)$/)[1])),
        );
      assert.equal(
        ids.length,
        expected,
        `Expected ${expected} total car cards, received ${ids.length}: ${ids}`,
      );
      assert.equal(new Set(ids).size, expected, `Duplicate car cards: ${ids}`);
      assert.deepEqual(
        [...new Set(ids)].sort((a, b) => a - b),
        Array.from({ length: expected }, (_, i) => i + 1),
        "Unique inventory disappeared",
      );
    };
    for (const mode of ["allocation", "allocation-pagination", "allocation-inflight"]) {
      await page.goto(origin + "/?fixture=" + mode);
      await page.waitForFunction(
        () =>
          document.querySelectorAll(
            'section[aria-labelledby="keep-browsing-heading"] a[aria-label^="View listing: Synthetic car"]',
          ).length === 8,
      );
      assert.deepEqual(await feedIds(), [17, 18, 19, 20, 21, 22, 23, 24]);
      await assertAllCars(24);
      const allocationCheck = { viewport, mode, beforeFeed: await feedIds() };
      if (mode !== "allocation") {
        await feed.getByRole("button", { name: "Load more", exact: true }).click();
        if (mode === "allocation-pagination") {
          await page.waitForFunction(
            () =>
              document.querySelectorAll(
                'section[aria-labelledby="keep-browsing-heading"] a[aria-label^="View listing: Synthetic car"]',
              ).length === 32,
          );
          await assertAllCars(48);
        } else {
          await page.waitForFunction(() =>
            window.__bluebirdHomepageFixture.pendingFeedPages().includes(2),
          );
        }
      }
      await page.evaluate(() => window.__bluebirdHomepageFixture.release());
      await page.waitForFunction(
        () =>
          document.querySelectorAll(
            '.homepage-lead-vehicles a[aria-label^="View listing: Synthetic car"]',
          ).length === 4 &&
          document.querySelectorAll('a[aria-label="View listing: Synthetic car 20"]').length > 0,
      );
      // Wait for the secondary rows to move c17-c20 above Keep browsing.
      await page.waitForFunction(() =>
        [...document.querySelectorAll("section")]
          .filter(
            (section) => section.querySelector("h2")?.textContent === "More from local sellers",
          )
          .some((section) =>
            section.querySelector('a[aria-label="View listing: Synthetic car 20"]'),
          ),
      );
      allocationCheck.afterFeed = await feedIds();
      allocationCheck.allIds = await page
        .getByRole("link", { name: /^View listing: Synthetic car/ })
        .evaluateAll((links) => links.map((link) => link.getAttribute("aria-label")));
      await writeFile(
        join(evidenceDir, `${viewport.width}-${mode}.json`),
        JSON.stringify(allocationCheck, null, 2),
      );
      await feed.scrollIntoViewIfNeeded();
      await capture(mode);
      if (mode === "allocation-inflight") {
        await assertAllCars(24);
        await page.evaluate(() => window.__bluebirdHomepageFixture.releaseFeedPage(2));
        await page.waitForFunction(
          () =>
            document.querySelectorAll(
              'section[aria-labelledby="keep-browsing-heading"] a[aria-label^="View listing: Synthetic car"]',
            ).length === 28,
        );
      }
      await assertAllCars(mode === "allocation" ? 24 : 48);
      assert.deepEqual(
        await feedIds(),
        Array.from({ length: mode === "allocation" ? 4 : 28 }, (_, i) => i + 21),
      );
      if (mode !== "allocation") {
        await feed.getByRole("button", { name: "Load more", exact: true }).click();
        await page.waitForFunction(
          () =>
            document.querySelectorAll(
              'section[aria-labelledby="keep-browsing-heading"] a[aria-label^="View listing: Synthetic car"]',
            ).length === 52,
        );
        await assertAllCars(72);
        assert.deepEqual(
          await page.evaluate(() => window.__bluebirdHomepageFixture.feedCalls),
          [2, 3],
        );
        assert.equal(await feed.getByRole("button", { name: "Load more", exact: true }).count(), 0);
      }
      allocationCheck.finalFeed = await feedIds();
      allocationCheck.feedCalls = await page.evaluate(
        () => window.__bluebirdHomepageFixture.feedCalls,
      );
      await writeFile(
        join(evidenceDir, `${viewport.width}-${mode}.json`),
        JSON.stringify(allocationCheck, null, 2),
      );
      await noOverflow();
      check.checks.push(
        `${mode}: full secondary-row allocation updates without duplicates or missing unique inventory; pagination retained`,
      );
    }
    await context.close();
  }
  assert.deepEqual(report.browserErrors, []);
  assert.deepEqual(
    report.blockedRequests,
    [],
    "Offline fixture attempted an external/backend request; it was blocked",
  );
  report.passed = true;
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(join(evidenceDir, "report.json"), JSON.stringify(report, null, 2));
  await browser?.close();
  await server.close();
}
