import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import {
  listingCardImageUrl,
  priorityListingCardImageUrl,
  listingCardImageFallbacks,
} from "../src/lib/listing-card-image.ts";
import { renderToStaticMarkup } from "react-dom/server";

const homeSource = await readFile(new URL("../src/routes/index.tsx", import.meta.url), "utf8");
const browseSource = await readFile(new URL("../src/routes/browse.tsx", import.meta.url), "utf8");
const cardSource = await readFile(
  new URL("../src/components/classifieds/ListingCard.tsx", import.meta.url),
  "utf8",
);
const placePageSource = await readFile(
  new URL("../src/components/classifieds/PlacePage.tsx", import.meta.url),
  "utf8",
);

function componentSource(source, fileName, names) {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
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
  return [...(node.type === type ? [node] : []), ...elementsOfType(node.children, type)];
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
    `LandingListingsShowcase({ eyebrow: "Bluebird Marketplace Pets", title: "Latest pet listings", action: "Browse all pets", browseSearch: { category: "pets" }, listings: ${JSON.stringify(listings)}, compact: true })`,
  );
  const cards = elementsOfType(tree, "ListingCard");
  const priorities = cards.map((card) => card.props.priority);
  assert.deepEqual(priorities, [true, false, false, false, false]);
  const listItems = elementsOfType(tree, "li");
  assert.match(listItems[4].props.className, /hidden lg:block/);
  assert.match(
    browseSource,
    /pets && petLanding && \([\s\S]*?title="Latest pet listings"[\s\S]*?listings=\{result\.listings\}/,
  );
});

test("city and category inventory pages prioritize only the first card in the first visible group", () => {
  assert.match(
    placePageSource,
    /group\.listings\.map\(\(listing, index\) => \([\s\S]*?priority=\{groupIndex === 0 && index === 0\}/,
  );
  assert.match(
    placePageSource,
    /data\.listings\.map\(\(listing, index\) => \([\s\S]*?priority=\{index === 0\}/,
  );
  assert.doesNotMatch(placePageSource, /priority=\{[^}]*index < 2/);
});

test("other homepage showcase sections do not add extra eager cards", () => {
  const source = componentSource(browseSource, "browse.tsx", ["HomepageShowcaseRows"]);
  assert.doesNotMatch(source, /priority=/);
});

test("listing images stay lazy by default and only opt-in images get high fetch priority", () => {
  assert.match(cardSource, /loading=\{priority \? "eager" : "lazy"\}/);
  assert.match(cardSource, /fetchPriority=\{priority \? "high" : undefined\}/);
  assert.match(
    cardSource,
    /<LogoPhoto listing=\{listing\} logoUrl=\{logoUrl\} ratio=\{ratio\} priority=\{priority\} \/>/,
  );
});

test("prioritized employer logos render eagerly and retain lazy loading otherwise", () => {
  const logoImage = componentSource(cardSource, "ListingCard.tsx", ["LogoImage"]);
  const compiled = ts.transpileModule(logoImage.replace(/^function /, "function "), {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const LogoImage = vm.runInNewContext(`${compiled}\nLogoImage`, {
    React,
    useRef: React.useRef,
    useEffect: React.useEffect,
  });

  const prioritized = renderToStaticMarkup(
    React.createElement(LogoImage, {
      src: "/logo.svg",
      className: "logo",
      onMissing() {},
      priority: true,
    }),
  );
  const following = renderToStaticMarkup(
    React.createElement(LogoImage, { src: "/logo.svg", className: "logo", onMissing() {} }),
  );
  assert.match(prioritized, /loading="eager"/);
  assert.match(prioritized, /fetchPriority="high"|fetchpriority="high"/i);
  assert.match(following, /loading="lazy"/);
  assert.doesNotMatch(following, /fetchPriority="high"|fetchpriority="high"/i);
});

test("the rendered listing photo emits eager/high only for the first visible fixture", () => {
  const photo = componentSource(cardSource, "ListingCard.tsx", ["ListingCardPhoto"]);
  const compiled = ts.transpileModule(photo.replace(/^export\s+/, ""), {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const ListingCardPhoto = vm.runInNewContext(`${compiled}\nListingCardPhoto`, {
    React,
    listingLogoUrl: () => undefined,
    listingCardImageUrl,
    priorityListingCardImageUrl,
    listingCardImageFallbacks,
    LogoPhoto: "LogoPhoto",
    PlaceholderPhoto: "PlaceholderPhoto",
  });
  const fixture = {
    id: "synthetic-sofa",
    title: "Mid-century blue sofa",
    imageUrl: "/tests/fixtures/bluebird-sofa.svg",
  };

  const firstImage = renderToStaticMarkup(
    React.createElement(ListingCardPhoto, { listing: fixture, priority: true }),
  );
  const followingImage = renderToStaticMarkup(
    React.createElement(ListingCardPhoto, { listing: { ...fixture, id: "synthetic-dog" } }),
  );

  const original = "https://images.craigslist.org/00x0x_accRZPM5AdB_0CI0t2_1200x900.jpg";
  const element = ListingCardPhoto({ listing: { ...fixture, imageUrl: original } });
  const photoElement = element.props.children[0];
  let assignments = 0;
  const image = {
    dataset: {},
    set src(value) {
      assignments += 1;
      assert.equal(value, original);
    },
  };
  photoElement.props.onError({ currentTarget: image });
  photoElement.props.onError({ currentTarget: image });
  assert.equal(assignments, 1, "failed thumbnail falls back only once");
  const local = ListingCardPhoto({ listing: fixture }).props.children[0];
  local.props.onError({ currentTarget: image });
  assert.equal(assignments, 1, "relative originals never enter a retry loop");

  const priorityPhoto = ListingCardPhoto({
    listing: { ...fixture, imageUrl: original },
    priority: true,
  }).props.children[0];
  assert.equal(priorityPhoto.props.src, priorityListingCardImageUrl(original));
  assert.equal(
    priorityPhoto.key,
    priorityPhoto.props.src,
    "changing the source resets fallback state",
  );
  const attempts = [];
  const priorityImage = {
    dataset: {},
    set src(value) {
      attempts.push(value);
    },
  };
  for (let i = 0; i < 3; i++) priorityPhoto.props.onError({ currentTarget: priorityImage });
  assert.deepEqual(attempts, [listingCardImageUrl(original), original]);

  assert.match(firstImage, /loading="eager"/);
  assert.match(firstImage, /fetchPriority="high"|fetchpriority="high"/i);
  assert.match(followingImage, /loading="lazy"/);
  assert.doesNotMatch(followingImage, /fetchPriority="high"|fetchpriority="high"/i);
});
