/**
 * Vinted reader for the Bluebird listing import extension.
 *
 * Open a seller's Vinted profile (vinted.com/member/<id>) in your own browser
 * and click the extension. It scrolls their listings, then opens each item
 * one at a time (paced-reader.js) for its full title, description, photos,
 * condition and status. Location comes from the seller's profile. Bluebird
 * listings are local pickup, whatever shipping the seller offers on Vinted.
 *
 * Loaded into the service worker with importScripts() from background.js.
 */

const VINTED_MEMBER_RE = /^https:\/\/(?:www\.)?vinted\.com\/member\/(\d+)/;
const VINTED_ITEM_RE = /^https:\/\/(?:www\.)?vinted\.com\/items\/(\d+)/;

function vintedItemId(url) {
  const match = (url || "").match(VINTED_ITEM_RE);
  return match ? match[1] : null;
}

// --- In-page: the seller's profile -------------------------------------------

async function vintedCollectFromProfile() {
  const memberId = (location.pathname.match(/\/member\/(\d+)/) || [])[1] || "";
  const text = (selector) => {
    const element = document.querySelector(selector);
    return element ? element.innerText.trim() : "";
  };
  const expected = Number((document.body.innerText.match(/(\d[\d,]*)\s+items?\b/) || [])[1]?.replace(/,/g, "")) || 0;

  // Vinted loads more of the wardrobe as you scroll down the page.
  const selector = "[data-testid='grid-item'] a[href*='/items/'], a[data-testid$='--overlay-link'][href*='/items/']";
  const count = () => new Set(Array.from(document.querySelectorAll(selector)).map((a) => a.href)).size;
  let last = -1;
  let still = 0;
  for (let i = 0; i < 120 && still < 4; i++) {
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((resolve) => setTimeout(resolve, 900));
    const now = count();
    if (expected && now >= expected) break;
    still = now === last ? still + 1 : 0;
    last = now;
  }
  window.scrollTo(0, 0);

  const items = [];
  const seen = new Set();
  for (const link of document.querySelectorAll(selector)) {
    const id = (link.href.match(/\/items\/(\d+)/) || [])[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const card = link.closest("[data-testid='grid-item']") || link.parentElement;
    const priceText = card ? (card.querySelector("[data-testid$='--price-text']") || {}).innerText || "" : "";
    const price = Number((priceText.match(/[\d,.]+/) || [""])[0].replace(/,/g, ""));
    items.push({
      sourceUrl: `https://www.vinted.com/items/${id}`,
      title: card ? (card.querySelector("[data-testid$='--description-title']") || {}).innerText || "" : "",
      priceCents: Number.isFinite(price) && price > 0 ? Math.round(price * 100) : null,
    });
  }

  // "BLOOMINGTON, IN, United States"
  const place = text("[data-testid='profile-location-info--content']").split(",").map((part) => part.trim());
  return {
    sellerName: text("[data-testid='profile-username']"),
    sourceProfileUrl: `https://www.vinted.com/member/${memberId}`,
    city: place[0] || "",
    state: /^[A-Za-z]{2}$/.test(place[1] || "") ? place[1].toUpperCase() : "",
    expected,
    items,
  };
}

// --- In-page: one item ---------------------------------------------------------

function vintedExtractItemInPage(withPhotos) {
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
  const body = document.body ? document.body.innerText : "";
  if (!product) {
    if (/page (could not be|not) found|item (is )?(no longer|not) available|this item was deleted/i.test(body.slice(0, 1500))) {
      return { unavailable: true };
    }
    return null;
  }
  const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers || {};
  const availability = String(offer.availability || "");
  if (availability && !/instock/i.test(availability)) {
    return { unavailable: true, sold: /soldout|outofstock/i.test(availability) };
  }

  const conditionText = (body.match(/\nCondition\n([^\n]+)/) || [])[1] || "";
  // Category trail, top level first: Women › Clothing › Jeans.
  const trail = Array.from(document.querySelectorAll("a[href*='/catalog/']"))
    .filter((a) => /\/catalog\/\d+/.test(a.getAttribute("href") || ""))
    .map((a) => (a.innerText || "").trim())
    .filter(Boolean)
    .slice(0, 4);

  const result = {
    title: String(product.name || "").trim(),
    description: String(product.description || "").trim().slice(0, 5000),
    priceCents: typeof offer.price === "number" ? Math.round(offer.price * 100) : Number(offer.price) ? Math.round(Number(offer.price) * 100) : null,
    vintedCondition: conditionText,
    vintedCategories: trail,
    brand: product.brand && product.brand.name ? product.brand.name : "",
  };

  if (withPhotos) {
    // The item's own gallery: Vinted photos that aren't in the "Member's
    // items" / "Similar items" grids or an avatar. Signed URLs are kept whole.
    const seen = new Set();
    const photos = [];
    for (const img of document.querySelectorAll("img")) {
      const src = img.currentSrc || img.src || "";
      if (!/vinted\.net\/t\//.test(src)) continue;
      if (img.closest("[data-testid='grid-item'], [data-testid^='product-item-id'], [data-testid*='avatar']")) continue;
      if ((img.naturalWidth || 0) && img.naturalWidth < 200) continue;
      const key = (src.match(/\/t\/([^/]+)/) || [])[1] || src;
      if (seen.has(key)) continue;
      seen.add(key);
      photos.push(src);
    }
    const ldImages = [].concat(product.image || []).filter(Boolean);
    result.photoUrls = (photos.length ? photos : ldImages).slice(0, 8);
  }
  return result;
}

// --- Mapping to Bluebird -----------------------------------------------------

function vintedMapCondition(text) {
  const value = String(text || "").toLowerCase();
  if (/new with tags/.test(value)) return "new_with_tags";
  if (/new without tags|^new/.test(value)) return "new_without_tags";
  if (/very good|excellent/.test(value)) return "used_excellent";
  return "used_good";
}

const VINTED_CATEGORY_RULES = [
  [/jewel|watch/, "jewelry-watches"],
  [/beauty|grooming|fragrance|makeup|skincare/, "health-beauty"],
  [/kid|baby|toddler|girls|boys/, "baby-kids"],
  [/electronic|phone|computer|camera|audio|video game|console/, "electronics"],
  [/book|music|movie|dvd|vinyl|entertainment/, "books-media"],
  [/collect|trading card|figure|memorabilia|hobb/, "collectibles"],
  [/sport|outdoor|camping|fitness|bike|ski/, "outdoor-sporting"],
  [/home|kitchen|decor|furniture|bedding|garden/, "home-garden"],
  [/toy/, "baby-kids"],
  [/women|men|clothing|shoe|bag|accessor|apparel/, "apparel-accessories"],
];

function vintedMapCategory(trail, title, description) {
  // Most specific first: "Jewelry" under "Women" is jewelry, not apparel.
  for (const level of [...(trail || [])].reverse()) {
    const value = String(level).toLowerCase();
    const rule = VINTED_CATEGORY_RULES.find(([pattern]) => pattern.test(value));
    if (rule) return rule[1];
  }
  return typeof inferCategory === "function" ? inferCategory(title, description) : "general";
}

function vintedToImportItem(item) {
  return {
    sourceUrl: item.sourceUrl,
    title: String(item.title || "").slice(0, 120),
    description: item.description || "",
    priceCents: item.priceCents == null ? 0 : item.priceCents,
    condition: vintedMapCondition(item.vintedCondition),
    categorySlug: vintedMapCategory(item.vintedCategories, item.title, item.description),
    city: item.city || "",
    state: item.state || "",
    photoUrls: item.photoUrls || [],
  };
}

// --- Driving the browser -----------------------------------------------------

function vintedReadItems(items, options) {
  return readListingsPaced(items, {
    siteName: "Vinted",
    extract: vintedExtractItemInPage,
    idOf: vintedItemId,
    settleMs: 1800,
    ...options,
  });
}

async function runVinted(tabId) {
  const say = (body) =>
    overlay(tabId, `<strong>Bluebird import · Vinted</strong><div style="margin-top:6px">${body}</div>`);
  await say("Scrolling to load this seller's listings…");
  const profile = await exec(tabId, vintedCollectFromProfile);
  if (!profile || !profile.items.length) {
    await say("No listings found on this page.");
    return;
  }
  const items = profile.items.map((item) => ({ ...item, city: profile.city, state: profile.state }));
  const seller = profile.sellerName ? `Seller: ${profile.sellerName}<br/>` : "";
  let done = 0;
  const progress = () =>
    say(`${seller}${items.length} listing(s) found.<br/>Reading listings… ${done}/${items.length}`);
  await progress();
  await vintedReadItems(items, {
    withPhotos: true,
    onItemDone: () => {
      done += 1;
      progress();
    },
    notify: (message) => say(`${seller}${message}`),
  });

  const usable = items.filter((item) => !item.unavailable);
  const sold = items.length - usable.length;
  const unreadable = usable.filter((item) => item.unreadable).length;
  const missed = profile.expected > items.length ? profile.expected - items.length : 0;
  await deliverImport(
    tabId,
    say,
    seller,
    {
      sourceProfileUrl: profile.sourceProfileUrl,
      sellerName: profile.sellerName || undefined,
      items: usable.map(vintedToImportItem),
    },
    [
      ...(sold ? [`${sold} sold or reserved`] : []),
      ...(unreadable ? [`${unreadable} couldn't be fully read (check photos and description)`] : []),
      ...(missed ? [`${missed} didn't load from the profile (scroll their profile and run again)`] : []),
    ],
  );
}

async function vintedRefresh(targets, onItemDone) {
  const items = targets.map((t) => ({ sourceUrl: t.sourceUrl }));
  await vintedReadItems(items, { withPhotos: false, onItemDone });
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
