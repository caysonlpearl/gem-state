/** Diesel Depot's own Sandhills catalog. No KSL dependency or scheduled reads. */
const DEALER_INVENTORY_RE = /^https:\/\/(?:www\.)?diesel-depot\.com\/inventory\/(?:[?#]|$)/i;
function dealerListingId(value) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== "/inventory/" ||
      !["diesel-depot.com", "www.diesel-depot.com"].includes(url.hostname)
    )
      return null;
    return (url.search.match(/^\?\/listing\/for-sale\/(\d+)(?:[/?&]|$)/) || [])[1] || null;
  } catch {
    return null;
  }
}

function dealerCollectInventoryPage() {
  const structured = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(
    (script) => {
      try {
        const data = JSON.parse(script.textContent);
        return Array.isArray(data) ? data : [data];
      } catch {
        return [];
      }
    },
  );
  const catalog = structured.find((data) => data?.offers?.["@type"] === "AggregateOffer");
  const offers = catalog?.offers?.offers || [];
  const byUrl = new Map(
    offers
      .filter((offer) => offer.url && (offer.itemOffered?.productID || offer.itemOffered?.["@id"]))
      .map((offer) => [
        offer.url,
        {
          sourceUrl: offer.url,
          title: offer.itemOffered.name || "",
          dealerCategory: offer.itemOffered.category || "",
        },
      ]),
  );
  // AggregateOffer omits Call for price and rental-only ads. Discover those
  // from the actual result cards too, never from recommendations or showrooms.
  for (const anchor of document.querySelectorAll(".list-listing-title-link")) {
    if (!byUrl.has(anchor.href))
      byUrl.set(anchor.href, { sourceUrl: anchor.href, title: anchor.textContent.trim() });
  }
  const names = new Set([
    "trucks for sale",
    "trailers for sale",
    "truck bodies",
    "other",
    "attachments",
    "truck attachments",
    "construction",
    "farm equipment",
  ]);
  const sections = [...document.querySelectorAll('a[href*="/inventory/?/listings/"]')]
    .filter((a) => names.has(a.textContent.trim().toLowerCase()))
    .map((a) => a.href);
  const next = document.querySelector(
    'a[rel="next"], a[aria-label="Next Page"], a[aria-label="Next page"]',
  );
  const range = [...document.querySelectorAll("h2")]
    .map((h) => h.textContent.match(/([\d,]+)\s*-\s*([\d,]+)\s*of\s*([\d,]+)\s*listings/i))
    .find(Boolean);
  const counts = range ? range.slice(1).map((n) => Number(n.replaceAll(",", ""))) : null;
  return {
    items: [...byUrl.values()],
    sections: [...new Set(sections)],
    expected: counts ? counts[2] : Number(catalog?.offers?.offerCount) || 0,
    pageCount: counts ? (counts[2] ? counts[1] - counts[0] + 1 : 0) : null,
    recognized: !!catalog || !!counts,
    nextUrl: next?.href || null,
  };
}

function dealerExtractListingInPage(withPhotos) {
  const text = document.body?.innerText || "";
  const structured = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(
    (script) => {
      try {
        const data = JSON.parse(script.textContent);
        return Array.isArray(data) ? data : [data];
      } catch {
        return [];
      }
    },
  );
  const expected = (location.search.match(/^\?\/listing\/for-sale\/(\d+)/) || [])[1];
  // Only a top-level product for this ID: never a Recommended For You card.
  const product = structured.find(
    (d) =>
      /^(Vehicle|Product)$/.test(d?.["@type"]) &&
      String(
        d.offers?.itemOffered?.productID ||
          d.offers?.itemOffered?.["@id"] ||
          d.productID ||
          d["@id"],
      ) === expected,
  );
  if (!product) {
    if (
      /listing (?:is )?(?:no longer available|has been removed)|listing not found|this listing has been sold/i.test(
        text.slice(0, 1500),
      )
    )
      return { unavailable: true, sold: /has been sold/i.test(text.slice(0, 1500)) };
    return null;
  }
  const offer = product.offers || {};
  if (/soldout|outofstock|discontinued/i.test(offer.availability || ""))
    return { unavailable: true, sold: true };
  const specs = Object.fromEntries(
    [...document.querySelectorAll(".detail__specs-label")].map((label) => [
      label.textContent.trim(),
      label.nextElementSibling?.textContent.trim() || "",
    ]),
  );
  const offered = offer.itemOffered || product;
  const price = Number(offer.price);
  const address = offer.availableAtOrFrom?.address || {};
  const area = String(offer.areaServed || "");
  const region = address.addressRegion || "";
  const city = address.addressLocality || (region ? area.split(region)[0].trim() : "");
  const category = offered.category || "";
  const description = String(product.description || specs.Description || "");
  const specText = Object.entries(specs)
    .filter(([key]) => key !== "Description")
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  const result = {
    title: product.name || document.querySelector("h1")?.textContent.trim() || "",
    description: [description, specText].filter(Boolean).join("\n\n").slice(0, 5000),
    priceCents:
      offer.price !== undefined && Number.isFinite(price) && price >= 0
        ? Math.round(price * 100)
        : null,
    priceUnknown: offer.price == null || offer.price === "" || !Number.isFinite(price) || price < 0,
    dealerCondition: offered.itemCondition || specs.Condition || "",
    dealerCategory: category,
    city,
    state: { Idaho: "ID", Utah: "UT", Oregon: "OR", Washington: "WA" }[region] || region,
    vehicle: {
      year: Number(offered.vehicleModelDate || specs.Year) || null,
      make: offered.manufacturer || product.brand?.name || specs.Manufacturer || "",
      model: offered.model || specs.Model || "",
      mileage: specs.Mileage ? Number(specs.Mileage.replace(/[^\d.]/g, "")) : null,
      vin: specs.VIN || product.mpn || "",
      transmission: product.vehicleTransmission || specs.Transmission || "",
      fuelType: specs["Fuel Type"] || "",
      color: product.color || specs.Color || "",
      stockNumber: product.sku || specs["Stock Number"] || "",
    },
  };
  if (withPhotos) {
    // Preserve Sandhills' id/checksum query string and read lazy gallery
    // attributes. Dropping the query would turn every photo into one URL.
    const gallery = [...document.querySelectorAll(".mc-item.mc-img img.mc-img-normal")].map(
      (img) => img.currentSrc || img.src || img.getAttribute("data-src"),
    );
    const images = (gallery.length ? gallery : [].concat(product.image || [])).flatMap((src) => {
      try {
        return [new URL(typeof src === "string" ? src : src?.url, location.href).href];
      } catch {
        return [];
      }
    });
    const seen = new Set();
    result.photoUrls = images
      .filter((src) => {
        if (!src) return false;
        const url = new URL(typeof src === "string" ? src : src.url, location.href);
        if (url.protocol !== "https:" || url.hostname !== "media.sandhills.com") return false;
        const key = url.searchParams.get("id") || url.href;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);
  }
  return result;
}

function dealerCategorySlug(category, title = "") {
  const text = `${category} ${title}`;
  if (/truck bod(?:y|ies)|truck (?:parts|attachments)|parts and components|bodies only/i.test(text))
    return "auto-parts";
  if (/trailers?/i.test(text)) return "trailers";
  if (/farm equipment|tractor|combine|baler|plow|harrow/i.test(text)) return "farm-garden";
  if (/construction attachments|cranes?|excavator|loader|forklift|equipment|machinery/i.test(text))
    return "industrial";
  if (/trucks?|chassis|ford f\d|kenworth|peterbilt|freightliner/i.test(text)) return "cars-trucks";
  return typeof inferCategory === "function" ? inferCategory(title, "") : "general";
}
function dealerToImportItem(item) {
  return {
    sourceUrl: item.sourceUrl,
    title: String(item.title || "").slice(0, 120),
    description: item.description || "",
    priceCents: item.priceCents ?? 0,
    condition:
      /new/i.test(item.dealerCondition || "") && !/used/i.test(item.dealerCondition || "")
        ? "new_without_tags"
        : "used_good",
    categorySlug: dealerCategorySlug(item.dealerCategory, item.title),
    city: item.city || "",
    state: item.state || "ID",
    photoUrls: item.photoUrls || [],
  };
}
async function runDealer(tabId) {
  const say = (body) =>
    overlay(
      tabId,
      `<strong>Bluebird import · Diesel Depot</strong><div style="margin-top:6px">${body}</div>`,
    );
  await say("Finding all inventory sections…");
  const first = await exec(tabId, dealerCollectInventoryPage);
  if (!first.sections.length)
    throw new Error("Could not find the dealer's inventory sections. No batch was created.");
  const pages = first.sections.filter((value) => {
      try {
        const url = new URL(value);
        return (
          url.origin === "https://www.diesel-depot.com" &&
          url.pathname === "/inventory/" &&
          url.search.startsWith("?/listings/")
        );
      } catch {
        return false;
      }
    }),
    visited = new Set(),
    byId = new Map();
  let complete = true;
  while (pages.length && visited.size < 100) {
    const url = pages.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    await chrome.tabs.update(tabId, { url });
    const pageKey = new URL(url).search;
    if (
      !(await waitForPage(tabId, (current) => new URL(current).search === pageKey, 25000, 1500))
    ) {
      complete = false;
      break;
    }
    if (await exec(tabId, isBotCheckPage)) {
      complete = false;
      break;
    }
    const page = await exec(tabId, dealerCollectInventoryPage);
    if (
      !page?.recognized ||
      (page.pageCount !== null && page.items.length < page.pageCount) ||
      (page.expected > page.items.length && !page.nextUrl && page.pageCount === page.expected)
    ) {
      complete = false;
      break;
    }
    for (const item of page.items) {
      const id = dealerListingId(item.sourceUrl);
      if (id && !byId.has(id)) byId.set(id, item);
    }
    if (page.nextUrl) {
      const next = new URL(page.nextUrl);
      if (
        next.origin !== "https://www.diesel-depot.com" ||
        !next.search.startsWith("?/listings/")
      ) {
        complete = false;
        break;
      }
      if (!visited.has(page.nextUrl)) pages.push(page.nextUrl);
    } else if (page.pageCount !== null && page.expected > page.pageCount) {
      complete = false;
      break;
    }
    await say(`${visited.size} inventory page(s), ${byId.size} unique listing(s) found…`);
  }
  if (pages.length) complete = false;
  if (!complete)
    throw new Error(
      "An inventory page could not be read. Complete any site verification and retry; no partial batch was created.",
    );
  const items = [...byId.values()];
  let done = 0;
  await readListingsPaced(items, {
    siteName: "Diesel Depot",
    extract: dealerExtractListingInPage,
    idOf: dealerListingId,
    withPhotos: true,
    onItemDone: () => say(`Reading listings in two windows… ${++done}/${items.length}`),
    notify: say,
  });
  const usable = items.filter((i) => !i.unreadable && !i.unavailable && !i.priceUnknown);
  const skipped = items.length - usable.length;
  if (!usable.length)
    throw new Error("No complete, priced listings could be read. Nothing was staged.");
  await deliverImport(
    tabId,
    say,
    "",
    {
      sourceProfileUrl: "https://www.diesel-depot.com/inventory/",
      sellerName: "Diesel Depot",
      items: usable.map(dealerToImportItem),
    },
    skipped
      ? [
          `${skipped} unavailable, rental-only, call-for-price or unreadable listing(s) skipped — no $0 placeholders; check these on the dealer site`,
        ]
      : [],
  );
}
