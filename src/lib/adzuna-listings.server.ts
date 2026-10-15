import type { ClassifiedBrowseInput, ClassifiedCard } from "./classifieds.functions";
import { isWithinClassifiedRadius, usStates } from "../config/classifieds.ts";

const categories: Record<string, string> = {
  "Accounting & Finance": "accounting-finance-jobs",
  "Architecture & Engineering": "engineering-jobs",
  Administrative: "admin-jobs",
  Construction: "trade-construction-jobs",
  Healthcare: "healthcare-nursing-jobs",
  Hospitality: "hospitality-catering-jobs",
  Retail: "retail-jobs",
  Education: "teaching-jobs",
};

export function canIncludeAdzuna(data: ClassifiedBrowseInput) {
  if (
    data.includeAllMocks ||
    data.sellerSlug ||
    data.dealerSlug ||
    data.group ||
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
  return result.jobs
    .filter(
      (job) =>
        (!state || job.state === state[0]) &&
        (!data.city ||
          data.radiusMiles != null ||
          job.city.toLowerCase() === data.city.toLowerCase()) &&
        isWithinClassifiedRadius({
          city: data.city,
          listingCity: job.city,
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
    .map((job) => ({
      id: `adzuna:${job.id}`,
      productId: `adzuna:${job.id}`,
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
          Object.keys(categories).find((category) => categories[category] === job.category) ?? null,
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
    }));
}
