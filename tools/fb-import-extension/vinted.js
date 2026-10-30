/**
 * Vinted reader for the Bluebird listing import extension.
 *
 * Open a seller's Vinted profile (vinted.com/member/<id>) in your own browser
 * and click the extension. It scrolls their listings, then opens each item
 * in two windows (paced-reader.js) for its full title, description, photos,
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
  const readExpected = () =>
    Number((document.body.innerText.match(/(\d[\d,]*)\s+items?\b/) || [])[1]?.replace(/,/g, "")) ||
    0;
  let expected = readExpected();
  const selector =
    "[data-testid='grid-item'] a[href*='/items/'], a[data-testid$='--overlay-link'][href*='/items/']";
  const accumulated = new Map();
  const capture = () => {
    expected = Math.max(expected, readExpected());
    for (const a of document.querySelectorAll(selector)) {
      if (a.closest("header, nav, footer, [data-testid*='similar']")) continue;
      const id = a.href.match(/\/items\/(\d+)/)?.[1];
      if (!id) continue;
      const card =
        a.closest("[data-testid='grid-item'], [class*='new-item-box__container']") ||
        a.parentElement;
      const label = a.getAttribute("title") || a.getAttribute("aria-label") || "";
      const title = (
        card?.querySelector("[data-testid$='--description-title']")?.textContent ||
        label.split(/, brand:|, condition:/)[0]
      ).trim();
      const priceText = card?.querySelector("[data-testid$='--price-text']")?.textContent || label;
      const match = priceText.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
      accumulated.set(id, {
        sourceUrl: `https://www.vinted.com/items/${id}`,
        title,
        priceCents: match ? Math.round(Number(match[1].replace(/,/g, "")) * 100) : null,
      });
    }
  };
  // Navigation completion is earlier than the asynchronously hydrated wardrobe.
  // Capture before scrolling so the first virtualized cards are never lost.
  for (let i = 0; i < 30; i++) {
    capture();
    if (accumulated.size || /wardrobe is empty|no items yet/i.test(document.body.innerText)) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  let last = accumulated.size,
    still = 0;
  for (let i = 0; i < 400 && still < 8; i++) {
    capture();
    if (expected > 0 && accumulated.size >= expected) break;
    window.scrollBy(0, Math.max(400, window.innerHeight * 0.8));
    await new Promise((resolve) => setTimeout(resolve, 900));
    capture();
    const atEnd = window.scrollY + window.innerHeight >= document.body.scrollHeight - 40;
    still = atEnd && accumulated.size === last ? still + 1 : 0;
    last = accumulated.size;
  }
  const items = [...accumulated.values()];
  window.scrollTo(0, 0);

  // "BLOOMINGTON, IN, United States"
  const place = text("[data-testid='profile-location-info--content']")
    .split(",")
    .map((part) => part.trim());
  return {
    sellerName: text("[data-testid='profile-username']"),
    sourceProfileUrl: `https://www.vinted.com/member/${memberId}`,
    city: place[0] || "",
    state: /^[A-Za-z]{2}$/.test(place[1] || "") ? place[1].toUpperCase() : "",
    expected,
    explicitEnd: /no (?:more )?(?:items|products)|wardrobe is empty/i.test(document.body.innerText),
    items,
  };
}

// --- In-page: one item ---------------------------------------------------------

function vintedExtractItemInPage(withPhotos) {
  const body = document.body?.innerText || "";
  const visibleText = (selector) =>
    Array.from(document.querySelectorAll(selector))
      .filter(
        (el) =>
          !el.hidden &&
          el.getAttribute("aria-hidden") !== "true" &&
          (typeof el.getClientRects !== "function" || el.getClientRects().length > 0),
      )
      .map((el) => (el.innerText || el.textContent || "").trim())
      .filter(Boolean);
  // Explicit UI status overrides stale structured offers. Never search item
  // descriptions or recommendation text for a generic 'removed' substring.
  const markers = visibleText(
    "h1, [role='alert'], [data-testid*='item-status'], [data-testid*='item-unavailable'], [data-testid*='item-removed'], [data-testid='item-details'] h2",
  );
  const unavailable = markers.find((text) =>
    /^(?:removed!?|sold!?|item (?:is )?(?:no longer|not) available[.!]?|this item (?:was|has been) (?:deleted|removed)[.!]?|page (?:could not be|not) found[.!]?)$/i.test(
      text,
    ),
  );
  // The gallery's hidden aria-live “Removed!” is a favorite-button
  // announcement, even on an available item. It is never inventory status.
  if (unavailable) return { unavailable: true, sold: /^sold/i.test(unavailable) };

  const products = [];
  const walk = (node) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") return;
    const types = [].concat(node["@type"] || []);
    if (types.some((type) => /(?:^|[/#])Product$/.test(String(type)))) products.push(node);
    for (const key of ["@graph", "mainEntity", "itemListElement", "item"])
      if (node[key]) walk(node[key]);
  };
  let malformed = false;
  for (const script of document.querySelectorAll("script[type='application/ld+json']")) {
    try {
      walk(JSON.parse(script.textContent || ""));
    } catch {
      malformed = true;
    }
  }
  const currentId = (location.pathname.match(/\/items\/(\d+)/) || [])[1];
  const product =
    products.find((p) => {
      const id = String(p.url || p["@id"] || "").match(/\/items\/(\d+)/)?.[1];
      return id && id === currentId;
    }) ||
    products.find((p) => !p.url && !p["@id"]) ||
    {};
  const offers = []
    .concat(product.offers || [])
    .flatMap((offer) => [].concat(offer?.offers || offer || []));
  const offer =
    offers.find((o) => o && (o.price != null || o.priceSpecification?.price != null)) ||
    offers[0] ||
    {};
  const availability = String(offer.availability || "")
    .split(/[/#]/)
    .pop();
  if (/^(Discontinued|SoldOut|OutOfStock)$/i.test(availability))
    return { unavailable: true, sold: /SoldOut|OutOfStock/i.test(availability) };
  const domTitle =
    visibleText("[data-testid='item-title'], [data-testid='item-title--content'], h1")[0] || "";
  const domDescription =
    visibleText(
      "[data-testid='item-description'], [data-testid='item-description--content'], [itemprop='description']",
    )[0] || "";
  const domPrice =
    visibleText("[data-testid='item-price'], [data-testid='item-price--content']")[0] || "";
  const priceValue =
    offer.price ??
    offer.priceSpecification?.price ??
    domPrice.replace(/[^\d.,]/g, "").replaceAll(",", "");
  const price = priceValue === "" || priceValue == null ? NaN : Number(priceValue);
  const conditionText = (body.match(/\nCondition\n([^\n]+)/) || [])[1] || "";
  // Category trail, top level first: Women › Clothing › Jeans.
  const trail = Array.from(document.querySelectorAll("a[href*='/catalog/']"))
    .filter((a) => /\/catalog\/\d+/.test(a.getAttribute("href") || ""))
    .map((a) => (a.innerText || "").trim())
    .filter(Boolean)
    .slice(0, 4);

  const result = {
    title: String(product.name || domTitle).trim(),
    description: String(product.description || domDescription)
      .trim()
      .slice(0, 5000),
    priceCents: Number.isFinite(price) && price >= 0 ? Math.round(price * 100) : null,
    vintedCondition: conditionText,
    vintedCategories: trail,
    brand: product.brand && product.brand.name ? product.brand.name : "",
  };

  if (withPhotos) {
    // The item's own gallery only: Vinted tags those photos item-photo-N.
    // Every other Vinted image on the page (the "Member's items" and
    // "Similar items" grids, avatars) belongs to other listings, and reading
    // them mixed other items' photos into each import. Signed URLs are kept whole.
    const seen = new Set();
    const photos = [];
    for (const img of document.querySelectorAll("img[data-testid^='item-photo-']")) {
      const src = img.currentSrc || img.src || "";
      if (!/vinted\.net\/t\//.test(src)) continue;
      const key = (src.match(/\/t\/([^/]+)/) || [])[1] || src;
      if (seen.has(key)) continue;
      seen.add(key);
      photos.push(src);
    }
    const ldImages = []
      .concat(product.image || [])
      .map((image) => (typeof image === "string" ? image : image?.url || image?.contentUrl))
      .filter((url) => typeof url === "string" && /vinted\.net\/t\//.test(url));
    result.photoUrls = (photos.length ? photos : ldImages).slice(0, 8);
  }
  if (
    !result.title ||
    result.priceCents == null ||
    !result.description ||
    (withPhotos && !result.photoUrls.length)
  ) {
    result.incomplete = true;
    result.unreadableReason =
      !Object.keys(product).length && (!domTitle || !domDescription)
        ? malformed
          ? "structured_data_invalid"
          : "structured_data_missing"
        : "price_or_details_missing";
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
    subcategory: (item.vintedCategories || []).at(-1) || "",
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
    overlay(
      tabId,
      `<strong>Bluebird import · Vinted</strong><div style="margin-top:6px">${body}</div>`,
    );
  await say("Scrolling to load this seller's listings…");
  const profile = await exec(tabId, vintedCollectFromProfile);
  if (!profile || !profile.items.length) {
    await say("No listings found on this page.");
    return;
  }
  const items = profile.items.map((item) => ({
    ...item,
    city: profile.city,
    state: profile.state,
  }));
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
      ...(unreadable
        ? [`${unreadable} couldn't be fully read (check photos and description)`]
        : []),
      ...(missed
        ? [`${missed} didn't load from the profile (scroll their profile and run again)`]
        : []),
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
