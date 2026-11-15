import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
const { chromium } = await import(
  new URL("../apps/mobile/node_modules/playwright/index.mjs", import.meta.url)
);
const output = resolve(process.env.BLUEBIRD_MOBILE_EVIDENCE || "/tmp/bluebird-mobile-runtime-ui");
await mkdir(output, { recursive: true });
const port = 5199,
  origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  { cwd: resolve("apps/mobile"), stdio: "ignore" },
);
let browser;
const results = [],
  errors = [];
try {
  for (let limit = Date.now() + 30000; ;) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    if (Date.now() > limit) throw Error("Preview did not start");
    await pause(150);
  }
  browser = await chromium.launch(
    process.env.BLUEBIRD_BROWSER_CHANNEL ? { channel: process.env.BLUEBIRD_BROWSER_CHANNEL } : {},
  );
  for (const missing of [
    "abort-statics",
    "color-mix",
    "oklch",
    "uuid",
    "abort-controller",
    "has-own",
  ]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
      requests = [],
      remote = [];
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => requests.push(r.url()));
    await page.addInitScript((mode) => {
      if (mode === "abort-statics") {
        Object.defineProperty(AbortSignal, "any", { value: undefined, configurable: true });
        Object.defineProperty(AbortSignal, "timeout", { value: undefined, configurable: true });
      }
      if (mode === "color-mix" || mode === "oklch") {
        const supports = CSS.supports.bind(CSS);
        CSS.supports = (property, value) =>
          typeof value === "string" && value.indexOf(mode) >= 0 ? false : supports(property, value);
      }
      if (mode === "uuid")
        Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
      if (mode === "abort-controller")
        Object.defineProperty(window, "AbortController", { value: undefined, configurable: true });
      if (mode === "has-own")
        Object.defineProperty(Object, "hasOwn", { value: undefined, configurable: true });
    }, missing);
    await page.route("https://onbluebird.com/**", async (route) => {
      const req = route.request();
      remote.push(req.url());
      const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      };
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const path = new URL(req.url()).pathname.split("/v1/")[1];
      let data;
      if (path === "bootstrap")
        data = {
          policyVersion: "2026-11-12",
          supabaseUrl: "https://fixture.supabase.co",
          supabaseKey: "sb_publishable_fixture",
          categories: [],
          features: { push: false, advertising: false, paidUpgrades: false },
        };
      else if (path === "shopping")
        data = { personalization: false, trackingAvailable: true, recommendationsAvailable: true };
      else if (path === "home") data = { motors: [], recent: [] };
      else if (path === "search") {
        assert.equal(req.method(), "GET");
        const params = Object.fromEntries(new URL(req.url()).searchParams);
        assert(["jobs", "pets"].includes(params.category));
        assert.deepEqual(params, {
          category: params.category,
          state: "ID",
          page: "1",
        });
        data = { items: [], total: 0, page: 1, nextPage: null, incomplete: false };
      } else if (path === "saved") data = { items: [] };
      else if (path?.startsWith("listings")) data = { items: [], total: 0, page: 1, pageSize: 24 };
      else throw Error("Unexpected runtime fixture request " + req.method() + " " + path);
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ data }) });
    });
    await page.goto(origin);
    if (missing === "abort-statics") {
      await page.getByRole("heading", { name: "Vehicles", exact: true }).waitFor();
      assert.equal(await page.getByText("Connecting to Bluebird…", { exact: true }).count(), 0);
      assert(remote.some((u) => u.endsWith("/bootstrap")));
      assert(requests.some((u) => /\/assets\/main-.*\.js$/.test(u)));
      assert.equal(new URL(page.url()).pathname, "/");
      assert.equal(await page.evaluate(() => typeof AbortSignal.any), "undefined");
      assert.equal(await page.evaluate(() => typeof AbortSignal.timeout), "undefined");
      results.push({ missing, compiledAppLoads: true, marketplaceContentLoaded: true });
    } else {
      await page
        .getByRole("heading", { name: "Your phone’s browser needs an update", exact: true })
        .waitFor();
      assert.equal(new URL(page.url()).pathname, "/webview-update.html");
      assert.equal(remote.length, 0);
      assert(!requests.some((u) => /\/assets\/main-.*\.js$/.test(u)));
      assert.equal(await page.locator("script").count(), 0);
      assert.equal(
        await page
          .getByRole("link", { name: "Visit Bluebird’s website", exact: true })
          .getAttribute("href"),
        "https://onbluebird.com",
      );
      const ratio = await page.evaluate(() => {
        const rgb = (css) =>
          css
            .match(/[\d.]+/g)
            .slice(0, 3)
            .map(Number)
            .map((v) => {
              const n = v / 255;
              return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
            });
        const luminance = (css) => {
          const v = rgb(css);
          return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
        };
        const c = getComputedStyle(document.body);
        const a = luminance(c.color),
          b = luminance(c.backgroundColor);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
      assert(ratio >= 4.5);
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(() => document.activeElement?.tagName), "A");
      for (const viewport of [
        { width: 320, height: 740 },
        { width: 390, height: 844 },
        { width: 1280, height: 900 },
      ]) {
        await page.setViewportSize(viewport);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        assert(
          await page
            .getByRole("link", { name: "Open Android System WebView", exact: true })
            .evaluate((e) => e.getBoundingClientRect().height >= 44),
        );
      }
      results.push({
        missing,
        updateScreen: true,
        noAppEvaluation: true,
        noRemoteRequests: true,
        contrast: ratio,
      });
    }
    await page.close();
  }
  // Capture each viewport in a fresh page, without a retained focus scroll.
  if (process.env.BLUEBIRD_SKIP_RUNTIME_SCREENSHOTS !== "true")
    for (const viewport of [
      { width: 320, height: 740 },
      { width: 390, height: 844 },
      { width: 1280, height: 900 },
    ]) {
      const page = await browser.newPage({ viewport });
      await page.goto(origin + "/webview-update.html");
      await page.evaluate(() => document.fonts.ready);
      await page
        .locator("img")
        .evaluate((img) =>
          img.complete
            ? undefined
            : new Promise((resolve) => img.addEventListener("load", resolve, { once: true })),
        );
      assert.equal(await page.locator("img").count(), 1);
      assert(await page.locator("img").evaluate((img) => img.naturalWidth > 0));
      const metrics = await page.evaluate(() => ({
        scrollY,
        scrollHeight: document.documentElement.scrollHeight,
        mainHeight: document.querySelector("main").getBoundingClientRect().height,
      }));
      await page.screenshot({
        path: resolve(output, `update-${viewport.width}.png`),
        fullPage: true,
      });
      results.push({ visualViewport: viewport, ...metrics });
      await page.close();
    }
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(output, "results.json"),
    JSON.stringify(
      {
        results,
        errors,
        mode: "Compiled bundled app; missing capabilities simulated, not an older physical OS certification.",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ results, errors }));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
