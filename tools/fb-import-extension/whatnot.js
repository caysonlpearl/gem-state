/**
 * Whatnot reader for the Bluebird listing import extension.
 *
 * Open a seller's Whatnot profile or shop (whatnot.com/user/<name>/shop) and
 * click the extension. It loads their shop, then opens each product in two windows (paced-reader.js). Only fixed-price "Buy Now" products are imported:
 * live-show auction lots list a $1 starting bid, which isn't a real price.
 * Whatnot doesn't show where a seller is, so the city is set during review.
 *
 * Loaded into the service worker with importScripts() from background.js.
 */

const WHATNOT_USER_RE = /^https:\/\/(?:www\.)?whatnot\.com\/user\/([^/?#]+)/;
const WHATNOT_LISTING_RE = /^https:\/\/(?:www\.)?whatnot\.com\/listing\/([^/?#]+)/;

function whatnotListingId(url) {
  const match = (url || "").match(WHATNOT_LISTING_RE);
  return match ? decodeURIComponent(match[1]) : null;
}

// --- In-page: the seller's shop ------------------------------------------------

async function whatnotCollectFromShop() {
  const username = decodeURIComponent((location.pathname.match(/\/user\/([^/]+)/) || [])[1] || "");
  const expected =
    Number(
      (document.body.innerText.match(/Products\s*\((\d[\d,]*)\)/) || [])[1]?.replace(/,/g, ""),
    ) || 0;
  const selector = "a[href^='/listing/'], a[href*='whatnot.com/listing/']";
  const accumulated = new Map();
  const capture = () => {
    for (const a of document.querySelectorAll(selector))
      accumulated.set(a.href.split("?")[0], a.cloneNode(true));
  };
  const count = () =>
    new Set(Array.from(document.querySelectorAll(selector)).map((a) => a.href.split("?")[0])).size;
  let last = -1;
  let still = 0;
  for (let i = 0; i < 150 && still < 4; i++) {
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((resolve) => setTimeout(resolve, 900));
    capture();
    const now = accumulated.size;
    if (expected && now >= expected) break;
    still = now === last ? still + 1 : 0;
    last = now;
  }
  window.scrollTo(0, 0);

  const items = [];
  const seen = new Set();
  capture();
  for (const link of accumulated.values()) {
    // Only the seller's own shop grid, not "More from" rails elsewhere.
    if (link.closest("header, nav, footer")) continue;
    const id = (link.href.match(/\/listing\/([^/?#]+)/) || [])[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    items.push({ sourceUrl: `https://www.whatnot.com/listing/${id}` });
  }
  // "Profile · stewsshoes · Stew and Zach · Whatnot: …"
  const titleParts = document.title.split(" · ");
  return {
    sellerName: (titleParts[2] && !/whatnot/i.test(titleParts[2])
      ? titleParts[2]
      : titleParts[1] || username
    ).trim(),
    sourceProfileUrl: `https://www.whatnot.com/user/${username}`,
    expected,
    explicitEnd: /no (?:more )?(?:items|products)|wardrobe is empty/i.test(document.body.innerText),
    items,
  };
}

// --- In-page: one product -------------------------------------------------------

function whatnotExtractListingInPage(withPhotos) {
  const product = Array.from(document.querySelectorAll("script[type='application/ld+json']"))
    .map((script) => {
      try {
        return JSON.parse(script.textContent || "");
      } catch {
        return null;
      }
    })
    .flat()
    .find((data) => data && data["@type"] === "Product");
  const body = (document.querySelector("main") || document.body || {}).innerText || "";
  if (!product) {
    if (
      /listing (is )?(no longer|not) available|page not found|sold out/i.test(body.slice(0, 1500))
    ) {
      return { unavailable: true, sold: /sold out/i.test(body.slice(0, 1500)) };
    }
    return null;
  }
  const head = body.slice(0, 800);
  if (/sold out|no longer available|0 available/i.test(head))
    return { unavailable: true, sold: true };
  // Auction lots: a starting bid, not a price.
  const auction =
    /pre-?bid|place (a )?bid|starting bid|current bid/i.test(head) && !/buy (it )?now/i.test(head);
  const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers || {};
  const price = Number(offer.price);
  const result = {
    title: String(product.name || "").trim(),
    description: String(product.description || "")
      .trim()
      .slice(0, 5000),
    priceCents: Number.isFinite(price) && price > 0 ? Math.round(price * 100) : null,
    whatnotCondition: (body.match(/Condition\s*\t?\s*\n?([^\n\t]+)/) || [])[1] || "",
    auction,
    sourceSubcategory: typeof product.category === "string" ? product.category : "",
  };
  if (withPhotos) {
    const numeric = (() => {
      try {
        const id = decodeURIComponent(
          (location.pathname.match(/\/listing\/([^/?#]+)/) || [])[1] || "",
        );
        return (atob(id).match(/(\d+)$/) || [])[1] || "";
      } catch {
        return "";
      }
    })();
    const ldImages = [].concat(product.image || []).filter(Boolean);
    const gallery = numeric
      ? Array.from(document.querySelectorAll("img"))
          .map((img) => img.currentSrc || img.src || "")
          .filter((src) => src.includes(`listings%2F${numeric}-`))
      : [];
    result.photoUrls = (ldImages.length ? ldImages : [...new Set(gallery)]).slice(0, 8);
  }
  return result;
}

// --- Mapping to Bluebird -----------------------------------------------------

function whatnotMapCondition(text) {
  const value = String(text || "").toLowerCase();
  if (/new with tags|brand new|sealed/.test(value)) return "new_with_tags";
  if (/^new|new without tags|open box/.test(value)) return "new_without_tags";
  if (/like new|excellent|mint|near mint/.test(value)) return "used_excellent";
  return "used_good";
}

// Whatnot doesn't expose its own category on public pages, so the category
// comes from the title, checked in this order. Descriptions are only used
// for book signals: book blurbs mention cars, babies and watches, and
// scanning them for everything put novels in Cars & Trucks.
const WHATNOT_TITLE_RULES = [
  [
    /\b(blind ?box|pop ?mart|labubu|nanci|maymei|cry ?baby|crybaby|sanrio|hippers|miniso|funko|vinyl figures?|figures?|figurines?|confirmed|chase|ron english|mindstyle|popland|smiski|sonny angel|key ?chains?|keychains?|charms?|trading cards?|pok[eé]mon|sports cards?|psa ?\d|bgs ?\d|graded|slab|hot wheels|diecast|collectibles?)\b/,
    "collectibles",
  ],
  // Strong book markers beat clothing words ("In Her Shoes (Paperback)").
  [
    /\b(paperback|hardcover|hard cover|novels?|sprayed edges?|duology|trilogy|series ?#\d*|collector'?s edition|reprint)\b/,
    "books-media",
  ],
  [
    /\b(bags?|backpacks?|purses?|pouch|totes?|wallets?|clutch|crossbody|handbags?|sandals|shoes|sneakers|boots|heels|slippers|dress(es)?|shirts?|tees?|t-shirts?|hoodies?|sweaters?|cardigans?|jackets?|coats?|jeans|leggings|skirts?|shorts|pajamas|scarf|hats?|beanies?|sunglasses)\b/,
    "apparel-accessories",
  ],
  [
    /\b(squish(y|ies)|plush(ies)?|stuffed animals?|toys?|lego|dolls?|barbie|erasers?|pencils?|notebooks?|stickers?|crayons|coloring)\b/,
    "baby-kids",
  ],
  [
    /\b(jewelry|necklaces?|bracelets?|earrings?|rings?|pendants?|watch(es)?|sterling silver|925)\b/,
    "jewelry-watches",
  ],
  [
    /\b(paperback|hardcover|hard cover|novels?|books?|series ?#|edition|sprayed edges?|duology|trilogy|omnibus|manga|comics?|graphic novel|vinyl records?|\blps?\b|dvds?|blu-?ray)\b/,
    "books-media",
  ],
];
const WHATNOT_BOOK_WORDS =
  /\b(novels?|paperback|hardcover|books?|authors?|bestsell(ing|er)|edition|chapters?|romance|thriller|mystery|fantasy|memoir|heroine|tale|saga|fiction|series)\b/;

function whatnotMapCategory(title, description) {
  const name = String(title || "").toLowerCase();
  for (const [pattern, slug] of WHATNOT_TITLE_RULES) if (pattern.test(name)) return slug;
  if (WHATNOT_BOOK_WORDS.test(String(description || "").toLowerCase())) return "books-media";
  // Last, the shared title-only guess (never the description).
  const guess = typeof inferCategory === "function" ? inferCategory(title, "") : "general";
  return guess || "general";
}

/**
 * Whatnot sellers usually stick to one kind of thing. When most of a
 * seller's items clearly share a category, items with nothing to go on
 * (a bare title like "Verity", "No description found") take that one
 * instead of General; anything else is still set in review.
 */
function whatnotFillFromMajority(items) {
  const counts = new Map();
  for (const item of items) {
    if (item.categorySlug !== "general")
      counts.set(item.categorySlug, (counts.get(item.categorySlug) || 0) + 1);
  }
  const [top, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  if (!top || topCount < items.length * 0.5) return items;
  return items.map((item) =>
    item.categorySlug === "general" ? { ...item, categorySlug: top } : item,
  );
}

function whatnotToImportItem(item) {
  return {
    sourceUrl: item.sourceUrl,
    title: String(item.title || "").slice(0, 120),
    description: item.description || "",
    priceCents: item.priceCents == null ? 0 : item.priceCents,
    condition: whatnotMapCondition(item.whatnotCondition),
    categorySlug: whatnotMapCategory(item.title, item.description),
    subcategory: item.sourceSubcategory || "",
    // Whatnot doesn't show a seller's location; set the city during review.
    city: "",
    state: "ID",
    photoUrls: item.photoUrls || [],
  };
}

// --- Driving the browser -----------------------------------------------------

function whatnotReadListings(items, options) {
  return readListingsPaced(items, {
    siteName: "Whatnot",
    extract: whatnotExtractListingInPage,
    idOf: whatnotListingId,
    settleMs: 2000,
    ...options,
  });
}

async function runWhatnot(tabId, url) {
  const say = (body) =>
    overlay(
      tabId,
      `<strong>Bluebird import · Whatnot</strong><div style="margin-top:6px">${body}</div>`,
    );
  // The products are on the shop tab.
  const username = (url.match(WHATNOT_USER_RE) || [])[1];
  if (!/\/shop\b/.test(new URL(url).pathname)) {
    await chrome.tabs.update(tabId, { url: `https://www.whatnot.com/user/${username}/shop` });
    await waitForPage(tabId, (current) => /\/shop\b/.test(current), 25000, 2500);
  }
  await say("Scrolling to load this seller's shop…");
  const shop = await exec(tabId, whatnotCollectFromShop);
  if (!shop || !shop.items.length) {
    await say("No products found in this seller's shop.");
    return;
  }
  const items = shop.items;
  const seller = shop.sellerName ? `Seller: ${shop.sellerName}<br/>` : "";
  let done = 0;
  const progress = () =>
    say(`${seller}${items.length} product(s) found.<br/>Reading products… ${done}/${items.length}`);
  await progress();
  await whatnotReadListings(items, {
    withPhotos: true,
    onItemDone: () => {
      done += 1;
      progress();
    },
    notify: (message) => say(`${seller}${message}`),
  });

  const auctions = items.filter((item) => item.auction).length;
  const usable = items.filter((item) => !item.unavailable && !item.auction && item.priceCents);
  const sold = items.filter((item) => item.unavailable).length;
  const unreadable = usable.filter((item) => item.unreadable).length;
  await deliverImport(
    tabId,
    say,
    seller,
    {
      sourceProfileUrl: shop.sourceProfileUrl,
      sellerName: shop.sellerName || undefined,
      items: whatnotFillFromMajority(usable.map(whatnotToImportItem)),
    },
    [
      ...(auctions ? [`${auctions} auction lot(s) skipped (no fixed price)`] : []),
      ...(sold ? [`${sold} sold out`] : []),
      ...(unreadable
        ? [`${unreadable} couldn't be fully read (check photos and description)`]
        : []),
      "set each listing's city during review",
    ],
  );
}

async function whatnotRefresh(targets, onItemDone) {
  const items = targets.map((t) => ({ sourceUrl: t.sourceUrl }));
  await whatnotReadListings(items, { withPhotos: false, onItemDone });
  return items
    .filter((item) => !item.unreadable)
    .map((item) => ({
      sourceUrl: item.sourceUrl,
      title: item.title || undefined,
      priceCents: item.priceCents,
      description: item.description,
      unavailable: item.unavailable === true,
      sold: item.sold === true,
    }));
}
