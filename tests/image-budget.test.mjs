import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";

// Phone speed (Core Web Vitals) depends on images staying small. A single
// oversized illustration doubled the home page's weight once, so every image
// the site's code points at must stay under its budget. Full-size originals
// can still live in public/ for outside links as long as no page uses them.
const DECORATIVE_BUDGET_BYTES = 150 * 1024; // logo, icons, illustrations
const LISTING_PHOTO_BUDGET_BYTES = 300 * 1024; // full-size gallery photos
const budgetFor = (image) =>
  image.startsWith("images/mock-vehicles/") ? LISTING_PHOTO_BUDGET_BYTES : DECORATIVE_BUDGET_BYTES;
const IMAGE_REFERENCE =
  /["'`(]\/((?:images|category-icons)\/[^"'`)\s?#]+\.(?:png|jpe?g|webp|avif|gif|svg))/g;

const root = new URL("../", import.meta.url);

async function sourceFiles(dir) {
  const entries = await readdir(new URL(dir, root), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (/\.(?:tsx?|css)$/.test(entry.name)) files.push(path);
  }
  return files;
}

test("every image the site uses stays within the phone-speed budget", async () => {
  const referenced = new Map();
  for (const file of await sourceFiles("src")) {
    const source = await readFile(new URL(file, root), "utf8");
    for (const match of source.matchAll(IMAGE_REFERENCE)) {
      if (!referenced.has(match[1])) referenced.set(match[1], file);
    }
  }
  assert.ok(referenced.size > 0, "expected the site to reference some images");

  const overBudget = [];
  for (const [image, file] of referenced) {
    // A path with no file behind it (leftover catalog references) isn't
    // served, so it costs nothing here.
    const size = await stat(new URL(`public/${image}`, root)).then(
      (info) => info.size,
      () => 0,
    );
    if (size > budgetFor(image)) {
      overBudget.push(
        `/${image} (${Math.round(size / 1024)} KB, budget ${budgetFor(image) / 1024} KB, used in ${file})`,
      );
    }
  }
  assert.deepEqual(
    overBudget,
    [],
    `Resize or convert these to WebP at about twice their display size:\n${overBudget.join("\n")}`,
  );
});
