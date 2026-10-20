#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const repo = fileURLToPath(new URL("../", import.meta.url));
const evidenceDir = resolve(
  process.env.BLUEBIRD_UI_EVIDENCE_DIR || join(tmpdir(), "bluebird-pagination-ui"),
);
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const server = await createServer({
  configFile: resolve(repo, "tests/pagination-ui/vite.config.ts"),
});
const report = {
  mounted: "production Browse route and CanonicalTags; real TanStack router/query cache",
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
  const origin = "http://127.0.0.1:4178";
  browser = await chromium.launch({ headless: true });
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 390, height: 844 },
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
    page.on("pageerror", (error) => report.browserErrors.push(error.message));
    page.on("console", (message) => {
      if (
        ["error", "warning"].includes(message.type()) &&
        !report.consoleWarnings.includes(message.text())
      )
        report.consoleWarnings.push(message.text());
    });
    const check = { viewport, checks: [], screenshots: [] };
    report.viewports.push(check);
    const cards = () => page.getByRole("link", { name: /^View listing: Fixture listing/ });
    const ready = async (path) => {
      await page.goto(origin + path);
      try {
        await cards().first().waitFor({ timeout: 10000 });
      } catch (error) {
        await writeFile(join(evidenceDir, "failed-page.html"), await page.content());
        await page.screenshot({ path: join(evidenceDir, "failed-page.png"), fullPage: false });
        throw error;
      }
    };
    const count = async (expected) => {
      await page.waitForFunction(
        (n) =>
          document.querySelectorAll('a[aria-label^="View listing: Fixture listing"]').length === n,
        expected,
      );
      assert.equal(await cards().count(), expected);
      const hrefs = await cards().evaluateAll((links) =>
        links.map((link) => link.getAttribute("href")),
      );
      assert.equal(new Set(hrefs).size, expected);
    };
    const pending = async (number) =>
      page.waitForFunction((n) => window.__bluebirdPaginationFixture.pending().includes(n), number);
    const release = async (number) =>
      page.evaluate((n) => window.__bluebirdPaginationFixture.release(n), number);
    const capture = async (name) => {
      const path = join(evidenceDir, `${viewport.width}-${name}.png`);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path, fullPage: false });
      check.screenshots.push(path);
    };
    const noOverflow = async () =>
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        "No horizontal overflow",
      );

    await ready("/browse");
    await count(24);
    await noOverflow();
    await capture("initial");
    for (const [nextPage, expected] of [
      [2, 48],
      [3, 53],
    ]) {
      await page.getByRole("link", { name: "Load more", exact: true }).click();
      await pending(nextPage);
      const loading = page.getByRole("link", { name: "Loading…", exact: true });
      assert.equal(await loading.getAttribute("aria-disabled"), "true");
      await loading.click({ force: true });
      await loading.click({ force: true });
      const calls = await page.evaluate(() => window.__bluebirdPaginationFixture.calls);
      assert.equal(calls.filter((value) => value === nextPage).length, 1);
      await capture(`loading-page-${nextPage}`);
      await release(nextPage);
      await count(expected);
      check.checks.push(
        `page ${nextPage}: loading/aria-disabled, repeated clicks issue one request, ${expected} unique cards`,
      );
    }
    assert.equal(await page.getByRole("link", { name: /^(Load more|Loading…)$/ }).count(), 0);
    assert.match(await page.getByText("Showing 53 of 53", { exact: true }).innerText(), /53/);
    await noOverflow();
    await capture("final");
    check.checks.push("final page: Showing 53 of 53; Load more absent");

    await ready("/browse?q=limited");
    const notice = page
      .getByRole("status")
      .filter({ hasText: "This broad search covers a limited set" });
    await notice.waitFor({ state: "visible" });
    assert.match(await notice.innerText(), /Narrow your location or filters to explore more/);
    await noOverflow();
    await capture("limited-results");
    check.checks.push("production limited-results notice visible and readable");

    await ready("/browse?q=repeat");
    await page.getByRole("link", { name: "Load more", exact: true }).click();
    await pending(2);
    await release(2);
    await page.getByText("Could not load more listings.", { exact: true }).waitFor();
    await count(24);
    await page.getByRole("link", { name: "Load more", exact: true }).waitFor();
    check.checks.push(
      "non-advancing response shows recovery toast, appends nothing, remains retryable",
    );

    await ready("/browse?page=51");
    await count(1);
    await page
      .getByRole("link", { name: "View listing: Fixture listing 1201", exact: true })
      .waitFor();
    assert.equal(await page.locator('link[rel="canonical"]').count(), 1);
    const canonical = page.locator('head link[rel="canonical"]');
    assert.equal(await canonical.getAttribute("href"), "https://onbluebird.com/browse?page=51");
    assert.equal(await page.getByRole("link", { name: /^(Load more|Loading…)$/ }).count(), 0);
    await noOverflow();
    await capture("page-51");
    check.checks.push(
      "production page 51: listing 1201 once, final controls, mounted canonical https://onbluebird.com/browse?page=51",
    );
    await context.close();
  }
  assert.deepEqual(report.browserErrors, []);
  assert.deepEqual(
    report.blockedRequests,
    [],
    "Fixture attempted an external/backend request; it was blocked",
  );
  report.passed = true;
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(join(evidenceDir, "report.json"), JSON.stringify(report, null, 2));
  await browser?.close();
  await server.close();
}
