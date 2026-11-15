import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { detailFixture } from "../tests/support/mobile-detail-fixture.mjs";
const { chromium } = await import(
  new URL("../apps/mobile/node_modules/playwright/index.mjs", import.meta.url)
);
const output = resolve(process.env.BLUEBIRD_MOBILE_EVIDENCE || "/tmp/bluebird-native-polish-ui");
await mkdir(output, { recursive: true });
const origin = "http://127.0.0.1:5205";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "5205",
    "--strictPort",
  ],
  { cwd: resolve("apps/mobile"), stdio: "ignore" },
);
const detail = detailFixture().vehicle;
const card = (n) => ({
  id: n === 0 ? detail.listing.id : `vehicle-card-${n}`,
  productId: "",
  title: `Vehicle ${n}`,
  categorySlug: "cars-trucks",
  categoryName: "Cars & Trucks",
  priceCents: 3590000,
  currency: "USD",
  city: "Boise",
  state: "ID",
  imageUrl: "https://fixture.images.invalid/car.jpg",
  createdAt: "2026-11-14T10:00:00Z",
  canSave: false,
  display: { vehicle: { year: 2024, make: "Ford", model: `Vehicle ${n}`, bodyStyle: "SUV" } },
});
let browser;
const results = [],
  errors = [];
try {
  for (let end = Date.now() + 30000; ;) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    if (Date.now() > end || server.exitCode !== null) throw Error("Polish preview unavailable");
    await pause(100);
  }
  browser = await chromium.launch(
    process.env.BLUEBIRD_BROWSER_CHANNEL ? { channel: process.env.BLUEBIRD_BROWSER_CHANNEL } : {},
  );
  for (const width of [320, 440, 768]) {
    const safeTop = width === 320 ? 0 : 59;
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: true });
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.fixtureTransitions = [];
      if (document.startViewTransition) {
        const original = document.startViewTransition.bind(document);
        document.startViewTransition = (update) => {
          const transition = original(() => {
            update();
            window.fixtureTransitions.push({
              path: location.hash,
              listing: !!document.querySelector(".native-listing-photos"),
              photos: document.querySelectorAll(".native-photo-slide").length,
              direction: document.documentElement.dataset.routeDirection,
            });
          });
          window.fixtureTransitionFinished = transition.finished.catch(() => {});
          return transition;
        };
      }
    });
    await page.route("https://fixture.images.invalid/**", (r) =>
      r.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#ddd7c7"/></svg>',
      }),
    );
    let detailReads = 0,
      homeReads = 0,
      detailRelease,
      homeRelease,
      pageRelease;
    let holdDetail = false,
      holdHome = false,
      holdPage = false,
      failMore = false;
    const searches = [];
    await page.route("https://onbluebird.com/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        path = url.pathname.split("/v1/")[1];
      const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
      };
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      assert.equal(
        req.method(),
        "GET",
        "These public journeys must not write accounts or tracking",
      );
      let data;
      if (path === "bootstrap")
        data = {
          policyVersion: "2026-11-12",
          supabaseUrl: "https://fixture.supabase.co",
          supabaseKey: "sb_publishable_fixture",
          categories: [],
          features: {
            listingDetails: true,
            fullSearch: true,
            push: false,
            advertising: false,
            paidUpgrades: false,
          },
        };
      else if (path === "home") {
        homeReads++;
        if (holdHome) await new Promise((r) => (homeRelease = r));
        data = { motors: Array.from({ length: 12 }, (_, n) => card(n)), recent: [] };
      } else if (path === `listings/${detail.listing.id}/detail`) {
        detailReads++;
        if (holdDetail) await new Promise((r) => (detailRelease = r));
        data = { listing: detail.listing, stats: detail.stats, canSave: false, canMessage: false };
      } else if (path === "shopping")
        data = { personalization: false, trackingAvailable: true, recommendationsAvailable: true };
      else if (path === "recommendations") data = { cards: [], model: "fallback" };
      else if (path === "similar") data = { cards: [], model: "fallback" };
      else if (path === "saved") data = { items: [] };
      else if (path?.endsWith("/price-insight"))
        data = { status: "unavailable", reason: "service_unavailable" };
      else if (path === "search") {
        const page = Number(url.searchParams.get("page") || 1);
        if (["jobs", "pets"].includes(url.searchParams.get("category")))
          data = { items: [], total: 0, page: 1, pageSize: 24, nextPage: null, incomplete: false };
        else {
          searches.push({ page, query: url.search });
          if (page === 2 && holdPage) await new Promise((r) => (pageRelease = r));
          if (page === 2 && failMore)
            return route.fulfill({
              status: 503,
              headers,
              body: JSON.stringify({ error: { message: "More listings temporarily unavailable" } }),
            });
          data = {
            items: Array.from({ length: 24 }, (_, n) => card((page - 1) * 24 + n)),
            total: 48,
            page,
            pageSize: 24,
            nextPage: page === 1 ? 2 : null,
            incomplete: false,
          };
        }
      } else throw Error("Unexpected polish request " + path);
      await route.fulfill({ status: 200, headers, body: JSON.stringify({ data }) }).catch(() => {});
    });
    await page.goto(origin);
    await page.locator("#bluebird-launch").waitFor({ state: "detached" });
    assert.equal(
      await page.evaluate(() => getComputedStyle(document.body).backgroundImage),
      "none",
    );
    assert.equal(
      await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
      "rgb(250, 247, 239)",
    );
    await page.evaluate(
      (inset) => document.documentElement.style.setProperty("--native-safe-top", `${inset}px`),
      safeTop,
    );
    await page.evaluate(async () => {
      await window.fixtureTransitionFinished;
      await Promise.all(
        document
          .getAnimations()
          .filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime))
          .map((a) => a.finished.catch(() => {})),
      );
    });
    const rail = page.locator(".homepage-lead-vehicles .native-listing-rail");
    const railSize = await rail.evaluate((node) => ({
      width: node.clientWidth,
      card: node.firstElementChild.getBoundingClientRect().width,
    }));
    assert(
      railSize.width / railSize.card > (width < 640 ? 2.5 : 3.5),
      "Next card remains partially visible",
    );
    const bodyOrder = await rail
      .locator(".listing-card > a")
      .first()
      .evaluate((node) => [...node.children].map((child) => child.tagName));
    assert(bodyOrder.indexOf("H3") < bodyOrder.indexOf("DIV"), "Card title precedes its price");
    assert.equal(await page.getByRole("heading", { name: "For you", exact: true }).count(), 1);
    await page.screenshot({ path: resolve(output, `home-${width}.png`) });
    const primary = page.getByRole("navigation", { name: "Primary", exact: true });
    await primary.getByRole("button", { name: "Open categories", exact: true }).click();
    const menu = page.getByRole("list", { name: "Main categories", exact: true });
    const { pets, post } = await menu.evaluate((list) => {
      const links = [...list.querySelectorAll("a")];
      const box = (node) => {
        const rect = node?.getBoundingClientRect();
        return rect ? { x: rect.x, y: rect.y } : null;
      };
      return {
        pets: box(links.find((link) => link.textContent.includes("Pets"))),
        post: box(links.find((link) => link.textContent.trim() === "Post a listing")),
      };
    });
    assert(pets && post && Math.abs(pets.y - post.y) < 1, "Post fills the empty tile beside Pets");
    assert.equal(await page.getByText("Find your next local gem.", { exact: true }).count(), 0);
    assert.equal(await page.getByRole("link", { name: "Newest listings", exact: true }).count(), 0);
    await page.keyboard.press("Escape");
    const firstBefore = await page
      .locator(".homepage-lead-vehicles .listing-card a")
      .first()
      .getAttribute("href");
    const navBeforePull = await primary.boundingBox();
    holdHome = true;
    homeRelease = undefined;
    await page.evaluate(() => {
      const target = document.querySelector(".mobile-home");
      const send = (type, y) =>
        target.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches: [new Touch({ identifier: 1, target, clientX: 90, clientY: y })],
          }),
        );
      send("touchstart", 250);
      send("touchmove", 550);
    });
    await page.waitForFunction(
      () =>
        new DOMMatrix(getComputedStyle(document.getElementById("native-page-surface")).transform)
          .m42 > 50,
    );
    const movingHeader = await page.locator(".native-brand-row").boundingBox();
    assert(movingHeader && movingHeader.y > 50, "The page and header move with the pull");
    const arrow = await page.locator(".native-refresh-indicator").boundingBox();
    const pageTop = await page
      .locator("#native-page-surface")
      .evaluate((node) => node.getBoundingClientRect().top);
    assert(
      arrow && arrow.y >= safeTop && arrow.y + arrow.height <= pageTop,
      "The complete refresh arrow clears the iPhone inset and moved page",
    );
    await page.evaluate(async () => {
      await window.fixtureTransitionFinished;
      await Promise.all(
        document
          .getAnimations()
          .filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime))
          .map((a) => a.finished.catch(() => {})),
      );
    });
    await page.screenshot({ path: resolve(output, `pull-${width}.png`) });
    const navDuringPull = await primary.boundingBox();
    assert(
      navBeforePull && navDuringPull && Math.abs(navBeforePull.y - navDuringPull.y) < 1,
      "The footer remains anchored",
    );
    await page.evaluate(() =>
      document
        .querySelector(".mobile-home")
        .dispatchEvent(
          new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [] }),
        ),
    );
    for (let end = Date.now() + 10000; !homeRelease;) {
      if (Date.now() > end) throw Error("Pull refresh did not request the latest pool");
      await pause(20);
    }
    await page.waitForFunction(() =>
      document.querySelector(".native-refresh-indicator")?.textContent.includes("Refreshing"),
    );
    const spinner = await page.locator(".native-refresh-indicator").boundingBox();
    const busyTop = await page
      .locator("#native-page-surface")
      .evaluate((node) => node.getBoundingClientRect().top);
    assert(
      spinner && spinner.y >= safeTop && spinner.y + spinner.height <= busyTop,
      "The loading wheel remains exposed after release",
    );
    homeRelease();
    holdHome = false;
    await page.waitForFunction(
      () => !document.getElementById("native-page-surface").style.transform,
    );
    const firstAfter = await page
      .locator(".homepage-lead-vehicles .listing-card a")
      .first()
      .getAttribute("href");
    assert.notEqual(
      firstBefore,
      firstAfter,
      "The same available inventory receives a different discovery selection",
    );
    holdDetail = true;
    await page.locator(`a[href="#/listings/${detail.listing.id}"]`).first().click();
    for (let end = Date.now() + 10000; !detailRelease;) {
      if (Date.now() > end) throw Error("Detail preparation did not start");
      await pause(20);
    }
    assert.equal(
      new URL(page.url()).hash,
      "",
      "The previous route remains committed while loading",
    );
    await page.getByRole("region", { name: "Vehicles", exact: true }).waitFor();
    assert.equal(await page.getByText("Loading listing…", { exact: true }).count(), 0);
    detailRelease();
    holdDetail = false;
    await page
      .getByRole("heading", { name: "2024 Ford F-150 XLT", exact: true, level: 1 })
      .waitFor();
    assert.equal(
      await page.getByRole("region", { name: "Asking price", exact: true }).isVisible(),
      false,
    );
    const facts = page.getByRole("region", { name: "Key vehicle facts", exact: true });
    const factColumns = await facts.evaluate(
      (node) => getComputedStyle(node).gridTemplateColumns.split(" ").length,
    );
    assert.equal(factColumns, 2);
    const info = page.getByRole("tablist", { name: "Listing information", exact: true });
    const infoBox = await info.boundingBox();
    const bodyBox = await page.locator(".native-detail-grid").boundingBox();
    assert(
      infoBox && bodyBox && infoBox.width >= bodyBox.width - 4,
      "Information tabs use the complete centered content width",
    );
    await page.evaluate(async () => {
      await window.fixtureTransitionFinished;
      await Promise.all(
        document
          .getAnimations()
          .filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime))
          .map((a) => a.finished.catch(() => {})),
      );
    });
    await page.screenshot({ path: resolve(output, `detail-${width}.png`), fullPage: true });
    const photos = page.getByRole("region", { name: "Listing photos", exact: true });
    await photos.getByRole("button", { name: "Next listing photo", exact: true }).click();
    await photos.getByRole("status").getByText("2 / 2", { exact: true }).waitFor();
    const navBox = await primary.boundingBox(),
      contactBox = await page
        .getByRole("region", { name: "Listing contact actions", exact: true })
        .boundingBox();
    assert(
      navBox && contactBox && contactBox.y + contactBox.height <= navBox.y - 8,
      "Contact and navigation have separate space",
    );
    const image = await page
      .locator(".native-photo-slide img")
      .first()
      .evaluate((img) => ({
        fit: getComputedStyle(img).objectFit,
        slide: img.parentElement.getBoundingClientRect().height,
        height: img.getBoundingClientRect().height,
      }));
    assert.equal(image.fit, "cover");
    assert(Math.abs(image.slide - image.height) < 1);
    assert.equal(detailReads, 1, "Prepared listing renders without fetching it again");
    const transitions = await page.evaluate(() => window.fixtureTransitions);
    assert(
      transitions.some((t) => t.listing && t.photos === 2 && t.direction === "forward"),
      "The actual page transition receives a populated listing",
    );
    holdHome = true;
    homeRelease = undefined;
    await primary.getByRole("link", { name: "Home", exact: true }).click();
    await page.getByRole("region", { name: "Vehicles", exact: true }).waitFor();
    for (let end = Date.now() + 10000; !homeRelease;) {
      if (Date.now() > end) throw Error("Return refresh did not start");
      await pause(20);
    }
    assert.equal(await page.getByText("Loading listings…", { exact: true }).count(), 0);
    assert((await page.locator(".homepage-lead-vehicles .listing-card").count()) > 0);
    homeRelease();
    holdHome = false;
    await page
      .getByRole("navigation", { name: "Shop by category", exact: true })
      .getByRole("button", { name: "Vehicles", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Find your next gem on wheels.", exact: true })
      .waitFor();
    assert.equal(
      searches.filter((q) => q.page === 1).length,
      1,
      "Navigation preparation is reused by results",
    );
    const filterBox = await page
      .getByRole("button", { name: "Filters", exact: true })
      .boundingBox();
    const sortBox = await page
      .getByRole("region", { name: "Car listings", exact: true })
      .getByRole("combobox")
      .boundingBox();
    assert(
      filterBox && sortBox && Math.abs(filterBox.y - sortBox.y) < 8,
      "Filters and sort share a row",
    );
    const tiles = page.locator("[data-native-browse-tile]");
    const positions = await tiles.evaluateAll((nodes) =>
      nodes.slice(0, 5).map((node) => {
        const b = node.getBoundingClientRect();
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      }),
    );
    const columns = width >= 768 ? 4 : 2;
    assert.equal(positions.filter((p) => Math.abs(p.y - positions[0].y) < 2).length, columns);
    assert(positions[0].height < 260, "Native preview cards are compact");
    assert.equal(await tiles.getByRole("link", { name: "Apply now", exact: true }).count(), 0);
    const meta = await tiles
      .first()
      .locator(".native-browse-card-meta")
      .evaluate((node) => {
        const b = node.getBoundingClientRect();
        return {
          height: b.height,
          children: [...node.children].map((n) => n.getBoundingClientRect().y),
        };
      });
    assert(
      meta.height <= 17 && Math.abs(meta.children[0] - meta.children[1]) < 1,
      "City and posted age share a line",
    );
    await page.evaluate(async () => {
      await window.fixtureTransitionFinished;
      await Promise.all(
        document
          .getAnimations()
          .filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime))
          .map((a) => a.finished.catch(() => {})),
      );
    });
    await page.screenshot({ path: resolve(output, `vehicles-${width}.png`) });
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    const filters = page.getByRole("dialog");
    await filters.getByRole("button", { name: "Close filters", exact: true }).waitFor();
    await filters.evaluate((node) => node.scrollTo(0, node.scrollHeight));
    const close = filters.getByRole("button", { name: "Close filters", exact: true });
    const closeBox = await close.boundingBox();
    assert(closeBox && closeBox.y >= 0 && closeBox.y + closeBox.height < 900);
    await close.click();
    await filters.waitFor({ state: "hidden" });
    const before = await page
      .getByRole("region", { name: "Browse listings", exact: true })
      .locator(".listing-card")
      .count();
    assert.equal(before, 24);
    holdPage = true;
    failMore = true;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    for (let end = Date.now() + 10000; !pageRelease;) {
      if (Date.now() > end) throw Error("Automatic next page did not start");
      await pause(20);
    }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await pause(100);
    assert.equal(searches.filter((q) => q.page === 2).length, 1);
    await page.getByText("Loading more listings…", { exact: true }).waitFor();
    await page.evaluate(() => {
      const target = document.querySelector(".native-browse-page");
      const send = (type, y) =>
        target.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches:
              type === "touchend"
                ? []
                : [new Touch({ identifier: 2, target, clientX: 120, clientY: y })],
          }),
        );
      send("touchstart", 650);
      send("touchmove", 500);
    });
    assert.equal(
      await page
        .locator("#native-page-surface")
        .evaluate((node) => node.style.getPropertyValue("--native-bottom-translate")),
      "0 -48px",
    );
    await page.evaluate(() =>
      document
        .querySelector(".native-browse-page")
        .dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [] })),
    );
    assert.equal(
      await page
        .locator("#native-page-surface")
        .evaluate((node) => node.style.getPropertyValue("--native-bottom-translate")),
      "",
    );
    assert.equal(
      searches.filter((q) => q.page === 2).length,
      1,
      "Bottom gestures cannot duplicate a pending page request",
    );
    pageRelease();
    holdPage = false;
    await page.getByRole("button", { name: "Retry loading listings", exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole("region", { name: "Browse listings", exact: true })
        .locator(".listing-card")
        .count(),
      24,
      "Failure retains visible inventory",
    );
    failMore = false;
    await page.getByRole("button", { name: "Retry loading listings", exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector('[aria-label="Browse listings"]')?.querySelectorAll(".listing-card")
          .length === 48,
    );
    assert.equal(await page.getByRole("button", { name: "Load more", exact: true }).count(), 0);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.goto(`${origin}/#/search?state=ID`);
    await page.getByRole("heading", { name: "All classifieds", exact: true }).waitFor();
    assert.equal(await page.getByText("Bluebird classifieds", { exact: true }).count(), 0);
    assert.equal(await page.getByLabel("Sort", { exact: true }).inputValue(), "for_you");
    await page.getByLabel("Sort", { exact: true }).selectOption("newest");
    await page
      .getByRole("region", { name: "Browse listings", exact: true })
      .getByRole("link", { name: "All listings", exact: true })
      .click();
    await page.waitForFunction(() => !new URLSearchParams(location.hash.split("?")[1]).has("sort"));
    assert.equal(await page.getByLabel("Sort", { exact: true }).inputValue(), "for_you");
    assert(
      new URLSearchParams(new URL(page.url()).hash.split("?")[1]).get("state") === "ID",
      "Reopening the mixed feed preserves selected location",
    );
    assert.equal(await page.getByText(/^48 listings$/).count(), 0);
    const genericFilter = await page.getByRole("button", { name: /^Filters/ }).boundingBox();
    const genericSort = await page.getByLabel("Sort", { exact: true }).boundingBox();
    assert(
      genericFilter && genericSort && Math.abs(genericFilter.y - genericSort.y) < 8,
      "Classified filters and sort share a row",
    );
    assert(
      genericFilter.x + genericFilter.width + 8 <= genericSort.x,
      "Sort cannot cover the filter count or button",
    );
    assert.equal(
      await page
        .getByText("Local listings from sellers across Idaho.", { exact: true })
        .evaluate((n) => getComputedStyle(n).fontSize),
      "12px",
    );
    await page.evaluate(async () => {
      await window.fixtureTransitionFinished;
      await Promise.all(
        document
          .getAnimations()
          .filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime))
          .map((a) => a.finished.catch(() => {})),
      );
    });
    await page.screenshot({ path: resolve(output, `classifieds-${width}.png`) });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert(
      parseFloat(
        await page
          .locator("#native-page-surface")
          .evaluate((n) => getComputedStyle(n).transitionDuration),
      ) <= 0.001,
      "Reduced motion removes elastic settling",
    );
    results.push({
      width,
      cream: true,
      menuGapFilled: true,
      preloadedSwipe: true,
      noBlankReturn: true,
      oneDetailRead: true,
      contactClearance: true,
      photosFill: true,
      filtersAlwaysClosable: true,
      automaticPagination: true,
      paginationRetryRetainsCards: true,
      safeTop,
      fullRefreshIndicator: true,
      compactFacts: true,
      centeredInformation: true,
      twoPhoneColumns: true,
      shortPreviewCards: true,
      cityDateSameLine: true,
      filterSortSameRow: true,
      bottomSpinner: true,
      elasticBottom: true,
    });
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(output, "results.json"),
    JSON.stringify({ results, errors }, null, 2) + "\n",
  );
  console.log(JSON.stringify({ nativePolish: "passed", results }));
} catch (error) {
  if (browser)
    for (const page of browser.contexts().flatMap((c) => c.pages()))
      await writeFile(
        resolve(output, "failure.json"),
        JSON.stringify(
          {
            error: String(error),
            url: page.url(),
            errors,
            body: await page
              .locator("body")
              .innerText()
              .catch(() => ""),
          },
          null,
          2,
        ),
      );
  throw error;
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
