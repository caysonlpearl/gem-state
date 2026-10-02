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
      await sleep(500);
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

  function mainPhoto(excludeEl) {
    let best = null;
    let bestArea = 0;
    document.querySelectorAll("img").forEach((img) => {
      if ((excludeEl && excludeEl.contains(img)) || !img.src) return;
      const rect = img.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (rect.width > 150 && rect.height > 150 && area > bestArea) {
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
    let img = mainPhoto(block);
    const photoStart = Date.now();
    while (!img && Date.now() - photoStart < 5000) {
      await sleep(300);
      img = mainPhoto(block);
    }
    if (img) photoUrls.push(img.src);
  } else {
    for (let i = 1; i <= buttons.length; i++) {
      const btn = photoButtons().find((el) => el.getAttribute("aria-label") === `View photo ${i}`);
      if (!btn) continue;
      btn.click();
      await sleep(700);
      const img = mainPhoto(block);
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

function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, timeoutMs || 20000);
    function listener(id, info) {
      if (id === tabId && info.status === "complete") {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.get(tabId, (t) => {
      if (settled) return;
      if (t && t.status === "complete") {
        settled = true;
        clearTimeout(timer);
        resolve();
        return;
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
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

  for (let i = 0; i < items.length; i++) {
    await overlay(
      tabId,
      `<strong>GemList import</strong>
       <div style="margin-top:6px">${sellerName ? "Seller: " + sellerName + "<br/>" : ""}${items.length} listing(s) found.</div>
       <div style="margin-top:6px">Fetching details… ${i}/${items.length}</div>`,
    );
    // Chrome throttles background tabs -- timers get clamped and
    // requestAnimationFrame stops firing entirely while a tab isn't
    // visible. Facebook's photo carousel needs rAF to actually swap the
    // displayed image after a click, so a background detail tab can
    // register the click but never finish rendering the next photo before
    // the wait elapses -- a real cause of missing photos, not just a slow
    // listing. Opening it active (foreground) avoids that; focus returns
    // to the original tab once every listing is done.
    const detailTab = await chrome.tabs.create({ url: items[i].sourceUrl, active: true });
    try {
      await waitForTabComplete(detailTab.id);
      const details = await exec(detailTab.id, extractListingDetailsInPage);
      if (details) Object.assign(items[i], details);
    } catch {
      // Leave this item with whatever card-level data it already has.
    } finally {
      await chrome.tabs.remove(detailTab.id).catch(() => {});
    }
  }
  await chrome.tabs.update(tabId, { active: true }).catch(() => {});

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
  await exec(tabId, (json) => navigator.clipboard.writeText(json), [JSON.stringify(payload)]);
  await overlay(
    tabId,
    `<strong>GemList import</strong>
     <div style="margin-top:6px">${sellerName ? "Seller: " + sellerName + "<br/>" : ""}Done — ${items.length} listing(s).</div>
     <div style="margin-top:6px;opacity:.85">Copied to clipboard. Paste into GemList's admin import tool.</div>`,
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
