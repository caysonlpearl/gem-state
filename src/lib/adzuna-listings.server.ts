import type { AdzunaJob } from "./adzuna-contract";
import { employerKey } from "./employer-logo-match.ts";
import type {
  ClassifiedBrowseInput,
  ClassifiedCard,
  ClassifiedDetail,
} from "./classifieds.functions";
import {
  hasClassifiedRadiusCenter,
  isWithinClassifiedRadius,
  usStates,
} from "../config/classifieds.ts";

const categories: Record<string, string> = {
  "Accounting & Finance": "accounting-finance-jobs",
  "Architecture & Engineering": "engineering-jobs",
  Administrative: "admin-jobs",
  Construction: "trade-construction-jobs",
  Healthcare: "healthcare-nursing-jobs",
  Hospitality: "hospitality-catering-jobs",
  Retail: "retail-jobs",
  Education: "teaching-jobs",
  "Human Resources": "hr-jobs",
  "Information Technology": "it-jobs",
};

export function canIncludeAdzuna(data: ClassifiedBrowseInput) {
  if (
    data.includeAllMocks ||
    data.sellerSlug ||
    data.dealerSlug ||
    (data.group && data.group !== "classifieds") ||
    (data.category && data.category !== "jobs")
  )
    return false;
  // Provider snippets cannot establish these listing attributes. Never silently
  // ignore an active filter or mix external inventory into an owner's storefront.
  return !Object.entries(data).some(
    ([key, value]) =>
      value != null &&
      value !== false &&
      value !== "" &&
      (/^(home|pet|service)/.test(key) ||
        [
          "hasPhotos",
          "condition",
          "fulfillment",
          "priceMin",
          "priceMax",
          "make",
          "model",
          "yearMin",
          "yearMax",
          "mileageMax",
          "bodyStyle",
          "transmission",
          "drivetrain",
          "fuelType",
          "exteriorColor",
          "titleStatus",
          "itemDetailKey",
          "itemDetailValue",
          "jobPayType",
          "jobPayMin",
          "jobPayMax",
          "jobExperience",
          "jobEducation",
        ].includes(key)),
  );
}

export async function adzunaCards(data: ClassifiedBrowseInput): Promise<ClassifiedCard[]> {
  const selectedCategories = data.jobCategory?.split("||").filter(Boolean) ?? [];
  if (selectedCategories.some((category) => !categories[category])) return [];
  const selectedTypes = data.jobEmploymentType?.split("||").filter(Boolean) ?? [];
  // Seasonal/temporary status isn't established by Adzuna's contract fields.
  const supportedTypes = selectedTypes.filter((type) =>
    ["Full-time", "Part-time", "Contract"].includes(type),
  );
  if (selectedTypes.length && !supportedTypes.length) return [];
  const state = usStates.find(([code, name]) => code === data.state || name === data.state);
  const where =
    data.postalCode || [data.city, state?.[1] ?? data.state ?? "Idaho"].filter(Boolean).join(", ");
  const employment =
    supportedTypes.length === 1
      ? ({ "Full-time": "full_time", "Part-time": "part_time", Contract: "contract" } as const)[
          supportedTypes[0] as "Full-time" | "Part-time" | "Contract"
        ]
      : undefined;
  const { searchJobs } = await import("./adzuna.server");
  const result = await searchJobs({
    what: data.q ?? "",
    where,
    page: 1,
    category: selectedCategories.length === 1 ? categories[selectedCategories[0]] : undefined,
    employment,
  });
  const ageHours = data.postedWithin
    ? { hour: 1, day: 24, week: 168, month: 720 }[data.postedWithin]
    : undefined;
  const cards = result.jobs
    .filter(
      (job) =>
        (!(state && !hasClassifiedRadiusCenter(data)) || job.state === state[0]) &&
        (!data.city ||
          data.radiusMiles != null ||
          job.city.toLowerCase() === data.city.toLowerCase()) &&
        isWithinClassifiedRadius({
          city: data.city,
          cityState: data.state,
          listingCity: job.city,
          listingState: job.state,
          latitude: data.latitude,
          longitude: data.longitude,
          radiusMiles: data.radiusMiles,
        }) &&
        (!selectedCategories.length ||
          selectedCategories.some((category) => categories[category] === job.category)) &&
        (!selectedTypes.length || selectedTypes.includes(job.employmentType)) &&
        (!data.jobEmployer || job.company.toLowerCase().includes(data.jobEmployer.toLowerCase())) &&
        (!ageHours || Date.parse(job.createdAt) >= Date.now() - ageHours * 3600000),
    )
    .map(adzunaCard);
  await notePartnerEmployers(cards.map((card) => card.job?.employerName ?? ""));
  const removed = await removedPartnerJobIds(cards.map((card) => card.id));
  const { withEmployerLogos } = await import("./employer-logos.server");
  return withEmployerLogos(cards.filter((card) => !removed.has(card.id)));
}

/** An Adzuna job as a Bluebird listing card (id "adzuna-<adzuna id>"). */
export function adzunaCard(job: AdzunaJob): ClassifiedCard {
  return {
    id: `adzuna-${job.id}`,
    productId: `adzuna-${job.id}`,
    productSlug: "",
    title: job.title,
    city: job.city,
    state: job.state,
    region: "",
    priceCents: 0,
    currency: "USD",
    categorySlug: "jobs",
    categoryName: "Jobs",
    condition: "",
    fulfillmentMode: "",
    createdAt: job.createdAt,
    isFeatured: false,
    imageUrl: null,
    vehicle: null,
    externalJob: { source: "Adzuna", url: job.url },
    job: {
      employerName: job.company,
      employmentType: job.employmentType,
      category:
        Object.keys(categories).find((category) => categories[category] === job.category) ??
        (job.categoryLabel?.replace(/\s+Jobs$/i, "") || null),
      // Adzuna salaries are annual; 0/0 means none was given.
      payType: "Salary",
      payMin: job.salaryMin ?? 0,
      payMax: job.salaryMax ?? 0,
      payEstimated: Boolean(job.salaryMin && job.salaryIsEstimate),
      jobSummary: job.description,
      responsibilities: [],
      applicationMethod: "external",
      applicationExternalContact: job.url,
    },
  };
}

/**
 * One Adzuna job as a listing page. Adzuna has no fetch-by-id endpoint, so
 * the job comes from the shared search cache, where it was saved when the
 * search that showed it ran. Cache entries last six hours; an older link
 * finds nothing and the listing page treats it as gone.
 */
export async function adzunaDetail(listingId: string): Promise<ClassifiedDetail | null> {
  const id = listingId.match(/^adzuna-(\d{1,20})$/)?.[1];
  if (!id) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows } = await (supabaseAdmin as any)
    .from("adzuna_search_cache")
    .select("payload")
    .contains("payload", { jobs: [{ id }] })
    .order("expires_at", { ascending: false })
    .limit(1);
  const cached = (rows?.[0]?.payload?.jobs ?? []) as AdzunaJob[];
  const found = cached.find((job) => job.id === id);
  if (!found) return null;
  if (await isPartnerJobRemoved(listingId)) return null;
  // Entries cached before salaries were kept have none.
  const job: AdzunaJob = {
    ...found,
    salaryMin: found.salaryMin ?? null,
    salaryMax: found.salaryMax ?? null,
    salaryIsEstimate: Boolean(found.salaryIsEstimate),
  };
  // Other openings from the same employer in the same search, for "More jobs from".
  const sameEmployer = cached
    .filter((other) => other.id !== job.id && other.company && other.company === job.company)
    .slice(0, 8)
    .map((other) =>
      adzunaCard({
        ...other,
        salaryMin: other.salaryMin ?? null,
        salaryMax: other.salaryMax ?? null,
      }),
    );
  const { withEmployerLogos } = await import("./employer-logos.server");
  const [[card, ...employerListings], employerSince] = await Promise.all([
    withEmployerLogos([adzunaCard(job), ...sameEmployer]),
    partnerEmployerSince(job.company),
  ]);
  if (card?.externalJob && employerSince) card.externalJob.employerSince = employerSince;
  return {
    ...card!,
    listingNumber: job.id,
    employerListings,
    description: job.description,
    postalCode: null,
    expiresAt: null,
    sellerNote: null,
    variantId: `adzuna-${job.id}`,
    seller: null,
    images: [],
  };
}

/** Partner jobs a moderator removed after a member's report (status "reviewed"). */
export async function removedPartnerJobIds(listingIds: string[]): Promise<Set<string>> {
  if (!listingIds.length) return new Set();
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("partner_job_reports")
      .select("listing_id")
      .eq("status", "reviewed")
      .in("listing_id", listingIds);
    return new Set(((data ?? []) as { listing_id: string }[]).map((row) => row.listing_id));
  } catch {
    return new Set();
  }
}

async function isPartnerJobRemoved(listingId: string) {
  return (await removedPartnerJobIds([listingId])).has(listingId);
}

/** Remembers when Bluebird first listed a job from each partner employer. */
async function notePartnerEmployers(names: string[]) {
  const keys = [...new Set(names.map(employerKey).filter((key) => key.length >= 3))];
  if (!keys.length) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any).from("partner_employers").upsert(
      keys.map((name_key) => ({ name_key })),
      { onConflict: "name_key", ignoreDuplicates: true },
    );
  } catch {
    // Only feeds "On Bluebird since"; never block a search over it.
  }
}

async function partnerEmployerSince(name: string): Promise<string | null> {
  const key = employerKey(name);
  if (key.length < 3) return null;
  await notePartnerEmployers([name]);
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("partner_employers")
      .select("first_seen_at")
      .eq("name_key", key)
      .maybeSingle();
    return data?.first_seen_at ?? null;
  } catch {
    return null;
  }
}
