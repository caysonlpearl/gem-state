import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { groupUnreadable } from "../src/lib/fb-import-queue.ts";

const load = (n) =>
  readFileSync(new URL(`../tools/fb-import-extension/${n}`, import.meta.url), "utf8");

// Minimal element tree: tag, classes, data-testid, text, children.
function el(tag, { cls = "", testid = "", text = "", src = "" } = {}, children = []) {
  const node = { tag, cls: cls.split(" ").filter(Boolean), testid, src, children, parent: null };
  for (const c of children) c.parent = node;
  node.textContent = text + children.map((c) => c.textContent).join("");
  node.innerText = node.textContent;
  node.getAttribute = (k) => (k === "data-testid" ? testid || null : null);
  node.getClientRects = () => [1];
  const matches = (n, sel) =>
    sel.split(",").some((part) => {
      const s = part.trim();
      if (s === ".u-visually-hidden") return n.cls.includes("u-visually-hidden");
      if (s === "[class*='status']") return n.cls.some((c) => c.includes("status"));
      if (s === "section") return n.tag === "section";
      const m = s.match(/^(img)?\[data-testid([*^])='([^']+)'\]$/);
      if (m) {
        if (m[1] && n.tag !== "img") return false;
        return m[2] === "*" ? n.testid.includes(m[3]) : n.testid.startsWith(m[3]);
      }
      return false;
    });
  const all = (n) => n.children.flatMap((c) => [c, ...all(c)]);
  node.querySelectorAll = (sel) => all(node).filter((n) => matches(n, sel));
  node.closest = (sel) => {
    for (let n = node; n; n = n.parent) if (matches(n, sel)) return n;
    return null;
  };
  return node;
}

const product = {
  "@type": "Product",
  name: "Shirt",
  description: "Cotton",
  offers: { price: "12.50", availability: "https://schema.org/InStock" },
  image: "https://images1.vinted.net/t/abc/a.webp",
};

function run(root) {
  const doc = el("body", {}, [root]);
  const document = {
    body: doc,
    querySelectorAll: (sel) =>
      sel === "script[type='application/ld+json']"
        ? [{ textContent: JSON.stringify(product) }]
        : doc.querySelectorAll(sel),
  };
  const c = vm.createContext({ document, location: { pathname: "/items/2-shirt" } });
  vm.runInContext(load("vinted.js"), c);
  return JSON.parse(JSON.stringify(c.vintedExtractItemInPage(true)));
}
const photo = (n = 1) =>
  el("img", { testid: `item-photo-${n}`, src: "https://images1.vinted.net/t/abc/a.webp" });

test("Vinted gallery favorite-removal announcement never means inventory was removed", () => {
  const r = run(
    el("section", { cls: "web_ui__x_9f3a" }, [
      el("span", { cls: "u-visually-hidden", text: "Removed!" }),
      photo(),
    ]),
  );
  assert.equal(r.unavailable, undefined);
  assert.equal(r.priceCents, 1250);
});
test("Vinted unverified hidden gallery text never overrides inventory data", () => {
  const r = run(
    el("section", {}, [el("span", { cls: "u-visually-hidden", text: "Sold" }), photo()]),
  );
  assert.equal(r.unavailable, undefined);
  assert.equal(r.priceCents, 1250);
});
test("Removed/sold in similar or member item grids never marks the listing unavailable", () => {
  for (const testid of ["similar-items", "closet-items", "member-items"]) {
    const r = run(
      el("div", {}, [
        el("section", {}, [photo()]),
        el("div", { testid }, [
          el("section", {}, [
            el("span", { cls: "u-visually-hidden", text: "Removed!" }),
            el("img", { testid: "item-photo-9", src: "https://images1.vinted.net/t/z/z.webp" }),
          ]),
        ]),
      ]),
    );
    assert.equal(r.unavailable, undefined, testid);
    assert.equal(r.priceCents, 1250);
  }
});
test("Non-exact hidden gallery text such as 'Tag removed!' is ignored", () => {
  const r = run(
    el("section", {}, [el("span", { cls: "u-visually-hidden", text: "Tag removed!" }), photo()]),
  );
  assert.equal(r.unavailable, undefined);
});
test("new reader failure codes have labels and pass sanitization", () => {
  const out = groupUnreadable(
    [
      { site: "Vinted", reason: "injection_failed", count: 1 },
      { site: "Vinted", reason: "empty_result", count: 2 },
      { site: "Vinted", reason: "challenge_detected", count: 3 },
    ],
    6,
  );
  assert.deepEqual(out.map((d) => d.reason).sort(), [
    "challenge_detected",
    "empty_result",
    "injection_failed",
  ]);
});
