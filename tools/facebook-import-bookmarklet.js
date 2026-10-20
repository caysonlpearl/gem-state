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
      (listingsSection &&
        listingsSection.parentElement &&
        listingsSection.parentElement.parentElement) ||
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
    if (matches(/\b(rv|r\.v\.|camper|motorhome|fifth wheel|travel trailer)\b/))
      return "rvs-campers";
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
    const inlineCondition = lines.find((line) => /^condition\s*:/i.test(line));
    if (inlineCondition) return inlineCondition.replace(/^condition\s*:\s*/i, "").trim();
    const conditionIdx = lines.findIndex((l) => /^condition\s*:?$/i.test(l));
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
  function mainPhoto(doc) {
    const tagged = doc.querySelector('img[alt^="Product photo of "]');
    if (tagged && tagged.src) return tagged;
    let best = null;
    let bestArea = 0;
    doc.querySelectorAll("img").forEach((img) => {
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

  async function collectCarouselPhotos(doc) {
    const buttons = photoButtons(doc);
    if (!buttons.length) {
      // Single-photo listing. The photo can still lag a beat behind the
      // text content even once "Condition"/"Details" are populated, so
      // check more than once before giving up.
      let img = mainPhoto(doc);
      const photoStart = Date.now();
      while (!img && Date.now() - photoStart < 9000) {
        await sleep(300);
        img = mainPhoto(doc);
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
      let img = mainPhoto(doc);
      const clickStart = Date.now();
      while ((!img || img.src === urls[urls.length - 1]) && Date.now() - clickStart < 8000) {
        await sleep(250);
        img = mainPhoto(doc);
      }
      if (img && img.src) urls.push(img.src);
    }
    return Array.from(new Set(urls)).slice(0, 8);
  }

  async function extractListingDetails(doc, block) {
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
    const photoUrls = await collectCarouselPhotos(doc);
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
      alert(
        "Open the seller's Facebook Marketplace profile page first, then click this bookmarklet.",
      );
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
              categorySlug: inferCategory(item.title, item.description),
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
