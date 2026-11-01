import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { seoCollectionFromSlug, collectionAvailableIn } from "../src/lib/seo-collections.ts";

// Guides and glossary entries are hand-written content, so their internal
// links and category tags are easy to get wrong silently: an /idaho/ link to
// a category that doesn't exist is a 404, and an unknown category tag means
// the guide never shows on any landing page. Check them against the real
// category, city and guide lists.
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const config = await read("src/config/classifieds.ts");
const placePages = await read("src/lib/place-pages.ts");
const guidesSource = await read("src/content/guides.ts");
const glossarySource = await read("src/content/glossary.ts");

const between = (source, start) => {
  const from = source.indexOf(start);
  return source.slice(from, source.indexOf("] as const", from));
};
const quoted = (block, key) =>
  [...block.matchAll(new RegExp(`${key}"([^"]+)"`, "g"))].map((m) => m[1]);

const categorySlugs = new Set(
  quoted(between(config, "export const classifiedCategories"), "slug:\\s*"),
);
const urlAliases = Object.fromEntries(
  [...placePages.matchAll(/"([a-z-]+)":\s*"([a-z-]+)"/g)].map((m) => [m[2], m[1]]),
);
const categoryUrlSlugs = new Set(
  [...categorySlugs].map(
    (slug) => Object.entries(urlAliases).find(([, internal]) => internal === slug)?.[0] ?? slug,
  ),
);
const placeSlug = (name) =>
  name
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const places = new Set(
  [
    ...quoted(between(config, "export const idahoRegions"), ""),
    ...quoted(between(config, "export const idahoCities"), ""),
  ].map(placeSlug),
);
const citiesBySlug = new Map(
  quoted(between(config, "export const idahoCities"), "").map((name) => [placeSlug(name), name]),
);
const guideSlugs = new Set(quoted(guidesSource, "slug:\\s*"));

function knownIdahoPath(first, second) {
  const collection = seoCollectionFromSlug(second || first);
  if (collection)
    return (
      !second ||
      (citiesBySlug.has(first) && collectionAvailableIn(collection, citiesBySlug.get(first)))
    );
  return second
    ? places.has(first) && categoryUrlSlugs.has(second)
    : places.has(first) || categoryUrlSlugs.has(first);
}

const internalLinks = (source) => [
  ...[...source.matchAll(/\]\((\/[^)\s]*)\)/g)].map((m) => m[1]),
  ...[...source.matchAll(/path:\s*"(\/[^"]*)"/g)].map((m) => m[1]),
];

test("guide and glossary links point at pages that exist", () => {
  const broken = [];
  for (const link of [...internalLinks(guidesSource), ...internalLinks(glossarySource)]) {
    const [, first, second] = link.split("/").filter(Boolean);
    if (link.startsWith("/idaho/")) {
      const ok = knownIdahoPath(first, second);
      if (!ok) broken.push(link);
    } else if (link.startsWith("/guides/") && !guideSlugs.has(first)) {
      broken.push(link);
    }
  }
  assert.ok(categorySlugs.size > 10 && places.size > 10, "expected to read categories and places");
  assert.deepEqual(broken, [], `Links to pages that don't exist:\n${broken.join("\n")}`);
});

test("guide collection links accept only configured city combinations", () => {
  assert.equal(knownIdahoPath("twin-falls", "houses-for-rent"), true);
  assert.equal(knownIdahoPath("boise", "plumbers"), true);
  assert.equal(knownIdahoPath("twin-falls", "plumbers"), false);
  assert.equal(knownIdahoPath("treasure-valley", "plumbers"), false);
  assert.equal(knownIdahoPath("invented", "houses-for-rent"), false);
});

test("guide category tags are real categories", () => {
  const tags = [...guidesSource.matchAll(/categories:\s*\[([^\]]*)\]/g)].flatMap((m) =>
    [...m[1].matchAll(/"([a-z-]+)"/g)].map((tag) => tag[1]),
  );
  assert.ok(tags.length > 0);
  assert.deepEqual(
    tags.filter((tag) => !categorySlugs.has(tag)),
    [],
  );
});
