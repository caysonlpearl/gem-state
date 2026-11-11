import { discoverySellerKey, selectDiscoveryCards } from "./discovery-ranking.ts";
import type { ClassifiedsHome, ClassifiedsHomeLead } from "./classifieds.functions";
import type { ListingCardSummary } from "./listing-card-summary";
import { homepageDistanceRow } from "./homepage-distance-row.ts";
import { isGeneralHomepageListing, isHomepageVehicleListing } from "./homepage-listing-rows.ts";

export const HOMEPAGE_ROW_SIZE = 4;
export const HOMEPAGE_FEED_SIZE = 24;

/** One allocation for server transport and browser rendering. Keep all candidates
 * in the shared snapshot; only send the cards a visitor can initially see. */
export function allocateHomepageRows(
  home: ClassifiedsHome,
  homeLead: Pick<ClassifiedsHomeLead, "motors"> | undefined,
  matchesLocation: (card: ListingCardSummary) => boolean = (card) => card.state === "ID",
  hasLocalArea = false,
) {
  const localRecent = home.recent.filter(
    (listing) => !listing.externalMerchandise && matchesLocation(listing),
  );
  const localMotors = home.motors.filter(matchesLocation);
  const localVehicles = localMotors.filter(isHomepageVehicleListing);
  // The homepage shows Idaho homes for now; browse still includes the
  // surrounding states.
  const homeListings = localRecent.filter(
    (listing) => listing.home && listing.state?.toUpperCase() === "ID",
  );
  const jobListings = localRecent.filter((listing) => listing.job);
  const serviceSource = localRecent.filter((listing) => listing.service);
  const generalSource = localRecent.filter(isGeneralHomepageListing);

  // Every row below draws from the same small pool, so without this the same
  // few listings repeat row after row. Each listing appears at most once on
  // the page; rows claim up to four listings in the order they render, and a
  // row with nothing left shows the "just getting started" card instead.
  const allLocalListings = [...localRecent];
  for (const listing of localMotors) {
    if (!allLocalListings.some((existing) => existing.id === listing.id)) {
      allLocalListings.push(listing);
    }
  }
  // The route loader has settled both snapshot queries before this renders.
  const leadMotors = selectDiscoveryCards(
    (homeLead?.motors ?? []).filter(isHomepageVehicleListing).filter(matchesLocation),
    HOMEPAGE_ROW_SIZE,
  );
  const sellerCounts = new Map<string, number>();
  for (const card of leadMotors) {
    const key = discoverySellerKey(card);
    sellerCounts.set(key, (sellerCounts.get(key) ?? 0) + 1);
  }
  const shownIds = new Set<string>(leadMotors.map((listing) => listing.id));
  const pick = (candidates: ClassifiedsHome["recent"]) => {
    const unseen = selectDiscoveryCards(
      candidates.filter((listing) => !shownIds.has(listing.id)),
      HOMEPAGE_ROW_SIZE,
      sellerCounts,
    );
    for (const listing of unseen) shownIds.add(listing.id);
    return unseen;
  };
  // Reserve dedicated-category inventory before broad rows consume it.
  const petListings = pick(localRecent.filter((listing) => listing.pet));
  // Member firearms lead; online retailer firearms and gear fill the rest.
  const firearmListings = pick([
    ...localRecent.filter((listing) => listing.categorySlug === "firearms"),
    ...(home.onlineMerchandise ?? []).filter((listing) => listing.categorySlug === "firearms"),
  ]);
  const freshListings = pick(generalSource);
  const distanceRow = homepageDistanceRow(
    [...home.recent, ...home.motors],
    hasLocalArea,
    matchesLocation,
    shownIds,
  );
  const fartherAwayListings = pick(distanceRow.listings);
  const vehicleListings = pick(localVehicles);
  const truckListings = pick(
    localVehicles.filter((listing) =>
      /truck|suv|pickup|jeep|sport utility|chassis/i.test(
        `${listing.vehicle?.bodyStyle ?? ""} ${listing.title}`,
      ),
    ),
  );
  const valueVehicleListings = pick(
    localVehicles
      .filter((listing) => listing.priceCents > 0)
      .sort((a, b) => a.priceCents - b.priceCents),
  );
  const buyHomes = pick(homeListings.filter((listing) => listing.home?.mode === "buy"));
  const buildHomes = pick(homeListings.filter((listing) => listing.home?.mode === "build"));
  const rentalHomes = pick(homeListings.filter((listing) => listing.home?.mode === "rent"));
  const jobRow = pick(jobListings);
  const flexibleJobs = pick(
    jobListings.filter((listing) =>
      /part-time|contract|temporary/i.test(listing.job?.employmentType ?? ""),
    ),
  );
  const serviceListings = pick(serviceSource);
  const homeServices = pick(
    serviceSource.filter((listing) =>
      /home|handyman|lawn|landscape|repair|clean|plumb|electric|roof|heating|paint|contractor|pest/i.test(
        `${listing.title} ${listing.service?.subcategory ?? ""}`,
      ),
    ),
  );
  const generalListings = pick(generalSource);
  const toyAndCollectibleListings = pick(
    generalSource.filter((listing) =>
      /toy|plush|doll|collectible|ninja|mario/i.test(
        `${listing.title} ${listing.categoryName ?? ""}`,
      ),
    ),
  );
  const valueFinds = pick(generalSource.filter((listing) => listing.priceCents <= 10_000));
  const localSellerPicks = pick(localRecent);
  const feedStart = allLocalListings.filter((listing) => !shownIds.has(listing.id));

  return {
    petListings,
    firearmListings,
    freshListings,
    distanceRow,
    fartherAwayListings,
    vehicleListings,
    truckListings,
    valueVehicleListings,
    buyHomes,
    buildHomes,
    rentalHomes,
    jobRow,
    flexibleJobs,
    serviceListings,
    homeServices,
    generalListings,
    toyAndCollectibleListings,
    valueFinds,
    localSellerPicks,
    feedStart,
    shownIds,
  };
}

/** Filtering is a transport projection, never a smaller stored inventory pool.
 * Row selection is idempotent because it retains every winning candidate in
 * its original order, followed by the first visible feed page. */
export function initialHomepagePayload(home: ClassifiedsHome, lead: ClassifiedsHomeLead) {
  const rows = allocateHomepageRows(home, lead);
  const keep = new Set(rows.shownIds);
  for (const card of rows.feedStart.slice(0, HOMEPAGE_FEED_SIZE)) keep.add(card.id);
  // Retail rows have independent category pools and retain their exact cards.
  for (const category of ["outdoor-sporting", "apparel-accessories", "tools-equipment"])
    for (const card of (home.onlineMerchandise ?? [])
      .filter((card) => card.categorySlug === category)
      .slice(0, HOMEPAGE_ROW_SIZE))
      keep.add(card.id);
  return {
    ...home,
    motors: home.motors.filter((card) => keep.has(card.id)),
    recent: home.recent.filter((card) => keep.has(card.id)),
    onlineMerchandise: (home.onlineMerchandise ?? []).filter((card) => keep.has(card.id)),
    cachedFeedHasMore: rows.feedStart.length > HOMEPAGE_FEED_SIZE,
    // Preserve the previous browse-continuation predicate before projection.
    nativeFeedHasMore: home.totalActive > home.recent.length,
  };
}

/** Load another page from the same saved inventory only. Exclusions are IDs
 * already rendered, so a snapshot refresh cannot reintroduce a visible card. */
export function homepageFeedPage(home: ClassifiedsHome, excludeIds: readonly string[]) {
  const seen = new Set(excludeIds);
  const remaining = [...home.recent, ...home.motors].filter((card) => {
    if (card.state !== "ID" || card.externalMerchandise || seen.has(card.id)) return false;
    seen.add(card.id);
    return true;
  });
  return {
    listings: remaining.slice(0, HOMEPAGE_FEED_SIZE),
    hasMore: remaining.length > HOMEPAGE_FEED_SIZE,
  };
}
