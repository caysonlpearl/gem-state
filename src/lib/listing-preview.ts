import type { ListingCardSummary } from "./listing-card-summary";

export const LISTING_PREVIEW_LIMIT = 6;

const plain = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const cleanBreed = (text?: string | null) =>
  (text ?? "").replace(/\s*\([^)]*\bcoat\b[^)]*\)/gi, "").trim();

/** Keep provider animal IDs out of preview copy; member-authored titles stay intact. */
export function listingPreviewTitle(
  listing: Pick<ListingCardSummary, "title" | "pet" | "externalPet">,
) {
  if (!listing.externalPet || !listing.pet) return listing.title;
  const pet = listing.pet;
  const name = (pet.name ?? "").trim();
  const named = name && !/^(?:[a-z]{0,4}[-# ]?)?\d{4,}$/i.test(name);
  const breed = cleanBreed(pet.breed);
  return (
    [named ? name : null, breed || (!named ? pet.species : null)].filter(Boolean).join(" · ") ||
    "Pet for adoption"
  );
}

/** Show each fact once, excluding information already in the pet's title or price. */
export function petPreviewFacts(
  listing: Pick<ListingCardSummary, "title" | "pet" | "externalPet" | "priceCents">,
) {
  if (!listing.pet) return [];
  const pet = listing.pet;
  const title = plain(listingPreviewTitle(listing));
  const breed = cleanBreed(pet.breed);
  const candidates = [breed || pet.species, pet.age, pet.sex];
  if (pet.placementType === "adoption" && listing.priceCents > 0) candidates.push("Adoption");
  const seen: string[] = [];
  return candidates.filter((value): value is string => {
    if (!value || /^(unknown|not specified|n\/a)$/i.test(value)) return false;
    const normalized = plain(value);
    if (
      !normalized ||
      title.includes(normalized) ||
      seen.some((previous) => previous.includes(normalized) || normalized.includes(previous))
    )
      return false;
    seen.push(normalized);
    return true;
  });
}
