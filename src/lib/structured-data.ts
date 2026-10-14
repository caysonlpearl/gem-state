import { brand } from "@/config/brand";
import type { ClassifiedCard, ClassifiedDetail } from "@/lib/classifieds.functions";
import { listingPath } from "@/lib/listing-url";
import {
  canonicalMake,
  canonicalModel,
  categoryPagePath,
  nearbyPagePath,
  vehiclePagePath,
} from "@/lib/place-pages";

/**
 * schema.org structured data (JSON-LD) for search engines and AI assistants.
 * Every value comes from the listing or page itself; nothing is invented to
 * fill a field, and fields with no data are left out.
 */

type JsonLd = Record<string, unknown>;

const absolute = (path: string) => `${brand.urls.siteUrl}${path}`;

/** A <script type="application/ld+json"> entry for a route's head(). */
export function jsonLdScript(data: JsonLd | JsonLd[]) {
  // "<" is escaped so listing text can never close the script tag early.
  return {
    type: "application/ld+json",
    children: JSON.stringify(data).replace(/</g, "\\u003c"),
  };
}

function compact<T extends JsonLd>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, entry]) =>
        entry !== undefined &&
        entry !== null &&
        entry !== "" &&
        !(Array.isArray(entry) && entry.length === 0),
    ),
  ) as T;
}

function address(listing: Pick<ClassifiedCard, "city" | "state" | "postalCode">) {
  return compact({
    "@type": "PostalAddress",
    addressLocality: listing.city,
    addressRegion: listing.state,
    postalCode: listing.postalCode ?? undefined,
    addressCountry: "US",
  });
}

function itemCondition(condition: string) {
  if (condition === "not_applicable") return undefined;
  if (condition.startsWith("new")) return "https://schema.org/NewCondition";
  if (condition === "broken_needs_repairs") return "https://schema.org/DamagedCondition";
  return "https://schema.org/UsedCondition";
}

/** Stable photo URLs (see routes/media.listings.$listingId.$photo.ts). */
function photoUrls(listing: ClassifiedDetail) {
  return listing.images
    .slice(0, 5)
    .map((_, index) => absolute(`/media/listings/${listing.id}/${index}`));
}

function seller(listing: ClassifiedDetail) {
  if (listing.dealer) {
    return compact({
      "@type": "AutoDealer",
      name: listing.dealer.displayName,
      url: absolute(`/dealers/${listing.dealer.slug}`),
    });
  }
  if (!listing.seller) return undefined;
  return compact({
    "@type": "Person",
    name: listing.seller.displayName,
    url: listing.seller.slug ? absolute(`/sellers/${listing.seller.slug}`) : undefined,
  });
}

function offer(listing: ClassifiedDetail, url: string, extra: JsonLd = {}) {
  return compact({
    "@type": "Offer",
    url,
    price: (listing.priceCents / 100).toFixed(2),
    priceCurrency: listing.currency || brand.defaultCurrency,
    availability: "https://schema.org/InStock",
    itemCondition: itemCondition(listing.condition),
    validFrom: listing.createdAt,
    priceValidUntil: listing.expiresAt?.slice(0, 10),
    availableAtOrFrom: { "@type": "Place", address: address(listing) },
    seller: seller(listing),
    ...extra,
  });
}

const EMPLOYMENT_TYPES: Record<string, string> = {
  "Full-time": "FULL_TIME",
  "Part-time": "PART_TIME",
  Seasonal: "TEMPORARY",
  Temporary: "TEMPORARY",
  Contract: "CONTRACTOR",
};

function jobPosting(listing: ClassifiedDetail, url: string): JsonLd {
  const job = listing.job!;
  const descriptionParts = [
    job.jobSummary ? `<p>${escapeHtml(job.jobSummary)}</p>` : "",
    job.responsibilities.length
      ? `<p>Responsibilities:</p><ul>${job.responsibilities.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : "",
    job.qualifications?.length
      ? `<p>Qualifications:</p><ul>${job.qualifications.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : "",
  ];
  const description =
    descriptionParts.join("") ||
    (listing.description ? `<p>${escapeHtml(listing.description)}</p>` : "");
  const unitText =
    job.payType === "Salary"
      ? "YEAR"
      : job.payType === "Hourly" || job.payType === "Contract"
        ? "HOUR"
        : null;
  return compact({
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: listing.title,
    description,
    url,
    datePosted: listing.createdAt.slice(0, 10),
    validThrough: listing.expiresAt ?? undefined,
    employmentType: EMPLOYMENT_TYPES[job.employmentType],
    hiringOrganization: { "@type": "Organization", name: job.employerName },
    jobLocation: { "@type": "Place", address: address(listing) },
    baseSalary:
      unitText && job.payMin > 0
        ? {
            "@type": "MonetaryAmount",
            currency: listing.currency || brand.defaultCurrency,
            value: compact({
              "@type": "QuantitativeValue",
              minValue: job.payMin,
              maxValue: job.payMax > job.payMin ? job.payMax : undefined,
              value: job.payMax > job.payMin ? undefined : job.payMin,
              unitText,
            }),
          }
        : undefined,
    educationRequirements: job.educationLevel ?? undefined,
    experienceRequirements: job.experienceRequired ?? undefined,
    directApply: (job.applicationMethod ?? "gemlist") === "gemlist",
  });
}

function vehicle(listing: ClassifiedDetail, url: string): JsonLd {
  const car = listing.vehicle!;
  return compact({
    "@context": "https://schema.org",
    "@type": "Car",
    name: listing.title,
    description: listing.description ?? undefined,
    url,
    image: photoUrls(listing),
    brand: car.make ? { "@type": "Brand", name: car.make } : undefined,
    model: car.model ?? undefined,
    vehicleModelDate: car.year ? String(car.year) : undefined,
    vehicleConfiguration: car.trim ?? undefined,
    vehicleIdentificationNumber: car.vin ?? undefined,
    mileageFromOdometer:
      car.mileage != null
        ? { "@type": "QuantitativeValue", value: car.mileage, unitCode: "SMI" }
        : undefined,
    bodyType: car.bodyStyle ?? undefined,
    vehicleTransmission: car.transmission ?? undefined,
    driveWheelConfiguration: car.drivetrain ?? undefined,
    fuelType: car.fuelType ?? undefined,
    color: car.exteriorColor ?? undefined,
    itemCondition: itemCondition(listing.condition),
    offers: offer(listing, url),
  });
}

function realEstate(listing: ClassifiedDetail, url: string): JsonLd {
  const home = listing.home!;
  return compact({
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: listing.title,
    description: listing.description ?? undefined,
    url,
    image: photoUrls(listing),
    datePosted: listing.createdAt.slice(0, 10),
    about: compact({
      "@type": "Accommodation",
      accommodationCategory: home.propertyType || undefined,
      numberOfBedrooms: home.bedrooms ?? undefined,
      numberOfBathroomsTotal: home.bathrooms ?? undefined,
      floorSize:
        home.squareFeet != null
          ? { "@type": "QuantitativeValue", value: home.squareFeet, unitCode: "FTK" }
          : undefined,
      yearBuilt: home.yearBuilt ?? undefined,
      address: address(listing),
    }),
    offers: offer(listing, url, {
      // Rentals are leased out; sales and builds are sold.
      businessFunction:
        home.mode === "rent"
          ? "http://purl.org/goodrelations/v1#LeaseOut"
          : "http://purl.org/goodrelations/v1#Sell",
      itemCondition: undefined,
    }),
  });
}

function service(listing: ClassifiedDetail, url: string): JsonLd {
  const details = listing.service!;
  return compact({
    "@context": "https://schema.org",
    "@type": "Service",
    name: listing.title,
    description: details.serviceSummary || listing.description || undefined,
    url,
    image: photoUrls(listing),
    serviceType: details.subcategory || undefined,
    areaServed: details.serviceArea || `${listing.city}, ${listing.state}`,
    provider: seller(listing),
    offers: listing.priceCents > 0 ? offer(listing, url, { itemCondition: undefined }) : undefined,
  });
}

function product(listing: ClassifiedDetail, url: string): JsonLd {
  return compact({
    "@context": "https://schema.org",
    "@type": "Product",
    name: listing.title,
    description: listing.description ?? undefined,
    url,
    image: photoUrls(listing),
    category: listing.categoryName ?? undefined,
    sku: listing.listingNumber ?? undefined,
    itemCondition: itemCondition(listing.condition),
    offers: offer(listing, url),
  });
}

function breadcrumbs(items: { name: string; path: string }[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absolute(item.path),
    })),
  };
}

/** Structured data for a listing page: the item itself plus its breadcrumb trail. */
export function listingStructuredData(listing: ClassifiedDetail): JsonLd[] {
  const url = absolute(listingPath(listing));
  const trail = [{ name: "Idaho", path: "/browse" }];
  if (listing.categorySlug) {
    trail.push({
      name: listing.categoryName ?? "Listings",
      path: categoryPagePath(listing.categorySlug),
    });
    const make =
      listing.categorySlug === "cars-trucks" ? canonicalMake(listing.vehicle?.make) : null;
    const model = make ? canonicalModel(make, listing.vehicle?.model) : null;
    const nearby = nearbyPagePath(listing.categorySlug, listing.city);
    if (make) {
      // Cars and trucks: Idaho › Cars & Trucks › Toyota › Tacoma.
      trail.push({ name: make, path: vehiclePagePath(make) });
      if (model) trail.push({ name: model, path: vehiclePagePath(make, model) });
    } else if (nearby !== categoryPagePath(listing.categorySlug)) {
      trail.push({
        name: `${listing.categoryName ?? "Listings"} in ${listing.city}`,
        path: nearby,
      });
    }
  }
  trail.push({ name: listing.title, path: listingPath(listing) });
  const crumbs = breadcrumbs(trail);

  // A sold or expired listing is no longer on offer: breadcrumbs only.
  if (listing.ended || listing.isMock) return [crumbs];
  const item = listing.job
    ? jobPosting(listing, url)
    : listing.vehicle
      ? vehicle(listing, url)
      : listing.home
        ? realEstate(listing, url)
        : listing.service
          ? service(listing, url)
          : product(listing, url);
  return [item, crumbs];
}

/** Structured data for a city, region or category landing page. */
export function placePageStructuredData(page: {
  heading: string;
  path: string;
  breadcrumbs: { label: string; path: string }[];
  listings: Pick<ClassifiedCard, "id" | "title" | "city">[];
  faq?: { question: string; answer: string }[];
}): JsonLd[] {
  const data: JsonLd[] = [
    breadcrumbs(page.breadcrumbs.map((crumb) => ({ name: crumb.label, path: crumb.path }))),
  ];
  if (page.faq?.length) {
    data.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: page.faq.map((entry) => ({
        "@type": "Question",
        name: entry.question,
        acceptedAnswer: { "@type": "Answer", text: entry.answer },
      })),
    });
  }
  if (page.listings.length) {
    data.push({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: page.heading,
      url: absolute(page.path),
      numberOfItems: page.listings.length,
      itemListElement: page.listings.map((listing, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: absolute(listingPath(listing)),
        name: listing.title,
      })),
    });
  }
  return data;
}

/** Site identity and site search, for the home page. */
export function siteStructuredData(): JsonLd[] {
  const url = absolute("/");
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${url}#organization`,
      name: brand.name,
      alternateName: brand.shortName,
      url,
      logo: absolute("/images/brand/bluebird-marketplace-logo.png"),
      description: brand.description,
      areaServed: { "@type": "State", name: "Idaho" },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${url}#website`,
      name: brand.name,
      url,
      publisher: { "@id": `${url}#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: absolute("/browse?q={search_term_string}") },
        "query-input": "required name=search_term_string",
      },
    },
  ];
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const GUIDE_COVER_IMAGE = "/images/guides/guides-cover.jpg";

/** Article, FAQ and breadcrumbs for an Idaho guide. */
export function guideStructuredData(guide: {
  slug: string;
  title: string;
  description: string;
  published: string;
  reviewed: string;
  faqs: { question: string; answer: string }[];
}): JsonLd[] {
  const path = `/guides/${guide.slug}`;
  const organization = {
    "@type": "Organization",
    "@id": `${absolute("/")}#organization`,
    name: brand.name,
    url: absolute("/"),
  };
  const data: JsonLd[] = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: guide.title,
      description: guide.description,
      url: absolute(path),
      mainEntityOfPage: absolute(path),
      // Dates carry Idaho's (Mountain) time zone, as Google recommends.
      datePublished: `${guide.published}T09:00:00-06:00`,
      dateModified: `${guide.reviewed}T09:00:00-06:00`,
      image: [absolute(GUIDE_COVER_IMAGE)],
      author: organization,
      publisher: {
        ...organization,
        logo: absolute("/images/brand/bluebird-marketplace-logo.png"),
      },
      inLanguage: "en-US",
    },
    breadcrumbs([
      { name: "Guides", path: "/guides" },
      { name: guide.title, path },
    ]),
  ];
  if (guide.faqs.length) {
    data.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: guide.faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    });
  }
  return data;
}
