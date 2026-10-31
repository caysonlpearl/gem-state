/** Verified against Guns.com's AvantLink taxonomy and live ProductSearch JSON. */
export const AVANTLINK_ACCOUNT = {
  affiliateId: "400633",
  websiteId: "448337",
  datafeedId: "6417",
  merchantId: "16393",
} as const;

export const MERCHANDISE_PAGE_SIZE = 250;
export const MERCHANDISE_SCOPES = [
  ["Silencers", ""],
  ["Silencer Accessories", ""],
  ["Gun Parts", ""],
  ["Magazines", ""],
  ["Optics", ""],
  ["Reloading", ""],
  ["Gear", "Apparel"],
  ["Gear", "Drinkware"],
  ["Gear", "Hats"],
  ["Gear", "Patches And Stickers"],
  ["Gear", "Shirts"],
  ["Cleaning Supplies", "Cleaning Kits"],
  ["Cleaning Supplies", "Oils"],
  ["Hunting Gear", "Cameras"],
  ["Hunting Gear", "Decoys"],
  ["Hunting Gear", "Feeders"],
  ["Hunting Gear", "Game Calls"],
  ["Hunting Gear", "Hunting Scents"],
  ["Hunting Gear", "Repellents"],
  ["Holsters And Holders", "Belts"],
  ["Holsters And Holders", "Holsters"],
  ["Holsters And Holders", "Pouch"],
  ["Optics", "Binoculars"],
  ["Optics", "Rangefinders"],
  ["Optics", "Spotting Scopes"],
  ["Range Gear", "Carrying Bags"],
  ["Range Gear", "Eye Protection"],
  ["Range Gear", "Gun Cases"],
  ["Range Gear", "Hearing Protection"],
  ["Range Gear", "Locks"],
  ["Range Gear", "Pouch"],
  ["Range Gear", "Targets"],
  ["Range Gear", "Traps And Clay Throwers"],
  ["Knives And Tools", "Knife Accessories"],
  ["Rifles", "Bolt Action"],
  ["Rifles", "Semi Auto"],
  ["Rifles", "Lever Action"],
  ["Rifles", "Single Shot"],
  ["Rifles", "Pump Action"],
  ["Handguns", "Semi Auto"],
  ["Handguns", "Revolver"],
  ["Handguns", "Bolt Action"],
  ["Handguns", "Lever Action"],
  ["Handguns", "Single Shot"],
  ["Shotguns", "Pump Action"],
  ["Shotguns", "Over Under"],
  ["Shotguns", "Semi Auto"],
  ["Shotguns", "Side By Side"],
  ["Shotguns", "Single Shot"],
  ["Shotguns", "Lever Action"],
  ["Shotguns", "Bolt Action"],
  ["Ammo", "Rifle Ammo"],
  ["Ammo", "Handgun Ammo"],
  ["Ammo", "Shotgun Ammo"],
  ["Ammo", "Rimfire Ammo"],
] as const;
/** Guns.com departments whose products are firearms or ammunition. */
export const FIREARM_DEPARTMENTS = ["Rifles", "Handguns", "Shotguns", "Ammo"] as const;
const firearmDepartments = new Set<string>(FIREARM_DEPARTMENTS);
const accessoryDepartments = new Set([
  "Silencers",
  "Silencer Accessories",
  "Gun Parts",
  "Magazines",
  "Optics",
  "Reloading",
  "Cleaning Supplies",
  "Holsters And Holders",
  "Range Gear",
  "Hunting Gear",
  "Knives And Tools",
]);

/** Maps a Guns.com department/category onto the site's Firearms filters. */
export function firearmDetails(
  department: string,
  category: string,
): { listingType: "Firearm" | "Accessory"; firearmType?: string; accessoryType?: string } | null {
  if (accessoryDepartments.has(department)) {
    const accessoryType =
      department === "Magazines"
        ? "Magazines"
        : department === "Optics"
          ? "Optics & sights"
          : department === "Reloading"
            ? "Reloading equipment"
            : department === "Cleaning Supplies"
              ? "Cleaning & maintenance"
              : department === "Holsters And Holders"
                ? "Holsters"
                : department === "Range Gear"
                  ? category === "Gun Cases" || category === "Carrying Bags"
                    ? "Cases & storage"
                    : category === "Locks"
                      ? "Safes & locks"
                      : "Targets & range gear"
                  : department === "Gun Parts" ||
                      department === "Silencers" ||
                      department === "Silencer Accessories"
                    ? "Parts"
                    : "Other accessories";
    return { listingType: "Accessory", accessoryType };
  }
  if (!firearmDepartments.has(department)) return null;
  if (department === "Ammo") return { listingType: "Accessory", accessoryType: "Ammunition" };
  const firearmType =
    department === "Rifles"
      ? "Rifle"
      : department === "Shotguns"
        ? "Shotgun"
        : category === "Revolver"
          ? "Revolver"
          : "Handgun";
  return { listingType: "Firearm", firearmType };
}
export type MerchandiseScope = (typeof MERCHANDISE_SCOPES)[number];
// These sections time out on full-size requests; small pages return reliably.
export const merchandisePageSize = (scope: MerchandiseScope) =>
  scope[0] === "Shotguns" || scope[0] === "Ammo" ? 10 : MERCHANDISE_PAGE_SIZE;
export const scopeKey = (scope: readonly [string, string]) => scope.join("/");
const approvedScopes = new Set(MERCHANDISE_SCOPES.map(scopeKey));

export type AffiliateMerchandise = {
  id: string;
  sku: string;
  title: string;
  brand: string;
  description: string;
  shortDescription: string;
  department: string;
  category: string;
  subcategory: string;
  categorySlug: "apparel-accessories" | "outdoor-sporting" | "tools-equipment" | "firearms";
  retailPriceCents: number;
  priceCents: number;
  images: string[];
  buyUrl: string;
  productUrl: string | null;
  variants: string;
  commission: string;
  /** This feed has no seller address, physical state, or shipping eligibility fields. */
  location: null;
  /** Original fields for approved merchandise only; never executed as HTML. */
  raw: Record<string, unknown>;
};

export function merchandiseText(value: unknown, max = 20000): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(?:p|div|li)>|<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(
      /&(?:amp|lt|gt|quot|apos|nbsp);/g,
      (entity) =>
        ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " " })[
          entity
        ] ?? "",
    )
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code: string) => {
      const n = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code);
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "";
    })
    .trim()
    .slice(0, max);
}

function httpsUrl(value: unknown, hosts: string[]): URL | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      hosts.includes(url.hostname)
      ? url
      : null;
  } catch {
    return null;
  }
}

function price(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const n = Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? Math.round(n * 100) : null;
}

/** Only the pinned merchant's supported departments/categories are accepted. */
export function approvedMerchandise(row: Record<string, unknown>): boolean {
  const department = merchandiseText(row.strDepartmentName, 120);
  const category = merchandiseText(row.strCategoryName, 120);
  return (
    approvedScopes.has(scopeKey([department, category])) ||
    approvedScopes.has(scopeKey([department, ""]))
  );
}

export function normalizeMerchandise(
  row: unknown,
  expectedScope?: MerchandiseScope,
): AffiliateMerchandise | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  if (
    String(r.lngDatafeedId) !== AVANTLINK_ACCOUNT.datafeedId ||
    String(r.lngMerchantId) !== AVANTLINK_ACCOUNT.merchantId ||
    !approvedMerchandise(r)
  )
    return null;
  const department = merchandiseText(r.strDepartmentName, 120);
  const category = merchandiseText(r.strCategoryName, 120);
  if (
    expectedScope &&
    (expectedScope[0] !== department || (expectedScope[1] && expectedScope[1] !== category))
  )
    return null;
  const id = String(r.lngProductId ?? "");
  const sku = merchandiseText(r.strProductSKU, 100);
  const title = merchandiseText(r.strProductName, 300);
  const retail = price(r.dblProductPrice);
  const sale = price(r.dblProductSalePrice);
  const buyUrl = httpsUrl(r.strBuyURL, ["www.avantlink.com", "avantlink.com"]);
  if (
    !/^\d{1,20}$/.test(id) ||
    !sku ||
    !title ||
    (!retail && !sale) ||
    !buyUrl ||
    buyUrl.pathname !== "/click.php"
  )
    return null;
  for (const [key, value] of Object.entries({
    tt: "pl",
    pt: "3",
    ti: AVANTLINK_ACCOUNT.datafeedId,
    pw: AVANTLINK_ACCOUNT.websiteId,
    mi: AVANTLINK_ACCOUNT.merchantId,
    pri: id,
  })) {
    if (buyUrl.searchParams.getAll(key).length !== 1 || buyUrl.searchParams.get(key) !== value)
      return null;
  }
  if (
    [...buyUrl.searchParams.keys()].some(
      (key) => !["tt", "pt", "ti", "pw", "mi", "pri", "ctc"].includes(key),
    )
  )
    return null;
  const validPrice = retail ?? sale;
  if (validPrice == null) return null;
  const images: string[] = [];
  const seen = new Set<string>();
  for (const image of [r.strLargeImage, r.strMediumImage, r.strThumbnailImage]) {
    const url = httpsUrl(image, ["images.guns.com", "www.guns.com", "guns.com"]);
    if (!url) continue;
    // The three feed image fields are often different sizes of one photograph.
    const identity = `${url.hostname.toLowerCase()}${url.pathname.toLowerCase()}`;
    if (!seen.has(identity)) {
      seen.add(identity);
      images.push(url.toString());
    }
  }
  const productUrl = httpsUrl(r.strProductURL, ["www.guns.com", "guns.com"]);
  const raw = { ...r };
  delete raw.strProductContentWidgetScript;
  return {
    id,
    sku,
    title,
    department,
    category,
    subcategory: merchandiseText(r.strSubCategoryName, 120),
    brand: merchandiseText(r.strBrandName, 160),
    description: merchandiseText(r.txtLongDescription),
    shortDescription: merchandiseText(r.txtShortDescription || r.txtAbbreviatedDescription, 2000),
    categorySlug:
      firearmDepartments.has(department) || accessoryDepartments.has(department)
        ? "firearms"
        : ["Apparel", "Hats", "Shirts", "Belts"].includes(category)
          ? "apparel-accessories"
          : department === "Cleaning Supplies" || department === "Knives And Tools"
            ? "tools-equipment"
            : "outdoor-sporting",
    retailPriceCents: validPrice,
    priceCents: sale && (!retail || sale < retail) ? sale : validPrice,
    images,
    buyUrl: buyUrl.toString(),
    productUrl: productUrl?.toString() ?? null,
    variants: merchandiseText(r.txtVariants, 10000),
    commission: merchandiseText(r.strActionCommission, 80),
    location: null,
    raw,
  };
}

export function merchandiseSearchUrl(scope: MerchandiseScope, offset = 0): URL {
  if (
    !approvedScopes.has(scopeKey(scope)) ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 9000
  )
    throw new Error("Invalid merchandise scope");
  const url = new URL("https://classic.avantlink.com/api.php");
  url.search = new URLSearchParams({
    module: "ProductSearch",
    affiliate_id: AVANTLINK_ACCOUNT.affiliateId,
    website_id: AVANTLINK_ACCOUNT.websiteId,
    datafeed_ids: AVANTLINK_ACCOUNT.datafeedId,
    merchant_ids: AVANTLINK_ACCOUNT.merchantId,
    search_term: "%",
    search_department: scope[0],
    ...(scope[1] ? { search_category: scope[1] } : {}),
    search_results_base: String(offset),
    search_results_count: String(merchandisePageSize(scope)),
    search_results_fields: "*|Variants XML|Google Categorization|Product URL",
    output: "json",
    search_results_sort_order: "Product Id|asc",
    search_results_options: "sortearly",
  }).toString();
  return url;
}
