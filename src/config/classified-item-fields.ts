export type ClassifiedItemField = {
  key: string;
  label: string;
  placeholder?: string;
  options?: readonly string[];
  required?: boolean;
};

export const classifiedItemFields: Record<string, ClassifiedItemField[]> = {
  furniture: [
    {
      key: "itemType",
      label: "Furniture type",
      placeholder: "Dining table, sofa, desk…",
      required: true,
    },
    { key: "material", label: "Material", placeholder: "Solid oak, leather…" },
    { key: "dimensions", label: "Dimensions", placeholder: "72 in W × 36 in D × 30 in H" },
  ],
  "apparel-accessories": [
    { key: "itemType", label: "Item type", placeholder: "Jacket, shoes, handbag…", required: true },
    { key: "size", label: "Size", placeholder: "Medium, 10, 32×30…" },
    { key: "brand", label: "Brand" },
    { key: "gender", label: "Fit / gender", options: ["Women", "Men", "Unisex", "Kids"] },
  ],
  "baby-kids": [
    {
      key: "itemType",
      label: "Item type",
      placeholder: "Stroller, toys, clothing…",
      required: true,
    },
    { key: "ageRange", label: "Age range", placeholder: "Newborn, 2–4 years…" },
    { key: "brand", label: "Brand" },
    {
      key: "safetyNotes",
      label: "Safety / recall notes",
      placeholder: "Include any recall or safety information",
    },
  ],
  "books-media": [
    {
      key: "format",
      label: "Format",
      options: ["Hardcover", "Paperback", "Audio", "DVD", "Vinyl", "Digital", "Other"],
      required: true,
    },
    { key: "author", label: "Author / artist" },
    { key: "isbn", label: "ISBN / catalog number" },
  ],
  collectibles: [
    {
      key: "itemType",
      label: "Collectible type",
      placeholder: "Card, coin, figure…",
      required: true,
    },
    { key: "maker", label: "Maker / brand" },
    { key: "era", label: "Era / year" },
    { key: "authenticity", label: "Authenticity / provenance" },
  ],
  "crafts-hobbies": [
    {
      key: "itemType",
      label: "Craft or hobby type",
      placeholder: "Quilting, model kit, supplies…",
      required: true,
    },
    { key: "materials", label: "Materials included" },
    {
      key: "skillLevel",
      label: "Skill level",
      options: ["Beginner", "Intermediate", "Advanced", "Any"],
    },
  ],
  electronics: [
    {
      key: "itemType",
      label: "Device type",
      placeholder: "Laptop, camera, speaker…",
      required: true,
    },
    { key: "brandModel", label: "Brand and model" },
    { key: "storageOrCapacity", label: "Storage / capacity" },
    { key: "compatibility", label: "Compatibility" },
  ],
  "health-beauty": [
    {
      key: "productType",
      label: "Product type",
      placeholder: "Skincare, fragrance, equipment…",
      required: true,
    },
    { key: "brand", label: "Brand" },
    {
      key: "sealedStatus",
      label: "Sealed / opened",
      options: ["Sealed", "Opened", "Used", "Not applicable"],
    },
    { key: "expiration", label: "Expiration date" },
  ],
  "home-garden": [
    {
      key: "itemType",
      label: "Item type",
      placeholder: "Lawn mower, decor, appliance…",
      required: true,
    },
    { key: "material", label: "Material" },
    { key: "dimensions", label: "Dimensions" },
    {
      key: "powerSource",
      label: "Power source",
      options: ["Electric", "Battery", "Gas", "Manual", "None", "Other"],
    },
  ],
  "jewelry-watches": [
    {
      key: "itemType",
      label: "Jewelry type",
      placeholder: "Ring, necklace, watch…",
      required: true,
    },
    { key: "metal", label: "Metal" },
    { key: "gemstone", label: "Gemstone" },
    { key: "size", label: "Size" },
  ],
  "musical-instruments": [
    {
      key: "instrumentType",
      label: "Instrument",
      placeholder: "Acoustic guitar, keyboard…",
      required: true,
    },
    { key: "brandModel", label: "Brand and model" },
    { key: "accessories", label: "Accessories included" },
  ],
  "office-business": [
    {
      key: "itemType",
      label: "Item type",
      placeholder: "Printer, desk, supplies…",
      required: true,
    },
    { key: "brand", label: "Brand" },
    { key: "quantity", label: "Quantity" },
    { key: "dimensions", label: "Dimensions" },
  ],
  "tickets-events": [
    { key: "eventName", label: "Event", placeholder: "Event name", required: true },
    { key: "eventDate", label: "Event date", placeholder: "YYYY-MM-DD" },
    { key: "venue", label: "Venue" },
    { key: "sectionOrSeats", label: "Section / seats" },
    { key: "quantity", label: "Quantity" },
  ],
  "tools-equipment": [
    {
      key: "itemType",
      label: "Tool or equipment type",
      placeholder: "Drill, generator, trailer…",
      required: true,
    },
    { key: "brandModel", label: "Brand and model" },
    { key: "powerSource", label: "Power source" },
    { key: "hoursOrUsage", label: "Hours / usage" },
  ],
  "outdoor-sporting": [
    {
      key: "itemType",
      label: "Sport or outdoor item",
      placeholder: "Bike, skis, tent…",
      required: true,
    },
    { key: "brand", label: "Brand" },
    { key: "size", label: "Size" },
    { key: "includedGear", label: "Included gear" },
  ],
  "farm-garden": [
    {
      key: "itemType",
      label: "Farm or garden item",
      placeholder: "Tractor attachment, fencing…",
      required: true,
    },
    { key: "brandModel", label: "Brand and model" },
    { key: "dimensions", label: "Dimensions" },
    { key: "hoursOrUsage", label: "Hours / usage" },
  ],
  general: [
    { key: "itemType", label: "Item type", placeholder: "What are you selling?", required: true },
    { key: "brand", label: "Brand" },
    { key: "dimensions", label: "Dimensions" },
  ],
};

export function fieldsForClassifiedItem(category: string): ClassifiedItemField[] {
  return classifiedItemFields[category] ?? classifiedItemFields["general"] ?? [];
}

export function normalizeClassifiedItemDetails(
  category: string,
  value: Record<string, unknown> | null | undefined,
) {
  const allowed = new Set(fieldsForClassifiedItem(category).map((field) => field.key));
  return Object.fromEntries(
    Object.entries(value ?? {})
      .filter(([key, item]) => allowed.has(key) && typeof item === "string")
      .map(([key, item]) => [key, String(item).trim().slice(0, 200)])
      .filter(([, item]) => item),
  );
}
