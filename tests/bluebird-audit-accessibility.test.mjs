import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const placePageSource = await readFile(
  new URL("../src/components/classifieds/PlacePage.tsx", import.meta.url),
  "utf8",
);
const emptyStateSource = await readFile(
  new URL("../src/components/layout/BluebirdEmptyState.tsx", import.meta.url),
  "utf8",
);
const listingCardSource = await readFile(
  new URL("../src/components/classifieds/ListingCard.tsx", import.meta.url),
  "utf8",
);

function componentSource(source, fileName, name) {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const declaration = file.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === name,
  );
  assert.ok(declaration, `${name} must exist`);
  return declaration.getText(file).replace(/^export\s+/, "");
}

function render(source, fileName, entry, globals = {}) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return vm.runInContext(
    `${compiled}\n${entry}`,
    vm.createContext({
      React: { createElement: (type, props, ...children) => ({ type, props, children }) },
      Link: "Link",
      cn: (...classes) => classes.filter(Boolean).join(" "),
      listingParam: (listing) => listing.id,
      ...globals,
    }),
  );
}

function elementsOfType(node, type) {
  if (Array.isArray(node)) return node.flatMap((child) => elementsOfType(child, type));
  if (!node || typeof node !== "object") return [];
  return [...(node.type === type ? [node] : []), ...elementsOfType(node.children, type)];
}

test("empty city/category pages keep one page h1 and use an h2 for the empty state", () => {
  assert.match(placePageSource, /<h1[^>]*>\s*\{data\.heading\}\s*<\/h1>/);
  assert.match(
    placePageSource,
    /<BluebirdEmptyState\s+headingLevel="h2"\s+title="Nothing listed here yet"/,
  );

  const component = componentSource(
    emptyStateSource,
    "BluebirdEmptyState.tsx",
    "BluebirdEmptyState",
  );
  const tree = render(
    component,
    "BluebirdEmptyState.tsx",
    'BluebirdEmptyState({ title: "Nothing listed here yet", description: "Try nearby cities.", headingLevel: "h2" })',
  );
  assert.equal(elementsOfType(tree, "h1").length, 0);
  assert.equal(elementsOfType(tree, "h2").length, 1);
});

test("other empty states retain the component's default h1", () => {
  const component = componentSource(
    emptyStateSource,
    "BluebirdEmptyState.tsx",
    "BluebirdEmptyState",
  );
  const tree = render(
    component,
    "BluebirdEmptyState.tsx",
    'BluebirdEmptyState({ title: "Unavailable" })',
  );
  assert.equal(elementsOfType(tree, "h1").length, 1);
  assert.equal(elementsOfType(tree, "h2").length, 0);
});

test("photo-only listing links expose a title-based accessible name", () => {
  assert.match(
    listingCardSource,
    /<ListingLink\s+listing=\{listing\}\s+className="block"\s+ariaLabel=\{"View listing: " \+ listing\.title\}\s*>\s*<Photo/,
  );

  const component = componentSource(listingCardSource, "ListingCard.tsx", "ListingLink");
  const link = render(
    component,
    "ListingCard.tsx",
    'ListingLink({ listing: { id: "listing-1", title: "Oak desk" }, className: "block", ariaLabel: "View listing: Oak desk", children: "photo" })',
  );
  assert.equal(link.type, "Link");
  assert.equal(link.props["aria-label"], "View listing: Oak desk");
});
