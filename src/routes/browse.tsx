import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookmarkSimple,
  CaretDown,
  Check,
  FunnelSimple,
  MapPin,
  MagnifyingGlass,
  Megaphone,
  X,
} from "@phosphor-icons/react";

import { brand } from "@/config/brand";
import {
  classifiedCategories,
  marketplaceCities,
  idahoRegions,
  nearestClassifiedCity,
  usStates,
  vehicleModelsByMake,
  vehicleOptions,
} from "@/config/classifieds";
import {
  petOfferedBy,
  petPlacementTypes,
  petSexes,
  petSpecies,
  petSubcategories,
  isPetSelectionCompatible,
  normalizePetSpecies,
  normalizePetSubcategory,
} from "@/config/pets";
import { fieldsForClassifiedItem, industrialSubcategories } from "@/config/classified-item-fields";
import { CategoryArtwork } from "@/components/classifieds/CategoryIcon";
import { AllCategoriesPopover } from "@/components/classifieds/AllCategoriesPopover";
import { ListingCard, ListingRow } from "@/components/classifieds/ListingCard";
import {
  LocationRadiusPicker,
  type LocationPoint,
} from "@/components/classifieds/LocationRadiusPicker";
import {
  conditionLabels,
  formatSavedSearchFilter,
  isMotorsCategory,
} from "@/lib/classifieds-display";
import {
  browseClassifieds,
  type ClassifiedBrowseInput,
  type ClassifiedBrowseResult,
} from "@/lib/classifieds.functions";
import { trackEvent, traceMutation } from "@/lib/analytics";
import { createSavedSearch, updateSavedSearch } from "@/lib/account-center.functions";
import { SavedSearchNameDialog } from "@/components/classifieds/SavedSearchNameDialog";
import { BluebirdEmptyState } from "@/components/layout/BluebirdEmptyState";
import { toast } from "sonner";
import {
  comparableJobPay,
  isInvertedRange,
  optionalNonNegativeInteger,
  optionalNonNegativeNumber,
} from "@/lib/classifieds-query";
import { ResponsiveBrowseFilters } from "@/components/classifieds/ResponsiveBrowseFilters";

type Sort = NonNullable<ClassifiedBrowseInput["sort"]>;
type View = "grid" | "list";
type HomeTab = "build" | "buy" | "rent";
type JobMode = "landing" | "results";
type ServiceMode = "landing" | "results";
type PetMode = "landing" | "results";

const isPostalCode = (value: string) => /^\d{5}(?:-\d{4})?$/.test(value.trim());

const itemCategorySlugs = new Set<string>(
  classifiedCategories
    .filter(
      (category) =>
        category.group === "classifieds" &&
        !["other-real-estate", "jobs", "services", "pets"].includes(category.slug),
    )
    .map((category) => category.slug),
);

type Search = {
  allCategories?: boolean | undefined;
  q?: string | undefined;
  savedSearchId?: string | undefined;
  category?: string | undefined;
  group?: "motors" | "classifieds" | undefined;
  state?: string | undefined;
  region?: string | undefined;
  city?: string | undefined;
  radiusMiles?: number | undefined;
  latitude?: number | undefined;
  longitude?: number | undefined;
  postalCode?: string | undefined;
  condition?: string | undefined;
  fulfillment?: string | undefined;
  priceMin?: number | undefined;
  priceMax?: number | undefined;
  make?: string | undefined;
  model?: string | undefined;
  yearMin?: number | undefined;
  yearMax?: number | undefined;
  mileageMax?: number | undefined;
  bodyStyle?: string | undefined;
  transmission?: string | undefined;
  drivetrain?: string | undefined;
  fuelType?: string | undefined;
  exteriorColor?: string | undefined;
  titleStatus?: string | undefined;
  sellerType?: string | undefined;
  mileageBands?: string | undefined;
  sort?: Sort | undefined;
  view?: View | undefined;
  page?: number | undefined;
  homeMode?: "landing" | "results" | undefined;
  homeTab?: HomeTab | undefined;
  homeYearBuilt?: number | undefined;
  homeHeating?: string | undefined;
  homeCooling?: string | undefined;
  homeGarageParking?: string | undefined;
  homeYard?: string | undefined;
  homeSchoolDistrict?: string | undefined;
  homeAvailable?: string | undefined;
  homePetsPolicy?: string | undefined;
  homeSmokingPolicy?: string | undefined;
  jobMode?: JobMode | undefined;
  serviceMode?: ServiceMode | undefined;
  vehicleMode?: "landing" | "results" | undefined;
  petMode?: PetMode | undefined;
  petSubcategory?: string | undefined;
  petSpecies?: string | undefined;
  petBreed?: string | undefined;
  petPlacementType?: string | undefined;
  petOfferedBy?: string | undefined;
  petSex?: string | undefined;
  petAge?: string | undefined;
  petHypoallergenic?: string | undefined;
  petVaccinated?: string | undefined;
  petSpayedNeutered?: string | undefined;
  petMicrochipped?: string | undefined;
  petRecordsAvailable?: string | undefined;
  petGoodWithKids?: string | undefined;
  petGoodWithDogs?: string | undefined;
  petGoodWithCats?: string | undefined;
  petIndoorOutdoor?: string | undefined;
  itemDetailKey?: string | undefined;
  itemDetailValue?: string | undefined;
  serviceSubcategory?: string | undefined;
  serviceExpandSearch?: string | undefined;
  servicePhotos?: string | undefined;
  serviceVideo?: string | undefined;
  serviceSellerType?: string | undefined;
  serviceCondition?: string | undefined;
  serviceTimeOnSite?: string | undefined;
  serviceArea?: string | undefined;
  serviceAvailability?: string | undefined;
  serviceLicenseRequired?: string | undefined;
  jobCategory?: string | undefined;
  jobEmployer?: string | undefined;
  jobEmploymentType?: string | undefined;
  jobType?: string | undefined;
  jobPayType?: string | undefined;
  jobPayMin?: number | undefined;
  jobPayMax?: number | undefined;
  jobExperience?: string | undefined;
  jobPosted?: string | undefined;
  jobEducation?: string | undefined;
  jobPhotos?: string | undefined;
  jobVideo?: string | undefined;
  jobTimeOnSite?: string | undefined;
  homeLocation?: string | undefined;
  homePrice?: string | undefined;
  propertyType?: string | undefined;
  bedrooms?: string | undefined;
  bathrooms?: string | undefined;
  homeSquareFeet?: string | undefined;
  homeBuilder?: string | undefined;
  constructionType?: string | undefined;
  homeAcres?: string | undefined;
  homeSellerType?: string | undefined;
  petsCats?: string | undefined;
  petsDogs?: string | undefined;
  homeAmenities?: string | undefined;
  communityAmenities?: string | undefined;
  leaseLength?: string | undefined;
};

const savedSearchFilterKeys: readonly (keyof Search)[] = [
  "allCategories",
  "q",
  "category",
  "group",
  "state",
  "region",
  "city",
  "radiusMiles",
  "latitude",
  "longitude",
  "postalCode",
  "condition",
  "fulfillment",
  "priceMin",
  "priceMax",
  "make",
  "model",
  "yearMin",
  "yearMax",
  "mileageMax",
  "mileageBands",
  "bodyStyle",
  "transmission",
  "drivetrain",
  "fuelType",
  "exteriorColor",
  "titleStatus",
  "sellerType",
  "homeTab",
  "homeMode",
  "homeYearBuilt",
  "homeHeating",
  "homeCooling",
  "homeGarageParking",
  "homeYard",
  "homeSchoolDistrict",
  "homeAvailable",
  "homePetsPolicy",
  "homeSmokingPolicy",
  "jobMode",
  "serviceMode",
  "vehicleMode",
  "petMode",
  "serviceSubcategory",
  "serviceExpandSearch",
  "servicePhotos",
  "serviceVideo",
  "serviceSellerType",
  "serviceCondition",
  "serviceTimeOnSite",
  "serviceArea",
  "serviceAvailability",
  "serviceLicenseRequired",
  "jobCategory",
  "jobEmployer",
  "jobEmploymentType",
  "jobType",
  "jobPayType",
  "jobPayMin",
  "jobPayMax",
  "jobExperience",
  "jobPosted",
  "jobEducation",
  "jobPhotos",
  "jobVideo",
  "jobTimeOnSite",
  "homeLocation",
  "homePrice",
  "propertyType",
  "bedrooms",
  "bathrooms",
  "homeSquareFeet",
  "homeBuilder",
  "constructionType",
  "homeAcres",
  "homeSellerType",
  "petsCats",
  "petsDogs",
  "homeAmenities",
  "communityAmenities",
  "leaseLength",
  "petSubcategory",
  "petSpecies",
  "petBreed",
  "petPlacementType",
  "petOfferedBy",
  "petSex",
  "petAge",
  "petHypoallergenic",
  "petVaccinated",
  "petSpayedNeutered",
  "petMicrochipped",
  "petRecordsAvailable",
  "petGoodWithKids",
  "petGoodWithDogs",
  "petGoodWithCats",
  "petIndoorOutdoor",
  "itemDetailKey",
  "itemDetailValue",
];

type VehicleHeroFilter =
  | "makeModel"
  | "year"
  | "price"
  | "mileage"
  | "bodyStyle"
  | "titleStatus"
  | "location"
  | "condition"
  | "fulfillment"
  | "drivetrain"
  | "transmission"
  | "fuelType"
  | "exteriorColor";

const conditionOptions = Object.entries(conditionLabels);

const sortOptions: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "price_low", label: "Price: low to high" },
  { value: "price_high", label: "Price: high to low" },
  { value: "mileage_low", label: "Mileage: low to high" },
];

const homeTabs: { value: HomeTab; label: string; eyebrow: string }[] = [
  { value: "build", label: "Build", eyebrow: "New construction" },
  { value: "buy", label: "Buy", eyebrow: "Homes for sale" },
  { value: "rent", label: "Rent", eyebrow: "Places to rent" },
];

const homePropertyTypes = [
  "Any property type",
  "Single-family home",
  "Townhome",
  "Condo",
  "Apartment",
  "Duplex",
  "Manufactured home",
  "Land",
];
const homeBedroomOptions = [
  "Any bedrooms",
  "Studio",
  "1+ bedrooms",
  "2+ bedrooms",
  "3+ bedrooms",
  "4+ bedrooms",
];
const homeBathroomOptions = [
  "Any bathrooms",
  "1+ bathrooms",
  "2+ bathrooms",
  "3+ bathrooms",
  "4+ bathrooms",
];
const homeSquareFeetOptions = [
  "Any",
  "250+",
  "500+",
  "1000+",
  "1500+",
  "2000+",
  "3000+",
  "4000+",
  "5000+",
  "10000+",
];
const homeAcresOptions = [
  "Any",
  ".10+",
  ".20+",
  ".25+",
  ".30+",
  ".5+",
  ".75+",
  "1+",
  "1.5+",
  "2+",
  "2.5+",
];
const homeYearBuiltOptions = [
  "Any year",
  "Built 2025 or newer",
  "Built 2020 or newer",
  "Built 2010 or newer",
  "Built 2000 or newer",
  "Built 1990 or newer",
];
const homeAmenitiesOptions = [
  "Any",
  "Air Conditioning",
  "Attached Garage",
  "Balcony",
  "Carpet",
  "Ceiling Fan(s)",
  "Crown Molding",
  "Controlled Access",
  "Deck",
  "Dishwasher",
  "Energy Efficient",
  "Fireplace",
  "Furnished",
  "Handicap Accessible",
  "Hardwood Flooring",
  "Heating",
  "High ceilings",
  "Internet Ready",
  "New Paint",
  "Newly Remodeled",
  "Parking",
];
const communityAmenitiesOptions = [
  "Any",
  "BBQ Area(s)",
  "Basketball Court",
  "Bike Lockers/Storage",
  "Bluetooth Enabled Spaces",
  "Business Center",
  "Clubhouse",
  "Community Garden",
  "Dog Park",
  "Elevator Access",
  "Fenced Yard",
  "Parcel Lockers",
  "Pet Washing Station",
  "Pickleball",
  "Playground",
  "Pool",
  "Public Transit Nearby",
  "Splash Pad",
  "Storage",
  "Tennis",
  "Theater Room",
  "Volleyball",
  "WiFi in Common Areas",
];
const leaseLengthOptions = [
  "Any",
  "Month-to-month",
  "1 month",
  "2 months",
  "3 months",
  "4 months",
  "5 months",
  "6 months",
  "9 months",
  "12 months",
  "18 months",
  "24 months",
];

const mileageBandOptions = [
  "Under 25,000 miles",
  "Under 50,000 miles",
  "Under 75,000 miles",
  "Under 100,000 miles",
  "Under 150,000 miles",
] as const;
const splitVehicleFilter = (value: string | undefined) => value?.split("||").filter(Boolean) ?? [];
const normalizeMultiSelect = (value: string | undefined) =>
  value
    ?.split(/\|\||,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join("||") ?? "";
const hasSearchValue = (value: unknown) => value !== undefined && value !== null && value !== "";
const modelsForMakes = (makes: readonly string[]) =>
  [...new Set(makes.flatMap((make) => vehicleModelsByMake[make] ?? []))].sort();
const vehicleConditionOptions = [
  { value: "new_with_tags", label: "New" },
  { value: "used_excellent", label: "Used excellent" },
  { value: "used_good", label: "Used good" },
  { value: "broken_needs_repairs", label: "Broken/needs repairs" },
] as const;
const jobCategoryOptions = [
  "Any category",
  "Accounting & Finance",
  "Administrative",
  "Architecture & Engineering",
  "Automotive",
  "Construction",
  "Education",
  "Healthcare",
  "Hospitality",
  "Human Resources",
  "Information Technology",
  "Retail",
] as const;
const jobTypeOptions = [
  "Any job type",
  "Contract",
  "Full-time",
  "Part-time",
  "Seasonal",
  "Temporary",
] as const;
const jobPayTypeOptions = ["All pay types", "Hourly", "Salary", "Commission", "Contract"] as const;
const jobExperienceOptions = [
  "Any experience",
  "1–2 years",
  "3–4 years",
  "5–7 years",
  "8–10 years",
  "10+ years",
] as const;
const jobPostedOptions = [
  "Any time",
  "Last hour",
  "Last 24 hours",
  "Last 7 days",
  "Last 30 days",
] as const;
const jobEducationOptions = [
  "Any education",
  "2-year Degree",
  "4-year Degree",
  "Advanced Degree",
  "High School",
  "None",
] as const;

type HomePreviewRow = {
  title: string;
  action: string;
  cards: { name: string; location: string; price: string; facts: string; image: string }[];
};

const homePreviewRows: HomePreviewRow[] = [
  {
    title: "Featured homes for sale",
    action: "Browse homes for sale",
    cards: [],
  },
  {
    title: "New builds to explore",
    action: "Find new construction",
    cards: [],
  },
  {
    title: "Rentals worth a look",
    action: "Browse rentals",
    cards: [],
  },
];

const homePreviewRowsByTab: Record<HomeTab, HomePreviewRow[]> = {
  buy: [
    homePreviewRows[0]!,
    {
      title: "Price drops to watch",
      action: "See price drops",
      cards: [],
    },
    showcaseRow(
      "Starter homes",
      "Browse starter homes",
      "/browse?category=other-real-estate&homeMode=results&homeTab=buy",
      [],
    ),
    showcaseRow(
      "Condos & townhomes",
      "Browse attached homes",
      "/browse?category=other-real-estate&homeMode=results&homeTab=buy",
      [],
    ),
    showcaseRow(
      "Homes with space to grow",
      "Find larger homes",
      "/browse?category=other-real-estate&homeMode=results&homeTab=buy",
      [],
    ),
  ],
  build: [
    homePreviewRows[1]!,
    {
      title: "Quick move-in homes",
      action: "Find move-in ready builds",
      cards: [],
    },
    showcaseRow(
      "New build communities",
      "Explore communities",
      "/browse?category=other-real-estate&homeMode=results&homeTab=build",
      [],
    ),
    showcaseRow(
      "Custom build opportunities",
      "Plan a custom home",
      "/browse?category=other-real-estate&homeMode=results&homeTab=build",
      [],
    ),
    showcaseRow(
      "Townhome builds",
      "Find new townhomes",
      "/browse?category=other-real-estate&homeMode=results&homeTab=build",
      [],
    ),
  ],
  rent: [
    homePreviewRows[2]!,
    {
      title: "Pet-friendly rentals",
      action: "Browse pet-friendly homes",
      cards: [],
    },
    showcaseRow(
      "Apartments under $1,800",
      "Browse budget-friendly rentals",
      "/browse?category=other-real-estate&homeMode=results&homeTab=rent",
      [],
    ),
    showcaseRow(
      "Rentals with room to spread out",
      "Find larger rentals",
      "/browse?category=other-real-estate&homeMode=results&homeTab=rent",
      [],
    ),
    showcaseRow(
      "Short-term & flexible stays",
      "Explore flexible rentals",
      "/browse?category=other-real-estate&homeMode=results&homeTab=rent",
      [],
    ),
  ],
};

type ServiceCategory = { name: string; count: number; image: string };

const serviceCategoryRows: { title: string; categories: ServiceCategory[] }[] = [
  {
    title: "Popular services",
    categories: [
      {
        name: "Drywall",
        count: 49,
        image:
          "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=700&q=80",
      },
      {
        name: "Electricians",
        count: 48,
        image:
          "https://images.unsplash.com/photo-1621905251918-48416bd8575a?auto=format&fit=crop&w=700&q=80",
      },
      {
        name: "Handyman",
        count: 75,
        image:
          "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=700&q=80",
      },
      {
        name: "Heating & Air Conditioning",
        count: 66,
        image:
          "https://images.unsplash.com/photo-1631545806609-ccf5d6f5c2ab?auto=format&fit=crop&w=700&q=80",
      },
      {
        name: "Movers",
        count: 19,
        image:
          "https://images.unsplash.com/photo-1600518464441-9154a4dea21b?auto=format&fit=crop&w=700&q=80",
      },
      {
        name: "Painters",
        count: 55,
        image:
          "https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=700&q=80",
      },
    ],
  },
  {
    title: "Seasonal categories",
    categories: [
      {
        name: "Lawn Care & Maintenance",
        count: 38,
        image:
          "https://images.unsplash.com/photo-1599685315640-3f3c8e3d9b4b?auto=format&fit=crop&w=700&q=80",
      },
      {
        name: "Landscape Contractors",
        count: 100,
        image:
          "https://images.unsplash.com/photo-1558904541-efa843a96f01?auto=format&fit=crop&w=700&q=80",
      },
      {
        name: "House Cleaning",
        count: 54,
        image:
          "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=700&q=80",
      },
      {
        name: "Cabinet & Countertops",
        count: 18,
        image:
          "https://images.unsplash.com/photo-1556912167-f556f1f39fdf?auto=format&fit=crop&w=700&q=80",
      },
      {
        name: "Carpet & Flooring Installation",
        count: 39,
        image:
          "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=700&q=80",
      },
      {
        name: "Automotive",
        count: 54,
        image:
          "https://images.unsplash.com/photo-1486006920555-c77dcf18193c?auto=format&fit=crop&w=700&q=80",
      },
    ],
  },
];

const allServiceCategories: ServiceCategory[] = [
  { name: "Accounting & Bookkeeping", count: 14, image: "" },
  { name: "Appliance & Electronics Repair", count: 9, image: "" },
  { name: "Automotive", count: 54, image: "" },
  { name: "Cabinets & Countertops", count: 18, image: "" },
  { name: "Carpentry", count: 20, image: "" },
  { name: "Carpet & Flooring Installation", count: 39, image: "" },
  { name: "Carpet Cleaning", count: 9, image: "" },
  { name: "Childcare", count: 5, image: "" },
  { name: "Concrete Contractors", count: 86, image: "" },
  { name: "Concrete Foundations & Footings", count: 16, image: "" },
  { name: "Deck & Patio Construction", count: 27, image: "" },
  { name: "Drywall", count: 49, image: "" },
  { name: "Electricians", count: 48, image: "" },
  { name: "Excavation", count: 37, image: "" },
  { name: "Fence Installation & Repair", count: 28, image: "" },
  { name: "Garage Doors", count: 18, image: "" },
  { name: "General Contractors", count: 126, image: "" },
  { name: "Gutters & Downspouts", count: 15, image: "" },
  { name: "Handyman", count: 75, image: "" },
  { name: "Healthcare", count: 9, image: "" },
  { name: "Heating & Air Conditioning", count: 66, image: "" },
  { name: "Hot Tub & Pool", count: 12, image: "" },
  { name: "House Cleaning", count: 54, image: "" },
  { name: "Insulation", count: 5, image: "" },
  { name: "IT Services", count: 9, image: "" },
  { name: "Landscape Contractors", count: 100, image: "" },
  { name: "Legal Services", count: 2, image: "" },
  { name: "Masonry", count: 19, image: "" },
  { name: "Miscellaneous Services", count: 55, image: "" },
  { name: "Movers", count: 19, image: "" },
  { name: "Other Home Services", count: 21, image: "" },
  { name: "Painters", count: 55, image: "" },
  { name: "Paving & Asphalt", count: 6, image: "" },
  { name: "Pest Control", count: 4, image: "" },
  { name: "Pet Training", count: 2, image: "" },
  { name: "Plumbers", count: 76, image: "" },
  { name: "Real Estate Services", count: 7, image: "" },
  { name: "Remodelers", count: 42, image: "" },
  { name: "Roofing", count: 50, image: "" },
  { name: "RV & Boat Repair", count: 15, image: "" },
  { name: "Scrap & Junk Removal", count: 36, image: "" },
  { name: "Siding Installation & Repair", count: 18, image: "" },
  { name: "Small Engine Repair", count: 7, image: "" },
  { name: "Sprinkler Installation & Repair", count: 38, image: "" },
  { name: "Tile, Marble & Granite Installation", count: 25, image: "" },
  { name: "Tree Trimming & Removal", count: 30, image: "" },
  { name: "Tutoring", count: 9, image: "" },
  { name: "Welding & Fabrication", count: 23, image: "" },
  { name: "Window Cleaning", count: 12, image: "" },
  { name: "Windows & Glass Installation", count: 11, image: "" },
];

const serviceSubcategoryOptions = [
  "Any subcategory",
  ...allServiceCategories.map((category) => category.name),
] as const;
const serviceConditionOptions = ["Any condition", "New", "Used", "Like new"] as const;
const serviceTimeOnSiteOptions = [
  "Any time",
  "Last hour",
  "Last 24 hours",
  "Last 7 days",
  "Last 30 days",
] as const;

const classifiedQuery = (input: ClassifiedBrowseInput) =>
  queryOptions({
    queryKey: ["classified-browse", input],
    queryFn: () =>
      traceMutation(
        {
          flow: "classified_search",
          props: { category: input.category ?? "all", group: input.group ?? "all" },
          thresholdMs: 1_000,
        },
        () => browseClassifieds({ data: input }),
      ),
  });

function stringParam(search: Record<string, unknown>, key: string, max = 80) {
  const value = search[key];
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

function numberParam(search: Record<string, unknown>, key: string) {
  return optionalNonNegativeNumber(search[key]);
}

function coordinateParam(search: Record<string, unknown>, key: string) {
  const value = search[key];
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function integerParam(search: Record<string, unknown>, key: string) {
  return optionalNonNegativeInteger(search[key]);
}

function thresholdValue(value: string | undefined) {
  const match = value?.match(/[0-9]+(?:\.[0-9]+)?/);
  const parsed = match ? Number(match[0]) : undefined;
  return parsed != null && Number.isFinite(parsed) ? parsed : undefined;
}

function postedWindow(value: string | undefined): ClassifiedBrowseInput["postedWithin"] {
  if (!value) return undefined;
  if (value === "Last hour") return "hour";
  if (value === "Last 24 hours") return "day";
  if (value === "Last 7 days") return "week";
  if (value === "Last 30 days") return "month";
  return undefined;
}

function normalizedCondition(value: string | undefined) {
  if (!value) return undefined;
  if (value === "New") return "new_with_tags||new_without_tags";
  if (value === "Used") return "used_excellent||used_good";
  if (value === "Like new") return "used_excellent";
  return value;
}

function inputFromSearch(search: Search): ClassifiedBrowseInput {
  return {
    q: search.q,
    category: search.category,
    homeTab: search.homeTab,
    group: search.group,
    state: search.state,
    region: search.region,
    city: search.city,
    radiusMiles: search.radiusMiles,
    latitude: search.latitude,
    longitude: search.longitude,
    postalCode: search.postalCode,
    condition: search.condition ?? normalizedCondition(search.serviceCondition),
    fulfillment: search.fulfillment,
    priceMin: search.priceMin,
    priceMax: search.priceMax,
    make: search.make,
    model: search.model,
    yearMin: search.yearMin,
    yearMax: search.yearMax,
    mileageMax: search.mileageMax,
    bodyStyle: search.bodyStyle,
    transmission: search.transmission,
    drivetrain: search.drivetrain,
    fuelType: search.fuelType,
    exteriorColor: search.exteriorColor,
    titleStatus: search.titleStatus,
    homePropertyType: search.propertyType,
    homeBedroomsMin: thresholdValue(search.bedrooms),
    homeBathroomsMin: thresholdValue(search.bathrooms),
    homeSquareFeetMin: thresholdValue(search.homeSquareFeet),
    homeYearBuiltMin: search.homeYearBuilt,
    homeAcresMin: thresholdValue(search.homeAcres),
    homeHeating: search.homeHeating,
    homeCooling: search.homeCooling,
    homeGarageParking: search.homeGarageParking,
    homeYard: search.homeYard,
    homeSchoolDistrict: search.homeSchoolDistrict,
    homeLeaseLength: search.leaseLength,
    homeAvailable: search.homeAvailable,
    homePetsPolicy: search.homePetsPolicy,
    homeSmokingPolicy: search.homeSmokingPolicy,
    jobCategory: search.jobCategory,
    jobEmployer: search.jobEmployer,
    jobEmploymentType: search.jobEmploymentType ?? search.jobType,
    jobPayType: search.jobPayType,
    jobPayMin: search.jobPayMin,
    jobPayMax: search.jobPayMax,
    jobExperience: search.jobExperience,
    jobEducation: search.jobEducation,
    serviceSubcategory: search.serviceSubcategory,
    serviceArea: search.serviceArea,
    serviceAvailability: search.serviceAvailability,
    serviceLicenseRequired: search.serviceLicenseRequired === "true" ? true : undefined,
    postedWithin: postedWindow(
      search.jobPosted ?? search.jobTimeOnSite ?? search.serviceTimeOnSite,
    ),
    hasPhotos: search.jobPhotos === "true" || search.servicePhotos === "true",
    petSubcategory: search.petSubcategory,
    petSpecies: search.petSpecies,
    petBreed: search.petBreed,
    petPlacementType: search.petPlacementType,
    petOfferedBy: search.petOfferedBy,
    petSex: search.petSex,
    petAge: search.petAge,
    petHypoallergenic: search.petHypoallergenic,
    petVaccinated: search.petVaccinated,
    petSpayedNeutered: search.petSpayedNeutered,
    petMicrochipped: search.petMicrochipped,
    petRecordsAvailable: search.petRecordsAvailable,
    petGoodWithKids: search.petGoodWithKids,
    petGoodWithDogs: search.petGoodWithDogs,
    petGoodWithCats: search.petGoodWithCats,
    petIndoorOutdoor: search.petIndoorOutdoor,
    itemDetailKey: search.itemDetailKey,
    itemDetailValue: search.itemDetailValue,
    sort: search.sort ?? "newest",
    page: search.page ?? 1,
  };
}

const vehicleSearchKeys: readonly (keyof Search)[] = [
  "make",
  "model",
  "yearMin",
  "yearMax",
  "mileageMax",
  "mileageBands",
  "bodyStyle",
  "transmission",
  "drivetrain",
  "fuelType",
  "exteriorColor",
  "titleStatus",
];
const petSearchKeys: readonly (keyof Search)[] = [
  "petMode",
  "petSubcategory",
  "petSpecies",
  "petBreed",
  "petPlacementType",
  "petOfferedBy",
  "petSex",
  "petAge",
  "petHypoallergenic",
  "petVaccinated",
  "petSpayedNeutered",
  "petMicrochipped",
  "petRecordsAvailable",
  "petGoodWithKids",
  "petGoodWithDogs",
  "petGoodWithCats",
  "petIndoorOutdoor",
];
const jobSearchKeys: readonly (keyof Search)[] = [
  "jobMode",
  "jobCategory",
  "jobEmployer",
  "jobEmploymentType",
  "jobType",
  "jobPayType",
  "jobPayMin",
  "jobPayMax",
  "jobExperience",
  "jobPosted",
  "jobEducation",
  "jobPhotos",
  "jobVideo",
  "jobTimeOnSite",
];
const serviceSearchKeys: readonly (keyof Search)[] = [
  "serviceMode",
  "serviceSubcategory",
  "serviceExpandSearch",
  "servicePhotos",
  "serviceVideo",
  "serviceSellerType",
  "serviceCondition",
  "serviceTimeOnSite",
  "serviceArea",
  "serviceAvailability",
  "serviceLicenseRequired",
];
const homeSearchKeys: readonly (keyof Search)[] = [
  "homeMode",
  "homeTab",
  "homeLocation",
  "homePrice",
  "propertyType",
  "bedrooms",
  "bathrooms",
  "homeSquareFeet",
  "homeBuilder",
  "constructionType",
  "homeAcres",
  "homeSellerType",
  "petsCats",
  "petsDogs",
  "homeAmenities",
  "communityAmenities",
  "leaseLength",
  "homeYearBuilt",
  "homeHeating",
  "homeCooling",
  "homeGarageParking",
  "homeYard",
  "homeSchoolDistrict",
  "homeAvailable",
  "homePetsPolicy",
  "homeSmokingPolicy",
];

function normalizeBrowseSearch(search: Search): Search {
  const next = { ...search };
  const clear = (keys: readonly (keyof Search)[]) => {
    for (const key of keys) next[key] = undefined;
  };
  const motors = next.group === "motors" || isMotorsCategory(next.category);
  const pets = next.category === "pets";
  const jobs = next.category === "jobs";
  const services = next.category === "services";
  const homes = next.category === "other-real-estate";

  if (!motors) clear(vehicleSearchKeys);
  if (!pets) clear(petSearchKeys);
  if (!jobs) clear(jobSearchKeys);
  if (!services) clear(serviceSearchKeys);
  if (!homes) clear(homeSearchKeys);

  if (pets) {
    if (
      next.petMode === undefined &&
      petSearchKeys.some((key) => key !== "petMode" && hasSearchValue(next[key]))
    ) {
      next.petMode = "results";
    }
    const species = normalizePetSpecies(next.petSpecies);
    const subcategory = normalizePetSubcategory(next.petSubcategory);
    next.petSpecies = species;
    next.petSubcategory = isPetSelectionCompatible(species, subcategory) ? subcategory : undefined;
    if (!next.petSubcategory) next.petBreed = undefined;
  }
  if (jobs) {
    // Older shared links used jobEmploymentType. Consume that alias into the
    // canonical jobType field so the constraint is never silently discarded.
    next.jobType = next.jobType ?? next.jobEmploymentType;
    next.jobEmploymentType = undefined;
  }
  if (homes && next.homeTab === undefined) next.homeTab = "buy";
  return next;
}

// Keys that don't change which listings a page shows: sort order, layout and
// paging are handled by the canonical tag alone, not by noindex.
const BROWSE_IDENTITY_KEYS = new Set([
  "category",
  "group",
  "allCategories",
  "sort",
  "view",
  "page",
]);

function isIndexableBrowse(search: Search) {
  return Object.entries(search).every(
    ([key, value]) =>
      BROWSE_IDENTITY_KEYS.has(key) || value === undefined || value === false || value === "",
  );
}

function browseHeadHeading(search: Search) {
  const category = classifiedCategories.find((option) => option.slug === search.category);
  if (category?.slug === "jobs") return "Jobs in Idaho";
  if (category?.slug === "services") return "Local services in Idaho";
  if (category?.slug === "other-real-estate") return "Homes for sale and rent in Idaho";
  if (category?.slug === "pets") return "Pets in Idaho";
  if (category) return `${category.name} for sale in Idaho`;
  if (search.group === "motors") return "Vehicles for sale in Idaho";
  return null;
}

export const Route = createFileRoute("/browse")({
  validateSearch: (search: Record<string, unknown>): Search => {
    const group = stringParam(search, "group", 20);
    const sort = stringParam(search, "sort", 20);
    const view = stringParam(search, "view", 10);
    const homeMode = stringParam(search, "homeMode", 10);
    const homeTab = stringParam(search, "homeTab", 10);
    const jobMode = stringParam(search, "jobMode", 10);
    const serviceMode = stringParam(search, "serviceMode", 10);
    const vehicleMode = stringParam(search, "vehicleMode", 10);
    const petMode = stringParam(search, "petMode", 10);
    const savedSearchId = stringParam(search, "savedSearchId", 64);
    const page = Number(search["page"]);
    const parsed: Search = {
      // Undefined rather than false when absent: a false value gets written
      // back into the URL, which redirected every category link once.
      allCategories:
        search["allCategories"] === true || stringParam(search, "allCategories", 5) === "true"
          ? true
          : undefined,
      q: stringParam(search, "q"),
      savedSearchId,
      category: stringParam(search, "category", 60),
      group: group === "motors" || group === "classifieds" ? group : undefined,
      state: stringParam(search, "state", 2)?.toUpperCase(),
      region: stringParam(search, "region"),
      city: stringParam(search, "city"),
      radiusMiles: integerParam(search, "radiusMiles"),
      latitude: coordinateParam(search, "latitude"),
      longitude: coordinateParam(search, "longitude"),
      postalCode: stringParam(search, "postalCode", 12),
      condition: stringParam(search, "condition", 30),
      fulfillment: stringParam(search, "fulfillment", 20),
      priceMin: numberParam(search, "priceMin"),
      priceMax: numberParam(search, "priceMax"),
      make: stringParam(search, "make"),
      model: stringParam(search, "model"),
      yearMin: integerParam(search, "yearMin"),
      yearMax: integerParam(search, "yearMax"),
      mileageMax: integerParam(search, "mileageMax"),
      bodyStyle: stringParam(search, "bodyStyle", 30),
      transmission: stringParam(search, "transmission", 30),
      drivetrain: stringParam(search, "drivetrain", 20),
      fuelType: stringParam(search, "fuelType", 30),
      exteriorColor: stringParam(search, "exteriorColor", 30),
      titleStatus: stringParam(search, "titleStatus", 30),
      sort: (sortOptions.map((option) => option.value) as string[]).includes(sort ?? "")
        ? (sort as Sort)
        : undefined,
      view: view === "list" ? "list" : view === "grid" ? "grid" : undefined,
      page: page > 1 ? page : undefined,
      homeMode: homeMode === "results" ? "results" : homeMode === "landing" ? "landing" : undefined,
      homeTab:
        homeTab === "build" || homeTab === "rent" ? homeTab : homeTab === "buy" ? "buy" : undefined,
      jobMode: jobMode === "results" ? "results" : jobMode === "landing" ? "landing" : undefined,
      serviceMode:
        serviceMode === "results" ? "results" : serviceMode === "landing" ? "landing" : undefined,
      vehicleMode:
        vehicleMode === "results" ? "results" : vehicleMode === "landing" ? "landing" : undefined,
      petMode: petMode === "results" ? "results" : petMode === "landing" ? "landing" : undefined,
      sellerType: stringParam(search, "sellerType", 30),
      mileageBands: stringParam(search, "mileageBands", 300),
      serviceSubcategory: stringParam(search, "serviceSubcategory", 80),
      serviceExpandSearch: stringParam(search, "serviceExpandSearch", 10),
      servicePhotos: stringParam(search, "servicePhotos", 10),
      serviceVideo: stringParam(search, "serviceVideo", 10),
      serviceSellerType: stringParam(search, "serviceSellerType", 30),
      serviceCondition: stringParam(search, "serviceCondition", 30),
      serviceTimeOnSite: stringParam(search, "serviceTimeOnSite", 30),
      serviceArea: stringParam(search, "serviceArea", 200),
      serviceAvailability: stringParam(search, "serviceAvailability", 120),
      serviceLicenseRequired: stringParam(search, "serviceLicenseRequired", 10),
      jobCategory: stringParam(search, "jobCategory", 60),
      jobEmployer: stringParam(search, "jobEmployer", 120),
      jobEmploymentType: undefined,
      jobType:
        normalizeMultiSelect(
          stringParam(search, "jobType", 40) ?? stringParam(search, "jobEmploymentType", 40),
        ) || undefined,
      jobPayType: stringParam(search, "jobPayType", 30),
      jobPayMin: numberParam(search, "jobPayMin"),
      jobPayMax: numberParam(search, "jobPayMax"),
      jobExperience: stringParam(search, "jobExperience", 30),
      jobPosted: stringParam(search, "jobPosted", 30),
      jobEducation: stringParam(search, "jobEducation", 30),
      jobPhotos: stringParam(search, "jobPhotos", 10),
      jobVideo: stringParam(search, "jobVideo", 10),
      jobTimeOnSite: stringParam(search, "jobTimeOnSite", 30),
      homeLocation: stringParam(search, "homeLocation"),
      homePrice: stringParam(search, "homePrice", 30),
      propertyType: stringParam(search, "propertyType", 40),
      bedrooms: stringParam(search, "bedrooms", 30),
      bathrooms: stringParam(search, "bathrooms", 30),
      homeSquareFeet: stringParam(search, "homeSquareFeet", 30),
      homeBuilder: stringParam(search, "homeBuilder", 60),
      constructionType: stringParam(search, "constructionType", 40),
      homeAcres: stringParam(search, "homeAcres", 30),
      homeSellerType: stringParam(search, "homeSellerType", 40),
      petsCats: stringParam(search, "petsCats", 20),
      petsDogs: stringParam(search, "petsDogs", 20),
      homeAmenities: stringParam(search, "homeAmenities", 600),
      communityAmenities: stringParam(search, "communityAmenities", 800),
      leaseLength: stringParam(search, "leaseLength", 30),
      homeYearBuilt: integerParam(search, "homeYearBuilt"),
      homeHeating: stringParam(search, "homeHeating", 80),
      homeCooling: stringParam(search, "homeCooling", 80),
      homeGarageParking: stringParam(search, "homeGarageParking", 120),
      homeYard: stringParam(search, "homeYard", 120),
      homeSchoolDistrict: stringParam(search, "homeSchoolDistrict", 120),
      homeAvailable: stringParam(search, "homeAvailable", 60),
      homePetsPolicy: stringParam(search, "homePetsPolicy", 120),
      homeSmokingPolicy: stringParam(search, "homeSmokingPolicy", 60),
      petSubcategory: normalizePetSubcategory(stringParam(search, "petSubcategory", 80)),
      petSpecies: normalizePetSpecies(stringParam(search, "petSpecies", 40)),
      petBreed: stringParam(search, "petBreed", 100),
      petPlacementType: stringParam(search, "petPlacementType", 30),
      petOfferedBy: stringParam(search, "petOfferedBy", 30),
      petSex: stringParam(search, "petSex", 30),
      petAge: stringParam(search, "petAge", 60),
      petHypoallergenic: stringParam(search, "petHypoallergenic", 20),
      petVaccinated: stringParam(search, "petVaccinated", 20),
      petSpayedNeutered: stringParam(search, "petSpayedNeutered", 20),
      petMicrochipped: stringParam(search, "petMicrochipped", 20),
      petRecordsAvailable: stringParam(search, "petRecordsAvailable", 20),
      petGoodWithKids: stringParam(search, "petGoodWithKids", 20),
      petGoodWithDogs: stringParam(search, "petGoodWithDogs", 20),
      petGoodWithCats: stringParam(search, "petGoodWithCats", 20),
      petIndoorOutdoor: stringParam(search, "petIndoorOutdoor", 30),
      itemDetailKey: stringParam(search, "itemDetailKey", 60),
      itemDetailValue: stringParam(search, "itemDetailValue", 200),
    };
    return normalizeBrowseSearch(parsed);
  },
  head: ({ match }) => {
    const search = match.search as Search;
    const heading = browseHeadHeading(search);
    const title = heading
      ? `${heading} — ${brand.name}`
      : `Browse Idaho classifieds — ${brand.name}`;
    const description = heading
      ? `${heading}: browse listings from local sellers across Idaho and contact them directly on ${brand.name}.`
      : "Search Idaho classifieds by category, region, price, condition, and detailed vehicle filters including make, model, year, mileage, drivetrain, fuel type, and title status.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        // Category pages are indexable; keyword searches, filter combinations
        // and saved-search views are not (followed, never indexed).
        ...(isIndexableBrowse(search) ? [] : [{ name: "robots", content: "noindex, follow" }]),
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(classifiedQuery(inputFromSearch(deps)));
  },
  component: Browse,
  errorComponent: ({ reset }) => (
    <main className="mx-auto max-w-[760px] px-4 py-14 sm:px-6">
      <BluebirdEmptyState
        title="The classifieds did not load"
        description="The connection dropped before the listings finished loading. Nothing was lost — try again."
      >
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-10 items-center rounded-md border border-input px-4 text-[13px] font-semibold hover:bg-secondary"
        >
          Retry
        </button>
      </BluebirdEmptyState>
    </main>
  ),
});

function Browse() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: result } = useSuspenseQuery(classifiedQuery(inputFromSearch(search)));
  const [term, setTerm] = useState(search.q ?? "");
  const [saveSearchDialogOpen, setSaveSearchDialogOpen] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState("");
  const [saveSearchPending, setSaveSearchPending] = useState(false);
  const [pendingSaveSearch, setPendingSaveSearch] = useState<Record<string, unknown> | null>(null);
  const [pendingFilterResultCount, setPendingFilterResultCount] = useState<number | null>(null);
  const [isClearingFilters, setIsClearingFilters] = useState(false);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewRequest = useRef(0);
  const saveSearch = useServerFn(createSavedSearch);
  const updateSearch = useServerFn(updateSavedSearch);

  useEffect(() => setTerm(search.q ?? ""), [search.q]);

  useEffect(() => {
    void trackEvent("page_view", { route: "/browse" });
  }, []);

  useEffect(() => {
    if (!search.q) return;
    void trackEvent(result.total === 0 ? "search_no_results" : "search_performed", {
      term_length: search.q.length,
      results: result.total,
      category: search.category ?? "all",
      region: search.region ?? "all",
    });
    void trackEvent("search_completed", {
      results: result.total,
      category: search.category ?? "all",
      region: search.region ?? "all",
    });
  }, [search.q, search.category, search.region, result.total]);

  const scoped = (patch: Partial<Search>): Search =>
    Object.fromEntries(
      Object.entries({ ...search, ...patch, page: undefined }).filter(
        ([, value]) => value !== undefined && value !== "",
      ),
    ) as Search;

  const clearSearch = (): Search => {
    const preservedKeys: (keyof Search)[] = [
      "allCategories",
      "category",
      "group",
      "homeMode",
      "homeTab",
      "jobMode",
      "serviceMode",
      "vehicleMode",
      "petMode",
      "view",
    ];
    return Object.fromEntries(
      preservedKeys.flatMap((key) => {
        const value = search[key];
        return value !== undefined && value !== "" && value !== false ? [[key, value]] : [];
      }),
    ) as Search;
  };

  async function clearFilters() {
    if (isClearingFilters) return;
    setIsClearingFilters(true);
    try {
      await navigate({ to: "/browse", search: clearSearch() });
    } finally {
      setIsClearingFilters(false);
    }
  }

  const scopedWithoutVehicleFilters = (patch: Partial<Search>): Search =>
    scoped({
      make: undefined,
      model: undefined,
      yearMin: undefined,
      yearMax: undefined,
      mileageMax: undefined,
      mileageBands: undefined,
      bodyStyle: undefined,
      transmission: undefined,
      drivetrain: undefined,
      fuelType: undefined,
      exteriorColor: undefined,
      titleStatus: undefined,
      sellerType: undefined,
      ...patch,
    });

  const selectedCategory = classifiedCategories.find(
    (category) => category.slug === search.category,
  );
  const allCategoriesLanding = search.allCategories === true;
  const motors = search.group === "motors" || isMotorsCategory(search.category);
  const homes = search.category === "other-real-estate";
  const jobs = search.category === "jobs";
  const services = search.category === "services";
  const pets = search.category === "pets";
  const vehicleLanding = motors && search.vehicleMode !== "results";
  const petLanding = pets && search.petMode !== "results";
  const showGenericBrowse =
    !allCategoriesLanding && (!motors || vehicleLanding) && (!pets || !petLanding);
  const homeTab: HomeTab = search.homeTab ?? "buy";
  const homeLanding = homes && search.homeMode !== "results";
  const jobLanding = jobs && search.jobMode !== "results";
  const serviceLanding = services && search.serviceMode !== "results";
  const page = search.page ?? 1;
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  // "Load more" appends the following pages under the current one instead
  // of making shoppers page back and forth. Reset whenever the search changes.
  const queryClient = useQueryClient();
  const searchKey = JSON.stringify({ ...inputFromSearch(search), page: undefined });
  const [extraListings, setExtraListings] = useState<typeof result.listings>([]);
  const [loadedThroughPage, setLoadedThroughPage] = useState(page);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    setExtraListings([]);
    setLoadedThroughPage(page);
  }, [searchKey, page]);
  const shownListings = [...result.listings, ...extraListings];
  const canLoadMore = loadedThroughPage < pageCount;
  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await queryClient.fetchQuery(
        classifiedQuery({ ...inputFromSearch(search), page: loadedThroughPage + 1 }),
      );
      setExtraListings((current) => [...current, ...next.listings]);
      setLoadedThroughPage(next.page);
    } catch {
      toast.error("Could not load more listings.");
    } finally {
      setLoadingMore(false);
    }
  }
  const alertSubject = search.q
    ? `“${search.q}”`
    : (selectedCategory?.name.toLowerCase() ?? (motors ? "vehicles" : "listings"));
  const alertPlace = search.city ? ` near ${search.city}` : "";
  const activeFilterCount = countActiveFilters(search, motors, pets);
  const heading =
    selectedCategory?.name ?? (search.group === "motors" ? "Vehicles" : "All classifieds");
  const noResultsHint = pets
    ? "Try widening the animal, breed, placement type, location, or price filters."
    : homes
      ? "Try widening the price, location, property type, or bedroom filters."
      : jobs
        ? "Try widening the job type, pay range, experience, location, or search terms."
        : services
          ? "Try widening the service type, price, location, availability, or search terms."
          : motors
            ? "Try widening the year, price, mileage, location, or vehicle filters."
            : "Try widening the category, price, condition, location, or search terms.";

  if (isClearingFilters) {
    return (
      <main className="mx-auto max-w-[1400px] px-4 py-10 sm:px-8">
        <div
          role="status"
          aria-live="polite"
          className="floating-card flex min-h-32 items-center justify-center px-5 text-[13px] text-muted-foreground"
        >
          Updating results…
        </div>
      </main>
    );
  }

  function searchPatchFromForm(form: HTMLFormElement): Partial<Search> {
    const values = new FormData(form);
    const value = (key: string) => {
      const raw = values.get(key);
      return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
    };
    const numeric = (key: string) => {
      return optionalNonNegativeNumber(value(key));
    };
    const coordinate = (key: string) => {
      const raw = value(key);
      if (!raw) return undefined;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : undefined;
    };
    const category = value("category");
    const nextMotors = value("group") === "motors" || isMotorsCategory(category);
    const nextPets = category === "pets";
    const nextPetSpecies = nextPets ? normalizePetSpecies(value("petSpecies")) : undefined;
    const nextPetSubcategory = nextPets
      ? normalizePetSubcategory(value("petSubcategory"))
      : undefined;
    const compatiblePetSubcategory = isPetSelectionCompatible(nextPetSpecies, nextPetSubcategory)
      ? nextPetSubcategory
      : undefined;

    return {
      category,
      group: category ? undefined : value("group") === "motors" ? "motors" : undefined,
      state: value("state")?.toUpperCase(),
      region: value("region"),
      city: isPostalCode(value("city") ?? "") ? undefined : value("city"),
      postalCode: isPostalCode(value("city") ?? "") ? value("city") : undefined,
      radiusMiles: isPostalCode(value("city") ?? "")
        ? undefined
        : optionalNonNegativeInteger(value("radiusMiles")),
      latitude: coordinate("latitude"),
      longitude: coordinate("longitude"),
      condition: value("condition"),
      fulfillment: value("fulfillment"),
      priceMin: numeric("priceMin"),
      priceMax: numeric("priceMax"),
      make: nextMotors ? value("make") : undefined,
      model: nextMotors ? value("model") : undefined,
      yearMin: nextMotors ? optionalNonNegativeInteger(value("yearMin")) : undefined,
      yearMax: nextMotors ? optionalNonNegativeInteger(value("yearMax")) : undefined,
      mileageMax: nextMotors ? optionalNonNegativeInteger(value("mileageMax")) : undefined,
      bodyStyle: nextMotors ? value("bodyStyle") : undefined,
      transmission: nextMotors ? value("transmission") : undefined,
      drivetrain: nextMotors ? value("drivetrain") : undefined,
      fuelType: nextMotors ? value("fuelType") : undefined,
      exteriorColor: nextMotors ? value("exteriorColor") : undefined,
      titleStatus: nextMotors ? value("titleStatus") : undefined,
      petMode: nextPets ? "results" : undefined,
      petSubcategory: compatiblePetSubcategory,
      petSpecies: nextPetSpecies,
      petBreed: nextPets && compatiblePetSubcategory ? value("petBreed") : undefined,
      petPlacementType: nextPets ? value("petPlacementType") : undefined,
      petOfferedBy: nextPets ? value("petOfferedBy") : undefined,
      petSex: nextPets ? value("petSex") : undefined,
      petAge: nextPets ? value("petAge") : undefined,
      petHypoallergenic: nextPets ? value("petHypoallergenic") : undefined,
      petVaccinated: nextPets ? value("petVaccinated") : undefined,
      petSpayedNeutered: nextPets ? value("petSpayedNeutered") : undefined,
      petMicrochipped: nextPets ? value("petMicrochipped") : undefined,
      petRecordsAvailable: nextPets ? value("petRecordsAvailable") : undefined,
      petGoodWithKids: nextPets ? value("petGoodWithKids") : undefined,
      petGoodWithDogs: nextPets ? value("petGoodWithDogs") : undefined,
      petGoodWithCats: nextPets ? value("petGoodWithCats") : undefined,
      petIndoorOutdoor: nextPets ? value("petIndoorOutdoor") : undefined,
      itemDetailKey:
        category && itemCategorySlugs.has(category) ? value("itemDetailKey") : undefined,
      itemDetailValue:
        category && itemCategorySlugs.has(category) ? value("itemDetailValue") : undefined,
    };
  }

  function previewFilterResults(form: HTMLFormElement) {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      const requestId = ++previewRequest.current;
      const previewSearch = scoped(searchPatchFromForm(form));
      void browseClassifieds({ data: inputFromSearch(previewSearch) }).then((preview) => {
        if (requestId === previewRequest.current) setPendingFilterResultCount(preview.total);
      });
    }, 250);
  }

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const patch = searchPatchFromForm(event.currentTarget);

    const ranges: [number | undefined, number | undefined, string][] = [
      [patch.priceMin, patch.priceMax, "Price"],
      [patch.yearMin, patch.yearMax, "Year"],
      [patch.jobPayMin, patch.jobPayMax, "Pay"],
    ];
    const invalidRange = ranges.find(([min, max]) => isInvertedRange(min, max));
    if (invalidRange) {
      toast.error(`${invalidRange[2]} minimum cannot exceed maximum.`);
      return;
    }

    void navigate({
      to: "/browse",
      search: scoped(patch),
    });
    setPendingFilterResultCount(null);
  }

  function currentSearchFilters(source: Search = search) {
    return Object.fromEntries(
      savedSearchFilterKeys.flatMap((key) => {
        const value = source[key];
        return value !== undefined && value !== "" ? [[key, value]] : [];
      }),
    );
  }

  function requestSaveSearch(patch: Partial<Search> = {}) {
    const nextSearch = scoped(patch);
    const searchToSave = currentSearchFilters(nextSearch);
    if (search.savedSearchId) {
      void saveCurrentSearch(searchToSave);
      return;
    }
    const suggestedName =
      [selectedCategory?.name, nextSearch.q].filter(Boolean).join(" · ") || "My marketplace search";
    setPendingSaveSearch(searchToSave);
    setSaveSearchName(suggestedName);
    setSaveSearchDialogOpen(true);
  }

  async function saveCurrentSearch(searchToSave = pendingSaveSearch ?? currentSearchFilters()) {
    try {
      if (search.savedSearchId) {
        await updateSearch({ data: { id: search.savedSearchId, search: searchToSave } });
        toast.success("Saved search updated.");
      } else {
        const name = saveSearchName.trim();
        if (!name) return;
        setSaveSearchPending(true);
        await saveSearch({ data: { name, search: searchToSave } });
        setSaveSearchDialogOpen(false);
        setPendingSaveSearch(null);
        toast.success("Saved search created.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sign in to save this search.");
    } finally {
      setSaveSearchPending(false);
    }
  }

  const genericFilters = (
    <form
      key={searchKey}
      onSubmit={applyFilters}
      onInput={(event) => previewFilterResults(event.currentTarget)}
      aria-label="Listing filters"
      className="space-y-6"
    >
      <input type="hidden" name="group" value={search.group ?? ""} />
      <FilterSection title="Category">
        <select name="category" defaultValue={search.category ?? ""} className="filter-input">
          <option value="">All categories</option>
          {classifiedCategories.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.name}
            </option>
          ))}
        </select>
      </FilterSection>

      {search.category && itemCategorySlugs.has(search.category) && (
        <FilterSection title="Category details">
          {search.category === "industrial" ? (
            <>
              <input type="hidden" name="itemDetailKey" value="itemType" />
              <select
                name="itemDetailValue"
                aria-label="Industrial subcategory"
                defaultValue={search.itemDetailValue ?? ""}
                className="filter-input"
              >
                <option value="">All Industrial subcategories</option>
                {industrialSubcategories.map((subcategory) => (
                  <option key={subcategory} value={subcategory}>
                    {subcategory}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <select
                name="itemDetailKey"
                defaultValue={search.itemDetailKey ?? ""}
                className="filter-input"
              >
                <option value="">Any detail</option>
                {fieldsForClassifiedItem(search.category).map((field) => (
                  <option key={field.key} value={field.key}>
                    {field.label}
                  </option>
                ))}
              </select>
              <input
                name="itemDetailValue"
                defaultValue={search.itemDetailValue ?? ""}
                placeholder="Match a detail value"
                className="filter-input"
                maxLength={200}
              />
            </>
          )}
        </FilterSection>
      )}

      <FilterSection title="Location" icon={<MapPin size={13} className="text-primary" />}>
        <BrowseLocationFields search={search} />
      </FilterSection>

      <FilterSection title="Price">
        <div className="grid grid-cols-2 gap-2">
          <input
            name="priceMin"
            type="number"
            min="0"
            step="1"
            defaultValue={search.priceMin ?? ""}
            placeholder="Min"
            className="filter-input"
          />
          <input
            name="priceMax"
            type="number"
            min="0"
            step="1"
            defaultValue={search.priceMax ?? ""}
            placeholder="Max"
            className="filter-input"
          />
        </div>
      </FilterSection>

      <FilterSection title="Condition and fulfillment">
        <select name="condition" defaultValue={search.condition ?? ""} className="filter-input">
          <option value="">Any condition</option>
          {conditionOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select name="fulfillment" defaultValue={search.fulfillment ?? ""} className="filter-input">
          <option value="">Any fulfillment</option>
          <option value="local_pickup">Local pickup</option>
          <option value="shipping">Ships</option>
          <option value="both">Pickup or shipping</option>
        </select>
      </FilterSection>

      {pets && (
        <FilterSection title="Pet details">
          <select
            name="petSubcategory"
            defaultValue={search.petSubcategory ?? ""}
            className="filter-input"
            onChange={(event) => {
              const form = event.currentTarget.form;
              const species = form?.elements.namedItem("petSpecies") as HTMLSelectElement | null;
              const breed = form?.elements.namedItem("petBreed") as HTMLInputElement | null;
              if (species && !isPetSelectionCompatible(species.value, event.currentTarget.value))
                species.value = "";
              if (breed) breed.value = "";
            }}
          >
            <option value="">All pet categories</option>
            {petSubcategories.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            name="petSpecies"
            defaultValue={search.petSpecies ?? ""}
            className="filter-input"
            onChange={(event) => {
              const species = normalizePetSpecies(event.currentTarget.value);
              const form = event.currentTarget.form;
              const subcategory = form?.elements.namedItem(
                "petSubcategory",
              ) as HTMLSelectElement | null;
              const breed = form?.elements.namedItem("petBreed") as HTMLInputElement | null;
              if (subcategory && !isPetSelectionCompatible(species, subcategory.value))
                subcategory.value = "";
              if (breed) breed.value = "";
            }}
          >
            <option value="">Any animal</option>
            {petSpecies.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <input
            name="petBreed"
            defaultValue={search.petBreed ?? ""}
            placeholder="Breed"
            className="filter-input"
            maxLength={100}
          />
          <select
            name="petPlacementType"
            defaultValue={search.petPlacementType ?? ""}
            className="filter-input"
          >
            <option value="">Any listing type</option>
            {petPlacementTypes.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            name="petOfferedBy"
            defaultValue={search.petOfferedBy ?? ""}
            className="filter-input"
          >
            <option value="">Any offered by</option>
            {petOfferedBy.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select name="petSex" defaultValue={search.petSex ?? ""} className="filter-input">
            <option value="">Any sex</option>
            {petSexes.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <input
            name="petAge"
            defaultValue={search.petAge ?? ""}
            placeholder="Age or age range"
            className="filter-input"
            maxLength={60}
          />
          {(
            [
              ["petHypoallergenic", "Hypoallergenic"],
              ["petVaccinated", "Vaccinated"],
              ["petSpayedNeutered", "Spayed / neutered"],
              ["petMicrochipped", "Microchipped"],
              ["petRecordsAvailable", "Records available"],
              ["petGoodWithKids", "Good with children"],
              ["petGoodWithDogs", "Good with dogs"],
              ["petGoodWithCats", "Good with cats"],
            ] as const
          ).map(([name, label]) => (
            <select
              key={name}
              name={name}
              defaultValue={search[name as keyof Search] as string | undefined}
              className="filter-input"
            >
              <option value="">Any {label.toLowerCase()}</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
              <option value="Unknown">Unknown</option>
            </select>
          ))}
          <select
            name="petIndoorOutdoor"
            defaultValue={search.petIndoorOutdoor ?? ""}
            className="filter-input"
          >
            <option value="">Any indoor / outdoor</option>
            <option value="Indoor">Indoor</option>
            <option value="Outdoor">Outdoor</option>
            <option value="Indoor / outdoor">Indoor / outdoor</option>
            <option value="Unknown">Unknown</option>
          </select>
        </FilterSection>
      )}

      {motors && (
        <FilterSection title="Vehicle details">
          <input
            list="vehicle-makes"
            name="make"
            defaultValue={search.make ?? ""}
            placeholder="Make / brand"
            className="filter-input"
            maxLength={80}
          />
          <datalist id="vehicle-makes">
            {vehicleOptions.makes.map((make) => (
              <option key={make} value={make} />
            ))}
          </datalist>
          <input
            name="model"
            defaultValue={search.model ?? ""}
            placeholder="Model"
            className="filter-input"
            maxLength={80}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              name="yearMin"
              type="number"
              min="1900"
              max="2100"
              step="1"
              defaultValue={search.yearMin ?? ""}
              placeholder="Year from"
              className="filter-input"
            />
            <input
              name="yearMax"
              type="number"
              min="1900"
              max="2100"
              step="1"
              defaultValue={search.yearMax ?? ""}
              placeholder="Year to"
              className="filter-input"
            />
          </div>
          <input
            name="mileageMax"
            type="number"
            min="0"
            step="1000"
            defaultValue={search.mileageMax ?? ""}
            placeholder="Max mileage"
            className="filter-input"
          />
          <select name="bodyStyle" defaultValue={search.bodyStyle ?? ""} className="filter-input">
            <option value="">Any body style</option>
            {vehicleOptions.bodyStyles.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select name="drivetrain" defaultValue={search.drivetrain ?? ""} className="filter-input">
            <option value="">Any drivetrain</option>
            {vehicleOptions.drivetrains.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            name="transmission"
            defaultValue={search.transmission ?? ""}
            className="filter-input"
          >
            <option value="">Any transmission</option>
            {vehicleOptions.transmissions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select name="fuelType" defaultValue={search.fuelType ?? ""} className="filter-input">
            <option value="">Any fuel type</option>
            {vehicleOptions.fuelTypes.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            name="exteriorColor"
            defaultValue={search.exteriorColor ?? ""}
            className="filter-input"
          >
            <option value="">Any exterior color</option>
            {vehicleOptions.exteriorColors.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            name="titleStatus"
            defaultValue={search.titleStatus ?? ""}
            className="filter-input"
          >
            <option value="">Any title status</option>
            {vehicleOptions.titleStatuses.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </FilterSection>
      )}

      <button
        type="button"
        onClick={() => void clearFilters()}
        className="text-sm font-semibold text-primary underline underline-offset-4"
      >
        Clear filters
      </button>
      <div className="mt-2 grid gap-2">
        <button
          type="submit"
          className="inline-flex h-12 w-full items-center justify-center rounded-full bg-primary px-3 text-[13px] font-semibold text-primary-foreground shadow-sm hover:opacity-90"
        >
          {pendingFilterResultCount == null ? (
            <>
              Show {result.total} {result.total === 1 ? "listing" : "listings"}
            </>
          ) : (
            <>
              Show {pendingFilterResultCount}{" "}
              {pendingFilterResultCount === 1 ? "listing" : "listings"}
            </>
          )}
        </button>
        <button
          type="button"
          onClick={(event) => {
            const form = event.currentTarget.form;
            if (form) requestSaveSearch(searchPatchFromForm(form));
          }}
          className="inline-flex h-12 items-center justify-center rounded-full border border-primary px-5 text-[13px] font-semibold text-primary hover:bg-secondary"
        >
          {search.savedSearchId ? "Update saved search" : "Save this search"}
        </button>
      </div>
    </form>
  );
  const homeFilters = homes && !homeLanding && (
    <HomesFilterPage
      activeTab={homeTab}
      search={search}
      resultCount={result.total}
      onClear={clearFilters}
      onTabChange={(tab) =>
        void navigate({
          to: "/browse",
          search: scoped({
            category: "other-real-estate",
            homeTab: tab,
            homeMode: "results",
            homeSquareFeet: undefined,
            homeAcres: undefined,
            homeYearBuilt: undefined,
            homeHeating: undefined,
            homeCooling: undefined,
            homeGarageParking: undefined,
            homeYard: undefined,
            homeSchoolDistrict: undefined,
            homeAvailable: undefined,
            homePetsPolicy: undefined,
            homeSmokingPolicy: undefined,
            leaseLength: undefined,
          }),
        })
      }
      onApply={(patch) =>
        void navigate({
          to: "/browse",
          search: scoped({
            category: "other-real-estate",
            homeTab,
            homeMode: "results",
            ...patch,
          }),
        })
      }
      onSave={(patch) => requestSaveSearch(patch)}
    />
  );

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-10 sm:px-8">
      {allCategoriesLanding && (
        <>
          <ClassifiedsLandingHero
            term={term}
            onTermChange={setTerm}
            onSearch={() =>
              void navigate({
                to: "/browse",
                search: scoped({ allCategories: undefined, q: term.trim() || undefined }),
              })
            }
          />
          <GeneralClassifiedShowcase listings={result.listings} />
          <HomepageShowcaseRows
            eyebrow="Bluebird Marketplace Classifieds"
            rows={classifiedShowcaseRows}
          />
        </>
      )}

      {motors && vehicleLanding && (
        <VehicleBrowseHero
          search={search}
          resultCount={result.total}
          activeFilterCount={activeFilterCount}
          term={term}
          onTermChange={setTerm}
          onSearch={() =>
            void navigate({
              to: "/browse",
              search: scoped({ q: term.trim() || undefined, vehicleMode: "results" }),
            })
          }
          onFilterChange={(patch) => void navigate({ to: "/browse", search: scoped(patch) })}
          onSell={() => void navigate({ to: "/create-listing" })}
        />
      )}

      {pets && petLanding && (
        <PetsLandingHero
          term={term}
          onTermChange={setTerm}
          onSearch={() =>
            void navigate({
              to: "/browse",
              search: scoped({ petMode: "results", q: term.trim() || undefined }),
            })
          }
          onCategory={(subcategory) =>
            void navigate({
              to: "/browse",
              search: scoped({ petMode: "results", petSubcategory: subcategory }),
            })
          }
          onPost={() => void navigate({ to: "/create-listing" })}
        />
      )}

      {pets && petLanding && (
        <>
          <LandingListingsShowcase
            eyebrow="Bluebird Marketplace Pets"
            title="Latest pet listings"
            action="Browse all pets"
            browseSearch={{ category: "pets", petMode: "results" }}
            listings={result.listings}
          />
          <HomepageShowcaseRows eyebrow="Bluebird Marketplace Pets" rows={petShowcaseRows} />
        </>
      )}

      {motors && vehicleLanding && (
        <>
          <LandingListingsShowcase
            eyebrow="Bluebird Marketplace Motors"
            title="Latest vehicles"
            action="Browse all vehicles"
            browseSearch={{ group: "motors", vehicleMode: "results" }}
            listings={result.listings}
          />
          <HomepageShowcaseRows eyebrow="Bluebird Marketplace Motors" rows={vehicleShowcaseRows} />
        </>
      )}

      {motors && !vehicleLanding && (
        <VehicleResultsPage
          search={search}
          result={result}
          onClear={clearFilters}
          onApply={(patch) =>
            void navigate({ to: "/browse", search: scoped({ vehicleMode: "results", ...patch }) })
          }
          onSave={(patch) => requestSaveSearch(patch)}
          onSell={() => void navigate({ to: "/create-listing" })}
        />
      )}

      {homeLanding && (
        <HomesLandingHero
          activeTab={homeTab}
          location={search.homeLocation ?? search.q ?? ""}
          resultCount={result.total}
          onTabChange={(tab) =>
            void navigate({
              to: "/browse",
              search: scoped({ category: "other-real-estate", homeTab: tab, homeMode: "landing" }),
            })
          }
          onSearch={(location) =>
            void navigate({
              to: "/browse",
              search: scoped({
                category: "other-real-estate",
                homeTab,
                homeMode: "results",
                q: location.trim() || undefined,
                homeLocation: location.trim() || undefined,
              }),
            })
          }
          onMoreFilters={() =>
            void navigate({
              to: "/browse",
              search: scoped({ category: "other-real-estate", homeTab, homeMode: "results" }),
            })
          }
        />
      )}

      {homeLanding && (
        <>
          <LandingListingsShowcase
            eyebrow="Bluebird Marketplace Homes"
            title={`${homeTab.charAt(0).toUpperCase()}${homeTab.slice(1)} listings`}
            action="Browse all homes"
            browseSearch={{
              category: "other-real-estate",
              homeMode: "results",
              homeTab,
            }}
            listings={result.listings}
          />
          <HomeShowcaseRows activeTab={homeTab} />
        </>
      )}

      {jobs && jobLanding && (
        <JobsLandingHero
          search={search}
          resultCount={result.total}
          onSearch={(patch) =>
            void navigate({
              to: "/browse",
              search: scoped({ category: "jobs", jobMode: "results", ...patch }),
            })
          }
          onMoreFilters={(patch) =>
            void navigate({
              to: "/browse",
              search: scoped({ category: "jobs", jobMode: "results", ...patch }),
            })
          }
          onPost={() => void navigate({ to: "/create-listing" })}
        />
      )}

      {jobs && jobLanding && (
        <>
          <LandingListingsShowcase
            eyebrow="Bluebird Marketplace Jobs"
            title="Latest local jobs"
            action="Browse all jobs"
            browseSearch={{ category: "jobs", jobMode: "results" }}
            listings={result.listings}
          />
          <HomepageShowcaseRows eyebrow="Bluebird Marketplace Jobs" rows={jobsShowcaseRows} />
        </>
      )}

      {jobs && !jobLanding && (
        <JobsFilterPage
          search={search}
          listings={result.listings}
          total={result.total}
          onClear={clearFilters}
          onApply={(patch) =>
            void navigate({
              to: "/browse",
              search: scoped({ category: "jobs", jobMode: "results", ...patch }),
            })
          }
          onSave={(patch) => requestSaveSearch(patch)}
          onPost={() => void navigate({ to: "/create-listing" })}
        />
      )}

      {services && serviceLanding && (
        <ServicesLandingHero
          resultCount={result.total}
          onSearch={(subcategory) =>
            void navigate({
              to: "/browse",
              search: scoped({
                category: "services",
                serviceMode: "results",
                q: undefined,
                serviceSubcategory: subcategory || undefined,
              }),
            })
          }
          onPost={() => void navigate({ to: "/create-listing" })}
        />
      )}

      {services && serviceLanding && (
        <>
          <LandingListingsShowcase
            eyebrow="Bluebird Marketplace Services"
            title="Latest local services"
            action="Browse all services"
            browseSearch={{ category: "services", serviceMode: "results" }}
            listings={result.listings}
          />
          <HomepageShowcaseRows
            eyebrow="Bluebird Marketplace Services"
            rows={servicesShowcaseRows}
          />
        </>
      )}

      {services && !serviceLanding && (
        <ServicesFilterPage
          search={search}
          listings={result.listings}
          total={result.total}
          onClear={clearFilters}
          onApply={(patch) =>
            void navigate({
              to: "/browse",
              search: scoped({ category: "services", serviceMode: "results", ...patch }),
            })
          }
          onSave={(patch) => requestSaveSearch(patch)}
          onPost={() => void navigate({ to: "/create-listing" })}
        />
      )}

      {services && serviceLanding && (
        <ServicesCategoryShowcase
          onCategorySelect={(category) =>
            void navigate({
              to: "/browse",
              search: scoped({
                category: "services",
                serviceMode: "results",
                q: undefined,
                serviceSubcategory: category,
              }),
            })
          }
        />
      )}

      <div
        className={`flex flex-wrap items-end justify-between gap-3 ${motors || homes || jobs || services ? "mt-7" : ""} ${homes || jobs || services || serviceLanding || !showGenericBrowse ? "hidden" : ""}`}
      >
        <div className={motors ? "hidden" : ""}>
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-primary">
            Bluebird classifieds
          </p>
          <h1 className="mt-2 text-[30px] font-bold tracking-tight">{heading}</h1>
          <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-muted-foreground">
            Local listings from sellers across Idaho.
          </p>
        </div>
      </div>

      {!allCategoriesLanding && !motors && !homes && !jobs && !services && !pets && (
        <form
          className="floating-card mt-8 p-2 sm:p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void navigate({ to: "/browse", search: scoped({ q: term.trim() || undefined }) });
          }}
        >
          <label className="relative block">
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search cars, tools, furniture, and more"
              aria-label="Search classifieds"
              className="h-12 w-full rounded-full border-0 bg-transparent pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none"
            />
          </label>
        </form>
      )}

      {!allCategoriesLanding && !motors && !homes && !jobs && !services && !pets && (
        <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto pb-1">
          <BrowsePill
            active={!search.group && !search.category}
            search={scopedWithoutVehicleFilters({ group: undefined, category: undefined })}
          >
            All listings
          </BrowsePill>
          <BrowsePill
            active={search.group === "motors" || motors}
            search={scoped({ group: "motors", category: undefined })}
          >
            Vehicles
          </BrowsePill>
          {classifiedCategories
            .filter((category) => category.group === "classifieds")
            .map((category) => (
              <BrowsePill
                key={category.slug}
                active={search.category === category.slug}
                search={scopedWithoutVehicleFilters({ category: category.slug, group: undefined })}
              >
                {category.name}
              </BrowsePill>
            ))}
        </div>
      )}

      {!jobs && !services && showGenericBrowse && (
        <div
          className={`${motors || homes ? "mt-6" : "mt-8"} ${homeLanding ? "hidden" : ""} ${!motors ? "grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-8" : ""}`}
        >
          {!motors && !homeLanding && (
            <ResponsiveBrowseFilters
              title={homes ? "Home filters" : "Filter listings"}
              activeCount={activeFilterCount}
              resetKey={searchKey}
            >
              {homes ? homeFilters : genericFilters}
            </ResponsiveBrowseFilters>
          )}
          <div className={`min-w-0 ${!motors ? "lg:col-start-2" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              {!motors && !homes && (
                <div className="flex w-full flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor="sort">
                    Sort
                  </label>
                  <select
                    id="sort"
                    value={search.sort ?? "newest"}
                    onChange={(event) =>
                      void navigate({
                        to: "/browse",
                        search: scoped({ sort: event.target.value as Sort }),
                      })
                    }
                    className="select-chevron h-11 rounded-full border border-input bg-card pl-4 pr-8 text-[13px] font-medium shadow-sm"
                  >
                    {sortOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <Link
                    to="/browse"
                    search={scoped({ view: "grid" })}
                    aria-label="Grid view"
                    className={`hidden h-11 items-center rounded-full border px-4 text-[12px] sm:inline-flex ${search.view !== "list" ? "border-primary bg-accent font-semibold" : "border-input"}`}
                  >
                    Grid
                  </Link>
                  <Link
                    to="/browse"
                    search={scoped({ view: "list" })}
                    aria-label="List view"
                    className={`hidden h-11 items-center rounded-full border px-4 text-[12px] sm:inline-flex ${search.view === "list" ? "border-primary bg-accent font-semibold" : "border-input"}`}
                  >
                    List
                  </Link>
                  {search.savedSearchId ? (
                    <button
                      type="button"
                      onClick={() => requestSaveSearch()}
                      className="inline-flex h-11 items-center gap-2 rounded-full border border-primary bg-card px-5 text-[13px] font-semibold text-primary shadow-sm"
                    >
                      <BookmarkSimple size={17} />
                      Update saved search
                    </button>
                  ) : null}
                </div>
              )}
            </div>

            <section id="results" className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className={motors ? "hidden" : "text-[12.5px] text-muted-foreground"}>
                  <span className="numeric">{result.total}</span>{" "}
                  {result.total === 1 ? "listing" : "listings"}
                  {search.q ? <span> matching “{search.q}”</span> : null}
                </p>
                {activeFilterCount > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {activeFilterLabels(search, motors, pets).map((label) => (
                      <span
                        key={label}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-1 text-[10.5px] text-muted-foreground"
                      >
                        {label}
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() => void clearFilters()}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10.5px] font-medium text-primary hover:bg-accent"
                    >
                      <X size={11} /> Clear
                    </button>
                  </div>
                )}
              </div>

              {result.listings.length === 0 ? (
                <BluebirdEmptyState
                  className="mt-5"
                  title="No listings match these filters."
                  description={noResultsHint}
                >
                  <Link
                    to="/browse"
                    search={clearSearch()}
                    className="inline-flex h-9 items-center rounded-md border border-input px-3 text-[12px] font-semibold hover:bg-secondary"
                  >
                    Clear filters
                  </Link>
                </BluebirdEmptyState>
              ) : search.view === "list" ? (
                <ul className="mt-5 space-y-4">
                  {shownListings.map((listing) => (
                    <li key={listing.id}>
                      <ListingRow listing={listing} />
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3 xl:grid-cols-3">
                  {shownListings.map((listing) => (
                    <li key={listing.id}>
                      <ListingCard listing={listing} />
                    </li>
                  ))}
                </ul>
              )}

              {result.listings.length > 0 && (
                <div className="mt-8 flex flex-col items-center gap-2">
                  <p className="numeric text-[12.5px] text-muted-foreground">
                    Showing {shownListings.length.toLocaleString()} of{" "}
                    {result.total.toLocaleString()}
                  </p>
                  {canLoadMore ? (
                    <button
                      type="button"
                      onClick={() => void loadMore()}
                      disabled={loadingMore}
                      className="inline-flex h-11 items-center rounded-full border border-input bg-card px-6 text-[13.5px] font-semibold shadow-sm disabled:opacity-60"
                    >
                      {loadingMore ? "Loading…" : "Load more"}
                    </button>
                  ) : null}
                </div>
              )}

              {/* Offer alerts once the shopper has seen results, not before. */}
              {result.listings.length > 0 && !search.savedSearchId ? (
                <div className="soft-card mt-8 flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[15px] font-semibold">
                      Get alerts for new {alertSubject}
                      {alertPlace}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                      We'll let you know when something new matches this search.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => requestSaveSearch()}
                    className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-5 text-[13.5px] font-semibold text-primary-foreground"
                  >
                    <BookmarkSimple size={17} />
                    Turn on alerts
                  </button>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      )}
      <SavedSearchNameDialog
        open={saveSearchDialogOpen}
        name={saveSearchName}
        mode="create"
        pending={saveSearchPending}
        onOpenChange={(open) => {
          setSaveSearchDialogOpen(open);
          if (!open) setPendingSaveSearch(null);
        }}
        onNameChange={setSaveSearchName}
        onSubmit={() => void saveCurrentSearch()}
      />
    </main>
  );
}

function PetsLandingHero({
  term,
  onTermChange,
  onSearch,
  onCategory,
  onPost,
}: {
  term: string;
  onTermChange: (value: string) => void;
  onSearch: () => void;
  onCategory: (subcategory: string) => void;
  onPost: () => void;
}) {
  const quickCategories = [
    { slug: "dogs", label: "Dogs" },
    { slug: "cats", label: "Cats" },
    { slug: "birds", label: "Birds" },
    { slug: "fish", label: "Fish" },
    { slug: "rabbits", label: "Rabbits" },
    { slug: "reptiles", label: "Reptiles" },
    { slug: "other-pets", label: "Other pets" },
  ];

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-border/70 bg-gradient-to-br from-secondary via-card to-accent/20 px-5 py-9 shadow-sm sm:px-10 sm:py-12">
      <span className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-brand-warm/20" />
      <span className="absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-primary/5" />
      <div className="relative mx-auto max-w-3xl text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
          Bluebird Marketplace Pets
        </p>
        <h1 className="mt-3 text-[34px] font-bold tracking-tight sm:text-[48px]">
          Find the right pet for your home.
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-[14px] leading-7 text-muted-foreground sm:text-[16px]">
          Browse local pets, supplies, and rehoming listings with filters for the animal, breed,
          placement type, and seller.
        </p>
        <form
          className="mx-auto mt-7 flex max-w-2xl flex-col gap-2 rounded-2xl border border-border/70 bg-card p-2 shadow-md sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch();
          }}
        >
          <label className="relative min-w-0 flex-1">
            <MagnifyingGlass
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-primary"
            />
            <input
              type="search"
              value={term}
              onChange={(event) => onTermChange(event.target.value)}
              placeholder="Search dogs, cats, birds, breeders, and more"
              aria-label="Search pets"
              className="h-12 w-full rounded-xl bg-transparent pl-11 pr-3 text-[14px] outline-none placeholder:text-muted-foreground"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-[13px] font-semibold text-primary-foreground hover:opacity-90"
          >
            <MagnifyingGlass size={16} /> Search pets
          </button>
        </form>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {quickCategories.map((category) => (
            <button
              key={category.slug}
              type="button"
              onClick={() => onCategory(category.slug)}
              className="rounded-full border border-border bg-card/80 px-3.5 py-2 text-[12px] font-semibold text-foreground transition hover:border-primary hover:text-primary"
            >
              {category.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onPost}
          className="mt-6 inline-flex h-10 items-center gap-2 rounded-full border border-primary px-5 text-[12px] font-semibold text-primary hover:bg-primary/10"
        >
          Post a pet listing <ArrowRight size={15} />
        </button>
      </div>
    </section>
  );
}

const generalCategoryHighlights = [
  { slug: "furniture", name: "Furniture", description: "Home pieces and decor" },
  { slug: "electronics", name: "Electronics", description: "Devices, audio, and gear" },
  { slug: "tools-equipment", name: "Tools & Equipment", description: "Workshop and jobsite finds" },
  {
    slug: "outdoor-sporting",
    name: "Outdoor & Sporting",
    description: "Gear for your next outing",
  },
  { slug: "farm-garden", name: "Farm & Garden", description: "Yard, farm, and garden" },
  { slug: "general", name: "General", description: "Everyday local finds" },
] as const;

const petShowcaseRows: HomepagePreviewRow[] = [
  {
    title: "Pets and companions near you",
    action: "Browse all pets",
    href: "/browse?category=pets&petMode=results",
    cards: [],
  },
];

type HomepagePreviewCard = {
  title: string;
  location: string;
  price: string;
  detail: string;
  image: string;
};

type HomepagePreviewRow = {
  title: string;
  action: string;
  href: string;
  cards: HomepagePreviewCard[];
};

function previewCard(
  title: string,
  location: string,
  price: string,
  detail: string,
  image: string,
  _badge?: string,
): HomepagePreviewCard & { name: string; facts: string } {
  return {
    title,
    name: title,
    location,
    price,
    detail,
    facts: detail,
    image,
  };
}

function showcaseRow(
  title: string,
  action: string,
  href: string,
  cards: (HomepagePreviewCard & { name: string; facts: string })[],
): HomepagePreviewRow & {
  cards: (HomepagePreviewCard & { name: string; facts: string })[];
} {
  return { title, action, href, cards };
}

const classifiedShowcaseRows: HomepagePreviewRow[] = [
  {
    title: "Popular near you",
    action: "See popular listings",
    href: "/browse?allCategories=true",
    cards: [],
  },
  {
    title: "Holiday & seasonal finds",
    action: "Browse seasonal finds",
    href: "/browse?category=general",
    cards: [],
  },
  {
    title: "Clothing & accessories",
    action: "Shop clothing",
    href: "/browse?category=general&q=clothing",
    cards: [],
  },
  {
    title: "Recently discounted",
    action: "See all price drops",
    href: "/browse?allCategories=true&sort=price_low",
    cards: [],
  },
  showcaseRow("Furniture & home refresh", "Shop furniture", "/browse?category=furniture", []),
  showcaseRow("Electronics & gaming", "Browse electronics", "/browse?category=electronics", []),
  showcaseRow("Outdoor & recreation", "Shop outdoor gear", "/browse?category=outdoor-sporting", []),
  showcaseRow("Tools & shop equipment", "Find tools", "/browse?category=tools-equipment", []),
  showcaseRow("Farm & garden finds", "Browse farm and garden", "/browse?category=farm-garden", []),
];

const vehicleShowcaseRows: HomepagePreviewRow[] = [
  {
    title: "Popular cars & trucks",
    action: "See popular vehicles",
    href: "/browse?group=motors&vehicleMode=results",
    cards: [],
  },
  {
    title: "Adventure-ready rides",
    action: "Explore outdoor vehicles",
    href: "/browse?group=motors&vehicleMode=results&bodyStyle=SUV||Truck",
    cards: [],
  },
  {
    title: "Just reduced",
    action: "See vehicle price drops",
    href: "/browse?group=motors&vehicleMode=results&sort=price_low",
    cards: [],
  },
  showcaseRow(
    "Fuel-efficient commuters",
    "Shop efficient cars",
    "/browse?group=motors&vehicleMode=results&fuelType=Hybrid||Electric",
    [],
  ),
  showcaseRow(
    "Family SUVs & crossovers",
    "Find family SUVs",
    "/browse?group=motors&vehicleMode=results&bodyStyle=SUV",
    [],
  ),
  showcaseRow(
    "Work trucks & vans",
    "Shop work-ready vehicles",
    "/browse?group=motors&vehicleMode=results&bodyStyle=Truck||Van",
    [],
  ),
  showcaseRow(
    "RVs, campers & trailers",
    "Explore campers and trailers",
    "/browse?group=motors&vehicleMode=results&bodyStyle=RV||Trailer",
    [],
  ),
  showcaseRow(
    "Motorcycles & powersports",
    "Shop powersports",
    "/browse?group=motors&vehicleMode=results&bodyStyle=Motorcycle||ATV",
    [],
  ),
  showcaseRow(
    "Cars under $20,000",
    "Find affordable cars",
    "/browse?group=motors&vehicleMode=results&priceMax=20000",
    [],
  ),
  showcaseRow(
    "Late-model local vehicles",
    "Browse newer vehicles",
    "/browse?group=motors&vehicleMode=results&yearMin=2022",
    [],
  ),
  showcaseRow(
    "Classic & enthusiast vehicles",
    "Explore classic rides",
    "/browse?group=motors&vehicleMode=results",
    [],
  ),
  showcaseRow(
    "Three-row family vehicles",
    "Find three-row vehicles",
    "/browse?group=motors&vehicleMode=results",
    [],
  ),
  showcaseRow(
    "AWD & winter-ready rides",
    "Shop all-weather vehicles",
    "/browse?group=motors&vehicleMode=results&drivetrain=AWD||4WD",
    [],
  ),
];

const jobsShowcaseRows: HomepagePreviewRow[] = [
  {
    title: "New opportunities",
    action: "See newest jobs",
    href: "/browse?category=jobs&jobMode=results",
    cards: [],
  },
  {
    title: "Part-time & flexible",
    action: "Find flexible work",
    href: "/browse?category=jobs&jobMode=results&jobType=Part-time",
    cards: [],
  },
  {
    title: "Skilled trades & hands-on work",
    action: "Browse skilled trades",
    href: "/browse?category=jobs&jobMode=results&jobCategory=Construction",
    cards: [],
  },
  showcaseRow(
    "Healthcare & caregiving",
    "Browse healthcare jobs",
    "/browse?category=jobs&jobMode=results&jobCategory=Healthcare",
    [],
  ),
  showcaseRow(
    "Hospitality & food service",
    "Find hospitality jobs",
    "/browse?category=jobs&jobMode=results&jobCategory=Hospitality",
    [],
  ),
  showcaseRow(
    "Office & administrative",
    "Browse office jobs",
    "/browse?category=jobs&jobMode=results&jobCategory=Administrative",
    [],
  ),
  showcaseRow(
    "Sales & customer experience",
    "Find sales jobs",
    "/browse?category=jobs&jobMode=results&jobCategory=Retail",
    [],
  ),
  showcaseRow(
    "Education & childcare",
    "Browse education jobs",
    "/browse?category=jobs&jobMode=results&jobCategory=Education",
    [],
  ),
  showcaseRow(
    "Remote-friendly roles",
    "Find flexible remote work",
    "/browse?category=jobs&jobMode=results",
    [],
  ),
  showcaseRow(
    "Seasonal & event work",
    "Find seasonal jobs",
    "/browse?category=jobs&jobMode=results&jobType=Seasonal",
    [],
  ),
  showcaseRow(
    "Finance & accounting",
    "Browse finance jobs",
    "/browse?category=jobs&jobMode=results&jobCategory=Accounting%20%26%20Finance",
    [],
  ),
  showcaseRow(
    "Transportation & delivery",
    "Find driving jobs",
    "/browse?category=jobs&jobMode=results",
    [],
  ),
  showcaseRow(
    "Engineering & technical",
    "Browse technical jobs",
    "/browse?category=jobs&jobMode=results&jobCategory=Architecture%20%26%20Engineering",
    [],
  ),
];

const servicesShowcaseRows: HomepagePreviewRow[] = [
  {
    title: "Recently added pros",
    action: "See newest service listings",
    href: "/browse?category=services&serviceMode=results",
    cards: [],
  },
  {
    title: "Popular with neighbors",
    action: "Browse popular pros",
    href: "/browse?category=services&serviceMode=results",
    cards: [],
  },
  {
    title: "Projects to plan this season",
    action: "Find a local pro",
    href: "/browse?category=services&serviceMode=results",
    cards: [],
  },
  showcaseRow(
    "Plumbing & water",
    "Find a plumber",
    "/browse?category=services&serviceMode=results&serviceSubcategory=Plumbing",
    [],
  ),
  showcaseRow(
    "Electrical & lighting",
    "Find an electrician",
    "/browse?category=services&serviceMode=results&serviceSubcategory=Electricians",
    [],
  ),
  showcaseRow(
    "Lawn & landscaping",
    "Find lawn care",
    "/browse?category=services&serviceMode=results&serviceSubcategory=Landscape Contractors",
    [],
  ),
  showcaseRow(
    "Cleaning & move-out",
    "Find a cleaner",
    "/browse?category=services&serviceMode=results&serviceSubcategory=House Cleaning",
    [],
  ),
  showcaseRow(
    "Automotive & mobile repair",
    "Find auto service",
    "/browse?category=services&serviceMode=results&serviceSubcategory=Automotive",
    [],
  ),
  showcaseRow(
    "Home improvement pros",
    "Plan a home project",
    "/browse?category=services&serviceMode=results",
    [],
  ),
  showcaseRow(
    "Technology & business help",
    "Find local tech help",
    "/browse?category=services&serviceMode=results",
    [],
  ),
  showcaseRow(
    "Moving & hauling",
    "Find movers",
    "/browse?category=services&serviceMode=results&serviceSubcategory=Movers",
    [],
  ),
  showcaseRow(
    "Pet care & family help",
    "Find local care",
    "/browse?category=services&serviceMode=results",
    [],
  ),
  showcaseRow(
    "Roofing & exterior work",
    "Find exterior pros",
    "/browse?category=services&serviceMode=results",
    [],
  ),
];

function ClassifiedsLandingHero({
  term,
  onTermChange,
  onSearch,
}: {
  term: string;
  onTermChange: (value: string) => void;
  onSearch: () => void;
}) {
  return (
    <section
      aria-label="Bluebird Marketplace all classifieds"
      className="classifieds-hero-shell relative isolate flex min-h-[430px] flex-col justify-center overflow-hidden rounded-[32px] border border-brand-blue/20 bg-secondary px-5 pb-8 pt-20 shadow-xl sm:px-10 sm:pb-12 sm:pt-20"
    >
      <span
        className="classifieds-hero-orb classifieds-hero-orb--blue absolute -right-20 -top-24 h-72 w-72 rounded-full bg-brand-blue/12"
        aria-hidden="true"
      />
      <span
        className="classifieds-hero-orb classifieds-hero-orb--warm absolute -bottom-36 left-1/3 h-80 w-80 rounded-full bg-brand-warm/18"
        aria-hidden="true"
      />
      <span
        className="classifieds-hero-sheen pointer-events-none absolute inset-y-0 -left-1/3 z-0 w-1/3 skew-x-[-18deg] bg-white/20"
        aria-hidden="true"
      />
      <div className="absolute right-5 top-5 z-20 sm:right-10 sm:top-6">
        <SponsoredHeroBadge />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-[920px] text-center">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
          Bluebird Marketplace Classifieds
        </p>
        <h1 className="mx-auto mt-3 max-w-[22ch] text-[36px] font-bold leading-[1.05] tracking-tight sm:text-[56px]">
          Discover{" "}
          <span className="relative inline-block text-brand-blue">
            local gems.
            <span
              className="absolute -bottom-2 left-1/4 h-1 w-1/2 rounded-full bg-brand-warm/80 sm:-bottom-3"
              aria-hidden="true"
            />
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-[54ch] text-[14px] leading-relaxed text-muted-foreground sm:text-[15px]">
          Browse local listings from people and businesses across Idaho and surrounding states.
        </p>
        <div className="mx-auto mt-5 flex w-fit items-center gap-1.5" aria-hidden="true">
          <span className="h-1.5 w-9 rounded-full bg-brand-blue" />
          <span className="h-1.5 w-5 rounded-full bg-brand-warm" />
          <span className="h-1.5 w-2.5 rounded-full bg-brand-blue/60" />
        </div>

        <form
          className="mx-auto mt-7 flex max-w-[860px] flex-col gap-2 rounded-[24px] border border-brand-blue/20 bg-card p-2 shadow-[0_20px_45px_-28px_rgb(31_53_87_/_55%)] ring-1 ring-brand-warm/10 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch();
          }}
        >
          <label className="flex min-w-0 flex-1 items-center gap-2 px-3">
            <MagnifyingGlass size={19} className="shrink-0 text-brand-blue" aria-hidden="true" />
            <span className="sr-only">Search classifieds</span>
            <input
              type="search"
              value={term}
              onChange={(event) => onTermChange(event.target.value)}
              placeholder="Search classifieds"
              aria-label="Search classifieds"
              className="h-12 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-7 text-[13px] font-bold text-primary-foreground transition-transform hover:-translate-y-0.5"
          >
            <MagnifyingGlass size={17} aria-hidden="true" />
            Search
          </button>
          <AllCategoriesPopover className="w-full sm:w-auto" />
        </form>
      </div>
    </section>
  );
}

function GeneralClassifiedShowcase({ listings }: { listings: ClassifiedBrowseResult["listings"] }) {
  const generalListings = listings.filter((listing) => !listing.vehicle);
  const listingRows = [
    {
      title: "Top listings",
      listings: generalListings.slice(0, 4),
    },
    {
      title: "Newest listings",
      listings: generalListings.slice(4, 8),
    },
  ];

  return (
    <div className="mt-10 space-y-12 sm:mt-14 sm:space-y-16">
      <section aria-labelledby="top-general-categories">
        <div className="mb-4 flex items-end justify-between gap-3 border-b border-border pb-3">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
              Bluebird Marketplace Classifieds
            </p>
            <h2
              id="top-general-categories"
              className="mt-1 text-[22px] font-bold tracking-tight sm:text-[27px]"
            >
              Top categories
            </h2>
          </div>
          <AllCategoriesPopover label="Browse all" className="h-10 rounded-full px-4 text-[12px]" />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {generalCategoryHighlights.map((category) => (
            <Link
              key={category.slug}
              to="/browse"
              search={{ category: category.slug }}
              className="group rounded-2xl border border-border/70 bg-card px-4 py-5 text-center shadow-sm transition-shadow hover:shadow-lg"
            >
              <span className="mx-auto flex h-16 items-center justify-center">
                <CategoryArtwork slug={category.slug} size={68} className="category-art--nav" />
              </span>
              <span className="mt-2 block text-[13px] font-semibold leading-tight group-hover:text-primary">
                {category.name}
              </span>
              <span className="mt-1 block text-[11px] leading-tight text-muted-foreground">
                {category.description}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {listingRows.map((row) => (
        <section key={row.title} aria-labelledby={row.title.replaceAll(" ", "-")}>
          <div className="mb-4 flex items-end justify-between gap-3 border-b border-border pb-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
                Bluebird Marketplace Classifieds
              </p>
              <h2
                id={row.title.replaceAll(" ", "-")}
                className="mt-1 text-[22px] font-bold tracking-tight sm:text-[27px]"
              >
                {row.title}
              </h2>
            </div>
            <Link
              to="/browse"
              search={{ category: "general" }}
              className="inline-flex shrink-0 items-center gap-1 text-[12px] font-bold text-primary hover:underline"
            >
              See all <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          {row.listings.length === 0 ? (
            <CategoryGettingStarted />
          ) : (
            <ul className="no-scrollbar grid grid-cols-1 gap-4 overflow-x-auto pb-2 sm:grid-cols-2 lg:grid-cols-4">
              {row.listings.map((listing) => (
                <li key={row.title + "-" + listing.id} className="min-w-0">
                  <ListingCard listing={listing} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function CategoryGettingStarted() {
  return (
    <BluebirdEmptyState
      title="Bluebird is just getting started."
      description="New listings from Idaho sellers show up here as soon as they're posted. Have something to sell? Be one of the first."
    />
  );
}

function LandingListingsShowcase({
  eyebrow,
  title,
  action,
  browseSearch,
  listings,
}: {
  eyebrow: string;
  title: string;
  action: string;
  browseSearch: Search;
  listings: ClassifiedBrowseResult["listings"];
}) {
  // This showcase is a single curated row. Keep it to the desktop row width
  // so a short second row can never appear beneath it.
  const visibleListings = listings.slice(0, 4);

  return (
    <section
      className="mt-10 sm:mt-14"
      aria-labelledby={`${eyebrow}-${title}`.replaceAll(" ", "-").toLowerCase()}
    >
      <div className="mb-4 flex items-end justify-between gap-3 border-b border-border pb-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
          <h2
            id={`${eyebrow}-${title}`.replaceAll(" ", "-").toLowerCase()}
            className="mt-1 text-[22px] font-bold tracking-tight sm:text-[27px]"
          >
            {title}
          </h2>
        </div>
        <Link
          to="/browse"
          search={browseSearch}
          className="inline-flex shrink-0 items-center gap-1 text-[12px] font-bold text-primary hover:underline"
        >
          {action}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>

      {visibleListings.length > 0 ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {visibleListings.map((listing) => (
            <li key={listing.id} className="min-w-0">
              <ListingCard listing={listing} />
            </li>
          ))}
        </ul>
      ) : (
        <CategoryGettingStarted />
      )}
    </section>
  );
}

function HomepageShowcaseRows({
  eyebrow,
  rows,
}: {
  eyebrow: string;
  rows: readonly HomepagePreviewRow[];
}) {
  return (
    <div className="mt-10 space-y-12 sm:mt-14 sm:space-y-16">
      {rows.map((row) => (
        <section key={row.title} aria-labelledby={row.title.replaceAll(" ", "-").toLowerCase()}>
          <div className="mb-4 flex items-end justify-between gap-3 border-b border-border pb-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
                {eyebrow}
              </p>
              <h2
                id={row.title.replaceAll(" ", "-").toLowerCase()}
                className="mt-1 text-[22px] font-bold tracking-tight sm:text-[27px]"
              >
                {row.title}
              </h2>
            </div>
            <a
              href={row.href}
              className="inline-flex shrink-0 items-center gap-1 text-[12px] font-bold text-primary hover:underline"
            >
              {row.action}
              <ArrowRight size={14} aria-hidden="true" />
            </a>
          </div>
          <CategoryGettingStarted />
        </section>
      ))}
    </div>
  );
}

function SponsoredHeroBadge() {
  return (
    <Link
      to="/advertise"
      aria-label="Sponsored by Bluebird Marketplace — learn about advertising with us"
      className="inline-flex max-w-full items-center gap-2 rounded-full border border-accent/70 bg-primary/90 px-3 py-2 text-left text-primary-foreground shadow-lg backdrop-blur-md transition-transform hover:-translate-y-0.5 sm:gap-2.5 sm:px-3.5"
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
        <Megaphone size={15} weight="fill" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 whitespace-normal text-[9px] font-bold uppercase leading-snug tracking-[0.1em] text-accent sm:text-[10px] sm:tracking-[0.12em]">
        Sponsored by Bluebird Marketplace
      </span>
      <ArrowRight
        size={15}
        weight="bold"
        className="ml-1 shrink-0 text-accent"
        aria-hidden="true"
      />
    </Link>
  );
}

function HomesLandingHero({
  activeTab,
  location,
  resultCount,
  onTabChange,
  onSearch,
  onMoreFilters,
}: {
  activeTab: HomeTab;
  location: string;
  resultCount: number;
  onTabChange: (tab: HomeTab) => void;
  onSearch: (location: string) => void;
  onMoreFilters: () => void;
}) {
  const [draft, setDraft] = useState(location);

  useEffect(() => setDraft(location), [location]);

  return (
    <section
      aria-label="Bluebird Marketplace Homes"
      className="relative isolate min-h-[610px] overflow-hidden rounded-[32px] bg-primary bg-cover bg-center shadow-xl sm:min-h-[680px]"
      style={{
        backgroundImage:
          "linear-gradient(90deg, rgb(11 26 38 / 72%), rgb(11 26 38 / 38%) 52%, rgb(11 26 38 / 18%)), url(https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=2200&q=85)",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-primary/55 via-transparent to-primary/15" />
      <div className="absolute right-5 top-5 z-20 sm:right-7 sm:top-7">
        <SponsoredHeroBadge />
      </div>
      <div className="relative flex min-h-[610px] items-center justify-center px-4 pb-12 pt-24 sm:min-h-[680px] sm:px-8 sm:pb-12 sm:pt-16">
        <div className="w-full max-w-[650px] rounded-[28px] border border-white/20 bg-primary/80 p-5 text-primary-foreground shadow-2xl backdrop-blur-md sm:p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
            Bluebird Marketplace Homes
          </p>
          <h1 className="mt-3 text-center font-display text-[34px] font-bold leading-[1.05] tracking-tight sm:text-[52px]">
            Build. Buy. Rent.
            <span className="block text-accent">All in one place.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-[43ch] text-center text-[14px] leading-relaxed text-white/80 sm:text-[15px]">
            Find your next home, discover new communities, and explore rentals from local sellers in
            Idaho and surrounding states.
          </p>

          <div className="mt-7 grid grid-cols-3 rounded-2xl bg-white/10 p-1.5 ring-1 ring-white/20">
            {homeTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                aria-pressed={activeTab === tab.value}
                onClick={() => onTabChange(tab.value)}
                className={`rounded-xl px-2 py-3 text-[13px] font-bold transition-colors sm:text-[15px] ${activeTab === tab.value ? "bg-accent text-accent-foreground shadow-sm" : "text-white/85 hover:bg-white/10"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <form
            className="mt-3 flex flex-col gap-2 rounded-2xl bg-card p-2 text-foreground sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              onSearch(draft);
            }}
          >
            <label className="flex min-w-0 flex-1 items-center gap-2 px-3">
              <MapPin
                size={19}
                weight="duotone"
                className="shrink-0 text-primary"
                aria-hidden="true"
              />
              <span className="sr-only">County, city, neighborhood, or ZIP</span>
              <input
                type="search"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="County, city, neighborhood, or ZIP"
                aria-label="County, city, neighborhood, or ZIP"
                className="h-12 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
              />
            </label>
            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-[13px] font-bold text-primary-foreground transition-transform hover:-translate-y-0.5"
            >
              <MagnifyingGlass size={17} aria-hidden="true" />
              Search homes
            </button>
          </form>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-[12px]">
            <span className="text-white/70">
              {resultCount.toLocaleString()} local listings to explore
            </span>
            <button
              type="button"
              onClick={onMoreFilters}
              className="inline-flex items-center gap-1.5 rounded-full border border-accent/70 px-4 py-2 font-bold text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              More filters
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function HomeShowcaseRows({ activeTab }: { activeTab: HomeTab }) {
  return (
    <div className="mt-10 space-y-12 sm:mt-14 sm:space-y-16">
      {homePreviewRowsByTab[activeTab].map((row) => (
        <section key={row.title} aria-labelledby={row.title.replaceAll(" ", "-").toLowerCase()}>
          <div className="mb-4 flex items-end justify-between gap-3 border-b border-border pb-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
                Bluebird Marketplace Homes
              </p>
              <h2
                id={row.title.replaceAll(" ", "-").toLowerCase()}
                className="mt-1 text-[22px] font-bold tracking-tight sm:text-[27px]"
              >
                {row.title}
              </h2>
            </div>
            <Link
              to="/browse"
              search={{
                category: "other-real-estate",
                homeMode: "results",
                homeTab: activeTab,
              }}
              className="inline-flex shrink-0 items-center gap-1 text-[12px] font-bold text-primary hover:underline"
            >
              {row.action}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <CategoryGettingStarted />
        </section>
      ))}
    </div>
  );
}

function ServicesLandingHero({
  resultCount,
  onSearch,
  onPost,
}: {
  resultCount: number;
  onSearch: (subcategory: string) => void;
  onPost: () => void;
}) {
  const [mode, setMode] = useState<"search" | "post">("search");
  const [subcategory, setSubcategory] = useState("");

  return (
    <section
      aria-label="Bluebird Marketplace Services"
      className="relative isolate min-h-[610px] overflow-hidden rounded-[32px] bg-primary bg-cover bg-center shadow-xl sm:min-h-[680px]"
      style={{
        backgroundImage:
          "linear-gradient(90deg, rgb(11 26 38 / 64%), rgb(11 26 38 / 30%) 58%, rgb(11 26 38 / 12%)), url(https://images.unsplash.com/photo-1556912167-f556f1f39fdf?auto=format&fit=crop&w=2200&q=85)",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-primary/60 via-transparent to-primary/10" />
      <div className="absolute right-5 top-5 z-20 sm:right-7 sm:top-7">
        <SponsoredHeroBadge />
      </div>
      <div className="relative flex min-h-[610px] items-center justify-center px-4 pb-12 pt-24 sm:min-h-[680px] sm:px-8 sm:pb-12 sm:pt-16">
        <div className="w-full max-w-[720px] rounded-[28px] border border-white/20 bg-primary/80 p-5 text-primary-foreground shadow-2xl backdrop-blur-md sm:p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
            Bluebird Marketplace Services
          </p>
          <h1 className="mt-3 text-center font-display text-[34px] font-bold leading-[1.05] tracking-tight sm:text-[54px]">
            Find qualified <span className="text-accent">local pros.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-[46ch] text-center text-[14px] leading-relaxed text-white/80 sm:text-[15px]">
            Connect with trusted service providers across Idaho and surrounding states — or share
            what you do with local customers.
          </p>

          <div className="mt-7 grid grid-cols-2 rounded-2xl bg-white/10 p-1.5 ring-1 ring-white/20">
            <button
              type="button"
              aria-pressed={mode === "search"}
              onClick={() => setMode("search")}
              className={`rounded-xl px-2 py-3 text-[13px] font-bold transition-colors sm:text-[15px] ${mode === "search" ? "bg-accent text-accent-foreground shadow-sm" : "text-white/85 hover:bg-white/10"}`}
            >
              Search Listings
            </button>
            <button
              type="button"
              aria-pressed={mode === "post"}
              onClick={() => setMode("post")}
              className={`rounded-xl px-2 py-3 text-[13px] font-bold transition-colors sm:text-[15px] ${mode === "post" ? "bg-accent text-accent-foreground shadow-sm" : "text-white/85 hover:bg-white/10"}`}
            >
              Post a Listing
            </button>
          </div>

          {mode === "search" ? (
            <form
              className="mt-3"
              onSubmit={(event) => {
                event.preventDefault();
                onSearch(subcategory.trim());
              }}
            >
              <ServiceCategoryPicker value={subcategory} onChange={setSubcategory} />
              <button
                type="submit"
                className="mx-auto mt-4 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-[13px] font-bold text-accent-foreground shadow-sm transition-transform hover:-translate-y-0.5"
              >
                <MagnifyingGlass size={17} aria-hidden="true" />
                Show {resultCount.toLocaleString()} results
              </button>
            </form>
          ) : (
            <div className="mt-3 rounded-2xl bg-card p-6 text-center text-foreground sm:p-8">
              <p className="text-[18px] font-bold">Have a service to offer?</p>
              <p className="mx-auto mt-2 max-w-[40ch] text-[13px] leading-relaxed text-muted-foreground">
                Reach local customers and show them what makes your work worth choosing.
              </p>
              <button
                type="button"
                onClick={onPost}
                className="mt-5 inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 text-[13px] font-bold text-primary-foreground hover:opacity-90"
              >
                Post a Service Listing
              </button>
            </div>
          )}

          {mode === "search" && (
            <div className="mt-5 text-center text-[12px] text-white/70">
              {resultCount.toLocaleString()} local services to explore
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ServiceCategoryPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const options = allServiceCategories.filter(
    (category) => !value.trim() || category.name.toLowerCase().includes(value.trim().toLowerCase()),
  );

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  return (
    <div ref={containerRef} className="relative text-foreground">
      <label className="relative flex h-12 items-center rounded-xl bg-card px-3 ring-1 ring-border focus-within:ring-2 focus-within:ring-primary">
        <MagnifyingGlass size={18} className="mr-2 shrink-0 text-primary" aria-hidden="true" />
        <span className="sr-only">What service are you looking for?</span>
        <input
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="What service are you looking for?"
          aria-label="What service are you looking for?"
          aria-expanded={open}
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
        />
        <CaretDown
          size={16}
          className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </label>
      {open && (
        <div
          role="listbox"
          aria-label="Service categories"
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-b-xl border border-border bg-card shadow-xl"
        >
          {options.length > 0 ? (
            options.map((category) => (
              <button
                key={category.name}
                type="button"
                role="option"
                aria-selected={value === category.name}
                onClick={() => {
                  onChange(category.name);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between border-b border-border/70 px-3 py-2.5 text-left text-[13px] last:border-b-0 hover:bg-secondary"
              >
                <span>{category.name}</span>
                <span className="numeric text-[11px] text-muted-foreground">{category.count}</span>
              </button>
            ))
          ) : (
            <p className="px-3 py-3 text-[12px] text-muted-foreground">
              No service categories found.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ServicesCategoryShowcase({
  onCategorySelect,
}: {
  onCategorySelect: (category: string) => void;
}) {
  return (
    <div className="mt-10 space-y-12 sm:mt-14 sm:space-y-16">
      {serviceCategoryRows.map((row) => (
        <section key={row.title} aria-labelledby={row.title.replaceAll(" ", "-").toLowerCase()}>
          <div className="mb-4 border-b border-border pb-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
              Bluebird Marketplace Services
            </p>
            <h2
              id={row.title.replaceAll(" ", "-").toLowerCase()}
              className="mt-1 text-[22px] font-bold tracking-tight sm:text-[27px]"
            >
              {row.title}
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {row.categories.map((category) => (
              <button
                key={category.name}
                type="button"
                onClick={() => onCategorySelect(category.name)}
                className="group text-left"
              >
                <div className="aspect-[1.65/1] overflow-hidden rounded-2xl border border-border/70 bg-secondary shadow-sm">
                  <img
                    src={category.image}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                </div>
                <p className="mt-2 text-center text-[13px] font-semibold leading-tight group-hover:text-primary">
                  {category.name}
                </p>
              </button>
            ))}
          </div>
        </section>
      ))}

      <section aria-labelledby="browse-all-service-categories">
        <div className="mb-4 border-b border-border pb-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
            Bluebird Marketplace Services
          </p>
          <h2
            id="browse-all-service-categories"
            className="mt-1 text-[22px] font-bold tracking-tight sm:text-[27px]"
          >
            Browse all categories
          </h2>
        </div>
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
          {allServiceCategories.map((category) => (
            <button
              key={category.name}
              type="button"
              onClick={() => onCategorySelect(category.name)}
              className="flex items-center justify-between border-b border-border/60 py-2 text-left text-[13px] transition-colors hover:text-primary"
            >
              <span>{category.name}</span>
              <span className="numeric text-muted-foreground">({category.count})</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ServicesFilterPage({
  search,
  listings,
  total,
  onClear,
  onApply,
  onSave,
  onPost,
}: {
  search: Search;
  listings: ClassifiedBrowseResult["listings"];
  total: number;
  onClear: () => void;
  onApply: (patch: Partial<Search>) => void;
  onSave: (patch?: Partial<Search>) => void;
  onPost: () => void;
}) {
  const [term, setTerm] = useState(search.q ?? "");
  const [subcategory, setSubcategory] = useState(search.serviceSubcategory ?? "");
  const [priceMin, setPriceMin] = useState(search.priceMin == null ? "" : String(search.priceMin));
  const [priceMax, setPriceMax] = useState(search.priceMax == null ? "" : String(search.priceMax));
  const [expandSearch, setExpandSearch] = useState(search.serviceExpandSearch === "true");
  const [photos, setPhotos] = useState(search.servicePhotos === "true");
  const [area, setArea] = useState(search.serviceArea ?? "");
  const [availability, setAvailability] = useState(search.serviceAvailability ?? "");
  const [licenseRequired, setLicenseRequired] = useState(search.serviceLicenseRequired === "true");
  const [condition, setCondition] = useState(search.serviceCondition ?? "");
  const [timeOnSite, setTimeOnSite] = useState(search.serviceTimeOnSite ?? "");

  useEffect(() => {
    setTerm(search.q ?? "");
    setSubcategory(search.serviceSubcategory ?? "");
    setPriceMin(search.priceMin == null ? "" : String(search.priceMin));
    setPriceMax(search.priceMax == null ? "" : String(search.priceMax));
    setExpandSearch(search.serviceExpandSearch === "true");
    setPhotos(search.servicePhotos === "true");
    setArea(search.serviceArea ?? "");
    setAvailability(search.serviceAvailability ?? "");
    setLicenseRequired(search.serviceLicenseRequired === "true");
    setCondition(search.serviceCondition ?? "");
    setTimeOnSite(search.serviceTimeOnSite ?? "");
  }, [search]);

  function currentPatch(): Partial<Search> {
    const numberValue = (value: string) => optionalNonNegativeNumber(value);
    return {
      q: term.trim() || undefined,
      serviceSubcategory: subcategory || undefined,
      priceMin: numberValue(priceMin),
      priceMax: numberValue(priceMax),
      serviceExpandSearch: expandSearch ? "true" : undefined,
      servicePhotos: photos ? "true" : undefined,
      serviceArea: area.trim() || undefined,
      serviceAvailability: availability.trim() || undefined,
      serviceLicenseRequired: licenseRequired ? "true" : undefined,
      serviceCondition: condition || undefined,
      serviceTimeOnSite: timeOnSite || undefined,
    };
  }

  function apply() {
    const patch = currentPatch();
    if (isInvertedRange(patch.priceMin, patch.priceMax)) {
      toast.error("Price minimum cannot exceed maximum.");
      return;
    }
    onApply(patch);
  }

  const filteredListings = listings;
  const sortedListings = [...filteredListings].sort((a, b) => {
    if (search.sort === "price_high" || search.sort === "price_low") {
      const aValue = a.job ? comparableJobPay(a.job.payType, a.job.payMin) : a.priceCents;
      const bValue = b.job ? comparableJobPay(b.job.payType, b.job.payMin) : b.priceCents;
      return search.sort === "price_low" ? aValue - bValue : bValue - aValue;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="mt-8">
      <section className="floating-card overflow-visible p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="grid w-full max-w-[390px] grid-cols-2 rounded-2xl bg-secondary p-1.5 ring-1 ring-border/70">
            <button
              type="button"
              aria-pressed="true"
              className="rounded-xl bg-primary px-3 py-3 text-[13px] font-bold text-primary-foreground shadow-sm"
            >
              Search Listings
            </button>
            <button
              type="button"
              onClick={onPost}
              className="rounded-xl px-3 py-3 text-[13px] font-bold hover:bg-card"
            >
              Post a Listing
            </button>
          </div>
        </div>
        <form
          className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.65fr_minmax(0,1fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <label className="flex h-12 min-w-0 items-center gap-2 rounded-xl border border-input bg-card px-3 focus-within:border-primary">
            <MagnifyingGlass size={16} className="shrink-0 text-primary" aria-hidden="true" />
            <span className="sr-only">Search services</span>
            <input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search for a service, company, or description"
              className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground"
            />
          </label>
          <ServiceOptionSelect
            label="Subcategory"
            value={subcategory}
            options={serviceSubcategoryOptions}
            onChange={setSubcategory}
          />
          <div className="grid grid-cols-2 gap-2 sm:contents">
            <button
              type="submit"
              className="h-12 rounded-xl bg-primary px-5 text-[12px] font-bold text-primary-foreground hover:opacity-90"
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => onSave(currentPatch())}
              className="h-12 rounded-xl border border-primary px-4 text-[12px] font-bold text-primary hover:bg-secondary"
            >
              Save search
            </button>
          </div>
        </form>
      </section>

      <div className="mt-7 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <ResponsiveBrowseFilters title="Service filters" resetKey={JSON.stringify(search)}>
          <div className="space-y-3">
            <ServiceFilterGroup title="Category">
              <ServiceOptionSelect
                label="Category"
                value="Services"
                options={["Any category", "Services"]}
                onChange={() => undefined}
              />
              <ServiceOptionSelect
                label="Subcategory"
                value={subcategory}
                options={serviceSubcategoryOptions}
                onChange={setSubcategory}
              />
            </ServiceFilterGroup>
            <ServiceFilterGroup title="Price">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <input
                  inputMode="numeric"
                  value={priceMin}
                  onChange={(event) => setPriceMin(event.target.value)}
                  placeholder="$0"
                  className="filter-input"
                />
                <span className="text-muted-foreground">–</span>
                <input
                  inputMode="numeric"
                  value={priceMax}
                  onChange={(event) => setPriceMax(event.target.value)}
                  placeholder="$200,000+"
                  className="filter-input"
                />
              </div>
            </ServiceFilterGroup>
            <ServiceFilterGroup title="Expand Your Search">
              <ServiceToggle
                label="Include listing descriptions in keyword searches"
                checked={expandSearch}
                onChange={setExpandSearch}
              />
            </ServiceFilterGroup>
            <ServiceFilterGroup title="Photos">
              <ServiceToggle
                label="Only show listings with photos"
                checked={photos}
                onChange={setPhotos}
              />
            </ServiceFilterGroup>
            <ServiceFilterGroup title="Service details">
              <input
                value={area}
                onChange={(event) => setArea(event.target.value)}
                placeholder="Service area"
                className="filter-input"
              />
              <input
                value={availability}
                onChange={(event) => setAvailability(event.target.value)}
                placeholder="Availability or schedule"
                className="filter-input"
              />
              <ServiceToggle
                label="Only show licensed providers"
                checked={licenseRequired}
                onChange={setLicenseRequired}
              />
            </ServiceFilterGroup>
            <ServiceFilterGroup title="Condition" initiallyOpen={false}>
              <ServiceOptionSelect
                label="Condition"
                value={condition}
                options={serviceConditionOptions}
                onChange={setCondition}
              />
            </ServiceFilterGroup>
            <ServiceFilterGroup title="Time On Site" initiallyOpen={false}>
              <div className="space-y-2">
                {serviceTimeOnSiteOptions.slice(1).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setTimeOnSite(timeOnSite === option ? "" : option)}
                    className={`h-10 w-full rounded-lg border px-3 text-[12px] font-bold ${timeOnSite === option ? "border-primary bg-primary text-primary-foreground" : "border-primary text-primary hover:bg-secondary"}`}
                  >
                    {option.replace("Last ", "Last ")}
                  </button>
                ))}
              </div>
            </ServiceFilterGroup>
            <button
              type="button"
              onClick={apply}
              className="h-11 w-full rounded-xl bg-primary text-[12px] font-bold text-primary-foreground hover:opacity-90"
            >
              Show {total.toLocaleString()} results
            </button>
          </div>
        </ResponsiveBrowseFilters>

        <section aria-label="Service listings" className="min-w-0 lg:col-start-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <p className="text-[13px] text-muted-foreground">
              <strong className="numeric text-foreground">{total}</strong>{" "}
              {total === 1 ? "service" : "services"} in Idaho
            </p>
            <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
              Sort by
              <select
                value={search.sort ?? "newest"}
                onChange={(event) =>
                  onApply({
                    sort:
                      event.target.value === "newest"
                        ? undefined
                        : (event.target.value as Search["sort"]),
                  })
                }
                className="select-chevron h-9 rounded-lg border border-input bg-card pl-2 pr-7 text-[12px] text-foreground"
              >
                <option value="newest">Newest to oldest</option>
                <option value="price_low">Lowest price</option>
                <option value="price_high">Highest price</option>
              </select>
            </label>
          </div>
          {sortedListings.length === 0 ? (
            <BluebirdEmptyState
              className="mt-5"
              title="No services match these filters."
              description="Try widening your subcategory, price range, or search terms."
            >
              <button
                type="button"
                onClick={onClear}
                className="inline-flex h-9 items-center rounded-md border border-input px-3 text-[12px] font-semibold hover:bg-secondary"
              >
                Clear filters
              </button>
            </BluebirdEmptyState>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {sortedListings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ServiceOptionSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full appearance-none rounded-xl border border-input bg-card px-3 pr-8 text-[12px] text-foreground outline-none focus:border-primary"
      >
        {options.map((option, index) => (
          <option key={option} value={index === 0 ? "" : option}>
            {option}
          </option>
        ))}
      </select>
      <CaretDown
        size={14}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </label>
  );
}

function ServiceFilterGroup({
  title,
  children,
  initiallyOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <section className="overflow-visible rounded-2xl border border-border bg-card shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between px-3.5 py-3 text-left text-[13px] font-bold"
      >
        <span>{title}</span>
        <CaretDown
          size={15}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="space-y-2 border-t border-border px-3.5 pb-3.5 pt-3">{children}</div>
      )}
    </section>
  );
}

function ServiceToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-[12px] leading-tight">
      <span>{label}</span>
      <button
        type="button"
        aria-label={label}
        aria-pressed={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted"}`}
      >
        <span
          className={`absolute top-1.5 size-5 rounded-full bg-card shadow-sm transition-transform ${checked ? "translate-x-7" : "translate-x-1.5"}`}
        />
      </button>
    </label>
  );
}

function JobsLandingHero({
  search,
  resultCount,
  onSearch,
  onMoreFilters,
  onPost,
}: {
  search: Search;
  resultCount: number;
  onSearch: (patch: Partial<Search>) => void;
  onMoreFilters: (patch: Partial<Search>) => void;
  onPost: () => void;
}) {
  const [mode, setMode] = useState<"search" | "post">("search");
  const [draft, setDraft] = useState(search.q ?? "");
  const [category, setCategory] = useState(search.jobCategory ?? "");
  const [jobType, setJobType] = useState(
    normalizeMultiSelect(search.jobType ?? search.jobEmploymentType),
  );
  const [payType, setPayType] = useState(search.jobPayType ?? "");

  useEffect(() => {
    setDraft(search.q ?? "");
    setCategory(search.jobCategory ?? "");
    setJobType(normalizeMultiSelect(search.jobType ?? search.jobEmploymentType));
    setPayType(search.jobPayType ?? "");
  }, [search.q, search.jobCategory, search.jobType, search.jobEmploymentType, search.jobPayType]);

  return (
    <section
      aria-label="Bluebird Marketplace Jobs"
      className="relative isolate min-h-[590px] overflow-hidden rounded-[32px] bg-primary bg-cover bg-center shadow-xl sm:min-h-[670px]"
      style={{
        backgroundImage:
          "linear-gradient(90deg, rgb(11 26 38 / 78%), rgb(11 26 38 / 42%) 55%, rgb(11 26 38 / 18%)), url(https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=2200&q=85)",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-primary/60 via-transparent to-primary/10" />
      <div className="absolute right-5 top-5 z-20 sm:right-7 sm:top-7">
        <SponsoredHeroBadge />
      </div>
      <div className="relative flex min-h-[590px] items-center justify-center px-4 pb-12 pt-24 sm:min-h-[670px] sm:px-8 sm:pb-12 sm:pt-16">
        <div className="w-full max-w-[720px] rounded-[28px] border border-white/20 bg-primary/80 p-5 text-primary-foreground shadow-2xl backdrop-blur-md sm:p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
            Bluebird Marketplace Jobs
          </p>
          <h1 className="mt-3 text-center font-display text-[34px] font-bold leading-[1.05] tracking-tight sm:text-[54px]">
            Find <span className="text-accent">local</span> work that fits your life.
          </h1>
          <p className="mx-auto mt-4 max-w-[46ch] text-center text-[14px] leading-relaxed text-white/80 sm:text-[15px]">
            Search jobs from local employers across Idaho and surrounding states — or post your next
            opportunity.
          </p>

          <div className="mt-7 grid grid-cols-2 rounded-2xl bg-white/10 p-1.5 ring-1 ring-white/20">
            <button
              type="button"
              aria-pressed={mode === "search"}
              onClick={() => setMode("search")}
              className={`rounded-xl px-2 py-3 text-[13px] font-bold transition-colors sm:text-[15px] ${mode === "search" ? "bg-accent text-accent-foreground shadow-sm" : "text-white/85 hover:bg-white/10"}`}
            >
              Search Jobs
            </button>
            <button
              type="button"
              aria-pressed={mode === "post"}
              onClick={() => setMode("post")}
              className={`rounded-xl px-2 py-3 text-[13px] font-bold transition-colors sm:text-[15px] ${mode === "post" ? "bg-accent text-accent-foreground shadow-sm" : "text-white/85 hover:bg-white/10"}`}
            >
              Post a Job
            </button>
          </div>

          {mode === "search" ? (
            <>
              <form
                className="mt-3 flex flex-col gap-2 rounded-2xl bg-card p-2 text-foreground"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSearch({
                    q: draft.trim() || undefined,
                    jobCategory: category || undefined,
                    jobType: jobType && !jobType.startsWith("Any ") ? jobType : undefined,
                    jobPayType: payType && !payType.startsWith("Any ") ? payType : undefined,
                  });
                }}
              >
                <label className="flex min-w-0 items-center gap-2 px-3">
                  <MagnifyingGlass size={19} className="shrink-0 text-primary" aria-hidden="true" />
                  <span className="sr-only">Search jobs</span>
                  <input
                    type="search"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="What job are you looking for?"
                    aria-label="Search jobs"
                    className="h-12 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
                  />
                  <button
                    type="submit"
                    className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-[13px] font-bold text-primary-foreground hover:opacity-90"
                  >
                    Search
                  </button>
                </label>
              </form>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <JobSelect
                  label="Category"
                  options={jobCategoryOptions}
                  value={category}
                  onChange={setCategory}
                />
                <JobChecklist
                  label="Job type"
                  options={jobTypeOptions}
                  value={jobType}
                  onChange={setJobType}
                />
                <JobSelect
                  label="Job pay range"
                  options={jobPayTypeOptions}
                  value={payType}
                  onChange={setPayType}
                />
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-[12px]">
                <span className="text-white/70">
                  {resultCount.toLocaleString()} local jobs to explore
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onMoreFilters({
                      jobCategory: category || undefined,
                      jobType: jobType && !jobType.startsWith("Any ") ? jobType : undefined,
                      jobPayType: payType && !payType.startsWith("Any ") ? payType : undefined,
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-full border border-accent/70 px-4 py-2 font-bold text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  More filters <ArrowRight size={14} aria-hidden="true" />
                </button>
              </div>
            </>
          ) : (
            <div className="mt-3 rounded-2xl bg-card p-6 text-center text-foreground sm:p-8">
              <p className="text-[18px] font-bold">Have a great opportunity?</p>
              <p className="mx-auto mt-2 max-w-[40ch] text-[13px] leading-relaxed text-muted-foreground">
                Reach local candidates and share the details that make your team worth joining.
              </p>
              <button
                type="button"
                onClick={onPost}
                className="mt-5 inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 text-[13px] font-bold text-primary-foreground hover:opacity-90"
              >
                Post a Job Listing
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function JobsFilterPage({
  search,
  listings,
  total,
  onClear,
  onApply,
  onSave,
  onPost,
}: {
  search: Search;
  listings: ClassifiedBrowseResult["listings"];
  total: number;
  onClear: () => void;
  onApply: (patch: Partial<Search>) => void;
  onSave: (patch?: Partial<Search>) => void;
  onPost: () => void;
}) {
  const [term, setTerm] = useState(search.q ?? "");
  const [category, setCategory] = useState(search.jobCategory ?? "");
  const [employer, setEmployer] = useState(search.jobEmployer ?? "");
  const [jobType, setJobType] = useState(search.jobType ?? "");
  const [payType, setPayType] = useState(search.jobPayType ?? "");
  const [payMin, setPayMin] = useState(search.jobPayMin == null ? "" : String(search.jobPayMin));
  const [payMax, setPayMax] = useState(search.jobPayMax == null ? "" : String(search.jobPayMax));
  const [experience, setExperience] = useState(search.jobExperience ?? "");
  const [posted, setPosted] = useState(search.jobPosted ?? "");
  const [education, setEducation] = useState(search.jobEducation ?? "");
  const [photos, setPhotos] = useState(search.jobPhotos === "true");
  const [timeOnSite, setTimeOnSite] = useState(search.jobTimeOnSite ?? "");

  useEffect(() => {
    setTerm(search.q ?? "");
    setCategory(search.jobCategory ?? "");
    setEmployer(search.jobEmployer ?? "");
    setJobType(search.jobType ?? "");
    setPayType(search.jobPayType ?? "");
    setPayMin(search.jobPayMin == null ? "" : String(search.jobPayMin));
    setPayMax(search.jobPayMax == null ? "" : String(search.jobPayMax));
    setExperience(search.jobExperience ?? "");
    setPosted(search.jobPosted ?? "");
    setEducation(search.jobEducation ?? "");
    setPhotos(search.jobPhotos === "true");
    setTimeOnSite(search.jobTimeOnSite ?? "");
  }, [search]);

  function currentPatch(): Partial<Search> {
    const numberValue = (value: string) => optionalNonNegativeNumber(value);
    const integerValue = (value: string) => optionalNonNegativeInteger(value);
    return {
      q: term.trim() || undefined,
      jobCategory: category || undefined,
      jobEmployer: employer.trim() || undefined,
      jobType: jobType || undefined,
      jobPayType: payType || undefined,
      jobPayMin: numberValue(payMin),
      jobPayMax: numberValue(payMax),
      jobExperience: experience || undefined,
      jobPosted: posted || undefined,
      jobEducation: education || undefined,
      jobPhotos: photos ? "true" : undefined,
      jobTimeOnSite: timeOnSite || undefined,
    };
  }

  function apply() {
    const patch = currentPatch();
    if (isInvertedRange(patch.jobPayMin, patch.jobPayMax)) {
      toast.error("Pay minimum cannot exceed maximum.");
      return;
    }
    onApply(patch);
  }

  const filteredListings = listings;
  const sortedListings = [...filteredListings].sort((a, b) => {
    if (search.sort === "price_high" || search.sort === "price_low") {
      const aValue = a.job ? comparableJobPay(a.job.payType, a.job.payMin) : a.priceCents;
      const bValue = b.job ? comparableJobPay(b.job.payType, b.job.payMin) : b.priceCents;
      return search.sort === "price_low" ? aValue - bValue : bValue - aValue;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="mt-8">
      <section className="floating-card overflow-visible p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="grid w-full max-w-[390px] grid-cols-2 rounded-2xl bg-secondary p-1.5 ring-1 ring-border/70">
            <button
              type="button"
              aria-pressed="true"
              className="rounded-xl bg-primary px-3 py-3 text-[13px] font-bold text-primary-foreground shadow-sm"
            >
              Search Jobs
            </button>
            <button
              type="button"
              onClick={onPost}
              className="rounded-xl px-3 py-3 text-[13px] font-bold hover:bg-card"
            >
              Post a Job
            </button>
          </div>
        </div>
        <form
          className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.65fr_repeat(3,minmax(0,1fr))_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <label className="flex h-12 min-w-0 items-center gap-2 rounded-xl border border-input bg-card px-3 focus-within:border-primary">
            <MagnifyingGlass size={16} className="shrink-0 text-primary" aria-hidden="true" />
            <span className="sr-only">Search jobs</span>
            <input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search for a job, company, or title"
              className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground"
            />
          </label>
          <JobChecklist
            label="Category"
            value={category}
            options={jobCategoryOptions}
            onChange={setCategory}
          />
          <JobChecklist
            label="Job type"
            value={jobType}
            options={jobTypeOptions}
            onChange={setJobType}
          />
          <JobSelect
            label="Job pay range"
            value={payType}
            options={jobPayTypeOptions}
            onChange={setPayType}
          />
          <div className="grid grid-cols-2 gap-2 sm:contents">
            <button
              type="submit"
              className="h-12 rounded-xl bg-primary px-5 text-[12px] font-bold text-primary-foreground hover:opacity-90"
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => onSave(currentPatch())}
              className="h-12 rounded-xl border border-primary px-4 text-[12px] font-bold text-primary hover:bg-secondary"
            >
              Save search
            </button>
          </div>
        </form>
      </section>

      <div className="mt-7 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <ResponsiveBrowseFilters title="Job filters" resetKey={JSON.stringify(search)}>
          <div className="space-y-3">
            <JobFilterGroup title="Category">
              <JobChecklist
                label="Category"
                value={category}
                options={jobCategoryOptions}
                onChange={setCategory}
              />
            </JobFilterGroup>
            <JobFilterGroup title="Employer">
              <input
                value={employer}
                onChange={(event) => setEmployer(event.target.value)}
                placeholder="Company or employer"
                className="filter-input"
              />
            </JobFilterGroup>
            <JobFilterGroup title="Job type">
              <JobChecklist
                label="Job type"
                value={jobType}
                options={jobTypeOptions}
                onChange={setJobType}
              />
            </JobFilterGroup>
            <JobFilterGroup title="Education level">
              <JobChecklist
                label="Education level"
                value={education}
                options={jobEducationOptions}
                onChange={setEducation}
              />
            </JobFilterGroup>
            <JobFilterGroup title="Years of experience">
              <JobChecklist
                label="Years of experience"
                value={experience}
                options={jobExperienceOptions}
                onChange={setExperience}
              />
            </JobFilterGroup>
            <JobFilterGroup title="Job pay range">
              <div className="grid grid-cols-3 gap-1.5">
                {jobPayTypeOptions.map((option, index) => {
                  const value = index === 0 ? "" : option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setPayType(value)}
                      className={`rounded-lg border px-2 py-2 text-[11px] font-semibold ${payType === value ? "border-primary bg-primary text-primary-foreground" : "border-primary text-primary hover:bg-secondary"}`}
                    >
                      {index === 0 ? "All" : option}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  inputMode="numeric"
                  value={payMin}
                  onChange={(event) => setPayMin(event.target.value)}
                  placeholder="$ From"
                  className="filter-input"
                />
                <input
                  inputMode="numeric"
                  value={payMax}
                  onChange={(event) => setPayMax(event.target.value)}
                  placeholder="$ To"
                  className="filter-input"
                />
              </div>
            </JobFilterGroup>
            <JobFilterGroup title="Photos">
              <JobToggle
                label="Only show listings with photos"
                checked={photos}
                onChange={setPhotos}
              />
            </JobFilterGroup>
            <JobFilterGroup title="Time on site">
              <JobSelect
                label="Time on site"
                value={timeOnSite}
                options={jobPostedOptions}
                onChange={setTimeOnSite}
              />
            </JobFilterGroup>
          </div>
        </ResponsiveBrowseFilters>

        <section aria-label="Job listings" className="min-w-0 lg:col-start-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <p className="text-[13px] text-muted-foreground">
              <strong className="numeric text-foreground">{total}</strong>{" "}
              {total === 1 ? "job" : "jobs"} in Idaho
            </p>
            <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
              Sort by
              <select
                value={search.sort ?? "newest"}
                onChange={(event) =>
                  onApply({
                    sort:
                      event.target.value === "newest"
                        ? undefined
                        : (event.target.value as Search["sort"]),
                  })
                }
                className="select-chevron h-9 rounded-lg border border-input bg-card pl-2 pr-7 text-[12px] text-foreground"
              >
                <option value="newest">Newest to oldest</option>
                <option value="price_high">Highest pay</option>
                <option value="price_low">Lowest pay</option>
              </select>
            </label>
          </div>
          {sortedListings.length === 0 ? (
            <BluebirdEmptyState
              className="mt-5"
              title="No jobs match these filters."
              description="Try widening your job type, pay range, or search terms."
            >
              <button
                type="button"
                onClick={onClear}
                className="inline-flex h-9 items-center rounded-md border border-input px-3 text-[12px] font-semibold hover:bg-secondary"
              >
                Clear filters
              </button>
            </BluebirdEmptyState>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {sortedListings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function JobSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: readonly string[];
  onChange?: (value: string) => void;
}) {
  return (
    <label className="relative block min-w-0">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value ?? ""}
        onChange={(event) => onChange?.(event.target.value)}
        className="h-12 w-full appearance-none rounded-xl border border-input bg-card px-3 pr-8 text-[12px] text-foreground outline-none focus:border-primary"
      >
        {options.map((option, index) => (
          <option key={option} value={index === 0 ? "" : option}>
            {option}
          </option>
        ))}
      </select>
      <CaretDown
        size={14}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </label>
  );
}

function JobChecklist({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? value.split("|").filter(Boolean) : [];
  const anyOption = options[0] ?? "Any";
  const displayValue =
    selected.length === 0
      ? anyOption
      : selected.length === 1
        ? selected[0]
        : `${selected.length} selected`;

  function toggle(option: string) {
    if (option === anyOption) {
      onChange("");
      return;
    }
    const next = selected.includes(option)
      ? selected.filter((item) => item !== option)
      : [...selected, option];
    onChange(next.join("||"));
  }

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-12 w-full items-center justify-between gap-2 rounded-xl border border-input bg-card px-3 text-left text-[12px] text-foreground outline-none focus:border-primary"
      >
        <span className="truncate">{displayValue}</span>
        <CaretDown
          size={14}
          className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={`${label} options`}
          className="absolute left-0 top-[calc(100%+6px)] z-30 max-h-72 w-full min-w-[220px] overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-xl"
        >
          {[anyOption, ...options.slice(1)].map((option) => {
            const checked =
              option === anyOption ? selected.length === 0 : selected.includes(option);
            return (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-[12px] hover:bg-secondary"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(option)}
                  className="size-4 accent-primary"
                />
                {option}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function JobFilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-3 shadow-sm">
      <h2 className="mb-3 text-[13px] font-bold">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function JobToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-[12px] leading-tight">
      <span>{label}</span>
      <button
        type="button"
        aria-label={label}
        aria-pressed={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted"}`}
      >
        <span
          className={`absolute top-1 size-5 rounded-full bg-card shadow-sm transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`}
        />
      </button>
    </label>
  );
}

function HomesFilterPage({
  activeTab,
  search,
  resultCount,
  onClear,
  onTabChange,
  onApply,
  onSave,
}: {
  activeTab: HomeTab;
  search: Search;
  resultCount: number;
  onClear: () => void;
  onTabChange: (tab: HomeTab) => void;
  onApply: (patch: Partial<Search>) => void;
  onSave: (patch?: Partial<Search>) => void;
}) {
  const [location, setLocation] = useState(search.homeLocation ?? search.q ?? "");
  const [propertyType, setPropertyType] = useState(search.propertyType ?? "");
  const [homePrice, setHomePrice] = useState(search.homePrice ?? "");
  const [bedrooms, setBedrooms] = useState(search.bedrooms ?? "");
  const [bathrooms, setBathrooms] = useState(search.bathrooms ?? "");
  const [extra, setExtra] = useState<Record<string, string>>({
    homeSquareFeet: search.homeSquareFeet ?? "",
    homeAcres: search.homeAcres ?? "",
    homeYearBuilt: search.homeYearBuilt == null ? "" : String(search.homeYearBuilt),
    homeHeating: search.homeHeating ?? "",
    homeCooling: search.homeCooling ?? "",
    homeGarageParking: search.homeGarageParking ?? "",
    homeSchoolDistrict: search.homeSchoolDistrict ?? "",
    homePetsPolicy: search.homePetsPolicy ?? "",
    homeSmokingPolicy: search.homeSmokingPolicy ?? "",
    leaseLength: search.leaseLength ?? "",
  });

  useEffect(() => {
    setLocation(search.homeLocation ?? search.q ?? "");
    setPropertyType(search.propertyType ?? "");
    setHomePrice(search.homePrice ?? "");
    setBedrooms(search.bedrooms ?? "");
    setBathrooms(search.bathrooms ?? "");
    setExtra({
      homeSquareFeet: search.homeSquareFeet ?? "",
      homeAcres: search.homeAcres ?? "",
      homeYearBuilt: search.homeYearBuilt == null ? "" : String(search.homeYearBuilt),
      homeHeating: search.homeHeating ?? "",
      homeCooling: search.homeCooling ?? "",
      homeGarageParking: search.homeGarageParking ?? "",
      homeSchoolDistrict: search.homeSchoolDistrict ?? "",
      homePetsPolicy: search.homePetsPolicy ?? "",
      homeSmokingPolicy: search.homeSmokingPolicy ?? "",
      leaseLength: search.leaseLength ?? "",
    });
  }, [
    search.homeLocation,
    search.q,
    search.homePrice,
    search.propertyType,
    search.bedrooms,
    search.bathrooms,
    search.homeYearBuilt,
    search.homeHeating,
    search.homeCooling,
    search.homeGarageParking,
    search.homeSchoolDistrict,
    search.homePetsPolicy,
    search.homeSmokingPolicy,
    search.homeAcres,
    search.homeSquareFeet,
    search.leaseLength,
  ]);

  const extraFields =
    activeTab === "build"
      ? [
          {
            key: "homeSquareFeet",
            label: "Square feet",
            options: homeSquareFeetOptions,
            multi: false,
          },
          {
            key: "homeYearBuilt",
            label: "Year built",
            options: homeYearBuiltOptions,
            multi: false,
          },
          {
            key: "homeHeating",
            label: "Heating",
            options: ["Any heating", "Forced air", "Gas", "Electric", "Heat pump", "Radiant"],
            multi: true,
          },
          {
            key: "homeCooling",
            label: "Cooling",
            options: ["Any cooling", "Central air", "Window unit", "Evaporative", "Heat pump"],
            multi: true,
          },
          {
            key: "homeGarageParking",
            label: "Garage / parking",
            options: ["Any parking", "Attached garage", "Detached garage", "Carport", "No garage"],
            multi: true,
          },
        ]
      : activeTab === "buy"
        ? [
            {
              key: "homeSquareFeet",
              label: "Square feet",
              options: homeSquareFeetOptions,
              multi: false,
            },
            {
              key: "homeYearBuilt",
              label: "Year built",
              options: homeYearBuiltOptions,
              multi: false,
            },
            { key: "homeAcres", label: "Acres", options: homeAcresOptions, multi: false },
            {
              key: "homeHeating",
              label: "Heating",
              options: ["Any heating", "Forced air", "Gas", "Electric", "Heat pump", "Radiant"],
              multi: true,
            },
            {
              key: "homeCooling",
              label: "Cooling",
              options: ["Any cooling", "Central air", "Window unit", "Evaporative", "Heat pump"],
              multi: true,
            },
            {
              key: "homeGarageParking",
              label: "Garage / parking",
              options: [
                "Any parking",
                "Attached garage",
                "Detached garage",
                "Carport",
                "No garage",
              ],
              multi: true,
            },
            {
              key: "homeSchoolDistrict",
              label: "School district",
              options: ["Any district", "West Ada", "Boise", "Nampa", "Vallivue", "Twin Falls"],
              multi: true,
            },
          ]
        : [
            {
              key: "homePetsPolicy",
              label: "Pet policy",
              options: ["Any pet policy", "Cats", "Dogs", "Pets allowed", "No pets"],
              multi: false,
            },
            {
              key: "homeSmokingPolicy",
              label: "Smoking policy",
              options: ["Any smoking policy", "No smoking", "Smoking allowed"],
              multi: false,
            },
            {
              key: "leaseLength",
              label: "Lease length",
              options: leaseLengthOptions,
              multi: false,
            },
            {
              key: "homeSquareFeet",
              label: "Square feet",
              options: homeSquareFeetOptions,
              multi: false,
            },
            {
              key: "homeHeating",
              label: "Heating",
              options: ["Any heating", "Forced air", "Gas", "Electric", "Heat pump", "Radiant"],
              multi: true,
            },
            {
              key: "homeCooling",
              label: "Cooling",
              options: ["Any cooling", "Central air", "Window unit", "Evaporative", "Heat pump"],
              multi: true,
            },
          ];

  function currentPatch(): Partial<Search> {
    const [minPrice, maxPrice] = homePrice.split("||");
    const parsedPrice = (value: string | undefined) => {
      return optionalNonNegativeNumber(value);
    };
    return {
      q: location.trim() || undefined,
      homeLocation: location.trim() || undefined,
      propertyType: propertyType || undefined,
      homePrice: homePrice || undefined,
      priceMin: parsedPrice(minPrice),
      priceMax: parsedPrice(maxPrice),
      bedrooms: bedrooms || undefined,
      bathrooms: bathrooms || undefined,
      homeSquareFeet: undefined,
      homeAcres: undefined,
      homeYearBuilt: undefined,
      homeHeating: undefined,
      homeCooling: undefined,
      homeGarageParking: undefined,
      homeYard: undefined,
      homeSchoolDistrict: undefined,
      homeAvailable: undefined,
      homePetsPolicy: undefined,
      homeSmokingPolicy: undefined,
      leaseLength: undefined,
      ...Object.fromEntries(extraFields.map(({ key }) => [key, extra[key] || undefined])),
    };
  }

  function apply() {
    const patch = currentPatch();
    if (isInvertedRange(patch.priceMin, patch.priceMax)) {
      toast.error("Price minimum cannot exceed maximum.");
      return;
    }
    onApply(patch);
  }

  return (
    <section className="min-w-0 space-y-4">
      <div className="flex flex-col gap-4 border-b border-border pb-4">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
            Bluebird Marketplace Homes
          </p>
          <h1 className="mt-2 text-[22px] font-bold tracking-tight">Find a gem to call home.</h1>
          <p className="mt-1 max-w-[55ch] text-[13px] text-muted-foreground">
            Search new builds, homes for sale, and rentals across Idaho.
          </p>
        </div>
        <div className="grid w-full max-w-[390px] grid-cols-3 rounded-2xl bg-card p-1.5 shadow-sm ring-1 ring-border/70">
          {homeTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              aria-pressed={activeTab === tab.value}
              onClick={() => onTabChange(tab.value)}
              className={`rounded-xl px-2 py-3 text-[13px] font-bold transition-colors ${activeTab === tab.value ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <HomeFilterControl
          label="County, city, neighborhood, or ZIP"
          value={location}
          onChange={setLocation}
          input
        />
        <HomeFilterControl
          label="Property type"
          value={propertyType}
          options={homePropertyTypes}
          multi
          onChange={setPropertyType}
        />
        <HomePriceRangeControl value={homePrice} onChange={setHomePrice} />
        <HomeFilterControl
          label="Bedrooms"
          value={bedrooms}
          options={homeBedroomOptions}
          multi={false}
          onChange={setBedrooms}
        />
        <HomeFilterControl
          label={activeTab === "rent" ? "Bathrooms" : "Bathrooms"}
          value={bathrooms}
          options={homeBathroomOptions}
          multi={false}
          onChange={setBathrooms}
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="submit"
            className="h-11 rounded-xl border border-primary px-4 text-[12px] font-bold text-primary hover:bg-primary hover:text-primary-foreground"
          >
            Search
          </button>
          <button
            type="button"
            onClick={() => onSave(currentPatch())}
            className="h-11 rounded-xl border border-primary px-4 text-[12px] font-bold text-primary hover:bg-secondary"
          >
            Save search
          </button>
        </div>
      </form>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-[12px] text-muted-foreground">
          <strong className="numeric text-foreground">{resultCount.toLocaleString()}</strong>{" "}
          {homeTabs.find((tab) => tab.value === activeTab)?.eyebrow.toLowerCase()}
        </span>

        <button
          type="button"
          onClick={onClear}
          className="text-[12px] font-semibold text-primary underline-offset-2 hover:underline"
        >
          Clear filters
        </button>
      </div>

      <div className="grid gap-3 border-t border-border pt-4">
        {extraFields.map((field) => (
          <div key={field.key} className="min-w-0">
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {field.label}
            </p>
            <HomeFilterControl
              label={field.label}
              value={extra[field.key] ?? ""}
              options={field.options}
              multi={field.multi}
              onChange={(value) => setExtra((current) => ({ ...current, [field.key]: value }))}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={apply}
        className="h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
      >
        Apply filters
      </button>
    </section>
  );
}

function HomeFilterControl({
  label,
  value,
  options,
  onChange,
  input = false,
  multi = false,
}: {
  label: string;
  value: string;
  options?: readonly string[];
  onChange: (value: string) => void;
  input?: boolean;
  multi?: boolean;
}) {
  if (!input && options) {
    return (
      <HomeMultiSelectControl
        label={label}
        value={value}
        options={options}
        multi={multi}
        onChange={onChange}
      />
    );
  }

  return input ? (
    <label className="flex h-12 min-w-0 items-center gap-2 rounded-xl border border-input bg-card px-3 focus-within:border-primary">
      <MapPin size={15} className="shrink-0 text-primary" aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
        className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground"
      />
    </label>
  ) : (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="h-12 w-full appearance-none rounded-xl border border-input bg-card px-3 pr-8 text-[12px] text-foreground outline-none focus:border-primary"
      >
        {options?.map((option) => (
          <option key={option} value={option === options[0] ? "" : option}>
            {option}
          </option>
        ))}
      </select>
      <CaretDown
        size={14}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </label>
  );
}

function HomePriceRangeControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [min, max] = value.split("||");
  const summary = min || max ? `$${min || "0"} – ${max ? `$${max}` : "No max"}` : "Any price";

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Price"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-12 w-full items-center justify-between gap-3 rounded-xl border border-input bg-card px-3 text-left text-[12px] text-foreground outline-none focus:border-primary"
      >
        <span className="min-w-0 truncate">{summary}</span>
        <CaretDown
          size={14}
          className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 w-full min-w-[260px] rounded-xl border border-border bg-card p-3 shadow-xl">
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Min price
              </span>
              <span className="flex h-12 items-center gap-1 rounded-lg border border-input px-2">
                <span className="text-muted-foreground">$</span>
                <input
                  aria-label="Minimum price"
                  inputMode="numeric"
                  value={min ?? ""}
                  onChange={(event) => onChange(`${event.target.value}||${max ?? ""}`)}
                  placeholder="0"
                  className="min-w-0 w-full bg-transparent text-[12px] outline-none"
                />
              </span>
            </label>
            <label className="min-w-0">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Max price
              </span>
              <span className="flex h-12 items-center gap-1 rounded-lg border border-input px-2">
                <span className="text-muted-foreground">$</span>
                <input
                  aria-label="Maximum price"
                  inputMode="numeric"
                  value={max ?? ""}
                  onChange={(event) => onChange(`${min ?? ""}||${event.target.value}`)}
                  placeholder="No max"
                  className="min-w-0 w-full bg-transparent text-[12px] outline-none"
                />
              </span>
            </label>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 h-10 w-full rounded-lg bg-primary text-[12px] font-semibold text-primary-foreground"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

function HomeMultiSelectControl({
  label,
  value,
  options,
  multi = false,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  multi?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = value ? value.split(/\|{1,2}/).filter(Boolean) : [];
  const visibleSelected = multi ? selected : selected.slice(0, 1);
  const summary =
    visibleSelected.length === 0
      ? options[0]
      : visibleSelected.length === 1
        ? visibleSelected[0]
        : `${visibleSelected.length} selected`;

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  function toggle(option: string) {
    if (option === options[0]) {
      onChange("");
      return;
    }
    if (!multi) {
      onChange(visibleSelected[0] === option ? "" : option);
      return;
    }
    const next = selected.includes(option)
      ? selected.filter((item) => item !== option)
      : [...selected, option];
    onChange(next.join("||"));
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-12 w-full items-center justify-between gap-3 rounded-xl border border-input bg-card px-3 text-left text-[12px] text-foreground outline-none focus:border-primary"
      >
        <span className="min-w-0 truncate">{summary}</span>
        <CaretDown
          size={14}
          className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 max-h-72 w-full min-w-[230px] overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-xl">
          {options.map((option) => {
            const checked =
              option === options[0]
                ? visibleSelected.length === 0
                : visibleSelected.includes(option);
            return (
              <button
                key={option}
                type="button"
                aria-pressed={checked}
                onClick={() => toggle(option)}
                className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[12px] hover:bg-secondary"
              >
                <span
                  className={`flex size-4 shrink-0 items-center justify-center rounded border ${checked ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}
                >
                  {checked && <Check size={11} weight="bold" aria-hidden="true" />}
                </span>
                <span className="truncate">{option}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function VehicleResultsPage({
  search,
  result,
  onClear,
  onApply,
  onSave,
  onSell,
}: {
  search: Search;
  result: ClassifiedBrowseResult;
  onClear: () => void;
  onApply: (patch: Partial<Search>) => void;
  onSave: (patch?: Partial<Search>) => void;
  onSell: () => void;
}) {
  const [term, setTerm] = useState(search.q ?? "");
  const [make, setMake] = useState(search.make ?? "");
  const [model, setModel] = useState(search.model ?? "");
  const [yearMin, setYearMin] = useState(search.yearMin == null ? "" : String(search.yearMin));
  const [yearMax, setYearMax] = useState(search.yearMax == null ? "" : String(search.yearMax));
  const [priceMin, setPriceMin] = useState(search.priceMin == null ? "" : String(search.priceMin));
  const [priceMax, setPriceMax] = useState(search.priceMax == null ? "" : String(search.priceMax));
  const [mileageBands, setMileageBands] = useState(
    splitVehicleFilter(search.mileageBands)[0] ?? "",
  );
  const [bodyStyle, setBodyStyle] = useState(search.bodyStyle ?? "");
  const [condition, setCondition] = useState(search.condition ?? "");
  const [fulfillment, setFulfillment] = useState(search.fulfillment ?? "");
  const [drivetrain, setDrivetrain] = useState(search.drivetrain ?? "");
  const [transmission, setTransmission] = useState(search.transmission ?? "");
  const [fuelType, setFuelType] = useState(search.fuelType ?? "");
  const [exteriorColor, setExteriorColor] = useState(search.exteriorColor ?? "");
  const [titleStatus, setTitleStatus] = useState(search.titleStatus ?? "");
  const [region, setRegion] = useState(search.region ?? "");
  const [state, setState] = useState(search.state ?? "");
  const [city, setCity] = useState(search.city ?? "");
  const [radiusMiles, setRadiusMiles] = useState(search.radiusMiles ?? 25);
  const [mapPoint, setMapPoint] = useState<LocationPoint | undefined>(
    search.latitude != null && search.longitude != null
      ? { latitude: search.latitude, longitude: search.longitude, city: search.city }
      : undefined,
  );
  const [mapOpen, setMapOpen] = useState(false);
  const [pendingResultCount, setPendingResultCount] = useState<number | null>(null);
  const previewRequest = useRef(0);
  const selectedMakes = splitVehicleFilter(make);
  const availableModels = modelsForMakes(selectedMakes);

  useEffect(() => {
    setTerm(search.q ?? "");
    setMake(search.make ?? "");
    setModel(search.model ?? "");
    setYearMin(search.yearMin == null ? "" : String(search.yearMin));
    setYearMax(search.yearMax == null ? "" : String(search.yearMax));
    setPriceMin(search.priceMin == null ? "" : String(search.priceMin));
    setPriceMax(search.priceMax == null ? "" : String(search.priceMax));
    setMileageBands(splitVehicleFilter(search.mileageBands)[0] ?? "");
    setBodyStyle(search.bodyStyle ?? "");
    setCondition(search.condition ?? "");
    setFulfillment(search.fulfillment ?? "");
    setDrivetrain(search.drivetrain ?? "");
    setTransmission(search.transmission ?? "");
    setFuelType(search.fuelType ?? "");
    setExteriorColor(search.exteriorColor ?? "");
    setTitleStatus(search.titleStatus ?? "");
    setRegion(search.region ?? "");
    setState(search.state ?? "");
    setCity(search.city ?? "");
    setRadiusMiles(search.radiusMiles ?? 25);
    setMapPoint(
      search.latitude != null && search.longitude != null
        ? { latitude: search.latitude, longitude: search.longitude, city: search.city }
        : undefined,
    );
  }, [search]);

  useEffect(() => {
    const available = new Set(modelsForMakes(splitVehicleFilter(make)));
    setModel((current) =>
      splitVehicleFilter(current)
        .filter((value) => available.has(value))
        .join("||"),
    );
  }, [make]);

  function currentPatch(): Partial<Search> {
    const numberValue = (value: string) => optionalNonNegativeNumber(value);
    const integerValue = (value: string) => optionalNonNegativeInteger(value);
    return {
      q: term.trim() || undefined,
      make: make || undefined,
      model: model || undefined,
      yearMin: integerValue(yearMin),
      yearMax: integerValue(yearMax),
      priceMin: numberValue(priceMin),
      priceMax: numberValue(priceMax),
      mileageBands: mileageBands || undefined,
      bodyStyle: bodyStyle || undefined,
      condition: condition || undefined,
      fulfillment: fulfillment || undefined,
      drivetrain: drivetrain || undefined,
      transmission: transmission || undefined,
      fuelType: fuelType || undefined,
      exteriorColor: exteriorColor || undefined,
      titleStatus: titleStatus || undefined,
      region: region || undefined,
      state: state || undefined,
      city: isPostalCode(city) ? undefined : city.trim() || undefined,
      postalCode: isPostalCode(city) ? city.trim() : undefined,
      radiusMiles: isPostalCode(city)
        ? undefined
        : city.trim() || mapPoint
          ? radiusMiles
          : undefined,
      latitude: mapPoint?.latitude,
      longitude: mapPoint?.longitude,
    };
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      const requestId = ++previewRequest.current;
      const pendingSearch = {
        ...search,
        ...currentPatch(),
        page: undefined,
        vehicleMode: "results" as const,
      };
      void browseClassifieds({ data: inputFromSearch(pendingSearch) }).then((preview) => {
        if (requestId === previewRequest.current) setPendingResultCount(preview.total);
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [
    bodyStyle,
    city,
    condition,
    drivetrain,
    exteriorColor,
    fuelType,
    fulfillment,
    make,
    mileageBands,
    model,
    priceMax,
    priceMin,
    region,
    search,
    state,
    term,
    titleStatus,
    transmission,
    yearMax,
    yearMin,
    radiusMiles,
    mapPoint,
  ]);

  function apply() {
    const patch = currentPatch();
    if (
      isInvertedRange(patch.yearMin, patch.yearMax) ||
      isInvertedRange(patch.priceMin, patch.priceMax)
    ) {
      toast.error("Minimum cannot exceed maximum.");
      return;
    }
    setPendingResultCount(null);
    onApply(patch);
  }

  return (
    <div className="mt-8">
      <section className="floating-card overflow-visible p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
              Bluebird motors
            </p>
            <h1 className="mt-1 text-[28px] font-bold tracking-tight">Cars & Trucks</h1>
          </div>
          <div className="grid w-full max-w-[330px] grid-cols-2 rounded-2xl bg-secondary p-1.5 ring-1 ring-border/70">
            <button
              type="button"
              aria-pressed="true"
              className="rounded-xl bg-primary px-3 py-3 text-[13px] font-bold text-primary-foreground shadow-sm"
            >
              Buy
            </button>
            <button
              type="button"
              onClick={onSell}
              className="rounded-xl px-3 py-3 text-[13px] font-bold hover:bg-card"
            >
              Sell
            </button>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="text-[12px] font-semibold text-primary underline-offset-2 hover:underline"
          >
            Clear filters
          </button>
        </div>
        <form
          className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <label className="flex h-12 min-w-0 items-center gap-2 rounded-xl border border-input bg-card px-3 focus-within:border-primary">
            <MagnifyingGlass size={16} className="shrink-0 text-primary" aria-hidden="true" />
            <span className="sr-only">Search cars</span>
            <input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search cars, trucks, and more"
              className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground"
            />
          </label>
          <button
            type="submit"
            className="h-12 rounded-xl bg-primary px-5 text-[12px] font-bold text-primary-foreground hover:opacity-90"
          >
            Search
          </button>
        </form>
        <div className="mt-5 flex justify-end border-t border-border pt-4">
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => onSave(currentPatch())}
              className="inline-flex items-center gap-2 rounded-full border border-primary px-4 py-2.5 text-[12px] font-bold text-primary hover:bg-secondary"
            >
              <BookmarkSimple size={15} aria-hidden="true" />
              Save this search
            </button>
          </div>
        </div>
      </section>

      <div className="mt-7 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <ResponsiveBrowseFilters title="Vehicle filters" resetKey={JSON.stringify(search)}>
          <div className="space-y-3">
            <VehicleFilterGroup title="Make / model">
              <VehicleCheckboxList
                label="Makes"
                value={make}
                options={vehicleOptions.makes}
                onChange={setMake}
              />
              {selectedMakes.length > 0 && (
                <VehicleCheckboxList
                  label="Models"
                  value={model}
                  options={availableModels}
                  onChange={setModel}
                />
              )}
            </VehicleFilterGroup>
            <VehicleFilterGroup title="Year">
              <div className="grid grid-cols-2 gap-2">
                <VehicleTextField
                  label="Year from"
                  value={yearMin}
                  onChange={setYearMin}
                  placeholder="From"
                  numeric
                />
                <VehicleTextField
                  label="Year to"
                  value={yearMax}
                  onChange={setYearMax}
                  placeholder="To"
                  numeric
                />
              </div>
            </VehicleFilterGroup>
            <VehicleFilterGroup title="Price">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <VehicleTextField
                  label="Minimum price"
                  value={priceMin}
                  onChange={setPriceMin}
                  placeholder="$ From"
                  numeric
                />
                <span className="text-muted-foreground">–</span>
                <VehicleTextField
                  label="Maximum price"
                  value={priceMax}
                  onChange={setPriceMax}
                  placeholder="$ To"
                  numeric
                />
              </div>
            </VehicleFilterGroup>
            <VehicleFilterGroup title="Mileage">
              <VehicleSingleSelectList
                label="Mileage"
                value={mileageBands}
                options={mileageBandOptions}
                onChange={setMileageBands}
              />
            </VehicleFilterGroup>
            <VehicleFilterGroup title="Body type">
              <VehicleCheckboxList
                label="Body type"
                value={bodyStyle}
                options={vehicleOptions.bodyStyles}
                onChange={setBodyStyle}
              />
            </VehicleFilterGroup>
            <VehicleFilterGroup title="Condition">
              <VehicleCheckboxList
                label="Condition"
                value={condition}
                options={vehicleConditionOptions}
                onChange={setCondition}
              />
            </VehicleFilterGroup>
            <VehicleFilterGroup title="Delivery">
              <VehicleCheckboxList
                label="Delivery"
                value={fulfillment}
                options={[
                  { value: "local_pickup", label: "Local pickup" },
                  { value: "shipping", label: "Ships" },
                  { value: "both", label: "Pickup or shipping" },
                ]}
                onChange={setFulfillment}
              />
            </VehicleFilterGroup>
            <VehicleFilterGroup title="Drive type">
              <VehicleCheckboxList
                label="Drive type"
                value={drivetrain}
                options={vehicleOptions.drivetrains}
                onChange={setDrivetrain}
              />
            </VehicleFilterGroup>
            <VehicleFilterGroup title="Transmission">
              <VehicleCheckboxList
                label="Transmission"
                value={transmission}
                options={vehicleOptions.transmissions}
                onChange={setTransmission}
              />
            </VehicleFilterGroup>
            <VehicleFilterGroup title="Fuel type">
              <VehicleCheckboxList
                label="Fuel type"
                value={fuelType}
                options={vehicleOptions.fuelTypes}
                onChange={setFuelType}
              />
            </VehicleFilterGroup>
            <VehicleFilterGroup title="Exterior color">
              <VehicleCheckboxList
                label="Exterior color"
                value={exteriorColor}
                options={vehicleOptions.exteriorColors}
                onChange={setExteriorColor}
              />
            </VehicleFilterGroup>
            <VehicleFilterGroup title="Title type">
              <VehicleCheckboxList
                label="Title type"
                value={titleStatus}
                options={vehicleOptions.titleStatuses}
                onChange={setTitleStatus}
              />
            </VehicleFilterGroup>
            <VehicleFilterGroup title="Location">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Start with a city or ZIP code. Region and state are optional broader browsing
                controls.
              </p>
              <select
                aria-label="Region"
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                className="filter-input w-full"
              >
                <option value="">Any region (optional)</option>
                {idahoRegions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <select
                aria-label="State"
                value={state}
                onChange={(event) => setState(event.target.value)}
                className="filter-input w-full"
              >
                <option value="">Any state (optional)</option>
                {usStates.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
              <VehicleTextField
                label="City or ZIP code"
                value={city}
                onChange={(value) => {
                  setCity(value);
                  setMapPoint(undefined);
                }}
                placeholder="Boise or 83702"
              />
              <button
                type="button"
                onClick={() => setMapOpen((open) => !open)}
                className="text-left text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
                aria-expanded={mapOpen}
              >
                {mapOpen ? "Hide map" : "Choose anywhere on map"}
              </button>
              {mapOpen ? (
                <LocationRadiusPicker
                  city={city}
                  latitude={mapPoint?.latitude}
                  longitude={mapPoint?.longitude}
                  radiusMiles={radiusMiles}
                  onChange={(point) => {
                    setMapPoint(point);
                    setCity(point.city ?? "");
                  }}
                />
              ) : null}
              <label className="block text-[11px] font-medium text-muted-foreground">
                Distance radius:{" "}
                <span className="font-semibold text-foreground">{radiusMiles} miles</span>
                <input
                  type="range"
                  min="5"
                  max="500"
                  step="5"
                  value={radiusMiles}
                  onChange={(event) => setRadiusMiles(Number(event.target.value))}
                  className="mt-2 w-full accent-primary"
                  disabled={(!city.trim() && !mapPoint) || isPostalCode(city)}
                />
                {isPostalCode(city) ? (
                  <span className="mt-1 block font-normal">
                    ZIP searches match that ZIP; use a city for distance.
                  </span>
                ) : null}
              </label>
            </VehicleFilterGroup>
            <button
              type="button"
              onClick={apply}
              className="h-11 w-full rounded-xl bg-primary text-[12px] font-bold text-primary-foreground hover:opacity-90"
            >
              Show {(pendingResultCount ?? result.total).toLocaleString()} results
            </button>
          </div>
        </ResponsiveBrowseFilters>

        <section id="results" aria-label="Car listings" className="min-w-0 lg:col-start-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <p className="text-[13px] text-muted-foreground">
              <strong className="numeric text-foreground">{result.total}</strong> cars and trucks
            </p>
            <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
              Sort by
              <select
                className="select-chevron h-9 rounded-lg border border-input bg-card pl-2 pr-7 text-[12px] text-foreground"
                value={search.sort ?? "newest"}
                onChange={(event) => onApply({ sort: event.target.value as Sort })}
              >
                <option value="newest">Newest first</option>
                <option value="price_low">Lowest price</option>
                <option value="price_high">Highest price</option>
              </select>
            </label>
          </div>
          {result.listings.length === 0 ? (
            <BluebirdEmptyState
              className="mt-5"
              title="No cars match these filters."
              description="Try widening your year, price, make, model, or location choices."
            />
          ) : (
            <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3 xl:grid-cols-3">
              {result.listings.map((listing) => (
                <li key={listing.id}>
                  <ListingCard listing={listing} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

type VehicleFilterOption = string | { value: string; label: string };

function VehicleCheckboxList({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly VehicleFilterOption[];
  onChange: (value: string) => void;
}) {
  const selected = value.split("||").filter(Boolean);
  const toggle = (option: VehicleFilterOption) => {
    const optionValue = typeof option === "string" ? option : option.value;
    onChange(
      selected.includes(optionValue)
        ? selected.filter((item) => item !== optionValue).join("||")
        : [...selected, optionValue].join("||"),
    );
  };
  return (
    <div role="group" aria-label={label} className="max-h-56 space-y-1 overflow-y-auto pr-1">
      {options.map((option) => {
        const optionValue = typeof option === "string" ? option : option.value;
        const optionLabel = typeof option === "string" ? option : option.label;
        const checked = selected.includes(optionValue);
        return (
          <label
            key={optionValue}
            className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 text-[12px] hover:bg-secondary"
          >
            <span>{optionLabel}</span>
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(option)}
              className="size-4 accent-primary"
            />
          </label>
        );
      })}
    </div>
  );
}

function VehicleSingleSelectList({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly VehicleFilterOption[];
  onChange: (value: string) => void;
}) {
  const selected = splitVehicleFilter(value)[0] ?? "";
  const radioName = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div role="radiogroup" aria-label={label} className="max-h-56 space-y-1 overflow-y-auto pr-1">
      {options.map((option) => {
        const optionValue = typeof option === "string" ? option : option.value;
        const optionLabel = typeof option === "string" ? option : option.label;
        return (
          <label
            key={optionValue}
            className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 text-[12px] hover:bg-secondary"
          >
            <span>{optionLabel}</span>
            <input
              type="radio"
              name={radioName}
              value={optionValue}
              checked={selected === optionValue}
              onChange={() => onChange(optionValue)}
              className="size-4 accent-primary"
            />
          </label>
        );
      })}
    </div>
  );
}

function VehicleMultiSelectPanel({
  label,
  value,
  options,
  onApply,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onApply: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="min-w-0">
      <VehicleCheckboxList label={label} value={draft} options={options} onChange={setDraft} />
      <button
        type="button"
        onClick={() => onApply(draft)}
        className="mt-2 h-9 w-full rounded-lg border border-primary text-[11px] font-bold text-primary hover:bg-secondary"
      >
        Apply {label}
      </button>
    </div>
  );
}

function VehicleTextField({
  label,
  value,
  onChange,
  placeholder,
  numeric = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  numeric?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="sr-only">{label}</span>
      <input
        aria-label={label}
        inputMode={numeric ? "numeric" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="filter-input w-full"
      />
    </label>
  );
}

function VehicleFilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-3 shadow-sm">
      <h2 className="mb-3 text-[13px] font-bold">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function VehicleBrowseHero({
  search,
  resultCount,
  activeFilterCount,
  term,
  onTermChange,
  onSearch,
  onFilterChange,
  onSell,
}: {
  search: Search;
  resultCount: number;
  activeFilterCount: number;
  term: string;
  onTermChange: (value: string) => void;
  onSearch: () => void;
  onFilterChange: (patch: Partial<Search>) => void;
  onSell: () => void;
}) {
  const [expandedFilter, setExpandedFilter] = useState<VehicleHeroFilter | null>(null);
  const [showAllFilters, setShowAllFilters] = useState(false);
  const locationLabel = search.city
    ? `${search.city}${search.state ? `, ${search.state}` : ""}`
    : (search.region ?? search.state ?? "Any location");
  const yearLabel =
    search.yearMin != null || search.yearMax != null
      ? `${search.yearMin ?? "Any"}–${search.yearMax ?? "Any"}`
      : "Year";
  const priceLabel =
    search.priceMin != null || search.priceMax != null
      ? search.priceMin != null && search.priceMax != null
        ? `$${search.priceMin}–$${search.priceMax}`
        : search.priceMin != null
          ? `$${search.priceMin}+`
          : `Up to $${search.priceMax}`
      : "Price";
  const selectedSummary = (value: string | undefined, fallback: string) => {
    const values = value?.split("||").filter(Boolean) ?? [];
    return values.length === 0
      ? fallback
      : values.length === 1
        ? (values[0] ?? fallback)
        : `${values.length} selected`;
  };
  const makeModelValues = [search.make, search.model].flatMap(
    (value) => value?.split("||").filter(Boolean) ?? [],
  );
  const makeModelLabel =
    makeModelValues.length === 0
      ? "Make / model"
      : makeModelValues.length === 1
        ? (makeModelValues[0] ?? "Make / model")
        : `${makeModelValues.length} selected`;
  const toggleFilter = (filter: VehicleHeroFilter) =>
    setExpandedFilter((current) => (current === filter ? null : filter));
  const applyInlineFilter = (patch: Partial<Search>) => {
    onFilterChange(patch);
    setExpandedFilter(null);
  };

  const quickFilters: { key: VehicleHeroFilter; label: string; value?: string }[] = [
    { key: "makeModel", label: makeModelLabel },
    { key: "year", label: yearLabel },
    { key: "price", label: priceLabel },
    {
      key: "mileage",
      label: selectedSummary(
        search.mileageBands,
        search.mileageMax != null ? `≤ ${search.mileageMax.toLocaleString()} mi` : "Mileage",
      ),
    },
    { key: "bodyStyle", label: selectedSummary(search.bodyStyle, "Body type") },
    { key: "titleStatus", label: selectedSummary(search.titleStatus, "Title type") },
  ];
  const additionalFilters: { key: VehicleHeroFilter; label: string }[] = [
    { key: "condition", label: selectedSummary(search.condition, "Condition") },
    { key: "fulfillment", label: selectedSummary(search.fulfillment, "Delivery") },
    { key: "drivetrain", label: selectedSummary(search.drivetrain, "Drive type") },
    { key: "transmission", label: selectedSummary(search.transmission, "Transmission") },
    { key: "fuelType", label: selectedSummary(search.fuelType, "Fuel type") },
    { key: "exteriorColor", label: selectedSummary(search.exteriorColor, "Exterior color") },
  ];

  function filterPanel(filter: VehicleHeroFilter) {
    switch (filter) {
      case "makeModel":
        return <InlineVehicleMakeModelFilter search={search} onApply={applyInlineFilter} />;
      case "year":
        return (
          <InlineRangeFilter
            firstLabel="Year from"
            secondLabel="Year to"
            firstValue={search.yearMin}
            secondValue={search.yearMax}
            onApply={(first, second) => applyInlineFilter({ yearMin: first, yearMax: second })}
          />
        );
      case "price":
        return (
          <InlineRangeFilter
            firstLabel="Min price"
            secondLabel="Max price"
            firstValue={search.priceMin}
            secondValue={search.priceMax}
            onApply={(first, second) => applyInlineFilter({ priceMin: first, priceMax: second })}
            prefix="$"
          />
        );
      case "mileage":
        return (
          <InlineSingleFilter
            label="Mileage"
            value={search.mileageBands}
            options={mileageBandOptions}
            onApply={(value) => applyInlineFilter({ mileageBands: value })}
          />
        );
      case "bodyStyle":
        return (
          <InlineMultiFilter
            label="Body type"
            value={search.bodyStyle}
            options={vehicleOptions.bodyStyles}
            onApply={(value) => applyInlineFilter({ bodyStyle: value })}
          />
        );
      case "titleStatus":
        return (
          <InlineMultiFilter
            label="Title type"
            value={search.titleStatus}
            options={vehicleOptions.titleStatuses}
            onApply={(value) => applyInlineFilter({ titleStatus: value })}
          />
        );
      case "drivetrain":
        return (
          <InlineMultiFilter
            label="Drive type"
            value={search.drivetrain}
            options={vehicleOptions.drivetrains}
            onApply={(value) => applyInlineFilter({ drivetrain: value })}
          />
        );
      case "transmission":
        return (
          <InlineMultiFilter
            label="Transmission"
            value={search.transmission}
            options={vehicleOptions.transmissions}
            onApply={(value) => applyInlineFilter({ transmission: value })}
          />
        );
      case "fuelType":
        return (
          <InlineMultiFilter
            label="Fuel type"
            value={search.fuelType}
            options={vehicleOptions.fuelTypes}
            onApply={(value) => applyInlineFilter({ fuelType: value })}
          />
        );
      case "exteriorColor":
        return (
          <InlineMultiFilter
            label="Exterior color"
            value={search.exteriorColor}
            options={vehicleOptions.exteriorColors}
            onApply={(value) => applyInlineFilter({ exteriorColor: value })}
          />
        );
      case "location":
        return <InlineLocationFilter search={search} onApply={applyInlineFilter} />;
      case "condition":
        return (
          <InlineMultiFilter
            label="Condition"
            value={search.condition}
            options={vehicleConditionOptions}
            onApply={(value) => applyInlineFilter({ condition: value })}
          />
        );
      case "fulfillment":
        return (
          <InlineMultiFilter
            label="Delivery"
            value={search.fulfillment}
            options={[
              { value: "local_pickup", label: "Local pickup" },
              { value: "shipping", label: "Ships" },
              { value: "both", label: "Pickup or shipping" },
            ]}
            onApply={(value) => applyInlineFilter({ fulfillment: value })}
          />
        );
    }
  }

  return (
    <section className="floating-card relative overflow-visible bg-surface px-5 py-12 sm:px-8 sm:py-14">
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
        <div className="absolute -right-24 -top-32 h-72 w-72 rounded-full bg-brand-warm/35" />
        <div className="absolute -bottom-36 left-1/3 h-64 w-64 rounded-full bg-primary/5" />
      </div>
      <div className="absolute right-5 top-5 z-20 sm:right-7 sm:top-7">
        <SponsoredHeroBadge />
      </div>

      <div className="relative pt-12 sm:pt-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
              Bluebird motors
            </p>
            <h1 className="mt-2 max-w-[22ch] text-[30px] font-bold leading-tight tracking-tight sm:text-[38px]">
              Find your next gem on wheels.
            </h1>
            <p className="mt-2 max-w-[52ch] text-[13.5px] leading-relaxed text-muted-foreground">
              Shop cars, trucks, powersports, trailers, and more from local sellers.
            </p>
          </div>

          <div className="grid w-full max-w-[360px] grid-cols-2 rounded-2xl bg-card p-1.5 shadow-sm ring-1 ring-border/70">
            <button
              type="button"
              className="h-14 rounded-xl bg-primary px-5 text-[16px] font-bold text-primary-foreground shadow-sm"
              aria-pressed="true"
            >
              Buy
            </button>
            <button
              type="button"
              onClick={onSell}
              className="h-14 rounded-xl px-5 text-[16px] font-bold text-foreground transition-colors hover:bg-secondary"
            >
              Sell
            </button>
          </div>
        </div>

        <form
          className="mt-7 grid gap-2 rounded-2xl bg-card p-2 shadow-sm ring-1 ring-border/60 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch();
          }}
        >
          <label className="relative flex h-14 items-center rounded-xl border border-transparent bg-secondary/55 px-3 focus-within:border-primary/40 focus-within:bg-card">
            <MagnifyingGlass
              size={18}
              className="shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="sr-only">Search vehicles</span>
            <input
              type="search"
              value={term}
              onChange={(event) => onTermChange(event.target.value)}
              placeholder="Search for..."
              aria-label="Search vehicles"
              className="min-w-0 flex-1 bg-transparent px-2 text-[13.5px] outline-none placeholder:text-muted-foreground"
            />
            {term && (
              <button
                type="button"
                onClick={() => onTermChange("")}
                aria-label="Clear vehicle search"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground"
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </label>
          {quickFilters.map(({ key, label }, index) => (
            <VehicleQuickFilter
              key={key}
              label={label}
              expanded={expandedFilter === key}
              onClick={() => toggleFilter(key)}
            >
              {filterPanel(key)}
            </VehicleQuickFilter>
          ))}
          {showAllFilters &&
            additionalFilters.map(({ key, label }, index) => (
              <VehicleQuickFilter
                key={key}
                label={label}
                expanded={expandedFilter === key}
                onClick={() => toggleFilter(key)}
              >
                {filterPanel(key)}
              </VehicleQuickFilter>
            ))}
        </form>

        <div className="mt-5 flex flex-col gap-3 text-[12.5px] sm:flex-row sm:items-center sm:justify-between">
          <div className="relative self-start">
            <button
              type="button"
              onClick={() =>
                setExpandedFilter((current) => (current === "location" ? null : "location"))
              }
              className="inline-flex items-center gap-2 text-primary hover:underline"
            >
              <MapPin size={18} weight="duotone" aria-hidden="true" />
              <span className="flex flex-col items-start leading-tight">
                <span className="text-[10px] font-bold uppercase tracking-[0.08em]">
                  Select location
                </span>
                <span className="mt-0.5 text-[12.5px] font-semibold">{locationLabel}</span>
              </span>
            </button>
            {expandedFilter === "location" && (
              <div className="absolute left-0 top-[calc(100%+8px)] z-40 w-[280px] rounded-xl bg-card p-4 text-left shadow-xl ring-1 ring-border/70">
                <InlineLocationFilter search={search} onApply={applyInlineFilter} />
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => {
                setShowAllFilters((current) => !current);
                setExpandedFilter(null);
              }}
              className="inline-flex items-center gap-2 font-semibold text-primary hover:underline"
            >
              <FunnelSimple size={17} weight="duotone" aria-hidden="true" />
              {showAllFilters ? "Hide all search filters" : "Show all search filters"}
              {activeFilterCount > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-foreground">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={onSearch}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 font-bold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5"
            >
              Show {resultCount.toLocaleString()} {resultCount === 1 ? "result" : "results"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function VehicleQuickFilter({
  label,
  onClick,
  expanded,
  children,
}: {
  label: string;
  onClick: () => void;
  expanded: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`relative ${expanded ? "z-30" : ""}`}>
      <button
        type="button"
        onClick={onClick}
        aria-expanded={expanded}
        className="flex h-[70px] w-full items-center justify-between rounded-xl border border-transparent bg-secondary/55 px-4 text-left text-[13.5px] font-semibold transition-colors hover:border-primary/40 hover:bg-card"
      >
        <span className="truncate">{label}</span>
        <CaretDown
          size={16}
          weight="bold"
          aria-hidden="true"
          className={`ml-2 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-40 w-full rounded-xl bg-card p-4 shadow-xl ring-1 ring-border/70">
          {children}
        </div>
      )}
    </div>
  );
}

function InlineVehicleMakeModelFilter({
  search,
  onApply,
}: {
  search: Search;
  onApply: (patch: Partial<Search>) => void;
}) {
  const [make, setMake] = useState(search.make ?? "");
  const [model, setModel] = useState(search.model ?? "");
  const selectedMakes = splitVehicleFilter(make);
  const availableModels = modelsForMakes(selectedMakes);

  useEffect(() => {
    setMake(search.make ?? "");
    setModel(search.model ?? "");
  }, [search.make, search.model]);

  useEffect(() => {
    const available = new Set(modelsForMakes(splitVehicleFilter(make)));
    setModel((current) =>
      splitVehicleFilter(current)
        .filter((value) => available.has(value))
        .join("||"),
    );
  }, [make]);

  return (
    <div className="w-full space-y-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Makes
      </p>
      <VehicleCheckboxList
        label="Makes"
        value={make}
        options={vehicleOptions.makes}
        onChange={setMake}
      />
      {selectedMakes.length > 0 && (
        <>
          <p className="pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Models
          </p>
          <VehicleCheckboxList
            label="Models"
            value={model}
            options={availableModels}
            onChange={setModel}
          />
        </>
      )}
      <InlineApplyButton
        onClick={() => onApply({ make: make || undefined, model: model || undefined })}
      />
    </div>
  );
}

function InlineMultiFilter({
  label,
  value,
  options,
  onApply,
}: {
  label: string;
  value: string | undefined;
  options: readonly VehicleFilterOption[];
  onApply: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <VehicleCheckboxList label={label} value={draft} options={options} onChange={setDraft} />
      <InlineApplyButton onClick={() => onApply(draft)} />
    </div>
  );
}

function InlineSingleFilter({
  label,
  value,
  options,
  onApply,
}: {
  label: string;
  value: string | undefined;
  options: readonly VehicleFilterOption[];
  onApply: (value: string) => void;
}) {
  const [draft, setDraft] = useState(splitVehicleFilter(value)[0] ?? "");
  useEffect(() => setDraft(splitVehicleFilter(value)[0] ?? ""), [value]);
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <VehicleSingleSelectList label={label} value={draft} options={options} onChange={setDraft} />
      <InlineApplyButton onClick={() => onApply(draft)} />
    </div>
  );
}

function InlineRangeFilter({
  firstLabel,
  secondLabel,
  firstValue,
  secondValue,
  onApply,
  prefix = "",
}: {
  firstLabel: string;
  secondLabel: string;
  firstValue: number | undefined;
  secondValue: number | undefined;
  onApply: (first?: number, second?: number) => void;
  prefix?: string;
}) {
  const [first, setFirst] = useState(firstValue == null ? "" : String(firstValue));
  const [second, setSecond] = useState(secondValue == null ? "" : String(secondValue));

  useEffect(() => {
    setFirst(firstValue == null ? "" : String(firstValue));
    setSecond(secondValue == null ? "" : String(secondValue));
  }, [firstValue, secondValue]);

  const parse = (value: string) => {
    return optionalNonNegativeNumber(value);
  };

  return (
    <div className="w-full space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <label className="relative">
          <span className="sr-only">{firstLabel}</span>
          {prefix && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {prefix}
            </span>
          )}
          <input
            type="number"
            min="0"
            value={first}
            onChange={(event) => setFirst(event.target.value)}
            placeholder={firstLabel}
            className={`filter-input w-full ${prefix ? "pl-7" : ""}`}
          />
        </label>
        <label className="relative">
          <span className="sr-only">{secondLabel}</span>
          {prefix && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {prefix}
            </span>
          )}
          <input
            type="number"
            min="0"
            value={second}
            onChange={(event) => setSecond(event.target.value)}
            placeholder={secondLabel}
            className={`filter-input w-full ${prefix ? "pl-7" : ""}`}
          />
        </label>
      </div>
      <InlineApplyButton
        onClick={() => {
          const min = parse(first);
          const max = parse(second);
          if (isInvertedRange(min, max)) {
            toast.error("Minimum cannot exceed maximum.");
            return;
          }
          onApply(min, max);
        }}
      />
    </div>
  );
}

function InlineNumberFilter({
  label,
  value,
  onApply,
}: {
  label: string;
  value: number | undefined;
  onApply: (value?: number) => void;
}) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));

  useEffect(() => setDraft(value == null ? "" : String(value)), [value]);

  return (
    <div className="w-full space-y-2.5">
      <label>
        <span className="sr-only">{label}</span>
        <input
          type="number"
          min="0"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={label}
          className="filter-input w-full"
        />
      </label>
      <InlineApplyButton
        onClick={() => {
          onApply(optionalNonNegativeNumber(draft));
        }}
      />
    </div>
  );
}

function InlineSelectFilter({
  value,
  options,
  placeholder,
  onChange,
  optionLabels,
}: {
  value: string | undefined;
  options: readonly (string | { value: string; label: string })[];
  placeholder: string;
  onChange: (value?: string) => void;
  optionLabels?: Record<string, string>;
}) {
  return (
    <select
      autoFocus
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || undefined)}
      className="filter-input w-full"
    >
      <option value="">{placeholder}</option>
      {options.map((option) => {
        const optionValue = typeof option === "string" ? option : option.value;
        const label =
          typeof option === "string" ? (optionLabels?.[option] ?? option) : option.label;
        return (
          <option key={optionValue} value={optionValue}>
            {label}
          </option>
        );
      })}
    </select>
  );
}

function InlineLocationFilter({
  search,
  onApply,
}: {
  search: Search;
  onApply: (patch: Partial<Search>) => void;
}) {
  const [region, setRegion] = useState(search.region ?? "");
  const [state, setState] = useState(search.state ?? "");
  const [city, setCity] = useState(search.city ?? "");
  const [radiusMiles, setRadiusMiles] = useState(search.radiusMiles ?? 25);
  const [mapPoint, setMapPoint] = useState<LocationPoint | undefined>(
    search.latitude != null && search.longitude != null
      ? { latitude: search.latitude, longitude: search.longitude, city: search.city }
      : undefined,
  );
  const [mapOpen, setMapOpen] = useState(false);

  useEffect(() => {
    setRegion(search.region ?? "");
    setState(search.state ?? "");
    setCity(search.city ?? search.postalCode ?? "");
    setRadiusMiles(search.radiusMiles ?? 25);
    setMapPoint(
      search.latitude != null && search.longitude != null
        ? { latitude: search.latitude, longitude: search.longitude, city: search.city }
        : undefined,
    );
  }, [
    search.region,
    search.state,
    search.city,
    search.postalCode,
    search.radiusMiles,
    search.latitude,
    search.longitude,
  ]);

  return (
    <div className="w-full space-y-2.5">
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Choose a city or ZIP first. Region and state are optional broader browsing controls.
      </p>
      <select
        value={region}
        onChange={(event) => setRegion(event.target.value)}
        className="filter-input w-full"
      >
        <option value="">Any region (optional)</option>
        {idahoRegions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <select
        value={state}
        onChange={(event) => setState(event.target.value)}
        className="filter-input w-full"
      >
        <option value="">Any state (optional)</option>
        {usStates.map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
      <input
        value={city}
        onChange={(event) => {
          setCity(event.target.value);
          setMapPoint(undefined);
        }}
        placeholder="City or ZIP code, e.g. Boise or 83702"
        aria-label="City or ZIP code"
        className="filter-input w-full"
        list="bluebird-city-options"
      />
      <datalist id="bluebird-city-options">
        {marketplaceCities.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <button
        type="button"
        onClick={() => setMapOpen((open) => !open)}
        className="text-left text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
        aria-expanded={mapOpen}
      >
        {mapOpen ? "Hide map" : "Choose anywhere on map"}
      </button>
      {mapOpen ? (
        <LocationRadiusPicker
          city={city}
          latitude={mapPoint?.latitude}
          longitude={mapPoint?.longitude}
          radiusMiles={radiusMiles}
          onChange={(point) => {
            setMapPoint(point);
            setCity(point.city ?? "");
          }}
        />
      ) : null}
      {city.trim() && !isPostalCode(city) ? (
        <span className="sr-only">Within {radiusMiles} miles</span>
      ) : null}
      {isPostalCode(city) ? (
        <p className="rounded-xl bg-secondary px-3 py-2 text-[11px] text-muted-foreground">
          ZIP searches match <strong className="text-foreground">{city.trim()}</strong>. Use a city
          when you want a distance radius.
        </p>
      ) : null}
      <label className="block text-[11px] font-medium text-muted-foreground">
        Search radius: <span className="font-semibold text-foreground">{radiusMiles} miles</span>
        <input
          type="range"
          min="5"
          max="500"
          step="5"
          value={radiusMiles}
          onChange={(event) => setRadiusMiles(Number(event.target.value))}
          className="mt-2 w-full accent-primary"
          disabled={(!city.trim() && !mapPoint) || isPostalCode(city)}
        />
      </label>
      <InlineApplyButton
        onClick={() =>
          onApply({
            region: region || undefined,
            state: state || undefined,
            city: isPostalCode(city) ? undefined : city.trim() || undefined,
            postalCode: isPostalCode(city) ? city.trim() : undefined,
            radiusMiles: isPostalCode(city)
              ? undefined
              : city.trim() || mapPoint
                ? radiusMiles
                : undefined,
            latitude: mapPoint?.latitude,
            longitude: mapPoint?.longitude,
          })
        }
      />
    </div>
  );
}

function BrowseLocationFields({ search }: { search: Search }) {
  const [city, setCity] = useState(search.city ?? search.postalCode ?? "");
  const [radiusMiles, setRadiusMiles] = useState(search.radiusMiles ?? 25);
  const [mapPoint, setMapPoint] = useState<LocationPoint | undefined>(
    search.latitude != null && search.longitude != null
      ? { latitude: search.latitude, longitude: search.longitude, city: search.city }
      : undefined,
  );
  const [mapOpen, setMapOpen] = useState(false);

  useEffect(() => {
    setCity(search.city ?? search.postalCode ?? "");
    setRadiusMiles(search.radiusMiles ?? 25);
    setMapPoint(
      search.latitude != null && search.longitude != null
        ? { latitude: search.latitude, longitude: search.longitude, city: search.city }
        : undefined,
    );
  }, [search.city, search.postalCode, search.radiusMiles, search.latitude, search.longitude]);

  return (
    <>
      <p className="mb-1 text-[11px] leading-relaxed text-muted-foreground">
        Choose a city or ZIP first. Region and state are optional broader browsing controls.
      </p>
      <select name="region" defaultValue={search.region ?? ""} className="filter-input">
        <option value="">Any region (optional)</option>
        {idahoRegions.map((region) => (
          <option key={region} value={region}>
            {region}
          </option>
        ))}
      </select>
      <select name="state" defaultValue={search.state ?? ""} className="filter-input">
        <option value="">Any state (optional)</option>
        {usStates.map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
      <input
        name="city"
        value={city}
        onChange={(event) => {
          setCity(event.target.value);
          setMapPoint(undefined);
        }}
        placeholder="City or ZIP code"
        aria-label="City or ZIP code"
        className="filter-input"
        maxLength={80}
        list="bluebird-browse-city-options"
      />
      <datalist id="bluebird-browse-city-options">
        {marketplaceCities.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <button
        type="button"
        onClick={() => setMapOpen((open) => !open)}
        className="text-left text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
        aria-expanded={mapOpen}
      >
        {mapOpen ? "Hide map" : "Choose anywhere on map"}
      </button>
      {mapOpen ? (
        <LocationRadiusPicker
          city={city}
          latitude={mapPoint?.latitude}
          longitude={mapPoint?.longitude}
          radiusMiles={radiusMiles}
          onChange={(point) => {
            setMapPoint(point);
            setCity(point.city ?? "");
          }}
        />
      ) : null}
      {isPostalCode(city) ? (
        <p className="rounded-xl bg-secondary px-3 py-2 text-[11px] text-muted-foreground">
          ZIP searches match <strong className="text-foreground">{city.trim()}</strong>. Use a city
          when you want a distance radius.
        </p>
      ) : null}
      <label className="block text-[11px] font-medium text-muted-foreground">
        Search radius: <span className="font-semibold text-foreground">{radiusMiles} miles</span>
        <input
          name="radiusMiles"
          type="range"
          min="5"
          max="500"
          step="5"
          value={radiusMiles}
          onChange={(event) => setRadiusMiles(Number(event.target.value))}
          className="mt-2 w-full accent-primary"
          disabled={(!city.trim() && !mapPoint) || isPostalCode(city)}
        />
      </label>
      <input type="hidden" name="latitude" value={mapPoint?.latitude ?? ""} />
      <input type="hidden" name="longitude" value={mapPoint?.longitude ?? ""} />
    </>
  );
}

function InlineApplyButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 w-full items-center justify-center rounded-full bg-primary px-4 text-[12px] font-semibold text-primary-foreground shadow-sm hover:opacity-90"
    >
      Apply filters
    </button>
  );
}

function countActiveFilters(search: Search, motors: boolean, pets: boolean) {
  const keys: (keyof Search)[] = [
    "category",
    "group",
    "state",
    "region",
    "city",
    "radiusMiles",
    "postalCode",
    "condition",
    "fulfillment",
    "priceMin",
    "priceMax",
  ];
  if (motors)
    keys.push(
      "make",
      "model",
      "yearMin",
      "yearMax",
      "mileageMax",
      "mileageBands",
      "bodyStyle",
      "transmission",
      "drivetrain",
      "fuelType",
      "exteriorColor",
      "titleStatus",
    );
  if (pets)
    keys.push(
      "petSubcategory",
      "petSpecies",
      "petBreed",
      "petPlacementType",
      "petOfferedBy",
      "petSex",
      "petAge",
      "petHypoallergenic",
      "petVaccinated",
      "petSpayedNeutered",
      "petMicrochipped",
      "petRecordsAvailable",
      "petGoodWithKids",
      "petGoodWithDogs",
      "petGoodWithCats",
      "petIndoorOutdoor",
    );
  return keys.filter((key) => search[key] !== undefined && search[key] !== "").length;
}

function activeFilterLabels(search: Search, motors: boolean, pets: boolean) {
  const labels: string[] = [];
  if (search.category)
    labels.push(
      classifiedCategories.find((category) => category.slug === search.category)?.name ??
        search.category,
    );
  if (search.group === "motors" && !search.category) labels.push("Vehicles");
  if (search.region) labels.push(`Region · ${search.region}`);
  if (search.state) {
    const stateName = usStates.find(([code]) => code === search.state)?.[1];
    labels.push(`State · ${stateName ?? search.state}`);
  }
  if (search.latitude != null && search.longitude != null && search.radiusMiles != null) {
    const nearest = nearestClassifiedCity(search.latitude, search.longitude);
    labels.push(`${nearest?.city ?? "Map point"} · within ${search.radiusMiles} miles`);
  } else if (search.city && search.radiusMiles != null)
    labels.push(`${search.city} · within ${search.radiusMiles} miles`);
  else if (search.city) labels.push(`City · ${search.city}`);
  if (search.postalCode) labels.push(`ZIP · ${search.postalCode}`);
  if (search.condition) labels.push(formatSavedSearchFilter("condition", search.condition));
  if (search.fulfillment) labels.push(formatSavedSearchFilter("fulfillment", search.fulfillment));
  if (search.priceMin != null || search.priceMax != null)
    labels.push(
      search.priceMin != null && search.priceMax != null
        ? `$${search.priceMin}–$${search.priceMax}`
        : search.priceMin != null
          ? `$${search.priceMin}+`
          : `Up to $${search.priceMax}`,
    );
  if (motors) {
    if (search.make) labels.push(formatSavedSearchFilter("make", search.make));
    if (search.model) labels.push(formatSavedSearchFilter("model", search.model));
    if (search.yearMin != null || search.yearMax != null)
      labels.push(`${search.yearMin ?? "Any"}–${search.yearMax ?? "Any"}`);
    if (search.bodyStyle) labels.push(formatSavedSearchFilter("bodyStyle", search.bodyStyle));
    if (search.titleStatus) labels.push(formatSavedSearchFilter("titleStatus", search.titleStatus));
    if (search.transmission)
      labels.push(formatSavedSearchFilter("transmission", search.transmission));
    if (search.drivetrain) labels.push(formatSavedSearchFilter("drivetrain", search.drivetrain));
    if (search.fuelType) labels.push(formatSavedSearchFilter("fuelType", search.fuelType));
    if (search.exteriorColor)
      labels.push(formatSavedSearchFilter("exteriorColor", search.exteriorColor));
    if (search.mileageMax != null) labels.push(`≤ ${search.mileageMax.toLocaleString()} mi`);
  }
  if (pets) {
    if (search.petSubcategory)
      labels.push(
        petSubcategories.find(([slug]) => slug === search.petSubcategory)?.[1] ??
          search.petSubcategory,
      );
    if (search.petSpecies) labels.push(formatSavedSearchFilter("petSpecies", search.petSpecies));
    if (search.petBreed) labels.push(search.petBreed);
    if (search.petPlacementType)
      labels.push(
        petPlacementTypes.find(([value]) => value === search.petPlacementType)?.[1] ??
          search.petPlacementType,
      );
    if (search.petOfferedBy) labels.push(search.petOfferedBy);
    if (search.petSex) labels.push(search.petSex);
    if (search.petAge) labels.push(search.petAge);
    if (search.petHypoallergenic === "Yes") labels.push("Hypoallergenic");
    if (search.petVaccinated === "Yes") labels.push("Vaccinated");
    if (search.petSpayedNeutered === "Yes") labels.push("Spayed / neutered");
    if (search.petMicrochipped === "Yes") labels.push("Microchipped");
    if (search.petGoodWithKids === "Yes") labels.push("Good with children");
    if (search.petGoodWithDogs === "Yes") labels.push("Good with dogs");
    if (search.petGoodWithCats === "Yes") labels.push("Good with cats");
  }
  return labels;
}

function FilterSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {icon}
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function BrowsePill({
  active,
  search,
  children,
}: {
  active: boolean;
  search: Search;
  children: React.ReactNode;
}) {
  return (
    <Link
      to="/browse"
      search={search}
      className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-[12.5px] ${active ? "border-primary bg-accent font-semibold text-accent-foreground" : "border-input"}`}
    >
      {children}
    </Link>
  );
}
