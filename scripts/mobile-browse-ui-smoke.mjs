import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { mobileCategories } from "../src/lib/mobile-contract.ts";
import { mobileSearchInput } from "../src/lib/mobile-search.ts";
import { mobileCachedSearch } from "../src/lib/mobile-catalog.ts";
import { mobileSavedSearchAllowed } from "../src/lib/mobile-saved-search-contract.ts";
import { savedSearch } from "../src/lib/saved-search-model.ts";
import { writeMobileSavedSearch } from "../src/lib/mobile-saved-search.server.ts";
const { chromium } = await import(
  new URL("../apps/mobile/node_modules/playwright/index.mjs", import.meta.url)
);
const output = resolve(process.env.BLUEBIRD_MOBILE_EVIDENCE || "/tmp/bluebird-mobile-browse-ui");
await mkdir(output, { recursive: true });
const port = 5194,
  origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  {
    cwd: resolve("apps/mobile"),
    env: { ...process.env, VITE_MOBILE_API_ORIGIN: "https://fixture.bluebird.invalid" },
    stdio: "ignore",
  },
);
process.once("exit", () => server.kill("SIGTERM"));
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
function session(actor) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token:
      [
        { alg: "HS256", typ: "JWT" },
        { sub: actor, aud: "authenticated", role: "authenticated", exp },
      ]
        .map((value) => Buffer.from(JSON.stringify(value)).toString("base64url"))
        .join(".") + ".fixture",
    refresh_token: "fixture-refresh",
    token_type: "bearer",
    expires_at: exp,
    expires_in: 3600,
    user: {
      id: actor,
      aud: "authenticated",
      email: `${actor === a ? "first" : "second"}@example.invalid`,
      app_metadata: { provider: "email" },
      user_metadata: { display_name: "Fixture shopper" },
    },
  };
}
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
function card(id, title, categorySlug, extra = {}) {
  return {
    id,
    productId: randomUUID(),
    title,
    categorySlug,
    categoryName: mobileCategories.find((c) => c.slug === categorySlug)?.name ?? categorySlug,
    priceCents: 2500000,
    currency: "USD",
    city: "Boise",
    state: "ID",
    region: "Treasure Valley",
    postalCode: "83702",
    condition: "used_good",
    fulfillmentMode: "local_pickup",
    createdAt: new Date().toISOString(),
    imageUrl: "https://images.fixture.invalid/one.png",
    vehicle: null,
    isFeatured: false,
    ...extra,
  };
}
const cards = [
  card("car-low", "Fixture Ford 20k", "cars-trucks", {
    vehicle: { make: "Ford", model: "F-150", year: 2024, mileage: 20000, bodyStyle: "truck" },
  }),
  card("car-high", "Fixture Ford 90k", "cars-trucks", {
    vehicle: { make: "Ford", model: "F-150", year: 2020, mileage: 90000 },
  }),
  card("car-other", "Fixture Toyota", "cars-trucks", {
    vehicle: { make: "Toyota", model: "Camry", year: 2023, mileage: 10000 },
  }),
  card("home-studio", "Fixture studio", "other-real-estate", {
    home: { mode: "rent", propertyType: "Apartment", bedrooms: 0, bathrooms: 1, squareFeet: 650 },
  }),
  card("home-family", "Fixture family home", "other-real-estate", {
    home: {
      mode: "buy",
      propertyType: "Single-family home",
      bedrooms: 4,
      bathrooms: 2,
      squareFeet: 1900,
    },
  }),
  card("job-one", "Fixture engineering job", "jobs", {
    job: {
      employmentType: "Full-time",
      employerName: "Fixture Company",
      payType: "Salary",
      payMin: 100000,
      payMax: 120000,
    },
  }),
  card("service-one", "Fixture service company", "services", {
    service: {
      subcategory: "Plumbing",
      serviceSummary: "Specialist drain repairs",
      serviceArea: "Boise",
      licenseNumber: "fixture",
    },
  }),
  card("pet-one", "Fixture dog", "pets", {
    pet: {
      subcategory: "Dogs & Puppies",
      species: "Dog",
      breed: "Labrador Retriever",
      placementType: "Adoption",
      offeredBy: "Rescue / shelter",
    },
  }),
  card("restricted", "Fixture rifle", "firearms"),
];
const dto = (card) => ({
  ...card,
  display: card,
  available: true,
  canSave: false,
  canMessage: false,
  images: [{ url: card.imageUrl, alt: card.title }],
  description: "Synthetic browser fixture.",
});
const results = [],
  errors = [];
let browser;
try {
  const deadline = Date.now() + 30000;
  while (true) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    if (server.exitCode !== null) throw Error("Preview process stopped before startup");
    if (Date.now() > deadline) throw Error("Preview did not start");
    await pause(150);
  }
  browser = await chromium.launch(
    process.env.BLUEBIRD_BROWSER_CHANNEL ? { channel: process.env.BLUEBIRD_BROWSER_CHANNEL } : {},
  );
  for (const viewport of [
    { width: 320, height: 740 },
    { width: 390, height: 844 },
    { width: 1280, height: 900 },
  ]) {
    const db = new PGlite();
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => {
      errors.push(error.message);
      console.error(error.message);
    });
    try {
      await db.exec(
        `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;create table shopping_accounts(user_id uuid,terms_version text);create table mobile_account_deletions(user_id uuid);create table categories(slug text);create table saved_searches(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),name text not null check(length(name) between 1 and 80),search jsonb not null default '{}',email_alerts boolean not null default true,paused boolean not null default false,created_at timestamptz default now(),updated_at timestamptz default now(),last_match_at timestamptz);`,
      );
      for (const category of mobileCategories)
        await db.query("insert into categories values($1)", [category.slug]);
      await db.query("insert into categories values('firearms')");
      await db.query("insert into auth.users values($1),($2)", [a, b]);
      await db.query("insert into shopping_accounts values($1,'2026-11-12'),($2,'2026-11-12')", [
        a,
        b,
      ]);
      for (const migration of [
        "20261113050000_mobile_message_receipts.sql",
        "20261113080000_mobile_saved_search_receipts.sql",
      ])
        await db.exec(
          await readFile(new URL("../supabase/migrations/" + migration, import.meta.url), "utf8"),
        );
      const initial = randomUUID();
      await db.query(
        "insert into saved_searches(id,user_id,name,search,email_alerts) values($1,$2,$3,$4,false)",
        [
          initial,
          a,
          "Fixture studios",
          { category: "other-real-estate", homeTab: "rent", bedrooms: "Studio" },
        ],
      );
      await db.query("insert into saved_searches(user_id,name,search) values($1,$2,$3)", [
        a,
        "Restricted fixture search",
        { category: "firearms" },
      ]);
      const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      };
      let ready = true,
        loseNextCreate = true,
        holdNextCreate = false,
        heldCommit = false,
        releaseHeld;
      const writes = [],
        queries = [];
      await page.addInitScript(
        ({ first, second }) => {
          if (!localStorage.getItem("bluebird-mobile-auth"))
            localStorage.setItem("bluebird-mobile-auth", JSON.stringify(first));
          window.fixtureSessions = { first, second };
        },
        { first: session(a), second: session(b) },
      );
      await page.addInitScript(() => {
        window.fixtureLocationCalls = 0;
        window.fixtureLocationDenied = false;
        Object.defineProperty(navigator, "geolocation", {
          configurable: true,
          value: {
            getCurrentPosition(success, error) {
              window.fixtureLocationCalls++;
              if (window.fixtureLocationDenied) error({ code: 1 });
              else
                success({ coords: { latitude: 43.615099, longitude: -116.202313, accuracy: 1 } });
            },
          },
        });
      });
      await page.route("https://*.tile.openstreetmap.org/**", (route) =>
        route.fulfill({ status: 200, contentType: "image/png", body: png }),
      );
      await page.route("https://images.fixture.invalid/**", (route) =>
        route.fulfill({ status: 200, contentType: "image/png", body: png }),
      );
      await page.route("https://fixture.supabase.co/**", async (route) => {
        const req = route.request();
        if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
        const token = req.headers().authorization?.split(" ")[1];
        const actor = token ? JSON.parse(Buffer.from(token.split(".")[1], "base64url")).sub : a;
        return route.fulfill({ status: 200, headers, body: JSON.stringify(session(actor).user) });
      });
      await page.route("https://fixture.bluebird.invalid/api/mobile/v1/**", async (route) => {
        const req = route.request(),
          url = new URL(req.url()),
          path = url.pathname.split("/v1/")[1],
          method = req.method();
        if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
        const token = req.headers().authorization?.split(" ")[1];
        const actor = token ? JSON.parse(Buffer.from(token.split(".")[1], "base64url")).sub : null;
        const fail = (status, code, message) =>
          route.fulfill({ status, headers, body: JSON.stringify({ error: { code, message } }) });
        let data;
        if (path === "bootstrap")
          data = {
            policyVersion: "2026-11-12",
            supabaseUrl: "https://fixture.supabase.co",
            supabaseKey: "sb_publishable_fixture",
            categories: mobileCategories,
            features: {
              accountControls: true,
              fullSearch: true,
              durableSavedSearches: ready,
              push: false,
              advertising: false,
              paidUpgrades: false,
              conversationAttachments: false,
              durablePosting: false,
            },
          };
        else if (path === "search") {
          queries.push(url.search);
          const filters = mobileSearchInput(url.searchParams);
          if (!filters) return fail(400, "invalid_filters", "Check your search filters.");
          const result = mobileCachedSearch(
            { sections: { fixture: { cards, updatedAt: Date.now() } } },
            filters,
          );
          data = {
            items: result.listings.map(dto),
            total: result.total,
            page: result.page,
            pageSize: 24,
            nextPage: null,
            incomplete: false,
          };
        } else if (path.startsWith("listings/"))
          data = dto(cards.find((card) => card.id === path.split("/")[1]));
        else if (path === "home")
          data = { motors: cards.filter((card) => card.vehicle).map(dto), recent: [] };
        else if (path === "saved") data = { items: [] };
        else if (path === "conversations") data = [];
        else if (path === "shopping")
          data = {
            personalization: false,
            trackingAvailable: true,
            recommendationsAvailable: true,
          };
        else if (path === "similar") data = { cards: [], model: "fixture" };
        else if (path === "recommendations")
          data = { recent: [], continuing: [], recommended: [], model: "fixture" };
        else if (path === "activity") throw Error("Permission-off activity must not be sent");
        else if (path === "account")
          data = {
            account: {
              userId: actor,
              displayName: actor === a ? "First fixture" : "Second fixture",
              onboardedAt: "2026-11-01",
              email: session(actor).user.email,
              primaryIntent: "buying",
              homeResortCode: "ID",
              roles: ["user"],
              completion: 1,
            },
            consent: { terms_version: "2026-11-12", shopping_alerts: false },
          };
        else if (path === "account/contact-preferences")
          data = {
            allowEmail: true,
            allowPhone: false,
            allowText: false,
            showContactButtons: true,
            allowInternalMessages: true,
          };
        else if (path === "account/notification-preferences")
          data = {
            messageAlerts: true,
            listingActivity: true,
            savedSearchMatches: true,
            reviewRequests: true,
            listingUpgradeReceipts: true,
            productUpdates: false,
            marketingEmail: false,
          };
        else if (path === "seller") data = { exists: false };
        else if (path === "account/deletion") data = null;
        else if (path === "advertising") data = { advertising: false, att: "not_requested" };
        else if (path === "saved-searches" && method === "GET") {
          assert(actor);
          data = {
            items: (
              await db.query(
                "select * from saved_searches where user_id=$1 order by created_at desc",
                [actor],
              )
            ).rows
              .map(savedSearch)
              .filter(mobileSavedSearchAllowed),
          };
        } else if (path === "saved-searches" || path.startsWith("saved-searches/")) {
          assert(actor);
          const input = req.postDataJSON();
          const receipt = req.headers()["idempotency-key"];
          writes.push({ actor, path, method, receipt, input });
          try {
            await db.query("select set_config('test.actor',$1,false)", [actor]);
            const response = await writeMobileSavedSearch(
              new Request(req.url(), {
                method,
                headers: { "Content-Type": "application/json", "Idempotency-Key": receipt },
                body: JSON.stringify(input),
              }),
              {
                rpc: async (name, args) => {
                  try {
                    return {
                      data: (
                        await db.query(`select ${name}($1,$2,$3,$4) result`, [
                          args._request,
                          args._operation,
                          args._target,
                          args._input,
                        ])
                      ).rows[0].result,
                      error: null,
                    };
                  } catch (error) {
                    return { data: null, error: { message: error.message } };
                  }
                },
              },
              ready,
              async () => {},
            );
            if (method === "POST" && loseNextCreate) {
              loseNextCreate = false;
              return route.abort("connectionreset");
            }
            if (method === "POST" && holdNextCreate) {
              holdNextCreate = false;
              heldCommit = true;
              await new Promise((resolve) => {
                releaseHeld = resolve;
              });
            }
            data = response;
          } catch (error) {
            return fail(
              error.status ?? 400,
              error.code ?? "invalid_request",
              error.status ? error.message : "Invalid fixture request",
            );
          }
        } else throw Error(`Unexpected fixture request ${method} ${path}`);
        return route.fulfill({ status: 200, headers, body: JSON.stringify({ data }) });
      });
      await page.goto(
        origin + "/#/search?category=cars-trucks&make=Ford&mileageBands=Under+25%2C000+miles",
      );
      await page
        .getByRole("link", { name: /Fixture Ford 20k/ })
        .first()
        .waitFor();
      assert.equal(await page.getByRole("link", { name: /Fixture Ford 90k/ }).count(), 0);
      assert.equal(await page.getByRole("link", { name: /Fixture Toyota/ }).count(), 0);
      await page.screenshot({
        path: resolve(output, `vehicles-${viewport.width}.png`),
        fullPage: true,
      });
      assert.equal(await page.evaluate(() => window.fixtureLocationCalls), 0);
      const filtersButton = page.getByRole("button", { name: /^Filters/ });
      if (await filtersButton.isVisible()) await filtersButton.click();
      await page.getByRole("button", { name: "Choose anywhere on map", exact: true }).click();
      await page.getByRole("button", { name: "Use my location", exact: true }).click();
      const locationDeadline = Date.now() + 5000;
      while (!queries.some((query) => new URLSearchParams(query).get("latitude") === "43.62")) {
        if (Date.now() > locationDeadline)
          throw Error("Approximate location preview did not arrive");
        await pause(50);
      }
      assert(queries.some((query) => new URLSearchParams(query).get("longitude") === "-116.2"));
      assert(!queries.some((query) => query.includes("43.615099")));
      await page.evaluate(() => {
        window.fixtureLocationDenied = true;
      });
      await page.getByRole("button", { name: "Use my location", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "Location was not shared" }).waitFor();
      assert(await page.getByPlaceholder("Boise or 83702", { exact: true }).isEnabled());
      await page.screenshot({
        path: resolve(output, `location-${viewport.width}.png`),
        fullPage: true,
      });
      if (viewport.width < 1024) {
        const hash = await page.evaluate(() => location.hash);
        await page.evaluate(async () => {
          const { dismissNativeOverlay } = await import("/src/native-back.ts");
          if (!dismissNativeOverlay()) throw Error("Open filter drawer was not detected");
        });
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        assert.equal(await page.evaluate(() => location.hash), hash);
      }
      await page.reload();
      await page
        .getByRole("link", { name: /Fixture Ford 20k/ })
        .first()
        .waitFor();
      const originalHash = await page.evaluate(() => location.hash);
      await page.evaluate(() => window.scrollTo(0, 150));
      await page.waitForTimeout(100);
      const originalScroll = await page.evaluate(() => window.scrollY);
      await page
        .getByRole("link", { name: /Fixture Ford 20k/ })
        .first()
        .click();
      await page.getByRole("heading", { name: "Fixture Ford 20k", exact: true }).waitFor();
      await page.evaluate(async () => {
        const { backWithinApp } = await import("/src/native-navigation.ts");
        if (!backWithinApp()) throw Error("Same-document app history was not recognized");
      });
      await page
        .getByRole("link", { name: /Fixture Ford 20k/ })
        .first()
        .waitFor();
      assert.equal(await page.evaluate(() => location.hash), originalHash);
      await page.waitForFunction(
        (expected) => Math.abs(window.scrollY - expected) < 3,
        originalScroll,
      );
      await page.getByRole("button", { name: "Save this search", exact: true }).click();
      await page.getByLabel("Search name", { exact: true }).fill("Reliable Ford");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Save search", exact: true })
        .click();
      await page.getByRole("button", { name: "Retry original request" }).waitFor();
      await page.reload();
      await page.getByRole("button", { name: "Retry original request" }).click();
      await page.waitForFunction(
        () =>
          !document.body.textContent.includes(
            "Your earlier saved-search request needs confirmation.",
          ),
      );
      assert.equal(writes.length, 2);
      assert.equal(writes[0].receipt, writes[1].receipt);
      assert.deepEqual(writes[0].input, writes[1].input);
      assert.equal(
        (await db.query("select count(*)::int n from saved_searches where name='Reliable Ford'"))
          .rows[0].n,
        1,
      );
      assert(
        (await db.query("select search from saved_searches where name='Reliable Ford'")).rows[0]
          .search.mobileCatalog,
      );
      await page.goto(origin + "/#/account/searches");
      await page.getByRole("heading", { name: "Reliable Ford", exact: true }).waitFor();
      assert.equal(await page.getByText("Restricted fixture search", { exact: true }).count(), 0);
      const studio = page
        .getByRole("article")
        .filter({ has: page.getByRole("heading", { name: "Fixture studios", exact: true }) });
      await studio.getByRole("button", { name: "Edit all filters for Fixture studios" }).click();
      await page
        .getByRole("link", { name: /Fixture studio/ })
        .first()
        .waitFor();
      assert.equal(await page.getByRole("link", { name: /Fixture family home/ }).count(), 0);
      assert(page.url().includes("bedrooms=Studio"));
      await page.screenshot({
        path: resolve(output, `studios-${viewport.width}.png`),
        fullPage: true,
      });
      await page.goto(origin + "/#/search?category=services&q=drain&serviceExpandSearch=true");
      await page
        .getByRole("link", { name: /Fixture service company/ })
        .first()
        .waitFor();
      await page.screenshot({
        path: resolve(output, `services-${viewport.width}.png`),
        fullPage: true,
      });
      await page.goto(origin + "/#/search?category=jobs&jobType=Full-time");
      await page
        .getByRole("link", { name: /Fixture engineering job/ })
        .first()
        .waitFor();
      await page.screenshot({
        path: resolve(output, `jobs-${viewport.width}.png`),
        fullPage: true,
      });
      await page.goto(origin + "/#/search?category=pets&petSpecies=Dog");
      await page
        .getByRole("link", { name: /Fixture dog/ })
        .first()
        .waitFor();
      await page.screenshot({
        path: resolve(output, `pets-${viewport.width}.png`),
        fullPage: true,
      });
      await page.goto(origin + "/#/account/searches");
      await page.getByRole("heading", { name: "Reliable Ford", exact: true }).waitFor();
      holdNextCreate = true;
      await page
        .getByPlaceholder("Saved search name", { exact: true })
        .fill("First-account pending search");
      await page.getByRole("button", { name: "Save search", exact: true }).click();
      const commitDeadline = Date.now() + 5000;
      while (!heldCommit) {
        if (Date.now() > commitDeadline) throw Error("Delayed write did not commit");
        await pause(30);
      }
      await page.evaluate(async () => {
        const { auth } = await import("/src/client.ts");
        await auth.auth.setSession(window.fixtureSessions.second);
      });
      await page.getByText("No saved searches yet", { exact: true }).waitFor();
      assert.equal(
        await page.getByText("First-account pending search", { exact: true }).count(),
        0,
      );
      assert.equal(await page.getByRole("button", { name: "Retry original request" }).count(), 0);
      await page
        .getByPlaceholder("Saved search name", { exact: true })
        .fill("Second-account search");
      await page.getByRole("button", { name: "Save search", exact: true }).click();
      releaseHeld();
      await page.getByRole("heading", { name: "Second-account search", exact: true }).waitFor();
      assert.equal(
        (
          await db.query(
            "select user_id from saved_searches where name='First-account pending search'",
          )
        ).rows[0].user_id,
        a,
      );
      assert.equal(
        (await db.query("select user_id from saved_searches where name='Second-account search'"))
          .rows[0].user_id,
        b,
      );
      await page.evaluate(async () => {
        const { auth } = await import("/src/client.ts");
        await auth.auth.setSession(window.fixtureSessions.first);
      });
      await page.getByRole("button", { name: "Retry original request" }).waitFor();
      await page.getByRole("button", { name: "Retry original request" }).click();
      await page.waitForFunction(
        () =>
          !document.body.textContent.includes(
            "Your earlier saved-search request needs confirmation.",
          ),
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from saved_searches where name='First-account pending search'",
          )
        ).rows[0].n,
        1,
      );
      assert.equal(await page.getByText("Second-account search", { exact: true }).count(), 0);
      ready = false;
      await page.goto(origin + "/#/account/searches");
      await page.reload();
      await page.getByRole("heading", { name: "Fixture studios", exact: true }).waitFor();
      assert(await page.getByRole("button", { name: "Save search", exact: true }).isDisabled());
      await page.getByRole("button", { name: "Edit all filters for Fixture studios" }).click();
      await page
        .getByRole("link", { name: /Fixture studio/ })
        .first()
        .waitFor();
      await page.goto(origin + "/#/search?category=firearms");
      await page
        .getByRole("alert")
        .filter({ hasText: "This category is unavailable in the app." })
        .waitFor();
      assert.equal(await page.getByRole("link", { name: /Fixture rifle/ }).count(), 0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false);
      results.push({
        viewport: viewport.width,
        filters: true,
        searchBackNavigation: true,
        nativeHashHistory: true,
        backClosesFilterDrawer: true,
        locationOnlyOnTap: true,
        approximateLocation: true,
        deniedLocationKeepsManualEntry: true,
        delayedWriteAccountIsolation: true,
        studio: true,
        serviceDescriptions: true,
        allSavedFiltersPreserved: true,
        reloadRetryReceipt: true,
        retries: writes.length,
        restrictedCatalog: true,
        readDuringWriteOutage: true,
        overflow,
      });
    } finally {
      await page.close();
      await db.close();
    }
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, "results.json"), JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ browserBrowse: "passed", results, errors }));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
