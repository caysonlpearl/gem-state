/**
 * GemList Facebook Marketplace import extension (service worker).
 *
 * Click the extension's icon while on a seller's Facebook Marketplace
 * profile page. It scrolls the listing grid, reads every listing's full
 * detail page (condition/description/photos), and copies GemList-ready
 * JSON to your clipboard to paste into the admin import tool.
 *
 * Why an extension instead of a plain bookmarklet: Facebook's lazy-loaded
 * listing grid ignores any script-driven scroll -- confirmed live that
 * neither direct scrollTop assignment nor dispatched scroll/wheel events
 * (trusted-looking or not) ever load more than the first page, while a
 * genuine mouse-wheel scroll does every time. Plain injected page JS has no
 * way to produce that; this extension's one privileged capability
 * (`chrome.debugger`, the same primitive tools like Puppeteer use for
 * page.mouse.wheel()) can.
 *
 * This still never stores, transmits, or has standing access to your
 * Facebook session -- it only runs when you click it, reads whatever your
 * own already-signed-in browser renders, and the one privileged action
 * (debugger attach) is visible to you via Chrome's own infobar each time
 * and is detached again immediately after scrolling. Nothing here runs on
 * a schedule or without you present.
 */

const PROFILE_RE = /\/marketplace\/profile\//;

// Paced readers for KSL, Vinted and Whatnot (runKsl/kslRefresh, runVinted/
// vintedRefresh, runWhatnot/whatnotRefresh and their URL patterns).
// Guarded so tests can load this file outside a service worker.
if (typeof importScripts === "function") {
  importScripts("paced-reader.js", "ksl.js", "vinted.js", "whatnot.js");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function exec(tabId, func, args) {
  const [injected] = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args: args || [],
  });
  return injected && injected.result;
}

function overlay(tabId, html) {
  return exec(
    tabId,
    (innerHtml) => {
      const ID = "gemlist-fb-import-overlay";
      let el = document.getElementById(ID);
      if (!el) {
        el = document.createElement("div");
        el.id = ID;
        el.style.cssText =
          "position:fixed;top:16px;right:16px;z-index:2147483647;width:300px;" +
          "background:#111;color:#fff;font:12px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;" +
          "border-radius:10px;padding:14px;box-shadow:0 8px 30px rgba(0,0,0,.45)";
        document.body.appendChild(el);
      }
      el.innerHTML = innerHtml;
    },
    [html],
  );
}

function countOwnListings(tabId) {
  return exec(
    tabId,
    () =>
      Array.from(document.querySelectorAll('a[href*="/marketplace/item/"]')).filter((a) =>
        /[?&]ref=marketplace_profile\b/.test(a.getAttribute("href") || ""),
      ).length,
  );
}

async function autoScroll(tabId, onProgress) {
  await chrome.debugger.attach({ tabId }, "1.3");
  try {
    let last = await countOwnListings(tabId);
    let stagnant = 0;
    for (let i = 0; i < 100 && stagnant < 5; i++) {
      await chrome.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", {
        type: "mouseWheel",
        x: 400,
        y: 400,
        deltaX: 0,
        deltaY: 700,
      });
      await sleep(400);
      const count = await countOwnListings(tabId);
      onProgress && onProgress(count);
      if (count === last) stagnant++;
      else stagnant = 0;
      last = count;
    }
  } finally {
    await chrome.debugger.detach({ tabId }).catch(() => {});
  }
}

// Runs inside the profile page. Facebook mixes unrelated recommendations
// into the same grid once you scroll past a seller's real listings, but
// tags them apart in the link itself (confirmed live): the seller's own
// items carry ref=marketplace_profile.
function collectListingsFromPage() {
  function isOwn(a) {
    return /[?&]ref=marketplace_profile\b/.test(a.getAttribute("href") || "");
  }
  function parseLink(a) {
    const label = a.getAttribute("aria-label") || "";
    const m = label.match(
      /^(.*), \$([\d,]+), (?:reduced from \$[\d,]+, )?([^,]+), ([A-Za-z]{2}), listing (\d+)$/,
    );
    if (!m) return null;
    const [, title, priceStr, city, state, id] = m;
    return {
      id,
      sourceUrl: `https://www.facebook.com/marketplace/item/${id}/`,
      title: title.trim(),
      priceCents: Math.round(parseFloat(priceStr.replace(/,/g, "")) * 100) || 0,
      city: city.trim(),
      state: state.trim().toUpperCase(),
    };
  }
  function findSellerName() {
    const ownLink = Array.from(document.querySelectorAll('a[href*="/marketplace/item/"]')).find(
      isOwn,
    );
    let node = ownLink || null;
    let listingsSection = null;
    while (node && node !== document.body) {
      if (/'s listings/i.test(node.textContent || "")) {
        listingsSection = node;
        break;
      }
      node = node.parentElement;
    }
    const scope =
      (listingsSection &&
        listingsSection.parentElement &&
        listingsSection.parentElement.parentElement) ||
      document.querySelector('[role="dialog"]') ||
      document.body;
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    let best = null;
    let bestSize = 0;
    let n;
    while ((n = walker.nextNode())) {
      const text = n.textContent.trim();
      if (!text || text.length > 60) continue;
      const el = n.parentElement;
      if (!el) continue;
      const size = parseFloat(getComputedStyle(el).fontSize) || 0;
      if (size >= 20 && size > bestSize) {
        bestSize = size;
        best = text;
      }
    }
    return best;
  }
  const links = Array.from(document.querySelectorAll('a[href*="/marketplace/item/"]')).filter(
    isOwn,
  );
  const byId = new Map();
  for (const a of links) {
    const parsed = parseLink(a);
    if (parsed && !byId.has(parsed.id)) byId.set(parsed.id, parsed);
  }
  return {
    sellerName: findSellerName(),
    sourceProfileUrl: location.href.split("?")[0],
    items: Array.from(byId.values()),
  };
}

// Runs inside each listing's own detail tab. Returns null if the page
// never settles (caller keeps whatever card-level data it already had).
function inferCategory(title, description) {
  if (title && description) {
    const primary = inferCategory(title, "");
    if (primary !== "general") return primary;
  }
  const text = `${title || ""} ${description || ""}`.toLowerCase();
  const matches = (pattern) => pattern.test(text);
  if (
    matches(
      /\b(industrial|forklift|heavy equipment|heavy machinery|cnc|lathe|milling machine|scissor lift|pallet jack)\b/,
    )
  )
    return "industrial";
  if (matches(/\b(car seat|stroller|crib|baby carrier)\b/)) return "baby-kids";
  if (matches(/\b(rv|camper|motorhome|fifth wheel|travel trailer)\b/)) return "rvs-campers";
  if (matches(/\b(bicycle|mountain bike|road bike)\b/)) return "outdoor-sporting";
  if (
    matches(
      /\b(car parts?|auto parts?|brake|bumper|alternator|engine|transmission|tire|tyre|wheel|rim|catalytic converter)\b/,
    )
  )
    return "auto-parts";
  if (matches(/\b(trailer|utility trailer|cargo trailer|boat trailer|enclosed trailer)\b/))
    return "trailers";
  if (matches(/\b(rv|r\.v\.|camper|motorhome|fifth wheel|travel trailer)\b/)) return "rvs-campers";
  if (matches(/\b(atv|utv|side[- ]by[- ]side|dirt bike|snowmobile|jet ski|pwc|go[- ]kart)\b/))
    return "powersports";
  if (matches(/\b(motorcycle|motorbike|scooter|vespa)\b/)) return "motorcycles";
  if (
    matches(
      /\b(?:19|20)\d{2}\s+(?:toyota|ford|chevrolet|chevy|dodge|ram|honda|subaru|nissan|gmc|jeep|hyundai|kia|mazda|bmw|mercedes|audi|volkswagen|lexus|buick|cadillac|volvo|tesla)\b/,
    )
  )
    return "cars-trucks";
  if (
    matches(
      /\b(car|truck|suv|sedan|coupe|convertible|van|pickup|vehicle|automobile|hatchback|wagon)\b/,
    )
  )
    return "cars-trucks";
  if (
    matches(
      /\b(smart ?watch|apple watch|galaxy watch|mechanical keyboard|gaming keyboard|computer keyboard|ring light|iphone|ipad|android|laptop|computer|desktop|television|tv|camera|headphones|earbuds|speaker|monitor|printer|gaming console|playstation|xbox|nintendo|electronics?)\b/,
    )
  )
    return "electronics";
  if (
    !/\b(doorbell|ring camera)\b/.test(text) &&
    matches(
      /\b(jewelry|jewellery|jewelry\s*&?\s*watches?|watch(?:es)?|rings?|necklace|bracelet|earrings?|pendant|brooch|anklet|tiara|gemstone|diamond|moissanite|sterling silver|(?:14|18|24)k\s*(?:gold)?|925\s+sterling)\b/,
    )
  )
    return "jewelry-watches";
  if (
    matches(
      /\b(stroller|crib|car seat|high chair|diaper|baby|toddler|kids?|children|playpen|nursery|lego|barbie)\b/,
    )
  )
    return "baby-kids";
  if (
    matches(
      /\b(book|books|novel|textbook|comic|magazine|vinyl|record|cd|dvd|blu[- ]?ray|video game)\b/,
    )
  )
    return "books-media";
  if (
    matches(
      /\b(collectible|trading card|sports card|coin collection|memorabilia|figurine|action figure)\b/,
    )
  )
    return "collectibles";
  if (
    matches(
      /\b(yarn|sewing|crochet|knitting|scrapbook|craft|hobby|model kit|art supplies|paint supplies)\b/,
    )
  )
    return "crafts-hobbies";
  if (
    matches(
      /\b(makeup|cosmetic|skincare|skin care|shampoo|conditioner|lotion|perfume|cologne|beauty|nail|hair extension)\b/,
    )
  )
    return "health-beauty";
  if (
    matches(
      /\b(dress|shirt|jeans|pants|shoes|boots|jacket|coat|purse|handbag|clothing|apparel|fashion|sunglasses)\b/,
    )
  )
    return "apparel-accessories";
  if (
    matches(
      /\b(guitar|drums?|piano|keyboard|violin|cello|trumpet|amplifier|microphone|music\s+instrument)\b/,
    )
  )
    return "musical-instruments";
  if (
    matches(
      /\b(office|business|commercial|point of sale|pos system|cash register|filing cabinet|warehouse|restaurant equipment)\b/,
    )
  )
    return "office-business";
  if (matches(/\b(ticket|tickets|concert|festival|event pass|sports game|season pass|theater)\b/))
    return "tickets-events";
  if (
    matches(
      /\b(power tool|hand tool|drill|saw|sander|welder|compressor|toolbox|tool set|generator)\b/,
    )
  )
    return "tools-equipment";
  if (
    matches(
      /\b(firearms?|rifles?|handguns?|pistols?|revolvers?|shotguns?|ammunition|ammo|holsters?)\b|\bgun\s+(safe|case|lock|vault|cabinet)\b/,
    )
  )
    return "firearms";
  if (
    matches(
      /\b(camping|tent|sleeping bag|fishing|tackle|hunting|rifle|bow|archery|golf|skis?|snowboard|kayak|canoe|bicycle|bike|fitness|exercise)\b/,
    )
  )
    return "outdoor-sporting";
  if (
    matches(
      /\b(tractor|tiller|harvester|livestock|chicken coop|chickens?|goat|horse|cow|hay|seed|seeds|plant nursery|greenhouse|farm equipment)\b/,
    )
  )
    return "farm-garden";
  if (
    matches(
      /\b(sofa|couch|dresser|nightstand|dining table|bookshelf|bed frame|mattress|furniture)\b/,
    )
  )
    return "furniture";
  if (
    matches(
      /\b(home decor|decor|kitchen|bathroom|lamp|lighting|curtain|rug|patio|grill|lawn|garden|houseplant|appliance|vacuum)\b/,
    )
  )
    return "home-garden";
  if (
    matches(
      /\b(dog|puppy|cat|kitten|bird|parrot|fish|reptile|hamster|rabbit|pet|kennel|aquarium)\b/,
    )
  )
    return "pets";
  if (matches(/\b(job|jobs|hiring|employment|career|work from home|position available)\b/))
    return "jobs";
  if (
    matches(
      /\b(service|services|repair|cleaning|landscaping|photography|tutoring|handyman|moving|plumbing|electrician|contractor)\b/,
    )
  )
    return "services";
  if (
    matches(
      /\b(home for sale|house for sale|apartment|condo|townhouse|property|real estate|rent|rental|room for rent|land for sale)\b/,
    )
  )
    return "other-real-estate";
  if (matches(/\b(antique|vintage)\b/)) return "collectibles";
  return "general";
}

async function extractListingDetailsInPage(withPhotos = true) {
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function findDetailsBlock() {
    const candidates = Array.from(document.querySelectorAll("*")).filter(
      (el) => el.children.length === 0 && /^\$[\d,]+$/.test((el.textContent || "").trim()),
    );
    for (const leaf of candidates) {
      let node = leaf;
      while (node) {
        const text = node.innerText || "";
        if (/Condition/.test(text) && /Details/.test(text)) return node;
        node = node.parentElement;
      }
    }
    return null;
  }
  function conditionLineValue(block) {
    const lines = (block.innerText || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const inline = lines.find((line) => /^condition\s*:/i.test(line));
    if (inline) return inline.replace(/^condition\s*:\s*/i, "").trim();
    const idx = lines.findIndex((l) => /^condition\s*:?$/i.test(l));
    return idx >= 0 ? lines[idx + 1] : null;
  }

  let block = null;
  const start = Date.now();
  while (Date.now() - start < 15000) {
    block = findDetailsBlock();
    if (block && conditionLineValue(block)) break;
    await sleep(400);
  }
  if (!block) block = findDetailsBlock();
  if (!block) {
    // Only an explicit "gone" page counts as unavailable -- a page that is
    // merely slow or odd returns null, which callers treat as "unknown".
    return /isn.t available right now/i.test(document.body.innerText || "")
      ? { unavailable: true }
      : null;
  }

  const lines = (block.innerText || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const inlineCondition = lines.find((line) => /^condition\s*:/i.test(line));
  const conditionIdx = lines.findIndex((l) => /^condition\s*:?$/i.test(l));
  const conditionLineIdx =
    conditionIdx >= 0 ? conditionIdx : lines.findIndex((line) => /^condition\s*:/i.test(line));
  const condition = inlineCondition
    ? inlineCondition.replace(/^condition\s*:\s*/i, "").trim()
    : conditionIdx >= 0
      ? lines[conditionIdx + 1]
      : "";
  const locationIdx = lines.findIndex((l) => /Location is approximate/i.test(l));
  const descLines =
    conditionLineIdx >= 0
      ? lines.slice(
          conditionLineIdx + (inlineCondition ? 1 : 2),
          locationIdx >= 0 ? locationIdx : lines.length,
        )
      : [];
  const description = descLines.join("\n\n").trim();

  // A sold listing shows a standalone "Sold" badge at the top of this block
  // (confirmed live), with the title pushed to the line after it. Only the
  // header lines above "Details" are checked, so a description that happens
  // to contain the word "sold" can't trigger this. It's no longer for sale,
  // and Bluebird marks its copy sold rather than just taking it down.
  const detailsIdx = lines.findIndex((l) => l === "Details");
  const headerLines = detailsIdx >= 0 ? lines.slice(0, detailsIdx) : lines.slice(0, 6);
  if (headerLines.some((l) => /^sold$/i.test(l))) return { unavailable: true, sold: true };

  if (!withPhotos) {
    const priceLine = lines.find((l) => /^\$[\d,]+$/.test(l));
    if (!priceLine || !lines[0]) return null;
    return {
      title: lines[0],
      priceCents: Math.round(parseFloat(priceLine.replace(/[$,]/g, "")) * 100) || 0,
      description,
    };
  }

  // Confirmed live: on a multi-photo listing, Facebook tags the currently
  // displayed hero image with alt="Product photo of {title}" -- a stable,
  // specific marker that updates correctly after each "View photo N"
  // click and is never used by recommendation thumbnails elsewhere on the
  // page. A single-photo listing doesn't tag it this way (empty alt
  // instead), but in that case it's reliably just the single biggest
  // rendered image on the page -- no exclusion zone needed. (An earlier
  // version excluded the details-text block here, but that block's own
  // upper bound isn't fixed -- confirmed live that on some listings it
  // grows to contain the hero photo too, which silently excluded the only
  // real candidate and produced "no photo found" for a page that plainly
  // had one.)
  function mainPhoto() {
    const tagged = document.querySelector('img[alt^="Product photo of "]');
    if (tagged && tagged.src) return tagged;
    let best = null;
    let bestArea = 0;
    document.querySelectorAll("img").forEach((img) => {
      if (!img.src) return;
      const rect = img.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (rect.width > 320 && rect.height > 320 && area > bestArea) {
        bestArea = area;
        best = img;
      }
    });
    return best;
  }
  function photoButtons() {
    return Array.from(document.querySelectorAll("[aria-label]")).filter((el) =>
      /^View photo \d+$/i.test(el.getAttribute("aria-label") || ""),
    );
  }
  const buttons = photoButtons();
  const photoUrls = [];
  if (!buttons.length) {
    // The photo can still lag a beat behind the text content even once
    // "Condition"/"Details" are populated -- check once isn't enough.
    let img = mainPhoto();
    const photoStart = Date.now();
    while (!img && Date.now() - photoStart < 9000) {
      await sleep(300);
      img = mainPhoto();
    }
    if (img) photoUrls.push(img.src);
  } else {
    for (let i = 1; i <= buttons.length; i++) {
      const btn = photoButtons().find((el) => el.getAttribute("aria-label") === `View photo ${i}`);
      if (!btn) continue;
      btn.click();
      let img = mainPhoto();
      const clickStart = Date.now();
      while (
        (!img || img.src === photoUrls[photoUrls.length - 1]) &&
        Date.now() - clickStart < 8000
      ) {
        await sleep(250);
        img = mainPhoto();
      }
      if (img && img.src) photoUrls.push(img.src);
    }
  }

  function mapCondition(raw) {
    const t = (raw || "").toLowerCase();
    if (t.includes("like new") || t.includes("excellent")) return "used_excellent";
    if (t.includes("used")) return "used_good";
    if (t.includes("new")) return /with\s*tags?/.test(t) ? "new_with_tags" : "new_without_tags";
    return "used_good";
  }

  return {
    condition: mapCondition(condition),
    description,
    photoUrls: Array.from(new Set(photoUrls)).slice(0, 8),
  };
}

function listingIdFromUrl(url) {
  const m = (url || "").match(/\/marketplace\/item\/(\d+)/);
  return m ? m[1] : null;
}

// Worker tabs get reused across navigations (chrome.tabs.update, not a
// fresh chrome.tabs.create each time) to keep the concurrent pool small,
// which reintroduces the same stale-read race the bookmarklet hit: a
// tab's PREVIOUS page can still report status "complete" for a beat after
// a new navigation starts. Confirming the tab's own URL matches the
// listing we just navigated to -- not just "complete" -- is what the
// bookmarklet's fix for that race relies on too.
function waitForTabReady(tabId, expectedUrl, timeoutMs) {
  const expectedId = listingIdFromUrl(expectedUrl);
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(finish, timeoutMs || 20000);
    function check() {
      if (settled) return;
      chrome.tabs.get(tabId, (t) => {
        if (settled || !t) return;
        const currentId = listingIdFromUrl(t.url);
        if (t.status === "complete" && (!expectedId || currentId === expectedId)) finish();
      });
    }
    function listener(id, info) {
      if (id === tabId && info.status === "complete") check();
    }
    function finish() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }
    chrome.tabs.onUpdated.addListener(listener);
    check();
  });
}

// Each worker gets its own small popup window rather than a background
// tab in the shared window: a window's single active tab counts as
// "visible" to Chrome's own throttling regardless of whether the window
// itself has OS focus, so several of these can run genuinely concurrently
// without hitting the background-tab throttling that caused missing
// photos before. `focused: false` keeps them from stealing your attention
// while they work.
async function runWorker(queue, onItemDone, withPhotos = true) {
  const win = await chrome.windows.create({
    url: "about:blank",
    focused: false,
    type: "popup",
    width: 900,
    height: 1000,
  });
  const tabId = win.tabs[0].id;
  try {
    while (queue.length) {
      const item = queue.shift();
      try {
        await chrome.tabs.update(tabId, { url: item.sourceUrl });
        await waitForTabReady(tabId, item.sourceUrl, 20000);
        const details = await exec(tabId, extractListingDetailsInPage, [withPhotos]);
        if (details) Object.assign(item, details);
      } catch {
        // Leave this item with whatever card-level data it already has.
      }
      onItemDone();
    }
  } finally {
    await chrome.windows.remove(win.id).catch(() => {});
  }
}

// 4 concurrent workers caused real, repeated misses (wrong photos, then
// missing photos) under resource contention -- both traced back to the
// same cause: a real hero photo taking longer to finish loading than
// expected while several tabs compete for network/CPU at once. 2 is a
// deliberate trade of some speed for reliability.
const DETAIL_FETCH_CONCURRENCY = 2;

async function fetchAllDetails(items, tabId, sellerName) {
  const queue = items.slice();
  const total = queue.length;
  let done = 0;
  const onItemDone = () => {
    done += 1;
    overlay(
      tabId,
      `<strong>GemList import</strong>
       <div style="margin-top:6px">${sellerName ? "Seller: " + sellerName + "<br/>" : ""}${total} listing(s) found.</div>
       <div style="margin-top:6px">Fetching details… ${done}/${total}</div>`,
    );
  };
  const workerCount = Math.min(DETAIL_FETCH_CONCURRENCY, queue.length) || 1;
  await Promise.all(Array.from({ length: workerCount }, () => runWorker(queue, onItemDone)));
}

// Hands the finished batch to the open GemList admin import page, which
// stages it on its own -- GemList's page, not Facebook's, so none of the
// Facebook-side caution applies here. Returns false if that page isn't
// open (the clipboard copy is the fallback).
const ADMIN_PAGE_PATTERNS = [
  "https://onbluebird.com/admin/fb-import*",
  "https://gemstateclassifieds.lovable.app/admin/fb-import*",
];

async function handoffToAdmin(json) {
  const tabs = await chrome.tabs.query({ url: ADMIN_PAGE_PATTERNS });
  if (!tabs.length) return false;
  const adminTab = tabs[0];
  await chrome.tabs.update(adminTab.id, { active: true });
  await chrome.windows.update(adminTab.windowId, { focused: true }).catch(() => {});
  await exec(
    adminTab.id,
    (text) => window.postMessage({ type: "gemlist-fb-import", text }, window.location.origin),
    [json],
  );
  return true;
}

const LISTING_URL_RE = /^https:\/\/www\.facebook\.com\/marketplace\/item\/\d+/;

// Re-reads price and description for listings that are already imported.
// Started by the admin clicking Refresh on the GemList page; no profile
// scrolling and no debugger needed since the listing URLs are already known.
async function refreshListings(adminTabId, requestId, targets) {
  const send = (payload) =>
    chrome.tabs.sendMessage(adminTabId, { type: "gemlist-ext-event", payload }).catch(() => {});
  const all = (Array.isArray(targets) ? targets : []).map((t) => ({
    sourceUrl: String(t && t.sourceUrl),
  }));
  const items = all.filter((t) => LISTING_URL_RE.test(t.sourceUrl));
  const kslItems = all.filter((t) => KSL_LISTING_RE.test(t.sourceUrl));
  const vintedItems = all.filter((t) => VINTED_ITEM_RE.test(t.sourceUrl));
  const whatnotItems = all.filter((t) => WHATNOT_LISTING_RE.test(t.sourceUrl));
  const queue = items.slice();
  const total = items.length + kslItems.length + vintedItems.length + whatnotItems.length;
  let done = 0;
  const onItemDone = () => {
    done += 1;
    send({ type: "gemlist-fb-refresh-progress", requestId, done, total });
  };
  const workerCount = Math.min(DETAIL_FETCH_CONCURRENCY, queue.length) || 1;
  await Promise.all(Array.from({ length: workerCount }, () => runWorker(queue, onItemDone, false)));
  const kslResults = kslItems.length ? await kslRefresh(kslItems, onItemDone) : [];
  const vintedResults = vintedItems.length ? await vintedRefresh(vintedItems, onItemDone) : [];
  const whatnotResults = whatnotItems.length ? await whatnotRefresh(whatnotItems, onItemDone) : [];
  send({
    type: "gemlist-fb-refresh-result",
    requestId,
    results: items
      .map((item) => ({
        sourceUrl: item.sourceUrl,
        title: item.title,
        priceCents: item.priceCents,
        description: item.description,
        unavailable: item.unavailable === true,
        sold: item.sold === true,
      }))
      .concat(kslResults, vintedResults, whatnotResults),
  });
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== "refresh" || !sender.tab || !sender.tab.id) return;
  refreshListings(sender.tab.id, message.requestId, message.targets).catch(() => {
    chrome.tabs
      .sendMessage(sender.tab.id, {
        type: "gemlist-ext-event",
        payload: { type: "gemlist-fb-refresh-result", requestId: message.requestId, results: [] },
      })
      .catch(() => {});
  });
});

async function run(tabId) {
  await overlay(
    tabId,
    "<strong>GemList import</strong><div style='margin-top:6px'>Scrolling to load every listing…</div>",
  );
  await autoScroll(tabId, (count) => {
    overlay(
      tabId,
      `<strong>GemList import</strong><div style="margin-top:6px">Scrolling… ${count} found</div>`,
    );
  });

  const { sellerName, sourceProfileUrl, items } = await exec(tabId, collectListingsFromPage);
  if (!items.length) {
    await overlay(
      tabId,
      "<strong>GemList import</strong><div style='margin-top:6px'>No listings found on this page.</div>",
    );
    return;
  }

  await overlay(
    tabId,
    `<strong>GemList import</strong>
     <div style="margin-top:6px">${sellerName ? "Seller: " + sellerName + "<br/>" : ""}${items.length} listing(s) found.</div>
     <div style="margin-top:6px">Fetching details… 0/${items.length}</div>`,
  );
  await fetchAllDetails(items, tabId, sellerName);

  const payload = {
    sourceProfileUrl,
    sellerName: sellerName || undefined,
    items: items.map((item) => ({
      sourceUrl: item.sourceUrl,
      title: item.title,
      description: item.description || "",
      priceCents: item.priceCents,
      condition: item.condition || "used_good",
      categorySlug: inferCategory(item.title, item.description),
      city: item.city || "",
      state: item.state || "",
      photoUrls: item.photoUrls || [],
    })),
  };
  const json = JSON.stringify(payload);
  await exec(tabId, (text) => navigator.clipboard.writeText(text), [json]);
  const handedOff = await handoffToAdmin(json).catch(() => false);
  await overlay(
    tabId,
    `<strong>GemList import</strong>
     <div style="margin-top:6px">${sellerName ? "Seller: " + sellerName + "<br/>" : ""}Done — ${items.length} listing(s).</div>
     <div style="margin-top:6px;opacity:.85">${
       handedOff
         ? "Sent to the GemList admin import page. Click Stage batch there."
         : "Copied to clipboard. Open the GemList admin import page and use Paste from clipboard."
     }</div>`,
  );
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  const paced = tab.url
    ? KSL_MEMBER_RE.test(tab.url)
      ? ["KSL", () => runKsl(tab.id)]
      : VINTED_MEMBER_RE.test(tab.url)
        ? ["Vinted", () => runVinted(tab.id)]
        : WHATNOT_USER_RE.test(tab.url)
          ? ["Whatnot", () => runWhatnot(tab.id, tab.url)]
          : null
    : null;
  if (paced) {
    try {
      await paced[1]();
    } catch (e) {
      await overlay(
        tab.id,
        `<strong>Bluebird import · ${paced[0]}</strong><div style="margin-top:6px;color:#f87171">Failed: ${String((e && e.message) || e)}</div>`,
      );
    }
    return;
  }
  if (!tab.url || !PROFILE_RE.test(tab.url)) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () =>
        alert(
          "Open the seller's Facebook Marketplace profile, KSL listings page (classifieds.ksl.com/search/member/...), Vinted profile (vinted.com/member/...) or Whatnot profile (whatnot.com/user/...) first, then click this extension's icon.",
        ),
    });
    return;
  }
  try {
    await run(tab.id);
  } catch (e) {
    await overlay(
      tab.id,
      `<strong>GemList import</strong><div style="margin-top:6px;color:#f87171">Failed: ${String((e && e.message) || e)}</div>`,
    );
  }
});
