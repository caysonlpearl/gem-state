import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const homeSource = await readFile(new URL("../src/routes/index.tsx", import.meta.url), "utf8");
const browseSource = await readFile(new URL("../src/routes/browse.tsx", import.meta.url), "utf8");
const cardSource = await readFile(
  new URL("../src/components/classifieds/ListingCard.tsx", import.meta.url),
  "utf8",
);

function componentSource(source, fileName, names) {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return names
    .map((name) => {
      const declaration = file.statements.find(
        (node) => ts.isFunctionDeclaration(node) && node.name?.text === name,
      );
      assert.ok(declaration, `${name} must exist`);
      return declaration.getText(file);
    })
    .join("\n");
}

function render(source, fileName, entry, globals = {}) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = vm.createContext({
    React: { createElement: (type, props, ...children) => ({ type, props, children }) },
    ListingCard: "ListingCard",
    Link: "Link",
    ArrowRight: "ArrowRight",
    CategoryGettingStarted: "CategoryGettingStarted",
    AllCategoriesPopover: "AllCategoriesPopover",
    CategoryArtwork: "CategoryArtwork",
    generalCategoryHighlights: [],
    ...globals,
  });
  return vm.runInContext(`${compiled}\n${entry}`, context);
}

function elementsOfType(node, type) {
  if (Array.isArray(node)) return node.flatMap((child) => elementsOfType(child, type));
  if (!node || typeof node !== "object") return [];
  return [
    ...(node.type === type ? [node] : []),
    ...elementsOfType(node.children, type),
  ];
}

const listings = Array.from({ length: 6 }, (_, index) => ({
  id: `listing-${index}`,
  title: `Listing ${index}`,
}));

test("homepage and results grids prioritize only their first listing card", () => {
  assert.match(
    homeSource,
    /leadMotors\.map\(\(listing, index\) => \([\s\S]*?ListingCard listing=\{listing\} priority=\{index === 0\}/,
  );
  assert.match(
    browseSource,
    /shownListings\.map\(\(listing, index\) => \([\s\S]*?ListingCard listing=\{listing\} priority=\{index === 0\}/,
  );
});

test("All Items prioritizes its first Top listings card and leaves the rest lazy", () => {
  const tree = render(
    componentSource(browseSource, "browse.tsx", ["GeneralClassifiedShowcase"]),
    "browse.tsx",
    `GeneralClassifiedShowcase({ listings: ${JSON.stringify(listings)} })`,
  );
  const priorities = elementsOfType(tree, "ListingCard").map((card) => card.props.priority);
  assert.deepEqual(priorities, [true, false, false, false, false, false]);
});

test("category landing and Pets listing showcases prioritize one card per page", () => {
  const showcaseSource = componentSource(browseSource, "browse.tsx", [
    "varietyOf",
    "LandingListingsShowcase",
  ]);
  const tree = render(
    showcaseSource,
    "browse.tsx",
    `LandingListingsShowcase({ eyebrow: "Bluebird Marketplace Pets", title: "Latest pet listings", action: "Browse all pets", browseSearch: { category: "pets" }, listings: ${JSON.stringify(listings)} })`,
  );
  const priorities = elementsOfType(tree, "ListingCard").map((card) => card.props.priority);
  assert.deepEqual(priorities, [true, false, false, false]);
  assert.match(
    browseSource,
    /pets && petLanding && \([\s\S]*?title="Latest pet listings"[\s\S]*?listings=\{result\.listings\}/,
  );
});

test("listing images stay lazy by default and only opt-in images get high fetch priority", () => {
  assert.match(cardSource, /loading=\{priority \? "eager" : "lazy"\}/);
  assert.match(cardSource, /fetchPriority=\{priority \? "high" : undefined\}/);
});
