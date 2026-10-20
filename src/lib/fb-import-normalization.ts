import { classifiedCategories } from "@/config/classifieds";

const knownCategorySlugs = new Set<string>(classifiedCategories.map((category) => category.slug));

/** Convert Facebook's free-form condition text into Bluebird's enum values. */
export function normalizeFacebookCondition(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  const normalized = raw.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ");
  if (
    ["new_with_tags", "new_without_tags", "used_excellent", "used_good", "not_applicable"].includes(
      raw,
    )
  ) {
    return raw;
  }
  if (/^(not applicable|n\/a|none)$/i.test(normalized)) return "not_applicable";
  if (/(like\s*new|excellent|barely used|gently used)/i.test(normalized)) return "used_excellent";
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

  if (title && description) {
    const primary = inferFacebookCategorySlug(null, title, null);
    if (primary !== "general") return primary;
  }
  const text = `${title ?? ""} ${description ?? ""}`.toLowerCase();
  const matches = (pattern: RegExp) => pattern.test(text);

  if (
    matches(
      /\b(industrial|forklift|heavy equipment|heavy machinery|cnc|lathe|milling machine|scissor lift|pallet jack)\b/,
    )
  )
    return "industrial";
  if (matches(/\b(car seat|stroller|crib|baby carrier)\b/)) return "baby-kids";
  if (matches(/\b(rv|camper|motorhome|fifth wheel|travel trailer)\b/)) return "rvs-campers";
  if (matches(/\b(bicycle|mountain bike|road bike)\b/)) return "outdoor-sporting";
  // Specific categories run before broad words such as "ring", "bike", or
  // "garden" so ordinary products do not get mistaken for a nearby category.
  if (
    matches(
      /\b(car parts?|auto parts?|brake|bumper|alternator|engine|transmission|tire|tyre|wheel|rim|catalytic converter)\b/,
    )
  )
    return "auto-parts";
  if (matches(/\b(trailer|utility trailer|cargo trailer|boat trailer|enclosed trailer)\b/))
    return "trailers";
  if (matches(/\b(rv|r\.v\.|camper|motorhome|fifth wheel|travel trailer)\b/)) return "rvs-campers";
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
  return knownCategorySlugs.has(supplied) ? supplied : "general";
}
