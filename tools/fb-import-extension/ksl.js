/**
 * KSL Classifieds reader for the Bluebird listing import extension.
 *
 * Same model as the Facebook reader: you open a seller's KSL listings page
 * (classifieds.ksl.com/search/member/<id>) in your own browser and click the
 * extension. It reads the listings the page already shows, then opens each
 * listing in two windows, to read its description, photos, condition
 * and status. If KSL asks you to verify you're human, the extension brings
 * that window forward and waits for you; it never tries to get past the check
 * itself (see paced-reader.js).
 *
 * Loaded into the service worker with importScripts() from background.js.
 * Functions passed to chrome.scripting.executeScript run inside the KSL page
 * and must stay self-contained (no closures over this file).
 */

const KSL_MEMBER_RE = /^https:\/\/classifieds\.ksl\.com\/search\/member\/(\d+)/;
const KSL_LISTING_RE = /^https:\/\/classifieds\.ksl\.com\/listing\/(\d+)/;

function kslListingId(url) {
  const match = (url || "").match(KSL_LISTING_RE);
  return match ? match[1] : null;
}

// --- In-page: the seller's listings page ----------------------------------

// Reads the seller's listings from the data KSL embeds in the page (a
// Next.js payload with an "initialState" of search results), falling back to
// the visible result cards. Returns the next page's URL when there is one.
function kslCollectFromMemberPage() {
  const memberId = (location.pathname.match(/\/search\/member\/(\d+)/) || [])[1] || "";
  const raw = Array.from(document.querySelectorAll("script"))
    .map((s) => s.textContent || "")
    .join("\n")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");

  function objectAt(start) {
    let depth = 0;
    for (let j = start; j < raw.length; j++) {
      const ch = raw[j];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(raw.slice(start, j + 1));
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }

  const byId = new Map();
  const marker = '{"id":';
  let at = raw.indexOf(marker);
  while (at >= 0) {
    const obj = objectAt(at);
    if (
      obj &&
      obj.id &&
      obj.title &&
      obj.contact &&
      String(obj.contact.memberId) === memberId &&
      !byId.has(String(obj.id))
    ) {
      byId.set(String(obj.id), obj);
    }
    at = raw.indexOf(marker, at + marker.length);
  }

  const items = [];
  const cards = Array.from(
    document.querySelectorAll("a.search-result[data-item-id], a[href*='/listing/'][data-item-id]"),
  );
  const ids = new Set([...byId.keys(), ...cards.map((a) => a.getAttribute("data-item-id"))]);
  for (const id of ids) {
    if (!id) continue;
    const obj = byId.get(id);
    const card = cards.find((a) => a.getAttribute("data-item-id") === id);
    if (obj && obj.marketType && !/^(sale|rent|for sale|for rent)$/i.test(obj.marketType)) continue;
    items.push({
      sourceUrl: `https://classifieds.ksl.com/listing/${id}`,
      title: obj ? obj.title : (card && card.getAttribute("aria-label")) || "",
      priceCents: obj && typeof obj.price === "number" ? Math.round(obj.price * 100) : null,
      city: obj && obj.location ? obj.location.city || "" : "",
      state: obj && obj.location ? obj.location.state || "" : "",
      kslCategory: obj ? obj.category || "" : "",
      kslSubCategory: obj ? obj.subCategory || "" : "",
      photoUrls:
        obj && obj.primaryImage && obj.primaryImage.url ? [obj.primaryImage.url.split("?")[0]] : [],
    });
  }

  // The seller's name is the line just above "Member Since" on the profile card.
  const lines = (document.body ? document.body.innerText : "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const sinceAt = lines.findIndex((line) => /^member since/i.test(line));
  const sellerName = sinceAt > 0 && lines[sinceAt - 1].length <= 60 ? lines[sinceAt - 1] : "";
  const next = document.querySelector('a[rel="next"], a[aria-label*="next" i]');
  return {
    sellerName,
    sourceProfileUrl: `https://classifieds.ksl.com/search/member/${memberId}`,
    items,
    recognized: !!memberId && (items.length > 0 || /no (?:listings|results)/i.test(lines.join(" "))),
    nextUrl: next && next.href && next.href !== location.href ? next.href : null,
  };
}

// --- In-page: one listing --------------------------------------------------

function kslExtractListingInPage(withPhotos) {
  const title = document.title || "";
  const text = document.body ? document.body.innerText.slice(0, 1500) : "";
  if (
    /access to this page has been denied/i.test(title) ||
    /press\s*&\s*hold|verify you are (a )?human|are you a robot/i.test(text)
  ) {
    return { challenge: true };
  }
  if (
    /listing (is )?(no longer|not) (available|found)|page not found|listing has (been )?(removed|expired)/i.test(
      title + " " + text.slice(0, 400),
    )
  ) {
    return { unavailable: true };
  }

  const raw = Array.from(document.querySelectorAll("script"))
    .map((s) => s.textContent || "")
    .join("\n")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
  // The listing record is the object that holds the "photos" array.
  let listing = null;
  const photosAt = raw.indexOf('"photos":[');
  if (photosAt >= 0) {
    let depth = 0;
    let start = -1;
    for (let j = photosAt; j >= 0; j--) {
      const ch = raw[j];
      if (ch === "}") depth++;
      else if (ch === "{") {
        if (depth === 0) {
          start = j;
          break;
        }
        depth--;
      }
    }
    if (start >= 0) {
      depth = 0;
      for (let j = start; j < raw.length; j++) {
        const ch = raw[j];
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) {
            try {
              listing = JSON.parse(raw.slice(start, j + 1));
            } catch {
              listing = null;
            }
            break;
          }
        }
      }
    }
  }
  let breadcrumbCategory = "",
    breadcrumbSubcategory = "";
  const trail = document.querySelector('a[href*="/search/cat/"][href*="/sub/"]');
  if (trail) {
    try {
      const match = new URL(trail.href, location.href).pathname.match(
        /\/search\/cat\/([^/]+)\/sub\/([^/]+)/,
      );
      if (match) {
        breadcrumbCategory = decodeURIComponent(match[1]);
        breadcrumbSubcategory = decodeURIComponent(match[2]);
      }
    } catch {
      /* Keep the embedded category when a breadcrumb is malformed. */
    }
  }
  if (!listing) {
    // The visible breadcrumb remains authoritative when KSL's streamed JSON
    // is incomplete. Keep those facts, but flag price/photos for review.
    if (!breadcrumbCategory || !breadcrumbSubcategory) return null;
    return { kslCategory: breadcrumbCategory, kslSubCategory: breadcrumbSubcategory, incomplete: true };
  }

  const status = String(listing.status || "");
  if (status && !/^active$/i.test(status)) {
    return { unavailable: true, sold: /sold/i.test(status) };
  }

  // The description renders as paragraphs in the Description tab; the
  // embedded field is only a reference to separately streamed data.
  let description = "";
  const heading = Array.from(document.querySelectorAll('[role="tabpanel"] h2')).find(
    (h) => (h.textContent || "").trim() === "Description",
  );
  const panel = heading ? heading.closest('[role="tabpanel"]') : null;
  if (panel) {
    description = Array.from(panel.querySelectorAll("p"))
      .map((p) => (p.innerText || "").trim())
      .filter(Boolean)
      .join("\n\n");
  }
  if (!description) {
    const fallback = [listing.descriptionMarkdown, listing.description].find(
      (value) => typeof value === "string" && value.length > 3 && !/^\$[0-9a-z]+$/i.test(value),
    );
    description = fallback || "";
  }

  let conditionText = "";
  if (panel) {
    const h3 = Array.from(panel.querySelectorAll("h3")).find(
      (h) => (h.textContent || "").trim() === "Condition",
    );
    if (h3 && h3.nextElementSibling) conditionText = (h3.nextElementSibling.innerText || "").trim();
  }

  const place = listing.location || {};
  const result = {
    title: listing.title || "",
    priceCents: typeof listing.price === "number" ? Math.round(listing.price * 100) : null,
    description: description.slice(0, 5000),
    kslCondition: conditionText || String(listing.newUsed || listing.condition || ""),
    kslCategory: breadcrumbCategory || listing.category || "",
    kslSubCategory: breadcrumbSubcategory || listing.subCategory || "",
    city: place.city || "",
    state: place.state || "",
  };
  if (withPhotos) {
    result.photoUrls = (Array.isArray(listing.photos) ? listing.photos : [])
      .map((photo) => photo && photo.url)
      .filter(Boolean)
      .map((url) => String(url).split("?")[0])
      .slice(0, 8);
  }
  return result;
}

// --- Mapping to Bluebird -----------------------------------------------------

// KSL titles often end with " | CITY, ST"; Bluebird shows the city on its own.
function kslCleanTitle(title, city) {
  let clean = String(title || "").trim();
  clean = clean.replace(/\s*\|\s*[A-Za-z .'-]+,\s*[A-Z]{2}\s*$/, "");
  if (city) clean = clean.replace(new RegExp(`\\s*\\|\\s*${city}\\s*$`, "i"), "");
  return clean.slice(0, 120);
}

function kslMapCondition(text) {
  const value = String(text || "").toLowerCase();
  if (/not applicable|^n\/?a$/.test(value)) return "not_applicable";
  if (/^new\b|brand new|new with/.test(value)) return "new_without_tags";
  if (/like new|excellent|mint/.test(value)) return "used_excellent";
  if (/parts|repair|broken|not working|poor/.test(value)) return "broken_needs_repairs";
  return "used_good";
}

// KSL category and subcategory -> Bluebird category slug. Checked against
// the subcategory first ("Livestock" / "Horses" -> pets).
const KSL_CATEGORY_RULES = [
  [
    /horse|livestock|cattle|goat|sheep|poultry|chicken|pig|llama|alpaca|\bpets?\b|dog|cat\b|bird|reptile|fish(?!ing)/,
    "pets",
  ],
  [/motorcycle|dirt bike/, "motorcycles"],
  [/atv|utv|snowmobile|side.?by.?side|powersport/, "powersports"],
  [
    /\brv\b|recreational vehicle|camper|motorhome|travel trailer|fifth wheel|toy hauler/,
    "rvs-campers",
  ],
  [/trailer/, "trailers"],
  [/auto part|auto accessor|tire|wheel|car part|truck part|parts and accessories/, "auto-parts"],
  [/^generators?$/, "tools-equipment"],
  [/\bcars?\b|trucks?|suv|vans?\b|vehicle/, "cars-trucks"],
  [
    /real estate|home for sale|land|lot\b|rental|apartment|condo|townhome|house/,
    "other-real-estate",
  ],
  [/\bjobs?\b|employment/, "jobs"],
  [/services?\b/, "services"],
  [/farm|ranch|agri|hay|tractor|garden equip/, "farm-garden"],
  [/industrial|heavy equipment|construction|commercial equipment/, "industrial"],
  [/tool/, "tools-equipment"],
  [/furniture|couch|sofa|table|chair|dresser|bed\b|mattress/, "furniture"],
  [/appliance|home and garden|home & garden|household|home decor|lawn/, "home-garden"],
  [
    /computer|electronic|cell phone|phone|tv|television|camera|audio|video game|gaming/,
    "electronics",
  ],
  [/baby|kid|child|toddler|stroller/, "baby-kids"],
  [/book|media|movie|dvd|vinyl|record/, "books-media"],
  [/clothing|apparel|shoe|boot|jacket|accessor/, "apparel-accessories"],
  [/jewel|watch/, "jewelry-watches"],
  [/musical|instrument|guitar|piano|drum/, "musical-instruments"],
  [/collect|antique|memorabilia|coin|card/, "collectibles"],
  [/craft|hobb|sewing|quilt/, "crafts-hobbies"],
  [/health|beauty|cosmetic/, "health-beauty"],
  [/office|business/, "office-business"],
  [/ticket|event/, "tickets-events"],
  [
    /outdoor|sporting|sport|camping|hunting|fishing|bike|bicycle|exercise|fitness|golf|ski|boat|kayak|watercraft/,
    "outdoor-sporting",
  ],
];

function kslMapCategory(category, subCategory, title, description) {
  if (/^industrial$/i.test(String(category).trim()) || /heavy equipment/i.test(String(subCategory)))
    return "industrial";
  for (const haystack of [subCategory, category]) {
    const value = String(haystack || "").toLowerCase();
    if (!value) continue;
    const rule = KSL_CATEGORY_RULES.find(([pattern]) => pattern.test(value));
    if (rule) return rule[1];
  }
  // Match server categoryHintFrom: KSL descriptions can be spec sheets or
  // blurbs. Incidental component words must not turn an unknown item into
  // Auto Parts. Leave ambiguous titles in General for administrator review.
  return typeof inferCategory === "function" ? inferCategory(title, "") : "general";
}

// --- Driving the browser -----------------------------------------------------

// Two reusable reader windows (see paced-reader.js).
function kslReadListings(items, { withPhotos, onItemDone, notify }) {
  return readListingsPaced(items, {
    siteName: "KSL",
    extract: kslExtractListingInPage,
    idOf: kslListingId,
    withPhotos,
    onItemDone,
    notify,
  });
}

function kslToImportItem(item) {
  return {
    sourceUrl: item.sourceUrl,
    title: kslCleanTitle(item.title, item.city),
    description: item.description || "",
    priceCents: item.priceCents == null ? 0 : item.priceCents,
    condition: kslMapCondition(item.kslCondition),
    categorySlug: kslMapCategory(
      item.kslCategory,
      item.kslSubCategory,
      item.title,
      item.description,
    ),
    subcategory: item.kslSubCategory || "",
    city: item.city || "",
    state: item.state || "",
    photoUrls: item.photoUrls || [],
  };
}

async function runKsl(tabId) {
  const say = (body) =>
    overlay(
      tabId,
      `<strong>Bluebird import · KSL</strong><div style="margin-top:6px">${body}</div>`,
    );
  await say("Reading this seller's listings…");

  // Follow the seller's result pages, if KSL splits them.
  let page = await exec(tabId, kslCollectFromMemberPage);
  const first = page;
  const items = [...page.items];
  for (let i = 0; i < 20 && page.nextUrl; i++) {
    await chrome.tabs.update(tabId, { url: page.nextUrl });
    await sleep(2500);
    page = await exec(tabId, kslCollectFromMemberPage);
    for (const item of page.items) {
      if (!items.some((existing) => existing.sourceUrl === item.sourceUrl)) items.push(item);
    }
  }
  if (!items.length) {
    await say("No listings found on this page.");
    return;
  }

  const seller = first.sellerName ? `Seller: ${first.sellerName}<br/>` : "";
  let done = 0;
  await say(`${seller}${items.length} listing(s) found.<br/>Reading listings… 0/${items.length}`);
  await kslReadListings(items, {
    withPhotos: true,
    onItemDone: () => {
      done += 1;
      say(
        `${seller}${items.length} listing(s) found.<br/>Reading listings… ${done}/${items.length}`,
      );
    },
    notify: (message) => say(`${seller}${message}`),
  });

  const usable = items.filter((item) => !item.unavailable);
  const skipped = items.length - usable.length;
  const unreadable = items.filter((item) => item.unreadable).length;
  await deliverImport(
    tabId,
    say,
    seller,
    {
      sourceProfileUrl: first.sourceProfileUrl,
      sellerName: first.sellerName || undefined,
      items: usable.map(kslToImportItem),
    },
    [
      ...(skipped ? [`${skipped} no longer active`] : []),
      ...(unreadable
        ? [`${unreadable} couldn't be fully read (check photos and description)`]
        : []),
    ],
  );
}

// Refresh: re-read already-imported KSL listings (no photos), for the admin
// page's Refresh button. Results use the same shape as the Facebook refresh.
async function kslRefresh(targets, onItemDone) {
  const items = targets.map((t) => ({ sourceUrl: t.sourceUrl }));
  await kslReadListings(items, { withPhotos: false, onItemDone });
  return items
    .filter((item) => !item.unreadable)
    .map((item) => ({
      sourceUrl: item.sourceUrl,
      title: item.title ? kslCleanTitle(item.title, item.city) : undefined,
      priceCents: item.priceCents,
      description: item.description,
      unavailable: item.unavailable === true,
      sold: item.sold === true,
    }));
}
