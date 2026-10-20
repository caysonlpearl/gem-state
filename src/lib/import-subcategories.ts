import {
  classifiedSubcategoryField,
  normalizeClassifiedItemDetails,
  industrialSubcategories,
} from "../config/classified-item-fields.ts";
const clean = (value: unknown) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 200) : "";
const titleRules: Record<string, readonly [RegExp, string][]> = {
  industrial: [
    [/\bcompressor\b/i, "Air Compressors"],
    [/\bcrane\b/i, "Cranes"],
    [/\bgenerator\b/i, "Generators"],
    [/\b(pump|blower)\b/i, "Pumps"],
    [/\bweld(er|ing)\b/i, "Welding Equipment"],
    [/\bexcavator\b/i, "Excavators"],
    [/\bfork\s?lift\b/i, "Fork Lifts"],
    [/\bskid steer\b/i, "Skid Steer Loaders"],
    [/\b(peterbilt|kenworth|freightliner|tractor|backhoe|dozer)\b/i, "Heavy Equipment/Tractors"],
  ],
  furniture: [
    [/\b(sofa|couch|sectional|futon)\b/i, "Sofas & sectionals"],
    [/\bdining table\b/i, "Dining tables"],
    [/\bdesk\b/i, "Desks"],
    [/\bdresser\b/i, "Dressers"],
    [/\b(chair|recliner)\b/i, "Chairs & recliners"],
    [/\b(bed|mattress)\b/i, "Beds & mattresses"],
  ],
  "jewelry-watches": [
    [/\bring\b/i, "Rings"],
    [/\b(necklace|pendant)\b/i, "Necklaces & pendants"],
    [/\bearrings?\b/i, "Earrings"],
    [/\bwatch\b/i, "Watches"],
    [/\bbracelet\b/i, "Bracelets"],
  ],
  "apparel-accessories": [
    [/\b(jeans|pants|trousers)\b/i, "Pants & jeans"],
    [/\bdress(es)?\b/i, "Dresses"],
    [/\b(shoes|sneakers|boots|sandals)\b/i, "Shoes"],
    [/\b(shirt|tee|t-shirt)\b/i, "Shirts"],
    [/\b(jacket|coat)\b/i, "Coats & jackets"],
    [/\b(bag|purse|backpack)\b/i, "Bags & purses"],
  ],
  "books-media": [
    [/\b(book|novel|paperback|hardcover)\b/i, "Books"],
    [/\b(vinyl|records?)\b/i, "Music"],
    [/\b(dvd|blu-ray)\b/i, "Movies"],
  ],
  collectibles: [
    [/\b(labubu|funko|figure|figurine)\b/i, "Figures & figurines"],
    [/\b(pok[eé]mon|trading cards?|sports cards?)\b/i, "Trading cards"],
    [/\bcoins?\b/i, "Coins"],
  ],
  electronics: [
    [/\b(laptop|computer|macbook)\b/i, "Computers"],
    [/\b(phone|iphone|samsung galaxy)\b/i, "Phones"],
    [/\bcamera\b/i, "Cameras"],
    [/\b(tv|television)\b/i, "TVs"],
    [/\b(speaker|headphones)\b/i, "Audio"],
  ],
  "baby-kids": [
    [/\bstroller\b/i, "Strollers"],
    [/\bcrib\b/i, "Cribs"],
    [/\b(toy|lego|plush|doll)\b/i, "Toys"],
  ],
  "home-garden": [
    [/\bmower\b/i, "Lawn mowers"],
    [/\b(refrigerator|washer|dryer|dishwasher|appliance)\b/i, "Appliances"],
  ],
  "tools-equipment": [
    [/\bdrill\b/i, "Drills"],
    [/\bsaw\b/i, "Saws"],
    [/\bgenerator\b/i, "Generators"],
    [/\bcompressor\b/i, "Air compressors"],
  ],
  "musical-instruments": [
    [/\bguitar\b/i, "Guitars"],
    [/\b(piano|keyboard)\b/i, "Pianos & keyboards"],
    [/\bdrums?\b/i, "Drums & percussion"],
  ],
  "farm-garden": [
    [/\btractor\b/i, "Tractors"],
    [/\bbaler\b/i, "Balers"],
    [/\b(fencing|fence)\b/i, "Fencing"],
  ],
  "cars-trucks": [
    [/\b(peterbilt|kenworth|freightliner|semi|dump truck)\b/i, "Commercial trucks"],
    [/\b(pickup|f-?150|silverado|tacoma)\b/i, "Pickup trucks"],
  ],
  trailers: [
    [/\bdump\b/i, "Dump trailers"],
    [/\blowboy\b/i, "Lowboy trailers"],
    [/\bflatbed\b/i, "Flatbed trailers"],
  ],
};
export function importSubcategoryField(category: string): string {
  if (category === "firearms") return "firearmType";
  return classifiedSubcategoryField(category).key;
}
export function importedSubcategory(
  category: string,
  details: Record<string, string> | null | undefined,
): string {
  if (category === "firearms") return details?.accessoryType || details?.firearmType || "";
  return details?.[importSubcategoryField(category)] || "";
}
/** Keep explicit source labels. Use clear title evidence only when absent;
 * unrelated words in descriptions must not become a subcategory. */
export function inferImportItemDetails(
  category: string,
  subcategory: unknown,
  supplied: Record<string, unknown> | null | undefined,
  title: string,
): Record<string, string> {
  const details = normalizeClassifiedItemDetails(category, supplied);
  const raw = clean(subcategory) || importedSubcategory(category, details);
  if (category === "firearms") {
    const text = raw || title;
    const accessory: readonly [RegExp, string][] = [
      [/ammo|ammunition/i, "Ammunition"],
      [/holster/i, "Holsters"],
      [/scope|optic|sight/i, "Optics & sights"],
      [/magazine/i, "Magazines"],
      [/safe|lock/i, "Safes & locks"],
      [/case|storage/i, "Cases & storage"],
      [/cleaning/i, "Cleaning & maintenance"],
      [/reloading/i, "Reloading equipment"],
      [/parts/i, "Parts"],
      [/accessor/i, "Other accessories"],
    ];
    const match = accessory.find(([re]) => re.test(text));
    if (match) return { ...details, listingType: "Accessory", accessoryType: match[1] };
    const firearm = (
      [
        [/revolver/i, "Revolver"],
        [/pistol|handgun/i, "Handgun"],
        [/shotgun/i, "Shotgun"],
        [/rifle/i, "Rifle"],
        [/muzzleloader/i, "Muzzleloader"],
        [/receiver|frame/i, "Receiver / frame"],
      ] as const
    ).find(([re]) => re.test(text));
    return firearm ? { ...details, listingType: "Firearm", firearmType: firearm[1] } : details;
  }
  let value = raw || titleRules[category]?.find(([re]) => re.test(title))?.[1] || "";
  if (category === "industrial" && value)
    value =
      industrialSubcategories.find((option) => option.toLowerCase() === value.toLowerCase()) ||
      value;
  if (value) details[importSubcategoryField(category)] = value;
  return details;
}
