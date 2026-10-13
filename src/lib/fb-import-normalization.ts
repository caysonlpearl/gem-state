import { classifiedCategories } from "@/config/classifieds";

const knownCategorySlugs = new Set(classifiedCategories.map((category) => category.slug));

/** Convert Facebook's free-form condition text into Bluebird's enum values. */
export function normalizeFacebookCondition(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  const normalized = raw.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ");
  if (["new_with_tags", "new_without_tags", "used_excellent", "used_good"].includes(raw)) {
    return raw;
  }
  if (/(like\s*new|excellent| barely used|gently used)/i.test(normalized)) return "used_excellent";
  if (/\bused\b/i.test(normalized)) return "used_good";
  if (/new\s*(?:,|-)?\s*(?:with|has)\s*tags?/i.test(normalized)) return "new_with_tags";
  if (/new\s*(?:,|-)?\s*(?:without|no)\s*tags?/i.test(normalized)) return "new_without_tags";
  if (/\bnew\b/i.test(normalized)) return "new_without_tags";
  return "used_good";
}

/** Infer a category when Facebook supplies no structured category field. */
export function inferFacebookCategorySlug(
  suppliedCategory: string | null | undefined,
  title: string | null | undefined,
  description: string | null | undefined,
): string {
  const supplied = String(suppliedCategory ?? "").trim();
  if (supplied && supplied !== "general" && knownCategorySlugs.has(supplied)) return supplied;

  const text = `${title ?? ""} ${description ?? ""}`.toLowerCase();
  if (
    !/doorbell|ring camera/.test(text) &&
    /\b(jewelry|jewellery|jewelry\s*&?\s*watches?|watch(?:es)?|ring|rings|necklace|bracelet|earrings?|pendant|brooch|anklet|tiara|gemstone|diamond|moissanite|sterling silver|\b(?:14|18|24)k\s*(?:gold)?|925\s+sterling)\b/.test(
      text,
    )
  ) {
    return "jewelry-watches";
  }
  if (/\b(sofa|couch|dresser|nightstand|dining table|bookshelf|furniture)\b/.test(text)) {
    return "furniture";
  }
  if (
    /\b(laptop|iphone|ipad|android|television|tv|camera|headphones|computer|monitor)\b/.test(text)
  ) {
    return "electronics";
  }
  if (/\b(dress|shirt|jeans|shoes|boots|jacket|purse|handbag|clothing)\b/.test(text)) {
    return "apparel-accessories";
  }
  if (/\b(guitar|drums?|piano|keyboard|amplifier|music\s+instrument)\b/.test(text)) {
    return "musical-instruments";
  }
  return knownCategorySlugs.has(supplied) ? supplied : "general";
}
