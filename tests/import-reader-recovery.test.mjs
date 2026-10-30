import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const load = (file) =>
  readFileSync(new URL("../tools/fb-import-extension/" + file, import.meta.url), "utf8");

test("Vinted waits for wardrobe hydration, keeps the first cards and parses current overlay metadata", async () => {
  let tick = 0,
    scrolled = false;
  const card = { querySelector: () => null };
  const link = (id, title, price) => ({
    href: `https://www.vinted.com/items/${id}`,
    parentElement: card,
    closest: (sel) => (sel.startsWith("header") ? null : card),
    getAttribute: (k) =>
      k === "title"
        ? `${title}, brand: Vintage, condition: Good, $${price}, $9.00 includes Vinted fee`
        : null,
  });
  const document = {
    body: {
      get innerText() {
        return tick < 2 ? "" : "2 items";
      },
      scrollHeight: 1500,
    },
    querySelector: () => null,
    querySelectorAll: () =>
      tick < 2
        ? []
        : scrolled
          ? [link(1, "Bowl", "6.00"), link(2, "Cup", "7.50")]
          : [link(1, "Bowl", "6.00")],
  };
  const window = {
    innerHeight: 1000,
    scrollY: 0,
    scrollTo() {},
    scrollBy() {
      scrolled = true;
      this.scrollY = 500;
    },
  };
  const c = vm.createContext({
    document,
    window,
    location: { pathname: "/member/123" },
    setTimeout: (fn) => {
      tick++;
      fn();
    },
  });
  vm.runInContext(load("vinted.js"), c);
  const r = await c.vintedCollectFromProfile();
  assert.equal(r.expected, 2);
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].title, "Bowl");
  assert.equal(r.items[0].priceCents, 600);
  assert.equal(r.items[1].priceCents, 750);
});

test("Facebook discounted and decimal prices do not require a leaf with the current price", async () => {
  for (const [line, cents] of [
    ["$2,750$3,250", 275000],
    ["$12.50", 1250],
    ["$850/month", 85000],
  ]) {
    const text = `Commercial space\n${line}\nListed today\nDetails\nCondition\nNew\nA complete source description\nLocation is approximate`;
    const block = { innerText: text, parentElement: null };
    const leaf = {
      children: [{}],
      childNodes: [{ nodeType: 3, textContent: line.split("$").slice(0, 2).join("$") }],
      parentElement: block,
    };
    const c = vm.createContext({
      document: {
        body: { innerText: text },
        querySelectorAll: () => [leaf],
        querySelector: () => null,
      },
      setTimeout,
      Date,
    });
    const src = load("background.js");
    vm.runInContext(
      src.slice(
        src.indexOf("async function extractListingDetailsInPage"),
        src.indexOf("\nfunction listingIdFromUrl"),
      ),
      c,
    );
    const r = await c.extractListingDetailsInPage(false);
    assert.equal(r.priceCents, cents);
    assert.match(r.description, /complete source/);
  }
});

test("a matching interactive document is readable even if ads keep the Chrome tab loading", async () => {
  for (const sameDocument of [true, false]) {
    let listeners = 0;
    const c = vm.createContext({
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      exec: async () => ({
        url: sameDocument ? "https://test/listing/new" : "https://test/listing/old",
        ready: "interactive",
        hasBody: true,
      }),
      chrome: {
        tabs: {
          get: (_id, cb) => cb({ status: "loading", url: "https://test/listing/new" }),
          onUpdated: { addListener: () => listeners++, removeListener: () => listeners-- },
        },
      },
    });
    vm.runInContext(load("paced-reader.js"), c);
    assert.equal(await c.waitForPage(1, (u) => u.endsWith("/new"), 40, 1, true), sameDocument);
    assert.equal(listeners, 0);
  }
});
