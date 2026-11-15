import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
const { chromium } = await import(
  new URL("../apps/mobile/node_modules/playwright/index.mjs", import.meta.url)
);
const output = resolve(process.env.BLUEBIRD_MOBILE_EVIDENCE || "/tmp/bluebird-mobile-startup-ui");
await mkdir(output, { recursive: true });
const port = 5201,
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
const member = "11111111-1111-4111-8111-111111111111";
function session() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token:
      [
        { alg: "HS256", typ: "JWT" },
        { sub: member, aud: "authenticated", role: "authenticated", exp },
      ]
        .map((x) => Buffer.from(JSON.stringify(x)).toString("base64url"))
        .join(".") + ".fixture",
    refresh_token: "fixture",
    token_type: "bearer",
    expires_at: exp,
    expires_in: 3600,
    user: {
      id: member,
      aud: "authenticated",
      email: "fixture@example.invalid",
      app_metadata: { provider: "email" },
      user_metadata: { display_name: "Fixture" },
    },
  };
}
function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}
async function wait(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error("Startup handshake timed out")), 15000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
const card = (title) => ({
  id: "dealerfeed-startup-fixture",
  productId: "",
  title,
  categorySlug: "cars-trucks",
  categoryName: "Cars & Trucks",
  priceCents: 2000000,
  currency: "USD",
  city: "Boise",
  state: "ID",
  imageUrl: null,
  createdAt: "2026-11-14T10:00:00Z",
  canSave: false,
  canMessage: false,
});
let browser;
const results = [],
  errors = [];
async function pageFixture({
  width = 390,
  signedIn = false,
  failBootstrap = false,
  failHome = false,
  holdHome = false,
} = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 } });
  await context.addCookies([
    {
      name: "private_session_fixture",
      value: "must-not-send",
      domain: "onbluebird.com",
      path: "/",
      secure: true,
      sameSite: "None",
    },
  ]);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    ({ signedIn, session }) => {
      Object.defineProperty(AbortSignal, "any", { value: undefined, configurable: true });
      Object.defineProperty(AbortSignal, "timeout", { value: undefined, configurable: true });
      if (signedIn) localStorage.setItem("bluebird-mobile-auth", JSON.stringify(session));
    },
    { signedIn, session: session() },
  );
  const boot = deferred(),
    bootStarted = deferred(),
    homeStarted = deferred(),
    homeGate = deferred();
  let released = false,
    homes = 0,
    homeFinished = false,
    accountRead = false;
  const calls = [],
    publicHeaders = [];
  await page.route("https://onbluebird.com/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const path = url.pathname.split("/api/mobile/v1/")[1];
    calls.push({ path, method: request.method(), beforeBootstrapReleased: !released });
    let data;
    if (path === "bootstrap") {
      bootStarted.resolve();
      await boot.promise;
      if (failBootstrap)
        return route.fulfill({
          status: 503,
          headers,
          body: JSON.stringify({ error: { message: "Setup temporarily unavailable" } }),
        });
      data = {
        policyVersion: "2026-11-12",
        supabaseUrl: "https://fixture.supabase.co",
        supabaseKey: "sb_publishable_fixture",
        categories: [],
        features: { fullSearch: true, push: false, advertising: false, paidUpgrades: false },
      };
    } else if (path === "home") {
      homes++;
      publicHeaders.push(await request.allHeaders());
      homeStarted.resolve();
      if (holdHome) await homeGate.promise;
      if (failHome)
        return route.fulfill({
          status: 503,
          headers,
          body: JSON.stringify({ error: { message: "Home temporarily unavailable" } }),
        });
      data = {
        motors: [card(homes === 1 ? "Startup vehicle" : "Fresh return vehicle")],
        recent: [],
      };
      homeFinished = true;
    } else if (path === "shopping")
      data = {
        personalization: false,
        trackingAvailable: true,
        recommendationsAvailable: true,
        version: "2026-11-12",
      };
    else if (path === "account") {
      accountRead = true;
      data = {
        account: { userId: member, displayName: "Fixture", email: "fixture@example.invalid" },
        consent: { terms_version: "2026-11-12", shopping_alerts: false },
      };
    } else if (path === "saved") data = { items: [] };
    else if (path === "search" || path?.startsWith("listings"))
      data = {
        items: [card("Fallback vehicle")],
        total: 1,
        page: 1,
        pageSize: 24,
        nextPage: null,
        incomplete: false,
      };
    else if (path === "recommendations") data = { cards: [], model: "fixture-fallback" };
    else
      return route.fulfill({
        status: 404,
        headers,
        body: JSON.stringify({ error: { message: "Unexpected fixture endpoint" } }),
      });
    await route.fulfill({ status: 200, headers, body: JSON.stringify({ data }) }).catch((e) => {
      if (!context.pages().length) return;
      throw e;
    });
  });
  return {
    context,
    page,
    calls,
    publicHeaders,
    bootStarted,
    homeStarted,
    homeGate,
    release() {
      released = true;
      boot.resolve();
    },
    get homes() {
      return homes;
    },
    get homeFinished() {
      return homeFinished;
    },
    get accountRead() {
      return accountRead;
    },
  };
}
try {
  for (let end = Date.now() + 30000; ;) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    if (Date.now() > end || server.exitCode !== null) throw Error("Preview did not start");
    await pause(150);
  }
  browser = await chromium.launch(
    process.env.BLUEBIRD_BROWSER_CHANNEL ? { channel: process.env.BLUEBIRD_BROWSER_CHANNEL } : {},
  );
  for (const width of [320, 390, 1280]) {
    const f = await pageFixture({ width });
    await f.page.goto(origin);
    await wait(f.bootStarted.promise);
    await wait(f.homeStarted.promise);
    assert(f.calls.find((c) => c.path === "home").beforeBootstrapReleased);
    assert.equal(
      await f.page.getByRole("heading", { name: "Startup vehicle", exact: true }).count(),
      0,
      "public data is not rendered before setup",
    );
    f.release();
    await f.page
      .getByRole("region", { name: "Vehicles", exact: true })
      .getByRole("heading", { name: "Startup vehicle", exact: true })
      .waitFor();
    assert.equal(f.homes, 1);
    assert.equal(
      await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    assert.equal(await f.page.evaluate(() => typeof AbortSignal.any), "undefined");
    if (process.env.BLUEBIRD_SKIP_STARTUP_SCREENSHOTS !== "true")
      await f.page.screenshot({ path: resolve(output, `startup-home-${width}.png`) });
    await f.page.evaluate(() => {
      location.hash = "/search";
    });
    await f.page
      .getByRole("region", { name: "Marketplace homepage", exact: true })
      .waitFor({ state: "hidden" });
    await f.page.evaluate(() => {
      location.hash = "/";
    });
    await f.page
      .getByRole("region", { name: "Vehicles", exact: true })
      .getByRole("heading", { name: "Fresh return vehicle", exact: true })
      .waitFor();
    assert.equal(f.homes, 2, "return loads fresh data, not startup replay");
    for (const h of f.publicHeaders)
      for (const key of ["authorization", "cookie", "x-bluebird-install", "referer"])
        assert.equal(h[key], undefined, key);
    assert(!f.calls.some((c) => c.path === "activity" || c.path?.startsWith("advertising")));
    results.push({
      width,
      overlap: true,
      initialHomeRequests: 1,
      returnReadsFresh: true,
      noCredentialsOrTracking: true,
    });
    await f.context.close();
  }
  {
    const f = await pageFixture({ signedIn: true });
    await f.page.goto(origin);
    await wait(f.homeStarted.promise);
    f.release();
    await f.page
      .getByRole("region", { name: "Vehicles", exact: true })
      .getByRole("heading", { name: "Startup vehicle", exact: true })
      .waitFor();
    for (let end = Date.now() + 15000; !f.accountRead;) {
      if (Date.now() > end) throw Error("Member session did not restore");
      await pause(20);
    }
    await pause(100);
    assert.equal(f.homes, 1, "restored members do not mount an initial guest feed");
    for (const h of f.publicHeaders)
      for (const key of ["authorization", "cookie", "x-bluebird-install", "referer"])
        assert.equal(h[key], undefined, key);
    results.push({ restoredMember: true, initialHomeRequests: 1 });
    await f.context.close();
  }
  for (const path of ["/search", "/auth", "/post"]) {
    const f = await pageFixture();
    await f.page.goto(origin + "/#" + path);
    await wait(f.bootStarted.promise);
    assert.equal(f.homes, 0);
    f.release();
    await f.page.getByText("Connecting to Bluebird…", { exact: true }).waitFor({ state: "hidden" });
    await pause(50);
    assert.equal(f.homes, 0);
    results.push({ path, noHomePrefetch: true });
    await f.context.close();
  }
  {
    const f = await pageFixture();
    await f.page.goto(origin + "/?code=fixture-return");
    await wait(f.bootStarted.promise);
    assert.equal(f.homes, 0, "root OAuth returns must not prefetch a homepage");
    // Stop before exchanging the synthetic code. The existing auth suite owns
    // callback completion; this case verifies the pre-setup network boundary.
    await f.context.close();
    f.release();
    results.push({ rootOAuthReturn: true, noHomePrefetch: true });
  }
  {
    const f = await pageFixture({ holdHome: true });
    await f.page.goto(origin);
    await wait(f.homeStarted.promise);
    await f.page.evaluate(() => {
      location.hash = "/auth";
    });
    f.release();
    f.homeGate.resolve();
    await f.page.getByText("Connecting to Bluebird…", { exact: true }).waitFor({ state: "hidden" });
    await pause(100);
    assert(
      !f.calls.some((c) => c.path?.startsWith("listings")),
      "navigation discards unused prefetch without a fallback browse",
    );
    results.push({ leaveDuringSetup: true, noFallbackOrStaleRender: true });
    await f.context.close();
  }
  {
    const f = await pageFixture({ failHome: true });
    await f.page.goto(origin);
    await wait(f.homeStarted.promise);
    f.release();
    await f.page.getByRole("heading", { name: "Fallback vehicle", exact: true }).first().waitFor();
    assert.equal(f.homes, 1);
    results.push({ failedHome: true, browseFallbackWorks: true });
    await f.context.close();
  }
  {
    const f = await pageFixture({ failBootstrap: true, holdHome: true });
    await f.page.goto(origin);
    await wait(f.homeStarted.promise);
    f.release();
    await f.page.getByRole("button", { name: "Retry connection", exact: true }).waitFor();
    f.homeGate.resolve();
    await pause(50);
    assert.equal(
      await f.page.getByRole("heading", { name: "Startup vehicle", exact: true }).count(),
      0,
    );
    results.push({ failedSetup: true, noMarketplaceBeforeRetry: true });
    await f.context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, "results.json"), JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ output, results }, null, 2));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
