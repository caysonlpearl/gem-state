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
  return exec(tabId, () =>
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
    const ownLink = Array.from(document.querySelectorAll('a[href*="/marketplace/item/"]')).find(isOwn);
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
  const links = Array.from(document.querySelectorAll('a[href*="/marketplace/item/"]')).filter(isOwn);
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
async function extractListingDetailsInPage() {
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
    const idx = lines.findIndex((l) => l === "Condition");
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
  if (!block) return null;

  const lines = (block.innerText || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const conditionIdx = lines.findIndex((l) => l === "Condition");
  const condition = conditionIdx >= 0 ? lines[conditionIdx + 1] : "";
  const locationIdx = lines.findIndex((l) => /Location is approximate/i.test(l));
  const descLines =
    conditionIdx >= 0
      ? lines.slice(conditionIdx + 2, locationIdx >= 0 ? locationIdx : lines.length)
      : [];
  const description = descLines.join("\n\n").trim();

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
      while ((!img || img.src === photoUrls[photoUrls.length - 1]) && Date.now() - clickStart < 8000) {
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
async function runWorker(queue, onItemDone) {
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
        const details = await exec(tabId, extractListingDetailsInPage);
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
const ADMIN_PAGE_PATTERN = "https://gemstateclassifieds.lovable.app/admin/fb-import*";

async function handoffToAdmin(json) {
  const tabs = await chrome.tabs.query({ url: ADMIN_PAGE_PATTERN });
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

async function run(tabId) {
  await overlay(
    tabId,
    "<strong>GemList import</strong><div style='margin-top:6px'>Scrolling to load every listing…</div>",
  );
  await autoScroll(tabId, (count) => {
    overlay(tabId, `<strong>GemList import</strong><div style="margin-top:6px">Scrolling… ${count} found</div>`);
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
      categorySlug: "general",
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
  if (!tab.url || !PROFILE_RE.test(tab.url)) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () =>
        alert(
          "Open the seller's Facebook Marketplace profile page first, then click this extension's icon.",
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
