import { listingPath } from "./listing-url.ts";

/** Product discovery only. Category eligibility is not OpenAI approval. */
export const CHATGPT_FEED_CATEGORIES = new Set([
  "cars-trucks",
  "motorcycles",
  "rvs-campers",
  "powersports",
  "auto-parts",
  "trailers",
  "furniture",
  "apparel-accessories",
  "baby-kids",
  "books-media",
  "collectibles",
  "crafts-hobbies",
  "electronics",
  "home-garden",
  "jewelry-watches",
  "musical-instruments",
  "office-business",
  "tools-equipment",
  "industrial",
  "outdoor-sporting",
  "farm-garden",
  "general",
]);

export type FeedListing = {
  id: string;
  seller_id: string;
  price_cents: number;
  currency: string;
  item_condition: string;
  status: string;
  approved_at: string | null;
  expires_at: string;
  is_demo: boolean;
  products: {
    name: string;
    description: string | null;
    status: string;
    is_demo: boolean;
    brands: { name: string } | null;
    categories: { slug: string; name: string } | null;
  } | null;
  classified_listing_details:
    | {
        city: string | null;
        state: string | null;
        item_details: Record<string, unknown> | null;
        vehicle_make: string | null;
      }
    | {
        city: string | null;
        state: string | null;
        item_details: Record<string, unknown> | null;
        vehicle_make: string | null;
      }[]
    | null;
  listing_media: { position: number | null }[] | null;
};
export type FeedSeller = {
  user_id: string | null;
  display_name: string | null;
  slug: string | null;
};
export const FEED_COLUMNS = [
  "item_id",
  "title",
  "description",
  "url",
  "brand",
  "seller_name",
  "image_url",
  "availability",
  "price",
  "condition",
  "product_category",
  "seller_url",
  "target_countries",
  "store_country",
  "is_eligible_search",
  "is_eligible_checkout",
  "is_ads_eligible",
] as const;
export type FeedProduct = Record<(typeof FEED_COLUMNS)[number], string>;

// Native classifieds do not require a brand. Only use a supplied brand/maker,
// vehicle make, or an unambiguous brand at the START of the published title.
// Never label an unknown item Bluebird/Generic or infer a brand from compatibility text.
const TITLE_BRANDS = [
  "The North Face",
  "Life is Good",
  "Bath & Body Works",
  "Victoria's Secret",
  "American Eagle",
  "Calvin Klein",
  "Kate Spade",
  "Michael Kors",
  "Ralph Lauren",
  "Tommy Hilfiger",
  "Under Armour",
  "Pop Mart",
  "Funko",
  "Disney",
  "Nike",
  "Adidas",
  "Levi's",
  "Carhartt",
  "Patagonia",
  "Columbia",
  "Lululemon",
  "Crocs",
  "Birkenstock",
  "Vans",
  "Converse",
  "Lego",
  "LEGO",
  "Nintendo",
  "Sony",
  "Samsung",
  "Apple",
  "Canon",
  "Nikon",
  "Bose",
  "JBL",
  "Dell",
  "Lenovo",
  "DeWalt",
  "Milwaukee",
  "Makita",
  "Ryobi",
  "Craftsman",
  "Husqvarna",
  "Stihl",
  "John Deere",
  "KitchenAid",
  "Cuisinart",
  "Pyrex",
  "Corelle",
  "CorningWare",
  "Tupperware",
  "BonJour",
  "Fisher-Price",
  "Little Tikes",
  "Melissa & Doug",
  "Hasbro",
  "Mattel",
  "Hot Wheels",
  "Yeti",
  "Coleman",
  "Igloo",
  "Weber",
  "Traeger",
  "IKEA",
  "Ashley",
  "La-Z-Boy",
].sort((a, b) => b.length - a.length);

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim() : "";
}
function suppliedBrand(value: unknown): string {
  const brand = text(value);
  return brand &&
    brand.length <= 100 &&
    !/^(unknown|unbranded|generic|none|n\/?a|null|not applicable|not specified|unspecified|other)$/i.test(
      brand,
    )
    ? brand
    : "";
}
function brandAtStart(value: string): string {
  return (
    TITLE_BRANDS.find(
      (brand) =>
        value.toLowerCase().startsWith(brand.toLowerCase()) &&
        !/[a-z0-9]/i.test(value.charAt(brand.length)),
    ) ?? ""
  );
}

// A category alone is insufficient: ordinary classifieds can contain restricted goods.
// Deliberately conservative; a held row can be corrected/reviewed rather than misrepresented.
const RESTRICTED =
  /\b(firearms?|ammo|ammunition|gun|guns|rifles?|shotguns?|pistols?|handguns?|receivers?|magazines?|suppressors?|holsters?|gunstocks?|glock|ar[ -]?15|80[ -]?percent|pepper spray|tasers?|stun guns?|brass knuckles|crossbows?|fireworks?|explosives?|gunpowder|ammonium nitrate|cyanide|mercury|radioactive|pesticides?|herbicides?|weed killer|muriatic acid|cannabis|marijuana|\bthc\b|\bcbd\b|psychedelic|nicotine|tobacco|cigarettes?|vapes?|e[ -]?liquids?|bongs?|hookahs?|rolling papers|vodka|whiskey|bourbon|tequila|alcohol|wine|beer|supplements?|creatine|pre[ -]?workout|protein powder|weight loss|detox|prescription|oxycodone|adderall|insulin|sex toys?|vibrators?|dildos?|porn|pornographic|replica|counterfeit|fake id|pirated|cracked software|stolen|recalled|recall notice|unsafe|not safe|for parts|parts only|salvage|non[ -]?running|not running|does not run|doesn.t run|needs repair)\b/i;
const LIVE_ANIMALS =
  /\b(pupp(?:y|ies)|kittens?|gelding|stallion|mare|livestock|chickens?|roosters?|cattle|bull|calf|calves|goats?|sheep|piglets?|rabbits?|live animals?|for adoption|pet adoption)\b/i;
const QA = /^(qa\b|mvp test\b|resend delivery qa\b)|\bdo not (?:buy|contact)\b/i;

export type FeedDecision = { product: FeedProduct } | { excluded: string };
export function productForFeed(
  row: FeedListing,
  sellers: Map<string, FeedSeller>,
  now = Date.now(),
): FeedDecision {
  const product = row.products;
  if (
    row.status !== "active" ||
    !row.approved_at ||
    row.is_demo ||
    !product ||
    product.is_demo ||
    product.status !== "published" ||
    !(Date.parse(row.expires_at) > now)
  )
    return { excluded: "not-public-active" };
  const category = product.categories;
  if (!category || !CHATGPT_FEED_CATEGORIES.has(category.slug))
    return { excluded: "category-held" };
  const details = Array.isArray(row.classified_listing_details)
    ? row.classified_listing_details[0]
    : row.classified_listing_details;
  if (!details || details.state?.toUpperCase() !== "ID") return { excluded: "outside-idaho" };
  const title = text(product.name);
  const description = text(product.description);
  const item = details.item_details ?? {};
  const policyText = `${title}\n${description}\n${Object.values(item)
    .filter((v) => typeof v === "string")
    .join("\n")}`;
  if (QA.test(title)) return { excluded: "test-listing" };
  if (RESTRICTED.test(policyText) || LIVE_ANIMALS.test(policyText))
    return { excluded: "restricted-or-uncertain-item" };
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(row.id) ||
    !title ||
    title.length > 150 ||
    !description ||
    description.length > 5000
  )
    return { excluded: "missing-or-invalid-description" };
  if (!Number.isSafeInteger(row.price_cents) || row.price_cents <= 0 || row.currency !== "USD")
    return { excluded: "missing-fixed-usd-price" };
  if (!row.listing_media?.length) return { excluded: "missing-photo" };
  const seller = sellers.get(row.seller_id);
  if (!text(seller?.display_name) || !text(seller?.slug))
    return { excluded: "missing-public-seller" };
  const brand =
    suppliedBrand(item.brand) ||
    suppliedBrand(item.maker) ||
    suppliedBrand(product.brands?.name) ||
    suppliedBrand(details.vehicle_make) ||
    brandAtStart(text(item.brandModel)) ||
    brandAtStart(title);
  if (!brand) return { excluded: "missing-brand" };
  const condition = /^(new_with_tags|new_without_tags)$/.test(row.item_condition)
    ? "new"
    : /^(used_excellent|used_good)$/.test(row.item_condition)
      ? "used"
      : "";
  if (!condition) return { excluded: "unknown-condition" };
  const origin = "https://onbluebird.com";
  return {
    product: {
      item_id: `bluebird-${row.id}`,
      title,
      description,
      url: origin + listingPath({ id: row.id, title, city: details.city }),
      brand,
      seller_name: text(seller!.display_name),
      image_url: `${origin}/media/listings/${row.id}/0`,
      // An active classified has not been independently stock-checked with its seller.
      availability: "unknown",
      price: `${(row.price_cents / 100).toFixed(2)} USD`,
      condition,
      product_category: text(category.name),
      seller_url: `${origin}/sellers/${encodeURIComponent(seller!.slug!)}`,
      target_countries: '["US"]',
      store_country: "US",
      is_eligible_search: "true",
      is_eligible_checkout: "false",
      is_ads_eligible: "false",
    },
  };
}

export function serializeProductFeed(products: FeedProduct[]): string {
  const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return (
    FEED_COLUMNS.join(",") +
    "\r\n" +
    products.map((p) => FEED_COLUMNS.map((key) => cell(p[key])).join(",") + "\r\n").join("")
  );
}
