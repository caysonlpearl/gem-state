import { normalizeClassifiedItemDetails } from "../config/classified-item-fields.ts";
import { mobileListingAllowed, mobileMediaUrl } from "./mobile-contract.ts";
import type { ClassifiedCard, ClassifiedDetail } from "./classifieds.functions";

type Shape = true | { [key: string]: Shape } | [Shape];
const fields = (keys: string) =>
  Object.fromEntries(keys.split(" ").map((key) => [key, true])) as Record<string, Shape>;
/** Closed projections: unknown provider payloads and future private fields never cross API v1. */
function project(value: unknown, shape: Shape): unknown {
  if (shape === true)
    return value == null || ["string", "number", "boolean"].includes(typeof value)
      ? value
      : undefined;
  if (Array.isArray(shape))
    return Array.isArray(value) ? value.map((v) => project(v, shape[0])) : [];
  if (!value || typeof value !== "object" || Array.isArray(value))
    return value == null ? null : undefined;
  return Object.fromEntries(
    Object.entries(shape).flatMap(([key, child]) => {
      const item = project((value as Record<string, unknown>)[key], child);
      return item === undefined ? [] : [[key, item]];
    }),
  );
}
const vehicle = fields(
  "year make model trim mileage bodyStyle transmission drivetrain fuelType exteriorColor titleStatus vin",
);
const home: Shape = {
  ...fields(
    "mode propertyType bedrooms bathrooms squareFeet yearBuilt acres available pets smoking leaseLength sellerType openHouse schoolDistrict acreage heating cooling garageParking yard appliancesIncluded basementType floorCoverings exteriorMaterial specialFeatures hoaFees zestimate rentZestimate",
  ),
  utilities: [fields("label paidBy")],
  amenities: [true],
  community: fields("slug name"),
  priceHistory: [fields("label amount date")],
  taxHistory: [fields("date amount value")],
};
const job: Shape = {
  ...fields(
    "category employerName employerAddress payType payMin payMax payEstimated employmentType experienceRequired educationLevel jobSummary applicationMethod applicationExternalContact",
  ),
  responsibilities: [true],
  qualifications: [true],
};
const service: Shape = {
  ...fields(
    "subcategory pricing pricingType priceMaxCents serviceArea availability serviceSummary businessAddress licenseNumber licenseLookupUrl",
  ),
  offerings: [true],
  reviews: [fields("author rating date title body")],
};
const pet = fields(
  "subcategory species breed name age sex placementType offeredBy hypoallergenic vaccinated spayedNeutered microchipped recordsAvailable goodWithKids goodWithDogs goodWithCats indoorOutdoor specialNeeds breedingTerms",
);
const marketVehicle: Shape = {
  ...fields(
    "id sourceKind providerId vin alternateVin heading price msrp fees priceIncludesFees referencePrice referencePriceDate referenceMiles priceChangePercent miles dom dom180 domActive dosActive sellerType inventoryType certified stockNumber inTransit vehicleStatus availabilityStatus source sourceUrl dataSource firstSeenAt lastSeenAt",
  ),
  location: fields("sellerName street city state zip latitude longitude"),
  media: { photoLinks: [true], photoLinksCached: [true] },
  build: fields(
    "year make model trim version bodyType vehicleType transmission drivetrain fuelType engine engineSize engineBlock cylinders doors madeIn overallHeight overallLength overallWidth seating highwayMpg cityMpg powertrainType",
  ),
  dealer: fields(
    "id name dealerType dealershipGroupName website street city state country zip phone email",
  ),
  finance: fields("loanTerm loanApr downPayment downPaymentPercentage estimatedMonthlyPayment"),
  lease: fields("term downPayment estimatedMonthlyPayment"),
  extra: {
    options: [true],
    features: [true],
    highValueFeatures: [true],
    optionsPackages: [true],
    sellerComments: true,
  },
  priceHistory: [fields("label amount date")],
};
const summary: Shape = {
  ...fields(
    "id title discoverySellerKey productId productSlug priceCents currency city state region postalCode categorySlug categoryName condition fulfillmentMode createdAt isFeatured imageUrl listingNumber",
  ),
  vehicle,
  home,
  job,
  service,
  pet,
  dealer: fields("displayName slug logoUrl city state website address postalCode"),
  vehiclePricing: fields("msrpCents referencePriceCents"),
  externalJob: fields("source url logoUrl employerSince"),
  externalHome: {
    ...fields("source sourceUrl cacheExpiresAt address latitude longitude"),
    schools: [true],
    listedBy: fields("agentName agentPhone brokerName brokerPhone mlsName"),
  },
  externalVehicle: marketVehicle,
  externalPet: fields("sourceUrl orgName orgPhone orgEmail size"),
  directory: {
    ...fields(
      "source claimed logoUrl phone website email rating reviewCount googleUrl verifiedAt address",
    ),
    trades: [true],
    hours: [fields("day hours")],
  },
};
const detail: Shape = {
  ...summary,
  ...fields("description expiresAt sellerNote variantId"),
  seller: fields(
    "userId slug displayName bio avatarUrl payoutVerified managedByBluebird ratingAverage reviewCount contactPhone contactTextPhone contactEmail allowInternalMessages memberSince sellerType",
  ),
  images: [fields("url alt")],
  ended: fields("reason endedAt"),
  originalListing: fields("platform url"),
};
const urlKeys = new Set([
  "url",
  "imageUrl",
  "logoUrl",
  "avatarUrl",
  "sourceUrl",
  "website",
  "googleUrl",
  "licenseLookupUrl",
  "builderUrl",
]);
const phoneKeys = new Set([
  "contactPhone",
  "contactTextPhone",
  "phone",
  "agentPhone",
  "brokerPhone",
  "orgPhone",
]);
const emailKeys = new Set(["contactEmail", "email", "orgEmail"]);
function sanitize(value: unknown, key = ""): unknown {
  if (urlKeys.has(key))
    return mobileMediaUrl(
      key === "website" && typeof value === "string" && !/^[a-z]+:/i.test(value)
        ? `https://${value}`
        : value,
    );
  if (key === "photoLinks" || key === "photoLinksCached")
    return Array.isArray(value)
      ? value.flatMap((v) => {
          const url = mobileMediaUrl(v);
          return url ? [url] : [];
        })
      : [];
  if (phoneKeys.has(key))
    return typeof value === "string" && /^[+\d().\s-]{3,80}$/.test(value) ? value : null;
  if (emailKeys.has(key))
    return typeof value === "string" && /^[^@\s?&#]+@[^@\s?&#]+\.[^@\s?&#]+$/.test(value)
      ? value
      : null;
  if (key === "applicationExternalContact") {
    if (typeof value !== "string") return null;
    return /^[^@\s?&#]+@[^@\s?&#]+\.[^@\s?&#]+$/.test(value)
      ? value
      : mobileMediaUrl(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  }
  if (Array.isArray(value)) return value.map((v) => sanitize(v));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v, k)]));
  return value;
}
function cardProjection(card: ClassifiedCard, includeDetail = false) {
  if (!mobileListingAllowed(card)) return null;
  const out = sanitize(project(card, includeDetail ? detail : summary)) as ClassifiedDetail;
  // itemDetails is the only public dictionary; values cannot contain arbitrary nested data.
  if (card.itemDetails)
    out.itemDetails = normalizeClassifiedItemDetails(
      card.categorySlug ?? "general",
      card.itemDetails,
    );
  if (out.externalVehicle) out.externalVehicle.raw = {};
  return out;
}
export function mobileListingDetail(card: ClassifiedDetail): ClassifiedDetail | null {
  const out = cardProjection(card, true);
  if (!out) return null;
  out.communityListings = (card.communityListings ?? []).flatMap((c) => {
    const safe = cardProjection(c);
    return safe ? [safe] : [];
  });
  out.employerListings = (card.employerListings ?? []).flatMap((c) => {
    const safe = cardProjection(c);
    return safe ? [safe] : [];
  });
  out.communityFloorplans = (card.communityFloorplans ?? []).flatMap((plan) => {
    const safe = sanitize(
      project(plan, fields("name bedrooms bathrooms squareFeet image builderUrl")),
    ) as typeof plan;
    const image = mobileMediaUrl(safe.image);
    return image ? [{ ...safe, image }] : [];
  });
  return out;
}
