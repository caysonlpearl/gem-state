import { dealerInventoryPage } from "./vehicle-shopping";
/* eslint-disable @typescript-eslint/no-explicit-any -- publication RPC is migration-backed */
import { publicServerClient } from "./supabase-public.server";
import { marketCheckCard, matchesProviderFilters } from "./marketcheck.server";
import { marketCheckDescription } from "./marketcheck-contract";
import {
  DEALER_FEED_ID,
  publishedFeedVehicle,
  type PublishedFeedDealer,
  type PublishedFeedVehicle,
} from "./dealer-feed-contract";
import type {
  ClassifiedBrowseInput,
  ClassifiedCard,
  ClassifiedDetail,
} from "./classifieds.functions";

type Feed = { dealers: PublishedFeedDealer[]; vehicles: PublishedFeedVehicle[] };
async function readFeed(slug?: string, id?: string, fullPhotos = false): Promise<Feed> {
  const { data, error } = await (publicServerClient() as any)
    .rpc("read_published_dealer_inventory", {
      _dealer_slug: slug ?? null,
      _record_id: id ?? null,
      _full_photos: fullPhotos,
    })
    .abortSignal(AbortSignal.timeout(8000))
    .retry(false);
  if (error) throw Error("Published dealer inventory is temporarily unavailable.");
  return data ?? { dealers: [], vehicles: [] };
}
export function canIncludeDealerFeed(data: ClassifiedBrowseInput) {
  return (
    !data.includeAllMocks &&
    !data.sellerSlug &&
    (!data.group || data.group === "motors") &&
    (!data.category || data.category === "cars-trucks")
  );
}
function cards(feed: Feed, data: ClassifiedBrowseInput): ClassifiedCard[] {
  return feed.vehicles.flatMap((row) => {
    const dealer = feed.dealers.find((d) => d.slug === row.dealer_slug);
    const vehicle = dealer && publishedFeedVehicle(row, dealer);
    if (!vehicle || !matchesProviderFilters(vehicle, data)) return [];
    const card = marketCheckCard(vehicle);
    return [
      {
        ...card,
        dealer: card.dealer
          ? { ...card.dealer, slug: dealer!.slug, logoUrl: dealer!.logo_url ?? null }
          : null,
      },
    ];
  });
}
export async function dealerFeedCards(data: ClassifiedBrowseInput) {
  if (!canIncludeDealerFeed(data)) return { cards: [], dealers: [] };
  const feed = await readFeed(data.dealerSlug);
  return { cards: cards(feed, data), dealers: feed.dealers };
}
export async function dealerFeedDetail(id: string): Promise<ClassifiedDetail | null> {
  if (!DEALER_FEED_ID.test(id)) return null;
  const feed = await readFeed(undefined, id.slice("dealerfeed-".length), true);
  const row = feed.vehicles[0],
    dealer = row && feed.dealers.find((d) => d.slug === row.dealer_slug);
  const vehicle = row && dealer && publishedFeedVehicle(row, dealer);
  if (!vehicle) return null;
  const card = cards(feed, {})[0];
  if (!card) return null;
  return {
    ...card,
    description: marketCheckDescription(vehicle),
    postalCode: vehicle.location.zip,
    expiresAt: null,
    sellerNote: null,
    variantId: id,
    seller: dealer!.owner_user_id
      ? {
          userId: dealer!.owner_user_id,
          slug: dealer!.slug,
          displayName: dealer!.display_name,
          bio: null,
          avatarUrl: dealer!.logo_url ?? null,
          payoutVerified: false,
          ratingAverage: null,
          reviewCount: 0,
          contactPhone: dealer!.phone,
          contactEmail: dealer!.email ?? null,
          allowInternalMessages: dealer!.inbox_enabled === true,
          sellerType: "Dealer",
        }
      : null,
    images: vehicle.media.photoLinks.map((url) => ({ url, alt: vehicle.heading })),
    shareImageUrl: vehicle.media.photoLinks[0] ?? null,
  };
}
export async function dealerFeedStorefront(slug: string, page = 1, mobileCatalog = false) {
  const feed = await readFeed(slug),
    dealer = feed.dealers[0];
  if (!dealer) return null;
  const mobile = mobileCatalog ? await import("./mobile-storefront-contract.ts") : null;
  if (mobile && !mobile.mobileStorefrontIdentityAllowed(dealer.display_name, null)) return null;
  const all = cards(feed, {});
  const listings = mobile ? all.filter((card) => mobile.mobileStorefrontCardAllowed(card)) : all;
  return {
    id: dealer.dealer_id ?? `dealerfeed-${slug}`,
    messagingEnabled: dealer.inbox_enabled === true && Boolean(dealer.dealer_id),
    ownerUserId: dealer.owner_user_id ?? undefined,
    legalName: dealer.display_name,
    displayName: dealer.display_name,
    slug: dealer.slug,
    phone: dealer.phone,
    email: dealer.email ?? null,
    website: dealer.website,
    addressLine1: dealer.address_line1,
    city: dealer.city,
    state: dealer.state,
    postalCode: dealer.postal_code,
    logoUrl: dealer.logo_url ?? null,
    description: `Vehicle inventory provided with permission by ${dealer.display_name}.`,
    ...dealerInventoryPage(listings, page),
  };
}
