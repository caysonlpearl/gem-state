/**
 * GemList Facebook Marketplace import bookmarklet.
 *
 * Install: drag the "Install bookmarklet" link on /admin/fb-import to your
 * bookmarks bar (that page builds the javascript: link from this file).
 *
 * Use, every time, by hand:
 *   1. In your own browser, while actually signed into Facebook, open the
 *      seller's Marketplace profile page.
 *   2. Click the bookmarklet. It scrolls the profile to load every listing,
 *      then shows a small panel in the top-right corner.
 *   3. Click "Fetch details" in that panel. It opens ONE extra tab/window
 *      (your browser may ask you to allow pop-ups for facebook.com -- allow
 *      it) and walks every listing's detail page in it, one at a time, to
 *      read the full description/condition/photos that the profile grid
 *      never shows. This takes a few seconds per listing.
 *   4. Click "Copy JSON" and paste it into the admin tool's "Paste from
 *      clipboard" button.
 *
 * This never stores, transmits, or has any access to your Facebook session,
 * cookies, or credentials -- it only reads the page your own browser already
 * rendered for you, because you're signed in. Nothing here runs on a
 * schedule or without you present; re-run it by hand whenever you want a
 * refresh, and the admin tool's own diffing handles the rest.
 */
(function () {
  const OVERLAY_ID = "gemlist-fb-import-overlay";
  const WORKER_NAME = "gemlist_fb_import_worker";

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function findScrollParent(el) {
    let node = el;
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
        return node;
      }
      node = node.parentElement;
    }
    return document.scrollingElement || document.body;
  }

  // The profile grid lazy-loads; keep scrolling its real scroll container
  // (not the page) until the listing count stops growing for a few tries.
  async function collectListingLinks(onProgress) {
    await sleep(300);
    let links = Array.from(document.querySelectorAll('a[href*="/marketplace/item/"]'));
    if (!links.length) return [];
    const scrollParent = findScrollParent(links[0]);
    let stagnant = 0;
    let lastCount = links.length;
    for (let i = 0; i < 60 && stagnant < 3; i++) {
      scrollParent.scrollTop = scrollParent.scrollHeight;
      await sleep(650);
      links = Array.from(document.querySelectorAll('a[href*="/marketplace/item/"]'));
      onProgress && onProgress(links.length);
      if (links.length === lastCount) stagnant++;
      else stagnant = 0;
      lastCount = links.length;
    }
    return links;
  }

  // Facebook's own aria-label on each listing link is
  // "{title}, ${price}, {city}, {state}, listing {id}" -- matched from the
  // right so a title containing a comma doesn't throw off the split.
  function parseListingLink(a) {
    const label = a.getAttribute("aria-label") || "";
    const m = label.match(/^(.*), \$([\d,]+), ([^,]+), ([A-Za-z]{2}), listing (\d+)$/);
    if (!m) return null;
    const [, title, priceStr, city, state, id] = m;
    const href = a.getAttribute("href") || "";
    const idMatch = href.match(/\/marketplace\/item\/(\d+)/);
    return {
      id: idMatch ? idMatch[1] : id,
      sourceUrl: `https://www.facebook.com/marketplace/item/${idMatch ? idMatch[1] : id}/`,
      title: title.trim(),
      priceCents: Math.round(parseFloat(priceStr.replace(/,/g, "")) * 100) || 0,
      city: city.trim(),
      state: state.trim().toUpperCase(),
    };
  }

  // The seller's display name isn't tagged with a stable attribute, but it's
  // reliably the largest text on the profile dialog (confirmed live: 32px vs
  // everything else under 20px).
  function findSellerName() {
    const container = document.querySelector('[role="dialog"]') || document.body;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let best = null;
    let bestSize = 0;
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (!text || text.length > 60) continue;
      const el = node.parentElement;
      if (!el) continue;
      const size = parseFloat(getComputedStyle(el).fontSize) || 0;
      if (size >= 20 && size > bestSize) {
        bestSize = size;
        best = text;
      }
    }
    return best;
  }

  function mapCondition(raw) {
    const t = (raw || "").toLowerCase();
    // Check "like new"/"excellent" before the bare "new" substring check --
    // "Used - Like New" contains "new" too, and is not actually new.
    if (t.includes("like new") || t.includes("excellent")) return "used_excellent";
    if (t.includes("used")) return "used_good";
    if (t.includes("new")) return t.includes("tag") ? "new_with_tags" : "new_without_tags";
    return "used_good";
  }

  // A listing's full description/condition/photos are rendered client-side
  // (confirmed: a plain fetch() of the listing URL does not contain them),
  // so each one has to actually load in a real window. Climbing from the
  // price leaf until the surrounding text contains both "Condition" and
  // "Details" lands on the one block holding everything we need, confirmed
  // against a real listing page.
  function findDetailsBlock(doc) {
    const candidates = Array.from(doc.querySelectorAll("*")).filter(
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

  async function waitForDetailsBlock(win, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        if (win.closed) return null;
        const doc = win.document;
        if (doc && doc.readyState === "complete") {
          const block = findDetailsBlock(doc);
          if (block) return { doc, block };
        }
      } catch {
        // Not loaded yet / about:blank -- keep polling.
      }
      await sleep(400);
    }
    return null;
  }

  async function collectCarouselPhotos(doc, detailsBlock) {
    const seen = new Set();
    const snapshot = () => {
      doc.querySelectorAll("img").forEach((img) => {
        if (img.naturalWidth > 150 && img.src && !detailsBlock.contains(img)) seen.add(img.src);
      });
    };
    snapshot();
    const findNextButton = () =>
      Array.from(doc.querySelectorAll("[aria-label]")).find((el) =>
        /next photo|next image/i.test(el.getAttribute("aria-label") || ""),
      );
    let stagnant = 0;
    for (let i = 0; i < 20 && stagnant < 2; i++) {
      const btn = findNextButton();
      if (!btn) break;
      const before = seen.size;
      btn.click();
      await sleep(550);
      snapshot();
      if (seen.size === before) stagnant++;
      else stagnant = 0;
    }
    return Array.from(seen).slice(0, 8);
  }

  async function extractListingDetails(doc, block) {
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
    const photoUrls = await collectCarouselPhotos(doc, block);
    return { condition: mapCondition(condition), description, photoUrls };
  }

  async function fetchAllDetails(items, onProgress) {
    const worker = window.open("about:blank", WORKER_NAME, "width=1000,height=1200");
    if (!worker) {
      alert("Please allow pop-ups for facebook.com so the detail worker tab can open, then retry.");
      return;
    }
    for (const item of items) {
      if (item.done) continue;
      try {
        worker.location.href = item.sourceUrl;
        const found = await waitForDetailsBlock(worker, 20000);
        if (!found) {
          item.error = "Timed out loading listing detail page.";
        } else {
          const details = await extractListingDetails(found.doc, found.block);
          Object.assign(item, details);
          item.done = true;
        }
      } catch (e) {
        item.error = String((e && e.message) || e);
      }
      onProgress && onProgress(item);
      await sleep(600);
    }
    try {
      worker.close();
    } catch {
      // Already closed by the user -- fine.
    }
  }

  function buildOverlay() {
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) existing.remove();
    const el = document.createElement("div");
    el.id = OVERLAY_ID;
    el.style.cssText =
      "position:fixed;top:16px;right:16px;z-index:2147483647;width:300px;" +
      "background:#111;color:#fff;font:12px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;" +
      "border-radius:10px;padding:14px;box-shadow:0 8px 30px rgba(0,0,0,.45)";
    document.body.appendChild(el);
    return el;
  }

  function render(el, html) {
    el.innerHTML = html;
  }

  async function main() {
    if (!/\/marketplace\/profile\//.test(location.href)) {
      alert("Open the seller's Facebook Marketplace profile page first, then click this bookmarklet.");
      return;
    }

    const overlay = buildOverlay();
    render(overlay, "<strong>GemList import</strong><div style='margin-top:6px'>Scrolling to load listings…</div>");

    const sourceProfileUrl = location.href.split("?")[0];
    const sellerName = findSellerName();
    const links = await collectListingLinks((count) => {
      render(
        overlay,
        `<strong>GemList import</strong><div style='margin-top:6px'>Loading listings… ${count} found</div>`,
      );
    });

    const byId = new Map();
    for (const a of links) {
      const parsed = parseListingLink(a);
      if (parsed && !byId.has(parsed.id)) byId.set(parsed.id, parsed);
    }
    const items = Array.from(byId.values());

    if (!items.length) {
      render(
        overlay,
        "<strong>GemList import</strong><div style='margin-top:6px'>No listings found on this page.</div>",
      );
      return;
    }

    const renderReady = () => {
      const done = items.filter((i) => i.done).length;
      const failed = items.filter((i) => i.error).length;
      render(
        overlay,
        `<strong>GemList import</strong>
         <div style="margin-top:6px">${sellerName ? "Seller: " + sellerName + "<br/>" : ""}${items.length} listing(s) found.</div>
         <div style="margin-top:6px">Details fetched: ${done}/${items.length}${failed ? " (" + failed + " failed)" : ""}</div>
         <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
           <button id="gemlist-fetch-btn" style="flex:1;padding:6px 8px;border-radius:6px;border:0;background:#2563eb;color:#fff;font:inherit;cursor:pointer">Fetch details</button>
           <button id="gemlist-copy-btn" style="flex:1;padding:6px 8px;border-radius:6px;border:0;background:#16a34a;color:#fff;font:inherit;cursor:pointer">Copy JSON</button>
         </div>
         <div style="margin-top:6px;opacity:.7">Fetch opens one extra tab to read each listing's full details. Allow pop-ups if asked.</div>`,
      );
      const fetchBtn = overlay.querySelector("#gemlist-fetch-btn");
      const copyBtn = overlay.querySelector("#gemlist-copy-btn");
      if (fetchBtn) {
        fetchBtn.onclick = async () => {
          fetchBtn.disabled = true;
          fetchBtn.textContent = "Fetching…";
          await fetchAllDetails(items, renderReady);
          renderReady();
        };
      }
      if (copyBtn) {
        copyBtn.onclick = async () => {
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
          await navigator.clipboard.writeText(JSON.stringify(payload));
          copyBtn.textContent = "Copied!";
          setTimeout(() => {
            copyBtn.textContent = "Copy JSON";
          }, 1500);
        };
      }
    };
    renderReady();
  }

  main();
})();
