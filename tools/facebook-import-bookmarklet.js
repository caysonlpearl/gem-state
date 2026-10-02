/**
 * GemList Facebook Marketplace import bookmarklet.
 *
 * Install: drag the "Install bookmarklet" link on /admin/fb-import to your
 * bookmarks bar (that page builds the javascript: link from this file).
 *
 * Use, every time, by hand:
 *   1. In your own browser, while actually signed into Facebook, open the
 *      seller's Marketplace profile page.
 *   2. Click the bookmarklet. A small panel appears in the top-right
 *      corner. Facebook only loads more of the seller's listings as you
 *      actually scroll (a script can't fake that), so scroll down through
 *      the listings yourself until no new ones appear, then click "Done
 *      scrolling" in the panel.
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

  // Facebook mixes unrelated "you might also like" recommendations into the
  // same page as a seller's real listings once you scroll past them, but
  // tags the two apart in the link itself: the seller's own items carry
  // ref=marketplace_profile, recommendations carry
  // ref=browse_tab&referral_code=marketplace_top_picks (confirmed live).
  function isOwnProfileListing(a) {
    return /[?&]ref=marketplace_profile\b/.test(a.getAttribute("href") || "");
  }

  function collectOwnLinks() {
    return Array.from(document.querySelectorAll('a[href*="/marketplace/item/"]')).filter(
      isOwnProfileListing,
    );
  }

  // Facebook's lazy-loaded listing grid only fetches more on a genuinely
  // user-driven scroll -- confirmed live that no amount of script-driven
  // scrollTop assignment, incremental or not, with dispatched scroll/wheel
  // events, ever triggers it, while an actual mouse-wheel scroll does
  // every time. A bookmarklet can't fake trusted input, so instead of
  // guessing at a scroll that won't work, this watches the page live and
  // has you do the scrolling -- which also means it never has to guess
  // when "done" means done.
  function waitForManualScroll(overlay, sellerName) {
    return new Promise((resolve) => {
      let links = collectOwnLinks();
      function renderWaiting() {
        render(
          overlay,
          `<strong>GemList import</strong>
           <div style="margin-top:6px">${sellerName ? "Seller: " + sellerName + "<br/>" : ""}<span id="gemlist-scroll-count">${links.length}</span> listing(s) found so far.</div>
           <div style="margin-top:8px;opacity:.85">Scroll down through the listings below (Facebook only loads more as you actually scroll) until no new ones appear, then click Done.</div>
           <button id="gemlist-scroll-done-btn" style="margin-top:10px;width:100%;padding:6px 8px;border-radius:6px;border:0;background:#2563eb;color:#fff;font:inherit;cursor:pointer">Done scrolling</button>`,
        );
        const btn = overlay.querySelector("#gemlist-scroll-done-btn");
        if (btn) btn.onclick = finish;
      }
      const observer = new MutationObserver(() => {
        const next = collectOwnLinks();
        if (next.length !== links.length) {
          links = next;
          const countEl = overlay.querySelector("#gemlist-scroll-count");
          if (countEl) countEl.textContent = String(links.length);
          else renderWaiting();
        }
      });
      function finish() {
        observer.disconnect();
        resolve(links);
      }
      observer.observe(document.body, { childList: true, subtree: true });
      renderWaiting();
    });
  }

  // Facebook's own aria-label on each listing link is
  // "{title}, ${price}, {city}, {state}, listing {id}" -- matched from the
  // right so a title containing a comma doesn't throw off the split. A
  // discounted listing inserts an extra "reduced from $X, " segment
  // between the price and the city (confirmed live), so that's optional.
  function parseListingLink(a) {
    const label = a.getAttribute("aria-label") || "";
    const m = label.match(
      /^(.*), \$([\d,]+), (?:reduced from \$[\d,]+, )?([^,]+), ([A-Za-z]{2}), listing (\d+)$/,
    );
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
  // A page-wide search for the largest text picks up unrelated chrome
  // (confirmed live: it grabbed the sidebar's "Notifications" label on the
  // full profile page layout). Scoping to the card that actually holds
  // "{Name}'s listings", then its grandparent (which also holds the name
  // heading as a sibling block), reliably isolates just the seller's own
  // profile card.
  function findSellerName() {
    const ownLink = collectOwnLinks()[0];
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
      (listingsSection && listingsSection.parentElement && listingsSection.parentElement.parentElement) ||
      document.querySelector('[role="dialog"]') ||
      document.body;
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    let best = null;
    let bestSize = 0;
    let textNode;
    while ((textNode = walker.nextNode())) {
      const text = textNode.textContent.trim();
      if (!text || text.length > 60) continue;
      const el = textNode.parentElement;
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
    // "tag" is a substring of "tags", so a bare .includes("tag") can't tell
    // "with tags" from "no tags" -- require the actual phrase.
    if (t.includes("new")) return /with\s*tags?/.test(t) ? "new_with_tags" : "new_without_tags";
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

  // The "Details"/"Condition" labels render before the condition's actual
  // value and the description text stream in a beat later -- so matching on
  // the labels alone (the old check) grabs the block too early, while it's
  // still "Details\nCondition" with nothing after it. Wait for a populated
  // value line too, but fall back to whatever was found if that never
  // resolves in time (partial data -- e.g. photos -- beats none).
  function conditionLineValue(block) {
    const lines = (block.innerText || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const conditionIdx = lines.findIndex((l) => l === "Condition");
    return conditionIdx >= 0 ? lines[conditionIdx + 1] : null;
  }

  function listingIdFromUrl(url) {
    const m = (url || "").match(/\/marketplace\/item\/(\d+)/);
    return m ? m[1] : null;
  }

  // Setting `win.location.href` doesn't navigate instantly -- the previous
  // listing's document (readyState "complete", its own real Details/
  // Condition block) is still sitting there for a beat. Without confirming
  // the worker has actually reached the NEW listing's id first, polling
  // would happily extract the PREVIOUS listing's title/photos/description
  // and attribute them to this one -- which is exactly the mismatched
  // title/photo pairing seen on a live run. Only trust the document once
  // its own URL matches the listing we just navigated to.
  async function waitForDetailsBlock(win, expectedUrl, timeoutMs) {
    const expectedId = listingIdFromUrl(expectedUrl);
    const start = Date.now();
    let fallback = null;
    while (Date.now() - start < timeoutMs) {
      try {
        if (win.closed) return fallback;
        const currentId = listingIdFromUrl(win.location.href);
        if (expectedId && currentId === expectedId) {
          const doc = win.document;
          if (doc && doc.readyState === "complete") {
            const block = findDetailsBlock(doc);
            if (block) {
              fallback = { doc, block };
              if (conditionLineValue(block)) return { doc, block };
            }
          }
        }
      } catch {
        // Mid cross-document transition -- keep polling.
      }
      await sleep(400);
    }
    return fallback;
  }

  // Confirmed live: each photo in a listing's carousel has its own numbered
  // control ("View photo 1", "View photo 2", ...) that deterministically
  // swaps the single large main image -- a far more reliable signal than
  // guessing at a "next" button's label or clicking until nothing changes.
  // A single-photo listing has no such buttons at all.
  function photoButtons(doc) {
    return Array.from(doc.querySelectorAll("[aria-label]")).filter((el) =>
      /^View photo \d+$/i.test(el.getAttribute("aria-label") || ""),
    );
  }

  // Rendered size, not naturalWidth/Height: Facebook's own avatar images
  // (the seller's profile picture, mutual-friend thumbnails) are often
  // uploaded at a large native resolution even though they're DISPLAYED
  // small, so naturalWidth alone can't tell a listing photo from an avatar.
  // How big the browser actually draws it can.
  function mainPhoto(doc, excludeEl) {
    let best = null;
    let bestArea = 0;
    doc.querySelectorAll("img").forEach((img) => {
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

  async function collectCarouselPhotos(doc, detailsBlock) {
    const buttons = photoButtons(doc);
    if (!buttons.length) {
      // Single-photo listing -- the main photo is reliably the single
      // largest rendered image outside the text block. It can still lag a
      // beat behind the text content even once "Condition"/"Details" are
      // populated, so check more than once before giving up.
      let img = mainPhoto(doc, detailsBlock);
      const photoStart = Date.now();
      while (!img && Date.now() - photoStart < 5000) {
        await sleep(300);
        img = mainPhoto(doc, detailsBlock);
      }
      return img ? [img.src] : [];
    }

    const count = buttons.length;
    const urls = [];
    for (let i = 1; i <= count; i++) {
      // Re-query by label each time rather than reusing earlier element
      // references -- Facebook can re-render the control strip between
      // clicks, which would make a stale reference silently no-op.
      const btn = photoButtons(doc).find(
        (el) => el.getAttribute("aria-label") === `View photo ${i}`,
      );
      if (!btn) continue;
      btn.click();
      await sleep(700);
      const img = mainPhoto(doc, detailsBlock);
      if (img && img.src) urls.push(img.src);
    }
    return Array.from(new Set(urls)).slice(0, 8);
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
        // Chrome throttles timers/rAF in a window that never has focus,
        // which can stop a photo-carousel click from ever finishing its
        // render -- keep the worker focused while it's doing the work.
        worker.focus();
        const found = await waitForDetailsBlock(worker, item.sourceUrl, 20000);
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
    const sourceProfileUrl = location.href.split("?")[0];
    const sellerName = findSellerName();
    const links = await waitForManualScroll(overlay, sellerName);

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
