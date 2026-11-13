import { listingBrandReviews } from "../content/listing-brand-reviews.ts";

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
    !/^(unknown|unbranded|generic|none|n\/?a|null|not applicable|not specified|unspecified|other|custom(?: built)?)$/i.test(
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
/** Parse explicit seller labels, never incidental compatibility or author mentions. */
function labeledBrand(description: string): string {
  const lines = description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const inline = /^(?:brand|manufacturer|publisher)\s*:\s*(.+)$/i.exec(lines[i]);
    const candidate =
      inline?.[1] ?? (/^(?:brand|manufacturer|publisher)$/i.test(lines[i]) ? lines[i + 1] : "");
    if (
      candidate &&
      !/^(?:model|year|condition|description|serial number|quantity|category)$/i.test(candidate)
    ) {
      const brand = suppliedBrand(candidate);
      if (brand) return brand;
    }
  }
  return "";
}
export type ListingBrandInput = {
  id: string;
  title: string;
  description?: string | null;
  itemDetails?: Record<string, unknown> | null;
  catalogBrand?: string | null;
  vehicleMake?: string | null;
  media?: { id?: string; position?: number | null }[] | null;
};
/** The feed and listing page share the same factual brand and evidence checks. */
export function resolveListingBrand(input: ListingBrandInput): string {
  const item = input.itemDetails ?? {};
  const supplied =
    suppliedBrand(item.brand) ||
    suppliedBrand(item.maker) ||
    suppliedBrand(input.catalogBrand) ||
    suppliedBrand(input.vehicleMake);
  if (supplied) return supplied;
  const description = text(input.description);
  const labeled = labeledBrand(description);
  if (labeled) return labeled;
  const review = listingBrandReviews[input.id];
  if (
    review &&
    input.title === review.title &&
    ((review.source === "title" && input.title.includes(review.quote)) ||
      (review.source === "description" && description.includes(review.quote)) ||
      (review.source === "photo" &&
        input.media?.some(
          (photo) => photo.id === review.photoId && photo.position === review.photoIndex,
        )))
  )
    return suppliedBrand(review.brand);
  return brandAtStart(text(item.brandModel)) || brandAtStart(input.title);
}
