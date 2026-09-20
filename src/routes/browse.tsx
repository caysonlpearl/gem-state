import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
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
  idahoRegions,
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
} from "@/config/pets";
import { CategoryArtwork } from "@/components/classifieds/CategoryIcon";
import { AllCategoriesPopover } from "@/components/classifieds/AllCategoriesPopover";
import { ListingCard, ListingRow } from "@/components/classifieds/ListingCard";
import { conditionLabels, isMotorsCategory } from "@/lib/classifieds-display";
import {
  browseClassifieds,
  type ClassifiedBrowseInput,
  type ClassifiedBrowseResult,
} from "@/lib/classifieds.functions";
import { trackEvent } from "@/lib/analytics";
import { createSavedSearch, updateSavedSearch } from "@/lib/account-center.functions";
import { SavedSearchNameDialog } from "@/components/classifieds/SavedSearchNameDialog";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type Sort = NonNullable<ClassifiedBrowseInput["sort"]>;
type View = "grid" | "list";
type HomeTab = "build" | "buy" | "rent";
type JobMode = "landing" | "results";
type ServiceMode = "landing" | "results";
type PetMode = "landing" | "results";

type Search = {
  allCategories?: boolean | undefined;
  q?: string | undefined;
  savedSearchId?: string | undefined;
  category?: string | undefined;
  group?: "motors" | "classifieds" | undefined;
  state?: string | undefined;
  region?: string | undefined;
  city?: string | undefined;
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
  serviceSubcategory?: string | undefined;
  serviceExpandSearch?: string | undefined;
  servicePhotos?: string | undefined;
  serviceVideo?: string | undefined;
  serviceSellerType?: string | undefined;
  serviceCondition?: string | undefined;
  serviceTimeOnSite?: string | undefined;
  jobCategory?: string | undefined;
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
  "q",
  "category",
  "group",
  "state",
  "region",
  "city",
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
  "jobCategory",
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
];

type VehicleHeroFilter =
  | "makeModel"
  | "year"
  | "price"
  | "mileage"
  | "bodyStyle"
  | "sellerType"
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
  "Single family",
  "Townhome",
  "Condo",
  "Land",
  "Multi-family",
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
  "<250",
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
  "< .10",
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
  "1 Month or Less",
  "2 Months or Less",
  "3 Months or Less",
  "4 Months or Less",
  "5 Months or Less",
  "6 Months or Less",
  "9 Months or Less",
  "12 Months or Less",
  "18 Months or Less",
  "24 Months or Less",
];

const mileageBandOptions = [
  "Under 25,000 miles",
  "Under 50,000 miles",
  "Under 75,000 miles",
  "Under 100,000 miles",
  "Under 150,000 miles",
] as const;
const splitVehicleFilter = (value: string | undefined) => value?.split("||").filter(Boolean) ?? [];
const modelsForMakes = (makes: readonly string[]) =>
  [...new Set(makes.flatMap((make) => vehicleModelsByMake[make] ?? []))].sort();
const vehicleConditionOptions = [
  { value: "new_with_tags", label: "New" },
  { value: "used_excellent", label: "Used excellent" },
  { value: "used_good", label: "Used good" },
  { value: "broken_needs_repairs", label: "Broken/needs repairs" },
] as const;
const vehicleSellerTypeOptions = ["Private", "Dealer"] as const;
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
  "Internships",
  "Part-time",
  "Seasonal",
  "Temporary",
  "Weekend only",
] as const;
const jobPayTypeOptions = ["All pay types", "Hourly", "Salary"] as const;
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
    cards: [
      {
        name: "Riverstone at Banbury",
        location: "Eagle, ID",
        price: "$524,900",
        facts: "3 bed · 2.5 bath · 2,146 sqft",
        image:
          "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=900&q=80",
      },
      {
        name: "North End Bungalow",
        location: "Boise, ID",
        price: "$649,000",
        facts: "4 bed · 2 bath · 1,988 sqft",
        image:
          "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80",
      },
      {
        name: "Sage Creek Townhomes",
        location: "Meridian, ID",
        price: "$419,900",
        facts: "3 bed · 2.5 bath · 1,742 sqft",
        image:
          "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=900&q=80",
      },
      {
        name: "Canyon Rim Estates",
        location: "Nampa, ID",
        price: "$489,900",
        facts: "3 bed · 2 bath · 1,876 sqft",
        image:
          "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=900&q=80",
      },
      {
        name: "Juniper Ridge",
        location: "Star, ID",
        price: "$719,000",
        facts: "4 bed · 3 bath · 2,492 sqft",
        image:
          "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=900&q=80",
      },
      {
        name: "The Owyhee Collection",
        location: "Kuna, ID",
        price: "$379,900",
        facts: "3 bed · 2 bath · 1,604 sqft",
        image:
          "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=900&q=80",
      },
    ],
  },
  {
    title: "New builds to explore",
    action: "Find new construction",
    cards: [
      {
        name: "Aspen Grove",
        location: "Meridian, ID",
        price: "From $499,900",
        facts: "2–5 bed · 1,550–2,800 sqft",
        image:
          "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=900&q=80",
      },
      {
        name: "Cottonwood Crossing",
        location: "Star, ID",
        price: "From $559,900",
        facts: "3–4 bed · 2–3 bath",
        image:
          "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=900&q=80",
      },
      {
        name: "The Preserve",
        location: "Eagle, ID",
        price: "From $799,900",
        facts: "3–5 bed · 2,100+ sqft",
        image:
          "https://images.unsplash.com/photo-1600047508788-786f386c0f2d?auto=format&fit=crop&w=900&q=80",
      },
      {
        name: "Overland Park",
        location: "Boise, ID",
        price: "From $449,900",
        facts: "Townhomes · 2–3 bed",
        image:
          "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=900&q=80",
      },
      {
        name: "Hillside Terrace",
        location: "Nampa, ID",
        price: "Call for pricing",
        facts: "Single-family homes",
        image:
          "https://images.unsplash.com/photo-1600585152915-d208bec867a1?auto=format&fit=crop&w=900&q=80",
      },
      {
        name: "Harvest Point",
        location: "Caldwell, ID",
        price: "From $389,900",
        facts: "2–4 bed · 2 bath",
        image:
          "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=900&q=80",
      },
    ],
  },
  {
    title: "Rentals worth a look",
    action: "Browse rentals",
    cards: [
      {
        name: "The Franklin",
        location: "Boise, ID",
        price: "$1,895 / mo",
        facts: "2 bed · 2 bath · Downtown",
        image:
          "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80",
      },
      {
        name: "Parkside Flats",
        location: "Meridian, ID",
        price: "$1,650 / mo",
        facts: "1 bed · 1 bath · Pet friendly",
        image:
          "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=900&q=80",
      },
      {
        name: "Warm Springs House",
        location: "Boise, ID",
        price: "$2,750 / mo",
        facts: "3 bed · 2 bath · Fenced yard",
        image:
          "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=900&q=80",
      },
      {
        name: "The Village Lofts",
        location: "Meridian, ID",
        price: "$2,150 / mo",
        facts: "2 bed · 2 bath · Garage",
        image:
          "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=900&q=80",
      },
      {
        name: "Canyon View Apartments",
        location: "Nampa, ID",
        price: "$1,425 / mo",
        facts: "1 bed · 1 bath · Pool",
        image:
          "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=80",
      },
      {
        name: "Maple Street Cottage",
        location: "Eagle, ID",
        price: "$2,400 / mo",
        facts: "3 bed · 2 bath · No HOA",
        image:
          "https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&w=900&q=80",
      },
    ],
  },
];

const homePreviewRowsByTab: Record<HomeTab, HomePreviewRow[]> = {
  buy: [
    homePreviewRows[0]!,
    {
      title: "Price drops to watch",
      action: "See price drops",
      cards: [
        {
          name: "Brookside Ranch",
          location: "Meridian, ID",
          price: "$459,900",
          facts: "4 bed · 2 bath · 2,012 sqft",
          image:
            "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80",
        },
        {
          name: "Foothills Modern",
          location: "Boise, ID",
          price: "$589,000",
          facts: "3 bed · 2 bath · 1,840 sqft",
          image:
            "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=900&q=80",
        },
        {
          name: "Cedar Grove",
          location: "Nampa, ID",
          price: "$399,500",
          facts: "3 bed · 2 bath · 1,672 sqft",
          image:
            "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=900&q=80",
        },
        {
          name: "Banbury Heights",
          location: "Eagle, ID",
          price: "$735,000",
          facts: "4 bed · 3 bath · 2,580 sqft",
          image:
            "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=900&q=80",
        },
        {
          name: "Parkside Landing",
          location: "Star, ID",
          price: "$427,900",
          facts: "3 bed · 2.5 bath · 1,910 sqft",
          image:
            "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=900&q=80",
        },
        {
          name: "Warm Springs View",
          location: "Boise, ID",
          price: "$682,000",
          facts: "4 bed · 3 bath · 2,306 sqft",
          image:
            "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=900&q=80",
        },
      ],
    },
    showcaseRow(
      "Starter homes",
      "Browse starter homes",
      "/browse?category=other-real-estate&homeMode=results&homeTab=buy",
      [
        previewCard(
          "Cedar Grove Starter",
          "Nampa, ID",
          "$359,900",
          "3 bed · 2 bath · 1,420 sqft",
          "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Maple Street Home",
          "Caldwell, ID",
          "$374,900",
          "3 bed · 2 bath · 1,506 sqft",
          "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Pine Creek Cottage",
          "Meridian, ID",
          "$399,000",
          "2 bed · 2 bath · 1,318 sqft",
          "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Owyhee View",
          "Kuna, ID",
          "$409,900",
          "3 bed · 2 bath · 1,588 sqft",
          "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "West Boise Ranch",
          "Boise, ID",
          "$429,900",
          "3 bed · 2 bath · 1,602 sqft",
          "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Canyon Creek Home",
          "Twin Falls, ID",
          "$339,900",
          "3 bed · 2 bath · 1,480 sqft",
          "https://images.unsplash.com/photo-1600047508788-786f386c0f2d?auto=format&fit=crop&w=900&q=80",
        ),
      ],
    ),
    showcaseRow(
      "Condos & townhomes",
      "Browse attached homes",
      "/browse?category=other-real-estate&homeMode=results&homeTab=buy",
      [
        previewCard(
          "Sage Creek Townhome",
          "Meridian, ID",
          "$419,900",
          "3 bed · 2.5 bath · 1,742 sqft",
          "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Downtown Boise Loft",
          "Boise, ID",
          "$449,000",
          "2 bed · 2 bath · Rooftop deck",
          "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Parkside Townhomes",
          "Nampa, ID",
          "$389,900",
          "3 bed · 2.5 bath · 1,610 sqft",
          "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "The Village Residence",
          "Eagle, ID",
          "$529,900",
          "2 bed · 2 bath · Garage",
          "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Canyon View Condo",
          "Boise, ID",
          "$335,000",
          "2 bed · 1 bath · Mountain views",
          "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "North End Bungalow",
          "Boise, ID",
          "$649,000",
          "4 bed · 2 bath · 1,988 sqft",
          "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80",
        ),
      ],
    ),
    showcaseRow(
      "Homes with space to grow",
      "Find larger homes",
      "/browse?category=other-real-estate&homeMode=results&homeTab=buy",
      [
        previewCard(
          "Juniper Ridge",
          "Star, ID",
          "$719,000",
          "4 bed · 3 bath · 2,492 sqft",
          "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Banbury Heights",
          "Eagle, ID",
          "$735,000",
          "5 bed · 3 bath · 2,880 sqft",
          "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Foothills Modern",
          "Boise, ID",
          "$589,000",
          "3 bed · 2 bath · 1,840 sqft",
          "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Riverstone Estate",
          "Eagle, ID",
          "$899,000",
          "5 bed · 4 bath · 3,420 sqft",
          "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Canyon Rim Estate",
          "Nampa, ID",
          "$612,000",
          "4 bed · 3 bath · 2,360 sqft",
          "https://images.unsplash.com/photo-1600047508788-786f386c0f2d?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Warm Springs View",
          "Boise, ID",
          "$682,000",
          "4 bed · 3 bath · 2,306 sqft",
          "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=900&q=80",
        ),
      ],
    ),
  ],
  build: [
    homePreviewRows[1]!,
    {
      title: "Quick move-in homes",
      action: "Find move-in ready builds",
      cards: [
        {
          name: "Aspen Grove — The Juniper",
          location: "Meridian, ID",
          price: "From $524,900",
          facts: "3 bed · 2.5 bath · Ready this fall",
          image:
            "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=900&q=80",
        },
        {
          name: "Canyon Rim — The Vista",
          location: "Nampa, ID",
          price: "From $489,900",
          facts: "3 bed · 2 bath · Finished basement",
          image:
            "https://images.unsplash.com/photo-1600047508788-786f386c0f2d?auto=format&fit=crop&w=900&q=80",
        },
        {
          name: "Cottonwood Crossing — Plan 4",
          location: "Star, ID",
          price: "From $574,900",
          facts: "4 bed · 2.5 bath · December completion",
          image:
            "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=900&q=80",
        },
        {
          name: "Harvest Point — The Maple",
          location: "Caldwell, ID",
          price: "From $389,900",
          facts: "3 bed · 2 bath · Single level",
          image:
            "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=900&q=80",
        },
        {
          name: "Hillside Terrace — Model 7",
          location: "Nampa, ID",
          price: "Call for pricing",
          facts: "4 bed · 3 bath · Model home",
          image:
            "https://images.unsplash.com/photo-1600585152915-d208bec867a1?auto=format&fit=crop&w=900&q=80",
        },
        {
          name: "The Preserve — Alder",
          location: "Eagle, ID",
          price: "From $819,900",
          facts: "4 bed · 3 bath · Mountain views",
          image:
            "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=900&q=80",
        },
      ],
    },
    showcaseRow(
      "New build communities",
      "Explore communities",
      "/browse?category=other-real-estate&homeMode=results&homeTab=build",
      [
        previewCard(
          "Banbury Meadows",
          "Eagle, ID",
          "From $549,900",
          "3–5 bed · 2–3 bath",
          "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Canyon Rim Estates",
          "Nampa, ID",
          "From $489,900",
          "3–4 bed · 1,876+ sqft",
          "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "North End Cottages",
          "Boise, ID",
          "From $599,900",
          "2–4 bed · Low-maintenance",
          "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Owyhee Collection",
          "Kuna, ID",
          "From $379,900",
          "3–4 bed · Single-family",
          "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Juniper Ridge",
          "Star, ID",
          "From $719,000",
          "4–6 bed · 2,492+ sqft",
          "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Harvest Point",
          "Caldwell, ID",
          "From $389,900",
          "2–4 bed · 2 bath",
          "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=900&q=80",
        ),
      ],
    ),
    showcaseRow(
      "Custom build opportunities",
      "Plan a custom home",
      "/browse?category=other-real-estate&homeMode=results&homeTab=build",
      [
        previewCard(
          "Foothills Modern Plan",
          "Boise, ID",
          "From $799,900",
          "3–5 bed · Custom finishes",
          "https://images.unsplash.com/photo-1600047508788-786f386c0f2d?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Riverstone Contemporary",
          "Eagle, ID",
          "From $724,900",
          "4 bed · 2,600+ sqft",
          "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Cottonwood Modern",
          "Star, ID",
          "From $559,900",
          "3–4 bed · Design studio",
          "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Hillside Terrace",
          "Nampa, ID",
          "Call for pricing",
          "Single-family · Lot selection",
          "https://images.unsplash.com/photo-1600585152915-d208bec867a1?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Aspen Grove",
          "Meridian, ID",
          "From $499,900",
          "2–5 bed · 1,550–2,800 sqft",
          "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "The Preserve",
          "Eagle, ID",
          "From $819,900",
          "4 bed · Mountain views",
          "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=900&q=80",
        ),
      ],
    ),
    showcaseRow(
      "Townhome builds",
      "Find new townhomes",
      "/browse?category=other-real-estate&homeMode=results&homeTab=build",
      [
        previewCard(
          "Overland Park",
          "Boise, ID",
          "From $449,900",
          "Townhomes · 2–3 bed",
          "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Sage Creek Townhomes",
          "Meridian, ID",
          "From $419,900",
          "3 bed · 2.5 bath",
          "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Parkside Landing",
          "Star, ID",
          "From $427,900",
          "3 bed · Attached garage",
          "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Canyon Trails",
          "Nampa, ID",
          "From $399,900",
          "2–3 bed · Community park",
          "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Maple Grove",
          "Caldwell, ID",
          "From $369,900",
          "2–3 bed · Low HOA",
          "https://images.unsplash.com/photo-1600047508788-786f386c0f2d?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "The Junction",
          "Meridian, ID",
          "From $479,900",
          "3 bed · Walkable location",
          "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=900&q=80",
        ),
      ],
    ),
  ],
  rent: [
    homePreviewRows[2]!,
    {
      title: "Pet-friendly rentals",
      action: "Browse pet-friendly homes",
      cards: [
        {
          name: "Parkview Commons",
          location: "Boise, ID",
          price: "$1,725 / mo",
          facts: "2 bed · 2 bath · Dogs welcome",
          image:
            "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=900&q=80",
        },
        {
          name: "Meridian Green",
          location: "Meridian, ID",
          price: "$1,590 / mo",
          facts: "1 bed · 1 bath · Cats welcome",
          image:
            "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=80",
        },
        {
          name: "Eagle Creek Townhome",
          location: "Eagle, ID",
          price: "$2,350 / mo",
          facts: "3 bed · 2.5 bath · Fenced patio",
          image:
            "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=900&q=80",
        },
        {
          name: "Canyon Trails",
          location: "Nampa, ID",
          price: "$1,480 / mo",
          facts: "2 bed · 1 bath · Dog park",
          image:
            "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80",
        },
        {
          name: "North End Garden Flat",
          location: "Boise, ID",
          price: "$2,050 / mo",
          facts: "2 bed · 1 bath · Small pets",
          image:
            "https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&w=900&q=80",
        },
        {
          name: "The Village Lofts",
          location: "Meridian, ID",
          price: "$2,150 / mo",
          facts: "2 bed · 2 bath · Garage",
          image:
            "https://images.unsplash.com/photo-1502672023488-70e25813eb80?auto=format&fit=crop&w=900&q=80",
        },
      ],
    },
    showcaseRow(
      "Apartments under $1,800",
      "Browse budget-friendly rentals",
      "/browse?category=other-real-estate&homeMode=results&homeTab=rent",
      [
        previewCard(
          "Canyon View Apartments",
          "Nampa, ID",
          "$1,425 / mo",
          "1 bed · 1 bath · Pool",
          "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Meridian Green",
          "Meridian, ID",
          "$1,590 / mo",
          "1 bed · 1 bath · Cats welcome",
          "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Cedar Flats",
          "Boise, ID",
          "$1,725 / mo",
          "2 bed · 1 bath · Parking",
          "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "West Valley Apartments",
          "Caldwell, ID",
          "$1,350 / mo",
          "2 bed · 1 bath · Laundry",
          "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Parkview Commons",
          "Boise, ID",
          "$1,725 / mo",
          "2 bed · 2 bath · Dogs welcome",
          "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Sagebrush Court",
          "Twin Falls, ID",
          "$1,495 / mo",
          "2 bed · 1 bath · Available now",
          "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=80",
        ),
      ],
    ),
    showcaseRow(
      "Rentals with room to spread out",
      "Find larger rentals",
      "/browse?category=other-real-estate&homeMode=results&homeTab=rent",
      [
        previewCard(
          "Warm Springs House",
          "Boise, ID",
          "$2,750 / mo",
          "3 bed · 2 bath · Fenced yard",
          "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Maple Street Cottage",
          "Eagle, ID",
          "$2,400 / mo",
          "3 bed · 2 bath · No HOA",
          "https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Eagle Creek Townhome",
          "Eagle, ID",
          "$2,350 / mo",
          "3 bed · 2.5 bath · Patio",
          "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "North End Family Home",
          "Boise, ID",
          "$2,950 / mo",
          "4 bed · 2 bath · Garage",
          "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Aspen Grove Rental",
          "Meridian, ID",
          "$2,200 / mo",
          "3 bed · 2 bath · Newer build",
          "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Canyon Rim Home",
          "Nampa, ID",
          "$2,100 / mo",
          "3 bed · 2 bath · Fenced yard",
          "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=900&q=80",
        ),
      ],
    ),
    showcaseRow(
      "Short-term & flexible stays",
      "Explore flexible rentals",
      "/browse?category=other-real-estate&homeMode=results&homeTab=rent",
      [
        previewCard(
          "Downtown Boise Furnished",
          "Boise, ID",
          "$2,100 / mo",
          "Furnished · Utilities included",
          "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Meridian Guest Suite",
          "Meridian, ID",
          "$1,250 / mo",
          "Furnished · Month to month",
          "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Eagle Corporate Rental",
          "Eagle, ID",
          "$3,200 / mo",
          "2 bed · Furnished · Utilities",
          "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "The Franklin Extended Stay",
          "Boise, ID",
          "$1,895 / mo",
          "2 bed · Flexible lease",
          "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Parkside Landing",
          "Star, ID",
          "$2,050 / mo",
          "2 bed · Short-term option",
          "https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&w=900&q=80",
        ),
        previewCard(
          "Canyon View Furnished",
          "Nampa, ID",
          "$1,650 / mo",
          "1 bed · Available this month",
          "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=80",
        ),
      ],
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
    queryFn: () => browseClassifieds({ data: input }),
  });

function stringParam(search: Record<string, unknown>, key: string, max = 80) {
  const value = search[key];
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

function numberParam(search: Record<string, unknown>, key: string) {
  const value = Number(search[key]);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
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
    postalCode: search.postalCode,
    condition: search.condition,
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
    petSubcategory: search.petSubcategory,
    petSpecies: search.petSpecies,
    petBreed: search.petBreed,
    petPlacementType: search.petPlacementType,
    petOfferedBy: search.petOfferedBy,
    petSex: search.petSex,
    sort: search.sort ?? "newest",
    page: search.page ?? 1,
  };
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
    return {
      allCategories:
        search["allCategories"] === true || stringParam(search, "allCategories", 5) === "true",
      q: stringParam(search, "q"),
      savedSearchId,
      category: stringParam(search, "category", 60),
      group: group === "motors" || group === "classifieds" ? group : undefined,
      state: stringParam(search, "state", 2)?.toUpperCase(),
      region: stringParam(search, "region"),
      city: stringParam(search, "city"),
      postalCode: stringParam(search, "postalCode", 12),
      condition: stringParam(search, "condition", 30),
      fulfillment: stringParam(search, "fulfillment", 20),
      priceMin: numberParam(search, "priceMin"),
      priceMax: numberParam(search, "priceMax"),
      make: stringParam(search, "make"),
      model: stringParam(search, "model"),
      yearMin: numberParam(search, "yearMin"),
      yearMax: numberParam(search, "yearMax"),
      mileageMax: numberParam(search, "mileageMax"),
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
      jobCategory: stringParam(search, "jobCategory", 60),
      jobType: stringParam(search, "jobType", 30),
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
      petSubcategory: stringParam(search, "petSubcategory", 80),
      petSpecies: stringParam(search, "petSpecies", 40),
      petBreed: stringParam(search, "petBreed", 100),
      petPlacementType: stringParam(search, "petPlacementType", 30),
      petOfferedBy: stringParam(search, "petOfferedBy", 30),
      petSex: stringParam(search, "petSex", 30),
    };
  },
  head: () => ({
    meta: [
      { title: `Browse Idaho classifieds — ${brand.name}` },
      {
        name: "description",
        content:
          "Search Idaho classifieds by category, region, price, condition, and detailed vehicle filters including make, model, year, mileage, drivetrain, fuel type, and title status.",
      },
      { property: "og:title", content: `Browse Idaho classifieds — ${brand.name}` },
      {
        property: "og:description",
        content:
          "Find cars, trucks, powersports, furniture, tools, and more from sellers across Idaho.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(classifiedQuery(inputFromSearch(deps)));
  },
  component: Browse,
  errorComponent: ({ reset }) => (
    <main className="mx-auto max-w-[720px] px-4 py-16 text-center sm:px-6">
      <h1 className="text-[20px] font-semibold tracking-tight">The classifieds did not load</h1>
      <p className="mx-auto mt-2 max-w-[46ch] text-[13px] leading-relaxed text-muted-foreground">
        The connection dropped before the listings finished loading. Nothing was lost — try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 inline-flex h-10 items-center rounded-md border border-input px-4 text-[13px] font-semibold hover:bg-secondary"
      >
        Retry
      </button>
    </main>
  ),
});

function Browse() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: result } = useSuspenseQuery(classifiedQuery(inputFromSearch(search)));
  const [term, setTerm] = useState(search.q ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [saveSearchDialogOpen, setSaveSearchDialogOpen] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState("");
  const [saveSearchPending, setSaveSearchPending] = useState(false);
  const [pendingSaveSearch, setPendingSaveSearch] = useState<Record<string, unknown> | null>(null);
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
  }, [search.q, search.category, search.region, result.total]);

  const scoped = (patch: Partial<Search>): Search =>
    Object.fromEntries(
      Object.entries({ ...search, ...patch, page: undefined }).filter(
        ([, value]) => value !== undefined && value !== "",
      ),
    ) as Search;

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
  const activeFilterCount = countActiveFilters(search, motors, pets);
  const heading =
    selectedCategory?.name ?? (search.group === "motors" ? "Cars & motors" : "All classifieds");

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const value = (key: string) => {
      const raw = values.get(key);
      return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
    };
    const numeric = (key: string) => {
      const parsed = Number(value(key));
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
    };
    const category = value("category");
    const nextMotors = value("group") === "motors" || isMotorsCategory(category);
    const nextPets = category === "pets";

    void navigate({
      to: "/browse",
      search: scoped({
        category,
        group: category ? undefined : value("group") === "motors" ? "motors" : undefined,
        state: value("state")?.toUpperCase(),
        region: value("region"),
        city: value("city"),
        condition: value("condition"),
        fulfillment: value("fulfillment"),
        priceMin: numeric("priceMin"),
        priceMax: numeric("priceMax"),
        make: nextMotors ? value("make") : undefined,
        model: nextMotors ? value("model") : undefined,
        yearMin: nextMotors ? numeric("yearMin") : undefined,
        yearMax: nextMotors ? numeric("yearMax") : undefined,
        mileageMax: nextMotors ? numeric("mileageMax") : undefined,
        bodyStyle: nextMotors ? value("bodyStyle") : undefined,
        transmission: nextMotors ? value("transmission") : undefined,
        drivetrain: nextMotors ? value("drivetrain") : undefined,
        fuelType: nextMotors ? value("fuelType") : undefined,
        exteriorColor: nextMotors ? value("exteriorColor") : undefined,
        titleStatus: nextMotors ? value("titleStatus") : undefined,
        petMode: nextPets ? "results" : undefined,
        petSubcategory: nextPets ? value("petSubcategory") : undefined,
        petSpecies: nextPets ? value("petSpecies") : undefined,
        petBreed: nextPets ? value("petBreed") : undefined,
        petPlacementType: nextPets ? value("petPlacementType") : undefined,
        petOfferedBy: nextPets ? value("petOfferedBy") : undefined,
        petSex: nextPets ? value("petSex") : undefined,
      }),
    });
    setFiltersOpen(false);
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
          <HomepageShowcaseRows eyebrow="GemList Classifieds" rows={classifiedShowcaseRows} />
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

      {pets && petLanding && <HomepageShowcaseRows eyebrow="GemList Pets" rows={petShowcaseRows} />}

      {motors && vehicleLanding && (
        <HomepageShowcaseRows eyebrow="GemList Motors" rows={vehicleShowcaseRows} />
      )}

      {motors && !vehicleLanding && (
        <VehicleResultsPage
          search={search}
          result={result}
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

      {homes && !homeLanding && (
        <HomesFilterPage
          activeTab={homeTab}
          search={search}
          resultCount={result.total}
          onTabChange={(tab) =>
            void navigate({
              to: "/browse",
              search: scoped({ category: "other-real-estate", homeTab: tab, homeMode: "results" }),
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
      )}

      {homeLanding && <HomeShowcaseRows activeTab={homeTab} />}

      {jobs && jobLanding && (
        <JobsLandingHero
          search={search}
          resultCount={result.total}
          onSearch={(term) =>
            void navigate({
              to: "/browse",
              search: scoped({ category: "jobs", jobMode: "results", q: term.trim() || undefined }),
            })
          }
          onMoreFilters={() =>
            void navigate({
              to: "/browse",
              search: scoped({ category: "jobs", jobMode: "results" }),
            })
          }
          onPost={() => void navigate({ to: "/create-listing" })}
        />
      )}

      {jobs && jobLanding && (
        <HomepageShowcaseRows eyebrow="GemList Jobs" rows={jobsShowcaseRows} />
      )}

      {jobs && !jobLanding && (
        <JobsFilterPage
          search={search}
          listings={result.listings}
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
        <HomepageShowcaseRows eyebrow="GemList Services" rows={servicesShowcaseRows} />
      )}

      {services && !serviceLanding && (
        <ServicesFilterPage
          search={search}
          listings={result.listings}
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
            Gem State classifieds
          </p>
          <h1 className="mt-2 text-[30px] font-bold tracking-tight">{heading}</h1>
          <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-muted-foreground">
            Search listings from sellers across Idaho. Vehicle shoppers can narrow by the details
            that matter before they open a listing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[12px] text-muted-foreground" htmlFor="sort">
            Sort
          </label>
          <select
            id="sort"
            value={search.sort ?? "newest"}
            onChange={(event) =>
              void navigate({ to: "/browse", search: scoped({ sort: event.target.value as Sort }) })
            }
            className="h-9 rounded-md border border-input bg-card px-2 text-[13px]"
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
            className={`hidden h-9 items-center rounded-md border px-2 text-[12px] sm:inline-flex ${search.view !== "list" ? "border-primary bg-accent font-semibold" : "border-input"}`}
          >
            Grid
          </Link>
          <Link
            to="/browse"
            search={scoped({ view: "list" })}
            aria-label="List view"
            className={`hidden h-9 items-center rounded-md border px-2 text-[12px] sm:inline-flex ${search.view === "list" ? "border-primary bg-accent font-semibold" : "border-input"}`}
          >
            List
          </Link>
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
            Cars & motors
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
        <div className={`${motors || homes ? "mt-6" : "mt-8"} ${homeLanding ? "hidden" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={motors || homes ? "hidden" : "text-[13px] text-muted-foreground"}>
              <span className="numeric font-semibold text-foreground">{result.total}</span>{" "}
              {result.total === 1 ? "listing" : "listings"}
            </p>
            {!motors && !homes && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => requestSaveSearch()}
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-primary bg-card px-5 text-[13px] font-semibold text-primary shadow-sm transition-shadow hover:bg-secondary hover:shadow-md"
                >
                  <BookmarkSimple size={17} />
                  {search.savedSearchId ? "Update saved search" : "Save this search"}
                </button>
                <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                  <SheetTrigger asChild>
                    <button
                      type="button"
                      className={`inline-flex h-11 items-center gap-2 rounded-full border border-input bg-card px-5 text-[13px] font-semibold shadow-sm transition-shadow hover:shadow-md ${motors || homes ? "hidden" : ""}`}
                    >
                      <FunnelSimple size={17} className="text-primary" />
                      Filters
                      {activeFilterCount > 0 && (
                        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[10px] font-bold">
                          {activeFilterCount}
                        </span>
                      )}
                    </button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-lg">
                    <SheetHeader className="border-b border-border px-6 py-6 pr-16 text-left">
                      <SheetTitle className="text-[22px] tracking-tight">
                        Filter listings
                      </SheetTitle>
                      <SheetDescription>
                        Narrow down local items, or add every vehicle detail that matters.
                      </SheetDescription>
                    </SheetHeader>
                    <form onSubmit={applyFilters} className="space-y-6 px-6 py-6">
                      <input type="hidden" name="group" value={search.group ?? ""} />
                      <FilterSection title="Category">
                        <select
                          name="category"
                          defaultValue={search.category ?? ""}
                          className="filter-input"
                        >
                          <option value="">All categories</option>
                          {classifiedCategories.map((category) => (
                            <option key={category.slug} value={category.slug}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </FilterSection>

                      <FilterSection
                        title="Location"
                        icon={<MapPin size={13} className="text-primary" />}
                      >
                        <select
                          name="region"
                          defaultValue={search.region ?? ""}
                          className="filter-input"
                        >
                          <option value="">All of Idaho</option>
                          {idahoRegions.map((region) => (
                            <option key={region} value={region}>
                              {region}
                            </option>
                          ))}
                        </select>
                        <select
                          name="state"
                          defaultValue={search.state ?? ""}
                          className="filter-input"
                        >
                          <option value="">All states</option>
                          {usStates.map(([code, name]) => (
                            <option key={code} value={code}>
                              {name}
                            </option>
                          ))}
                        </select>
                        <input
                          name="city"
                          defaultValue={search.city ?? ""}
                          placeholder="City"
                          className="filter-input"
                          maxLength={80}
                        />
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
                        <select
                          name="condition"
                          defaultValue={search.condition ?? ""}
                          className="filter-input"
                        >
                          <option value="">Any condition</option>
                          {conditionOptions.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <select
                          name="fulfillment"
                          defaultValue={search.fulfillment ?? ""}
                          className="filter-input"
                        >
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
                          <select
                            name="petSex"
                            defaultValue={search.petSex ?? ""}
                            className="filter-input"
                          >
                            <option value="">Any sex</option>
                            {petSexes.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
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
                          <select
                            name="bodyStyle"
                            defaultValue={search.bodyStyle ?? ""}
                            className="filter-input"
                          >
                            <option value="">Any body style</option>
                            {vehicleOptions.bodyStyles.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          <select
                            name="drivetrain"
                            defaultValue={search.drivetrain ?? ""}
                            className="filter-input"
                          >
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
                          <select
                            name="fuelType"
                            defaultValue={search.fuelType ?? ""}
                            className="filter-input"
                          >
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

                      <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <button
                          type="submit"
                          className="inline-flex h-12 w-full items-center justify-center rounded-full bg-primary px-3 text-[13px] font-semibold text-primary-foreground shadow-sm hover:opacity-90"
                        >
                          Show {result.total} {result.total === 1 ? "listing" : "listings"}
                        </button>
                        <button
                          type="button"
                          onClick={() => requestSaveSearch()}
                          className="inline-flex h-12 items-center justify-center rounded-full border border-primary px-5 text-[13px] font-semibold text-primary hover:bg-secondary"
                        >
                          {search.savedSearchId ? "Update saved search" : "Save this search"}
                        </button>
                      </div>
                    </form>
                  </SheetContent>
                </Sheet>
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
                  <Link
                    to="/browse"
                    search={scoped({ category: undefined, group: search.group })}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10.5px] font-medium text-primary hover:bg-accent"
                  >
                    <X size={11} /> Clear
                  </Link>
                </div>
              )}
            </div>

            {result.listings.length === 0 ? (
              <div className="soft-card mt-5 px-5 py-12 text-center">
                <p className="text-[14px] font-medium">No listings match these filters.</p>
                <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">
                  {pets
                    ? "Try widening the animal, breed, placement type, location, or price filters."
                    : homes
                      ? "Try widening the price, location, property type, or bedroom filters."
                      : "Try widening the year, price, mileage, location, or vehicle filters."}
                </p>
                <Link
                  to="/browse"
                  search={scoped({ category: undefined, group: search.group })}
                  className="mt-4 inline-flex h-9 items-center rounded-md border border-input px-3 text-[12px] font-semibold hover:bg-secondary"
                >
                  Clear filters
                </Link>
              </div>
            ) : search.view === "list" ? (
              <ul className="mt-5 space-y-4">
                {result.listings.map((listing) => (
                  <li key={listing.id}>
                    <ListingRow listing={listing} />
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3 xl:grid-cols-4">
                {result.listings.map((listing) => (
                  <li key={listing.id}>
                    <ListingCard listing={listing} />
                  </li>
                ))}
              </ul>
            )}

            {pageCount > 1 && (
              <div className="mt-5 flex items-center justify-between">
                <Link
                  to="/browse"
                  search={scoped({ page: page > 2 ? page - 1 : undefined })}
                  disabled={page <= 1}
                  className="inline-flex h-9 items-center rounded-md border border-input px-3 text-[13px] font-medium aria-disabled:pointer-events-none aria-disabled:opacity-40"
                  aria-disabled={page <= 1}
                >
                  Previous
                </Link>
                <span className="numeric text-[12.5px] text-muted-foreground">
                  Page {page} of {pageCount}
                </span>
                <Link
                  to="/browse"
                  search={scoped({ page: page + 1 })}
                  disabled={page >= pageCount}
                  className="inline-flex h-9 items-center rounded-md border border-input px-3 text-[13px] font-medium aria-disabled:pointer-events-none aria-disabled:opacity-40"
                  aria-disabled={page >= pageCount}
                >
                  Next
                </Link>
              </div>
            )}
          </section>
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
          GemList Pets
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
    cards: [
      previewCard(
        "Friendly Labrador puppies",
        "Boise, ID",
        "$650",
        "Dogs · adoption",
        "https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Young tabby cats",
        "Meridian, ID",
        "$125",
        "Cats · rehoming",
        "https://images.unsplash.com/photo-1519052537078-e6302a4968d4?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Hand-fed cockatiels",
        "Nampa, ID",
        "$225",
        "Birds · owner",
        "https://images.unsplash.com/photo-1552728089-57cc54a126e7?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Freshwater aquarium setup",
        "Eagle, ID",
        "$90",
        "Fish · supplies",
        "https://images.unsplash.com/photo-1520990269335-9271441d0f4c?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  },
];

type HomepagePreviewCard = {
  title: string;
  location: string;
  price: string;
  detail: string;
  image: string;
  badge?: string;
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
  badge?: string,
): HomepagePreviewCard & { name: string; facts: string } {
  return {
    title,
    name: title,
    location,
    price,
    detail,
    facts: detail,
    image,
    ...(badge ? { badge } : {}),
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
    cards: [
      previewCard(
        "Vintage House of LEGO Lunchbox",
        "Sandy, UT",
        "$15.00",
        "Used · excellent",
        "https://images.unsplash.com/photo-1607604276583-eef5b076f64f?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Squishmallows 8-Piece Collector Box",
        "West Jordan, UT",
        "$5.00",
        "New",
        "https://images.unsplash.com/photo-1559454403-b8fb88521f11?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Super Mario Galaxy Princess Peach Doll",
        "Murray, UT",
        "$27.00",
        "New",
        "https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "S.T. Dupont Ligne 2 Gold Finish Lighter",
        "Draper, UT",
        "$225.00",
        "Used · excellent",
        "https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Teenage Mutant Ninja Turtles Fuggler",
        "South Jordan, UT",
        "$25.00",
        "New",
        "https://images.unsplash.com/photo-1563901935883-cb61f2a2b4b3?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Pair of Mid-Century Nightstands",
        "Boise, ID",
        "$120.00",
        "Pickup available",
        "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  },
  {
    title: "Holiday & seasonal finds",
    action: "Browse seasonal finds",
    href: "/browse?category=general",
    cards: [
      previewCard(
        "Halloween Yard Display Set",
        "Meridian, ID",
        "$45.00",
        "New",
        "https://images.unsplash.com/photo-1509557965875-b88c97052f0e?auto=format&fit=crop&w=900&q=80",
        "Seasonal",
      ),
      previewCard(
        "Fall Porch Decor Bundle",
        "Nampa, ID",
        "$30.00",
        "Like new",
        "https://images.unsplash.com/photo-1509474520651-53cf6a80536f?auto=format&fit=crop&w=900&q=80",
        "Seasonal",
      ),
      previewCard(
        "Thanksgiving Table Settings",
        "Boise, ID",
        "$65.00",
        "Pickup available",
        "https://images.unsplash.com/photo-1577140917170-285929fb55b7?auto=format&fit=crop&w=900&q=80",
        "Seasonal",
      ),
      previewCard(
        "Holiday Light Installer Kit",
        "Eagle, ID",
        "$80.00",
        "Used · good",
        "https://images.unsplash.com/photo-1482517967863-00e15c9b44be?auto=format&fit=crop&w=900&q=80",
        "Seasonal",
      ),
      previewCard(
        "Kids Costume Lot",
        "Caldwell, ID",
        "$22.00",
        "Like new",
        "https://images.unsplash.com/photo-1601758003122-53c40e686a19?auto=format&fit=crop&w=900&q=80",
        "Seasonal",
      ),
      previewCard(
        "Outdoor Fire Pit",
        "Star, ID",
        "$140.00",
        "Used · excellent",
        "https://images.unsplash.com/photo-1478827536114-da961b7c7a74?auto=format&fit=crop&w=900&q=80",
        "Seasonal",
      ),
    ],
  },
  {
    title: "Clothing & accessories",
    action: "Shop clothing",
    href: "/browse?category=general&q=clothing",
    cards: [
      previewCard(
        "Women's Winter Coat",
        "Boise, ID",
        "$40.00",
        "Like new · Medium",
        "https://images.unsplash.com/photo-1544966503-7cc5ac882d5f?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Men's Leather Work Boots",
        "Meridian, ID",
        "$55.00",
        "Used · excellent",
        "https://images.unsplash.com/photo-1520639888713-7851133b1ed0?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Vintage Denim Jacket",
        "Nampa, ID",
        "$28.00",
        "Used · good",
        "https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Designer Handbag",
        "Eagle, ID",
        "$180.00",
        "Like new",
        "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Kids Snow Gear Bundle",
        "Caldwell, ID",
        "$35.00",
        "Used · excellent",
        "https://images.unsplash.com/photo-1544966503-7cc5ac882d5f?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Handmade Wool Scarf",
        "Boise, ID",
        "$24.00",
        "New",
        "https://images.unsplash.com/photo-1520903920243-00d872a2d1c9?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  },
  {
    title: "Recently discounted",
    action: "See all price drops",
    href: "/browse?allCategories=true&sort=price_low",
    cards: [
      previewCard(
        "Solid Oak Dining Table",
        "Meridian, ID",
        "$275.00",
        "Was $350 · pickup",
        "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=900&q=80",
        "Price drop",
      ),
      previewCard(
        "Cordless Tool Set",
        "Boise, ID",
        "$95.00",
        "Was $125 · like new",
        "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=900&q=80",
        "Price drop",
      ),
      previewCard(
        "Pair of Patio Chairs",
        "Eagle, ID",
        "$60.00",
        "Was $90 · pickup",
        "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=900&q=80",
        "Price drop",
      ),
      previewCard(
        "Mountain Bike",
        "Nampa, ID",
        "$325.00",
        "Was $400 · excellent",
        "https://images.unsplash.com/photo-1576435728678-68d0fbf94e91?auto=format&fit=crop&w=900&q=80",
        "Price drop",
      ),
      previewCard(
        "Portable Projector",
        "Caldwell, ID",
        "$70.00",
        "Was $90 · tested",
        "https://images.unsplash.com/photo-1626379953822-baec19c3accd?auto=format&fit=crop&w=900&q=80",
        "Price drop",
      ),
      previewCard(
        "Garden Tool Bundle",
        "Star, ID",
        "$42.00",
        "Was $60 · pickup",
        "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=900&q=80",
        "Price drop",
      ),
    ],
  },
  showcaseRow("Furniture & home refresh", "Shop furniture", "/browse?category=furniture", [
    previewCard(
      "Solid Oak Dining Table",
      "Meridian, ID",
      "$275.00",
      "Seats six · Pickup",
      "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=900&q=80",
    ),
    previewCard(
      "Mid-Century Lounge Chair",
      "Boise, ID",
      "$140.00",
      "Excellent · Local pickup",
      "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=900&q=80",
    ),
    previewCard(
      "Bedroom Dresser",
      "Nampa, ID",
      "$90.00",
      "Six drawers · Good condition",
      "https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&w=900&q=80",
    ),
    previewCard(
      "Patio Conversation Set",
      "Eagle, ID",
      "$320.00",
      "Outdoor · Like new",
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=900&q=80",
    ),
    previewCard(
      "Entryway Bench",
      "Caldwell, ID",
      "$65.00",
      "Wood · Pickup available",
      "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80",
    ),
    previewCard(
      "Farmhouse Bookshelf",
      "Star, ID",
      "$110.00",
      "Five shelves · Good",
      "https://images.unsplash.com/photo-1594620302200-9a762244a156?auto=format&fit=crop&w=900&q=80",
    ),
  ]),
  showcaseRow("Electronics & gaming", "Browse electronics", "/browse?category=electronics", [
    previewCard(
      "4K Smart TV",
      "Boise, ID",
      "$280.00",
      "55 inch · Tested",
      "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=900&q=80",
    ),
    previewCard(
      "Nintendo Switch Bundle",
      "Meridian, ID",
      "$240.00",
      "Console · 3 games",
      "https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?auto=format&fit=crop&w=900&q=80",
    ),
    previewCard(
      "Noise-Canceling Headphones",
      "Nampa, ID",
      "$95.00",
      "Wireless · Like new",
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80",
    ),
    previewCard(
      "Gaming Desktop PC",
      "Eagle, ID",
      "$850.00",
      "RTX graphics · Ready to play",
      "https://images.unsplash.com/photo-1593640408182-31c70c8268f5?auto=format&fit=crop&w=900&q=80",
    ),
    previewCard(
      "Pair of Studio Monitors",
      "Caldwell, ID",
      "$180.00",
      "Audio · Excellent",
      "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=900&q=80",
    ),
    previewCard(
      "Vintage Film Camera",
      "Boise, ID",
      "$125.00",
      "Tested · Case included",
      "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=80",
    ),
  ]),
  showcaseRow("Outdoor & recreation", "Shop outdoor gear", "/browse?category=outdoor-sporting", [
    previewCard(
      "Mountain Bike",
      "Nampa, ID",
      "$325.00",
      "Excellent · Adult size",
      "https://images.unsplash.com/photo-1576435728678-68d0fbf94e91?auto=format&fit=crop&w=900&q=80",
    ),
    previewCard(
      "Two-Person Kayak",
      "Meridian, ID",
      "$450.00",
      "Paddles included",
      "https://images.unsplash.com/photo-1600965962361-9035dbfd1c50?auto=format&fit=crop&w=900&q=80",
    ),
    previewCard(
      "Family Camping Tent",
      "Boise, ID",
      "$120.00",
      "Sleeps six · Used once",
      "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=900&q=80",
    ),
    previewCard(
      "Fishing Rod Collection",
      "Caldwell, ID",
      "$85.00",
      "Four rods · Tackle box",
      "https://images.unsplash.com/photo-1534624977-8bf5f5f6c5a7?auto=format&fit=crop&w=900&q=80",
    ),
    previewCard(
      "Snowboard & Boots",
      "Eagle, ID",
      "$260.00",
      "All-mountain · Size 10",
      "https://images.unsplash.com/photo-1517299321609-52687d1bc55a?auto=format&fit=crop&w=900&q=80",
    ),
    previewCard(
      "Portable Propane Grill",
      "Star, ID",
      "$75.00",
      "Tailgate ready",
      "https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?auto=format&fit=crop&w=900&q=80",
    ),
  ]),
  showcaseRow("Tools & shop equipment", "Find tools", "/browse?category=tools-equipment", [
    previewCard(
      "Cordless Tool Set",
      "Boise, ID",
      "$95.00",
      "18V · Three tools",
      "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=900&q=80",
    ),
    previewCard(
      "Rolling Tool Chest",
      "Meridian, ID",
      "$240.00",
      "Seven drawers · Steel",
      "https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?auto=format&fit=crop&w=900&q=80",
    ),
    previewCard(
      "Portable Air Compressor",
      "Nampa, ID",
      "$150.00",
      "6 gallon · Tested",
      "https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?auto=format&fit=crop&w=900&q=80",
    ),
    previewCard(
      "Table Saw",
      "Eagle, ID",
      "$275.00",
      "Jobsite · Folding stand",
      "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&w=900&q=80",
    ),
    previewCard(
      "Welding Helmet & Gear",
      "Caldwell, ID",
      "$110.00",
      "Auto-darkening · Complete",
      "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&w=900&q=80",
    ),
    previewCard(
      "Ladder Set",
      "Boise, ID",
      "$85.00",
      "Six and eight foot",
      "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=900&q=80",
    ),
  ]),
  showcaseRow("Farm & garden finds", "Browse farm and garden", "/browse?category=farm-garden", [
    previewCard(
      "Raised Garden Bed Set",
      "Meridian, ID",
      "$70.00",
      "Cedar · Four beds",
      "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=900&q=80",
    ),
    previewCard(
      "Zero-Turn Mower",
      "Boise, ID",
      "$2,800.00",
      "54 inch · Serviced",
      "https://images.unsplash.com/photo-1599685315640-3f3c8e3d9b4b?auto=format&fit=crop&w=900&q=80",
    ),
    previewCard(
      "Greenhouse Kit",
      "Nampa, ID",
      "$240.00",
      "8 × 10 · New in box",
      "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&w=900&q=80",
    ),
    previewCard(
      "Utility Trailer",
      "Eagle, ID",
      "$1,250.00",
      "5 × 8 · Titled",
      "https://images.unsplash.com/photo-1601584115197-04ecc0da31d8?auto=format&fit=crop&w=900&q=80",
    ),
    previewCard(
      "Fruit Tree Bundle",
      "Caldwell, ID",
      "$95.00",
      "Six trees · Ready to plant",
      "https://images.unsplash.com/photo-1530968464165-7a1861cbaf9f?auto=format&fit=crop&w=900&q=80",
    ),
    previewCard(
      "Compost Tumbler",
      "Star, ID",
      "$60.00",
      "Backyard composting",
      "https://images.unsplash.com/photo-1599685315640-3f3c8e3d9b4b?auto=format&fit=crop&w=900&q=80",
    ),
  ]),
];

const vehicleShowcaseRows: HomepagePreviewRow[] = [
  {
    title: "Popular cars & trucks",
    action: "See popular vehicles",
    href: "/browse?group=motors&vehicleMode=results",
    cards: [
      previewCard(
        "2019 Toyota Tacoma TRD Off-Road 4x4",
        "Meridian, ID",
        "$31,750",
        "68,420 mi · Automatic · 4WD",
        "https://images.unsplash.com/photo-1559416523-140ddc3d238c?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2020 Jeep Wrangler Sport 4WD",
        "Idaho Falls, ID",
        "$28,900",
        "52,100 mi · Manual · 4WD",
        "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2022 Hyundai Tucson SEL AWD",
        "Coeur d'Alene, ID",
        "$25,900",
        "27,400 mi · Automatic · AWD",
        "https://images.unsplash.com/photo-1619767886558-efdc259cde1a?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2018 Ford F-150 XLT",
        "Boise, ID",
        "$26,500",
        "91,200 mi · Automatic · 4WD",
        "https://images.unsplash.com/photo-1504215680853-026ed2a45def?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2021 Subaru Outback Premium",
        "Nampa, ID",
        "$24,400",
        "44,800 mi · Automatic · AWD",
        "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2017 Honda Civic EX",
        "Pocatello, ID",
        "$16,900",
        "73,600 mi · Automatic · FWD",
        "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  },
  {
    title: "Adventure-ready rides",
    action: "Explore outdoor vehicles",
    href: "/browse?group=motors&vehicleMode=results&bodyStyle=SUV||Truck",
    cards: [
      previewCard(
        "2021 Ford Bronco Big Bend",
        "Boise, ID",
        "$38,500",
        "39,100 mi · 4WD · Hardtop",
        "https://images.unsplash.com/photo-1533130061792-64b345e4a833?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2019 Airstream Basecamp",
        "Meridian, ID",
        "$29,800",
        "Sleeps 4 · Like new",
        "https://images.unsplash.com/photo-1544986581-efac024faf62?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2023 Polaris Ranger XP",
        "Eagle, ID",
        "$18,900",
        "1,240 mi · 4WD · Utility",
        "https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2020 Toyota 4Runner TRD Pro",
        "Caldwell, ID",
        "$42,700",
        "61,300 mi · 4WD",
        "https://images.unsplash.com/photo-1519245659620-e859806a8d3b?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2022 Yamaha Grizzly 700",
        "Twin Falls, ID",
        "$9,750",
        "980 mi · Automatic · 4WD",
        "https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2016 Ram 2500 Tradesman",
        "Idaho Falls, ID",
        "$31,200",
        "112,000 mi · Diesel · 4WD",
        "https://images.unsplash.com/photo-1551830820-330a71b99659?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  },
  {
    title: "Just reduced",
    action: "See vehicle price drops",
    href: "/browse?group=motors&vehicleMode=results&sort=price_low",
    cards: [
      previewCard(
        "2015 Ram 1500 Big Horn 4WD",
        "Nampa, ID",
        "$24,800",
        "101,300 mi · Automatic · 4WD",
        "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=900&q=80",
        "Price drop",
      ),
      previewCard(
        "2018 Chevrolet Equinox LT",
        "Boise, ID",
        "$15,400",
        "84,200 mi · Automatic · AWD",
        "https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=900&q=80",
        "Price drop",
      ),
      previewCard(
        "2014 Subaru Forester 2.5i",
        "Meridian, ID",
        "$12,900",
        "116,500 mi · AWD",
        "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=900&q=80",
        "Price drop",
      ),
      previewCard(
        "2022 Hyundai Santa Fe SEL",
        "Rexburg, ID",
        "$27,300",
        "35,400 mi · AWD",
        "https://images.unsplash.com/photo-1619767886558-efdc259cde1a?auto=format&fit=crop&w=900&q=80",
        "Price drop",
      ),
      previewCard(
        "2019 Honda Ridgeline RTL",
        "Pocatello, ID",
        "$26,100",
        "72,600 mi · AWD",
        "https://images.unsplash.com/photo-1597007066704-67bf2068d5b2?auto=format&fit=crop&w=900&q=80",
        "Price drop",
      ),
      previewCard(
        "2017 Mazda CX-5 Touring",
        "Twin Falls, ID",
        "$17,800",
        "88,900 mi · AWD",
        "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=900&q=80",
        "Price drop",
      ),
    ],
  },
  showcaseRow(
    "Fuel-efficient commuters",
    "Shop efficient cars",
    "/browse?group=motors&vehicleMode=results&fuelType=Hybrid||Electric",
    [
      previewCard(
        "2022 Toyota Prius LE",
        "Boise, ID",
        "$25,400",
        "42,100 mi · Hybrid · Automatic",
        "https://images.unsplash.com/photo-1550355291-bbee04a92027?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2021 Honda Accord Hybrid",
        "Meridian, ID",
        "$27,800",
        "36,500 mi · Hybrid · FWD",
        "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2023 Hyundai Kona Electric",
        "Nampa, ID",
        "$29,900",
        "18,200 mi · Electric · AWD",
        "https://images.unsplash.com/photo-1619767886558-efdc259cde1a?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2020 Toyota RAV4 Hybrid",
        "Eagle, ID",
        "$30,500",
        "51,700 mi · Hybrid · AWD",
        "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2022 Ford Escape Hybrid",
        "Caldwell, ID",
        "$24,700",
        "39,600 mi · Hybrid · AWD",
        "https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2019 Chevrolet Bolt EV",
        "Twin Falls, ID",
        "$18,900",
        "44,200 mi · Electric · Hatchback",
        "https://images.unsplash.com/photo-1597007066704-67bf2068d5b2?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  ),
  showcaseRow(
    "Family SUVs & crossovers",
    "Find family SUVs",
    "/browse?group=motors&vehicleMode=results&bodyStyle=SUV",
    [
      previewCard(
        "2022 Hyundai Tucson SEL AWD",
        "Coeur d'Alene, ID",
        "$25,900",
        "27,400 mi · Automatic · AWD",
        "https://images.unsplash.com/photo-1619767886558-efdc259cde1a?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2021 Subaru Outback Premium",
        "Nampa, ID",
        "$24,400",
        "44,800 mi · Automatic · AWD",
        "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2020 Honda CR-V EX",
        "Boise, ID",
        "$23,600",
        "58,100 mi · Automatic · AWD",
        "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2023 Kia Telluride S",
        "Meridian, ID",
        "$36,800",
        "21,900 mi · Automatic · AWD",
        "https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2019 Mazda CX-5 Touring",
        "Eagle, ID",
        "$19,900",
        "69,400 mi · Automatic · AWD",
        "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2021 Ford Explorer XLT",
        "Caldwell, ID",
        "$31,500",
        "48,700 mi · Automatic · 4WD",
        "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  ),
  showcaseRow(
    "Work trucks & vans",
    "Shop work-ready vehicles",
    "/browse?group=motors&vehicleMode=results&bodyStyle=Truck||Van",
    [
      previewCard(
        "2018 Ford F-150 XLT",
        "Boise, ID",
        "$26,500",
        "91,200 mi · Automatic · 4WD",
        "https://images.unsplash.com/photo-1504215680853-026ed2a45def?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2020 Ram 2500 Tradesman",
        "Idaho Falls, ID",
        "$38,900",
        "82,400 mi · Diesel · 4WD",
        "https://images.unsplash.com/photo-1551830820-330a71b99659?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2021 Chevrolet Silverado 1500",
        "Nampa, ID",
        "$34,700",
        "61,300 mi · Automatic · 4WD",
        "https://images.unsplash.com/photo-1533130061792-64b345e4a833?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2019 Toyota Tacoma TRD Off-Road",
        "Meridian, ID",
        "$31,750",
        "68,420 mi · Automatic · 4WD",
        "https://images.unsplash.com/photo-1559416523-140ddc3d238c?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2022 Ford Transit Cargo Van",
        "Caldwell, ID",
        "$42,500",
        "35,100 mi · Automatic · Shelving",
        "https://images.unsplash.com/photo-1616401784845-180882ba9ba8?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2017 GMC Sierra 2500HD",
        "Twin Falls, ID",
        "$29,800",
        "117,200 mi · Diesel · Tow package",
        "https://images.unsplash.com/photo-1551830820-330a71b99659?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  ),
  showcaseRow(
    "RVs, campers & trailers",
    "Explore campers and trailers",
    "/browse?group=motors&vehicleMode=results&bodyStyle=RV||Trailer",
    [
      previewCard(
        "2019 Airstream Basecamp",
        "Meridian, ID",
        "$29,800",
        "Sleeps 4 · Like new",
        "https://images.unsplash.com/photo-1544986581-efac024faf62?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2021 Forest River Travel Trailer",
        "Boise, ID",
        "$24,500",
        "Sleeps 6 · Slide-out",
        "https://images.unsplash.com/photo-1533592753491-5b4f9c2c4f9f?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2020 Enclosed Cargo Trailer",
        "Nampa, ID",
        "$8,900",
        "7 × 14 · Ramp door",
        "https://images.unsplash.com/photo-1601584115197-04ecc0da31d8?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2018 Jayco Pop-Up Camper",
        "Eagle, ID",
        "$11,750",
        "Sleeps 6 · Ready to camp",
        "https://images.unsplash.com/photo-1504851149312-7a075b496cc7?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Utility Trailer",
        "Caldwell, ID",
        "$1,250",
        "5 × 8 · Titled",
        "https://images.unsplash.com/photo-1601584115197-04ecc0da31d8?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2022 Toy Hauler",
        "Idaho Falls, ID",
        "$38,400",
        "Sleeps 7 · Garage area",
        "https://images.unsplash.com/photo-1544986581-efac024faf62?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  ),
  showcaseRow(
    "Motorcycles & powersports",
    "Shop powersports",
    "/browse?group=motors&vehicleMode=results&bodyStyle=Motorcycle||ATV",
    [
      previewCard(
        "2022 Yamaha MT-07",
        "Boise, ID",
        "$7,400",
        "2,100 mi · Street bike",
        "https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2022 Yamaha Grizzly 700",
        "Twin Falls, ID",
        "$9,750",
        "980 mi · Automatic · 4WD",
        "https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2019 Harley-Davidson Sportster",
        "Meridian, ID",
        "$8,900",
        "12,400 mi · V-twin",
        "https://images.unsplash.com/photo-1558981359-219d6364c9c8?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2021 Polaris Ranger XP",
        "Eagle, ID",
        "$18,900",
        "1,240 mi · 4WD · Utility",
        "https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2020 Honda Rebel 500",
        "Nampa, ID",
        "$6,200",
        "4,800 mi · Beginner friendly",
        "https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2018 Can-Am Outlander",
        "Caldwell, ID",
        "$7,800",
        "2,400 mi · Trail ready",
        "https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  ),
  showcaseRow(
    "Cars under $20,000",
    "Find affordable cars",
    "/browse?group=motors&vehicleMode=results&priceMax=20000",
    [
      previewCard(
        "2017 Honda Civic EX",
        "Pocatello, ID",
        "$16,900",
        "73,600 mi · Automatic · FWD",
        "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2018 Chevrolet Equinox LT",
        "Boise, ID",
        "$15,400",
        "84,200 mi · Automatic · AWD",
        "https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2014 Subaru Forester 2.5i",
        "Meridian, ID",
        "$12,900",
        "116,500 mi · AWD",
        "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2017 Mazda CX-5 Touring",
        "Twin Falls, ID",
        "$17,800",
        "88,900 mi · AWD",
        "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2016 Toyota Corolla LE",
        "Caldwell, ID",
        "$14,750",
        "92,100 mi · Automatic · FWD",
        "https://images.unsplash.com/photo-1550355291-bbee04a92027?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2015 Ford Escape SE",
        "Nampa, ID",
        "$13,900",
        "101,700 mi · Automatic · AWD",
        "https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  ),
  showcaseRow(
    "Late-model local vehicles",
    "Browse newer vehicles",
    "/browse?group=motors&vehicleMode=results&yearMin=2022",
    [
      previewCard(
        "2023 Ford Bronco Big Bend",
        "Boise, ID",
        "$38,500",
        "18,100 mi · 4WD · Hardtop",
        "https://images.unsplash.com/photo-1533130061792-64b345e4a833?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2022 Hyundai Tucson SEL AWD",
        "Coeur d'Alene, ID",
        "$25,900",
        "27,400 mi · Automatic · AWD",
        "https://images.unsplash.com/photo-1619767886558-efdc259cde1a?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2024 Toyota Tacoma SR5",
        "Meridian, ID",
        "$41,200",
        "9,800 mi · Automatic · 4WD",
        "https://images.unsplash.com/photo-1559416523-140ddc3d238c?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2023 Kia Telluride S",
        "Eagle, ID",
        "$36,800",
        "21,900 mi · Automatic · AWD",
        "https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2022 Ford Maverick XLT",
        "Nampa, ID",
        "$29,400",
        "31,700 mi · Hybrid · AWD",
        "https://images.unsplash.com/photo-1504215680853-026ed2a45def?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2022 Tesla Model 3",
        "Boise, ID",
        "$28,700",
        "24,600 mi · Electric · Long range",
        "https://images.unsplash.com/photo-1560958089-b8a1929cea89?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  ),
  showcaseRow(
    "Classic & enthusiast vehicles",
    "Explore classic rides",
    "/browse?group=motors&vehicleMode=results",
    [
      previewCard(
        "1967 Ford Mustang Coupe",
        "Boise, ID",
        "$32,500",
        "Restored · V8 · Automatic",
        "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "1972 Chevrolet C10 Pickup",
        "Meridian, ID",
        "$28,900",
        "Classic · Long bed · V8",
        "https://images.unsplash.com/photo-1504215680853-026ed2a45def?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "1988 Porsche 911 Carrera",
        "Eagle, ID",
        "$64,900",
        "Collector · Manual · Coupe",
        "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "1979 Jeep CJ-7",
        "Nampa, ID",
        "$21,750",
        "4WD · Soft top · Restored",
        "https://images.unsplash.com/photo-1533130061792-64b345e4a833?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "1965 Volkswagen Beetle",
        "Caldwell, ID",
        "$18,500",
        "Classic · Recent service",
        "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "1991 Toyota Land Cruiser",
        "Twin Falls, ID",
        "$35,900",
        "4WD · Original condition",
        "https://images.unsplash.com/photo-1519245659620-e859806a8d3b?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  ),
  showcaseRow(
    "Three-row family vehicles",
    "Find three-row vehicles",
    "/browse?group=motors&vehicleMode=results",
    [
      previewCard(
        "2021 Honda Pilot EX-L",
        "Boise, ID",
        "$29,500",
        "52,800 mi · 3 rows · AWD",
        "https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2020 Toyota Highlander XLE",
        "Meridian, ID",
        "$32,400",
        "61,400 mi · 3 rows · AWD",
        "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2022 Kia Carnival SX",
        "Nampa, ID",
        "$35,900",
        "28,700 mi · 3 rows · Van",
        "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2019 Chevrolet Traverse LT",
        "Eagle, ID",
        "$22,800",
        "74,200 mi · 3 rows · AWD",
        "https://images.unsplash.com/photo-1619767886558-efdc259cde1a?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2021 Volkswagen Atlas SEL",
        "Caldwell, ID",
        "$31,600",
        "47,900 mi · 3 rows · AWD",
        "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2018 Ford Expedition XLT",
        "Idaho Falls, ID",
        "$27,400",
        "88,100 mi · 3 rows · 4WD",
        "https://images.unsplash.com/photo-1533130061792-64b345e4a833?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  ),
  showcaseRow(
    "AWD & winter-ready rides",
    "Shop all-weather vehicles",
    "/browse?group=motors&vehicleMode=results&drivetrain=AWD||4WD",
    [
      previewCard(
        "2021 Subaru Outback Premium",
        "Nampa, ID",
        "$24,400",
        "44,800 mi · Automatic · AWD",
        "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2019 Jeep Cherokee Trailhawk",
        "Boise, ID",
        "$23,900",
        "57,600 mi · Automatic · 4WD",
        "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2020 Volvo XC60 Momentum",
        "Eagle, ID",
        "$29,700",
        "39,200 mi · Automatic · AWD",
        "https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2018 Toyota 4Runner SR5",
        "Meridian, ID",
        "$28,500",
        "93,100 mi · Automatic · 4WD",
        "https://images.unsplash.com/photo-1519245659620-e859806a8d3b?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2022 Mazda CX-50 Premium",
        "Caldwell, ID",
        "$30,900",
        "26,800 mi · Automatic · AWD",
        "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "2017 Honda Ridgeline RTL",
        "Pocatello, ID",
        "$26,100",
        "72,600 mi · Automatic · AWD",
        "https://images.unsplash.com/photo-1597007066704-67bf2068d5b2?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  ),
];

const jobsShowcaseRows: HomepagePreviewRow[] = [
  {
    title: "New opportunities",
    action: "See newest jobs",
    href: "/browse?category=jobs&jobMode=results",
    cards: [
      previewCard(
        "Front Desk Coordinator",
        "Boise, ID",
        "$18–$22 / hr",
        "Full-time · Healthcare",
        "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=900&q=80",
        "New",
      ),
      previewCard(
        "Warehouse Team Member",
        "Meridian, ID",
        "$20 / hr",
        "Full-time · Day shift",
        "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=900&q=80",
        "New",
      ),
      previewCard(
        "Customer Support Specialist",
        "Nampa, ID",
        "$21 / hr",
        "Remote friendly · Full-time",
        "https://images.unsplash.com/photo-1556761175-4b46a572b786?auto=format&fit=crop&w=900&q=80",
        "New",
      ),
      previewCard(
        "Line Cook",
        "Eagle, ID",
        "$17–$20 / hr",
        "Part-time · Evenings",
        "https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=900&q=80",
        "New",
      ),
      previewCard(
        "Office Administrator",
        "Caldwell, ID",
        "$46,000–$52,000",
        "Full-time · Benefits",
        "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=900&q=80",
        "New",
      ),
      previewCard(
        "Delivery Driver",
        "Boise, ID",
        "$22 / hr",
        "Contract · Flexible",
        "https://images.unsplash.com/photo-1616401784845-180882ba9ba8?auto=format&fit=crop&w=900&q=80",
        "New",
      ),
    ],
  },
  {
    title: "Part-time & flexible",
    action: "Find flexible work",
    href: "/browse?category=jobs&jobMode=results&jobType=Part-time",
    cards: [
      previewCard(
        "Weekend Event Staff",
        "Boise, ID",
        "$19 / hr",
        "Weekend only · Seasonal",
        "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "After-school Tutor",
        "Meridian, ID",
        "$24 / hr",
        "Part-time · Education",
        "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Retail Sales Associate",
        "Nampa, ID",
        "$16 / hr",
        "Part-time · Flexible",
        "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Barista",
        "Eagle, ID",
        "$15 + tips",
        "Part-time · Mornings",
        "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Dog Walker",
        "Boise, ID",
        "$25 / visit",
        "Contract · Flexible",
        "https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Seasonal Garden Center",
        "Caldwell, ID",
        "$17 / hr",
        "Seasonal · Part-time",
        "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  },
  {
    title: "Skilled trades & hands-on work",
    action: "Browse skilled trades",
    href: "/browse?category=jobs&jobMode=results&jobCategory=Construction",
    cards: [
      previewCard(
        "Licensed Electrician",
        "Boise, ID",
        "$34–$42 / hr",
        "Full-time · Construction",
        "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "HVAC Service Technician",
        "Meridian, ID",
        "$28–$36 / hr",
        "Full-time · Benefits",
        "https://images.unsplash.com/photo-1631545806609-ccf5d6f5c2ab?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Carpenter / Finish Crew",
        "Nampa, ID",
        "$25–$32 / hr",
        "Full-time · 3+ years",
        "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Diesel Mechanic",
        "Idaho Falls, ID",
        "$30–$38 / hr",
        "Full-time · Shop",
        "https://images.unsplash.com/photo-1486006920555-c77dcf18193c?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Landscape Crew Lead",
        "Eagle, ID",
        "$23–$28 / hr",
        "Seasonal · Outdoor",
        "https://images.unsplash.com/photo-1558904541-efa843a96f01?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Apprentice Plumber",
        "Caldwell, ID",
        "$20–$26 / hr",
        "Full-time · Training",
        "https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  },
  showcaseRow(
    "Healthcare & caregiving",
    "Browse healthcare jobs",
    "/browse?category=jobs&jobMode=results&jobCategory=Healthcare",
    [
      previewCard(
        "Medical Assistant",
        "Boise, ID",
        "$21–$26 / hr",
        "Full-time · Clinic",
        "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Registered Nurse",
        "Meridian, ID",
        "$38–$48 / hr",
        "Full-time · Hospital",
        "https://images.unsplash.com/photo-1584982751601-97dcc096659c?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Caregiver — Weekends",
        "Nampa, ID",
        "$19 / hr",
        "Part-time · Weekend",
        "https://images.unsplash.com/photo-1576765608866-5b51046452be?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Dental Office Coordinator",
        "Eagle, ID",
        "$20–$25 / hr",
        "Full-time · Benefits",
        "https://images.unsplash.com/photo-1609840114035-3c981b782dfe?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Physical Therapy Aide",
        "Caldwell, ID",
        "$18 / hr",
        "Part-time · Training",
        "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Home Health Scheduler",
        "Boise, ID",
        "$22 / hr",
        "Full-time · Office",
        "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  ),
  showcaseRow(
    "Hospitality & food service",
    "Find hospitality jobs",
    "/browse?category=jobs&jobMode=results&jobCategory=Hospitality",
    [
      previewCard(
        "Restaurant General Manager",
        "Boise, ID",
        "$58,000–$68,000",
        "Full-time · Restaurant",
        "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Sous Chef",
        "Meridian, ID",
        "$24–$29 / hr",
        "Full-time · Evenings",
        "https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Hotel Front Desk Agent",
        "Nampa, ID",
        "$17 / hr",
        "Full-time · Nights",
        "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Catering Server",
        "Eagle, ID",
        "$18 / hr",
        "Part-time · Events",
        "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Barista",
        "Boise, ID",
        "$15 + tips",
        "Part-time · Mornings",
        "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Banquet Captain",
        "Caldwell, ID",
        "$20 / hr",
        "Seasonal · Evenings",
        "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  ),
  showcaseRow(
    "Office & administrative",
    "Browse office jobs",
    "/browse?category=jobs&jobMode=results&jobCategory=Administrative",
    [
      previewCard(
        "Executive Assistant",
        "Boise, ID",
        "$52,000–$62,000",
        "Full-time · Hybrid",
        "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Office Administrator",
        "Caldwell, ID",
        "$46,000–$52,000",
        "Full-time · Benefits",
        "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Receptionist",
        "Meridian, ID",
        "$18 / hr",
        "Full-time · Customer-facing",
        "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Bookkeeping Assistant",
        "Nampa, ID",
        "$21–$25 / hr",
        "Part-time · Flexible",
        "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Project Coordinator",
        "Eagle, ID",
        "$55,000–$65,000",
        "Full-time · Construction",
        "https://images.unsplash.com/photo-1556761175-4b46a572b786?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Data Entry Specialist",
        "Boise, ID",
        "$19 / hr",
        "Temporary · Remote friendly",
        "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  ),
  showcaseRow(
    "Sales & customer experience",
    "Find sales jobs",
    "/browse?category=jobs&jobMode=results&jobCategory=Retail",
    [
      previewCard(
        "Customer Support Specialist",
        "Nampa, ID",
        "$21 / hr",
        "Full-time · Remote friendly",
        "https://images.unsplash.com/photo-1556761175-4b46a572b786?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Outside Sales Representative",
        "Boise, ID",
        "$60,000 + commission",
        "Full-time · Territory",
        "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Retail Sales Associate",
        "Meridian, ID",
        "$16 / hr",
        "Part-time · Flexible",
        "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Account Representative",
        "Eagle, ID",
        "$24 / hr",
        "Full-time · Benefits",
        "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Call Center Lead",
        "Caldwell, ID",
        "$24–$28 / hr",
        "Full-time · Day shift",
        "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Merchandising Associate",
        "Boise, ID",
        "$18 / hr",
        "Seasonal · Retail",
        "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  ),
  showcaseRow(
    "Education & childcare",
    "Browse education jobs",
    "/browse?category=jobs&jobMode=results&jobCategory=Education",
    [
      previewCard(
        "After-school Tutor",
        "Meridian, ID",
        "$24 / hr",
        "Part-time · Education",
        "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Preschool Teacher",
        "Boise, ID",
        "$19–$23 / hr",
        "Full-time · Early learning",
        "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "School Office Assistant",
        "Nampa, ID",
        "$20 / hr",
        "Full-time · School year",
        "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Math Instructor",
        "Eagle, ID",
        "$28 / hr",
        "Part-time · Afternoons",
        "https://images.unsplash.com/photo-1596495578066-2e8be67f0c7f?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Nanny — Three Afternoons",
        "Boise, ID",
        "$22 / hr",
        "Part-time · Family home",
        "https://images.unsplash.com/photo-1484820540004-14229fe36ca4?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Youth Program Assistant",
        "Caldwell, ID",
        "$18 / hr",
        "Part-time · Community",
        "https://images.unsplash.com/photo-1472162072942-cd5147eb3902?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  ),
  showcaseRow(
    "Remote-friendly roles",
    "Find flexible remote work",
    "/browse?category=jobs&jobMode=results",
    [
      previewCard(
        "Customer Support Specialist",
        "Idaho · Remote",
        "$21 / hr",
        "Full-time · Work from home",
        "https://images.unsplash.com/photo-1556761175-4b46a572b786?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Virtual Bookkeeper",
        "Idaho · Remote",
        "$25–$30 / hr",
        "Contract · Flexible",
        "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Content Coordinator",
        "Idaho · Remote",
        "$52,000–$60,000",
        "Full-time · Marketing",
        "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Technical Support Agent",
        "Idaho · Remote",
        "$24 / hr",
        "Full-time · Technology",
        "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Scheduling Coordinator",
        "Idaho · Remote",
        "$20 / hr",
        "Part-time · Healthcare",
        "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Digital Marketing Assistant",
        "Idaho · Remote",
        "$22 / hr",
        "Contract · Flexible",
        "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  ),
  showcaseRow(
    "Seasonal & event work",
    "Find seasonal jobs",
    "/browse?category=jobs&jobMode=results&jobType=Seasonal",
    [
      previewCard(
        "Weekend Event Staff",
        "Boise, ID",
        "$19 / hr",
        "Weekend only · Seasonal",
        "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Holiday Retail Associate",
        "Meridian, ID",
        "$17 / hr",
        "Seasonal · Retail",
        "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Festival Setup Crew",
        "Nampa, ID",
        "$22 / hr",
        "Temporary · Outdoors",
        "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Garden Center Associate",
        "Caldwell, ID",
        "$17 / hr",
        "Seasonal · Part-time",
        "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Snow Removal Crew",
        "Boise, ID",
        "$25 / hr",
        "Seasonal · Early mornings",
        "https://images.unsplash.com/photo-1517299321609-52687d1bc55a?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Catering Prep Staff",
        "Eagle, ID",
        "$18 / hr",
        "Temporary · Events",
        "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  ),
  showcaseRow(
    "Finance & accounting",
    "Browse finance jobs",
    "/browse?category=jobs&jobMode=results&jobCategory=Accounting%20%26%20Finance",
    [
      previewCard(
        "Staff Accountant",
        "Boise, ID",
        "$62,000–$75,000",
        "Full-time · Finance",
        "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Payroll Specialist",
        "Meridian, ID",
        "$24–$29 / hr",
        "Full-time · Benefits",
        "https://images.unsplash.com/photo-1554224154-26032ffc0d07?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Tax Preparer",
        "Nampa, ID",
        "$25 / hr",
        "Seasonal · Contract",
        "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Financial Advisor Associate",
        "Eagle, ID",
        "$55,000 + bonus",
        "Full-time · Training",
        "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Accounts Receivable Clerk",
        "Caldwell, ID",
        "$21 / hr",
        "Full-time · Office",
        "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Bookkeeping Manager",
        "Boise, ID",
        "$68,000–$80,000",
        "Full-time · Small business",
        "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  ),
  showcaseRow(
    "Transportation & delivery",
    "Find driving jobs",
    "/browse?category=jobs&jobMode=results",
    [
      previewCard(
        "Delivery Driver",
        "Boise, ID",
        "$22 / hr",
        "Contract · Flexible",
        "https://images.unsplash.com/photo-1616401784845-180882ba9ba8?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "CDL Class A Driver",
        "Meridian, ID",
        "$28–$34 / hr",
        "Full-time · Local routes",
        "https://images.unsplash.com/photo-1519003722824-194d4455a60c?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "School Bus Driver",
        "Nampa, ID",
        "$23 / hr",
        "Part-time · Split shift",
        "https://images.unsplash.com/photo-1570125909232-eb263c188f7e?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Route Delivery Helper",
        "Caldwell, ID",
        "$19 / hr",
        "Full-time · Day shift",
        "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Fleet Coordinator",
        "Eagle, ID",
        "$52,000–$60,000",
        "Full-time · Logistics",
        "https://images.unsplash.com/photo-1586528116493-da8b20f5c7bb?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Weekend Courier",
        "Boise, ID",
        "$20 / hr",
        "Weekend only · Contractor",
        "https://images.unsplash.com/photo-1616401784845-180882ba9ba8?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  ),
  showcaseRow(
    "Engineering & technical",
    "Browse technical jobs",
    "/browse?category=jobs&jobMode=results&jobCategory=Architecture%20%26%20Engineering",
    [
      previewCard(
        "Civil Engineering Technician",
        "Boise, ID",
        "$27–$34 / hr",
        "Full-time · Engineering",
        "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "CAD Designer",
        "Meridian, ID",
        "$62,000–$74,000",
        "Full-time · Construction",
        "https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Quality Control Technician",
        "Nampa, ID",
        "$24 / hr",
        "Full-time · Manufacturing",
        "https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Project Engineer",
        "Eagle, ID",
        "$78,000–$92,000",
        "Full-time · Infrastructure",
        "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Survey Crew Technician",
        "Caldwell, ID",
        "$23–$29 / hr",
        "Full-time · Outdoors",
        "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Manufacturing Engineer",
        "Boise, ID",
        "$85,000–$100,000",
        "Full-time · Production",
        "https://images.unsplash.com/photo-1565043666747-69f6646db940?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  ),
];

const servicesShowcaseRows: HomepagePreviewRow[] = [
  {
    title: "Recently added pros",
    action: "See newest service listings",
    href: "/browse?category=services&serviceMode=results",
    cards: [
      previewCard(
        "Boise Home Works | Handyman & Drywall Repair",
        "Boise, ID",
        "Call for quote",
        "Just listed · Handyman",
        "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=900&q=80",
        "New",
      ),
      previewCard(
        "Treasure Valley Lawn Co. | Lawn Care & Sprinklers",
        "Meridian, ID",
        "From $45 / visit",
        "1 day · Lawn care",
        "https://images.unsplash.com/photo-1558904541-efa843a96f01?auto=format&fit=crop&w=900&q=80",
        "New",
      ),
      previewCard(
        "Gem State Tech Help | Home Wi-Fi & Computer Setup",
        "Boise, ID",
        "From $85 / visit",
        "2 days · IT services",
        "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80",
        "New",
      ),
      previewCard(
        "ClearView Window Care",
        "Eagle, ID",
        "Call for quote",
        "3 days · Window cleaning",
        "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=900&q=80",
        "New",
      ),
      previewCard(
        "Valley Fence & Gate",
        "Nampa, ID",
        "Call for quote",
        "4 days · Fence installation",
        "https://images.unsplash.com/photo-1580130732478-4e339fb6836f?auto=format&fit=crop&w=900&q=80",
        "New",
      ),
      previewCard(
        "Mountain Air HVAC",
        "Caldwell, ID",
        "From $89 service call",
        "5 days · Heating & cooling",
        "https://images.unsplash.com/photo-1631545806609-ccf5d6f5c2ab?auto=format&fit=crop&w=900&q=80",
        "New",
      ),
    ],
  },
  {
    title: "Popular with neighbors",
    action: "Browse popular pros",
    href: "/browse?category=services&serviceMode=results",
    cards: [
      previewCard(
        "Treasure Valley Lawn Co.",
        "Meridian, ID",
        "From $45 / visit",
        "Lawn care · Sprinklers",
        "https://images.unsplash.com/photo-1558904541-efa843a96f01?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Boise Home Works",
        "Boise, ID",
        "Call for quote",
        "Handyman · Drywall",
        "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Gem State Tech Help",
        "Boise, ID",
        "From $85 / visit",
        "Wi-Fi · Computer setup",
        "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "ClearView Window Care",
        "Eagle, ID",
        "From $120",
        "Windows · Screens",
        "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Valley Fence & Gate",
        "Nampa, ID",
        "Call for quote",
        "Fence repair · Install",
        "https://images.unsplash.com/photo-1580130732478-4e339fb6836f?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Mountain Air HVAC",
        "Caldwell, ID",
        "From $89 service call",
        "Heating · Cooling",
        "https://images.unsplash.com/photo-1631545806609-ccf5d6f5c2ab?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  },
  {
    title: "Projects to plan this season",
    action: "Find a local pro",
    href: "/browse?category=services&serviceMode=results",
    cards: [
      previewCard(
        "Holiday Light Installation",
        "Boise, ID",
        "Call for quote",
        "Exterior lighting",
        "https://images.unsplash.com/photo-1482517967863-00e15c9b44be?auto=format&fit=crop&w=900&q=80",
        "Seasonal",
      ),
      previewCard(
        "Fall Yard Cleanup",
        "Meridian, ID",
        "From $75",
        "Leaf removal · Hauling",
        "https://images.unsplash.com/photo-1599685315640-3f3c8e3d9b4b?auto=format&fit=crop&w=900&q=80",
        "Seasonal",
      ),
      previewCard(
        "Interior Painting Refresh",
        "Eagle, ID",
        "Free estimates",
        "Walls · Trim · Cabinets",
        "https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Kitchen Countertop Install",
        "Nampa, ID",
        "Call for quote",
        "Quartz · Granite",
        "https://images.unsplash.com/photo-1556912167-f556f1f39fdf?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Carpet & Flooring Install",
        "Boise, ID",
        "From $3.50 / sqft",
        "Carpet · LVP · Tile",
        "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Move-out Cleaning",
        "Caldwell, ID",
        "From $160",
        "Deep clean · Turnover",
        "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  },
  showcaseRow(
    "Plumbing & water",
    "Find a plumber",
    "/browse?category=services&serviceMode=results&serviceSubcategory=Plumbing",
    [
      previewCard(
        "Treasure Valley Plumbing",
        "Boise, ID",
        "From $95 service call",
        "Repairs · Installations",
        "https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "ClearFlow Water Heaters",
        "Meridian, ID",
        "Free estimates",
        "Water heaters · Maintenance",
        "https://images.unsplash.com/photo-1585704032915-c3400ca199e7?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Caldwell Drain Pros",
        "Caldwell, ID",
        "From $79",
        "Drain cleaning · Sewer",
        "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Eagle Leak Repair",
        "Eagle, ID",
        "Call for quote",
        "Leak detection · Repair",
        "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Boise Fixture Install",
        "Boise, ID",
        "From $125",
        "Faucets · Toilets · Sinks",
        "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Valley Sewer & Septic",
        "Nampa, ID",
        "Call for quote",
        "Septic · Sewer line",
        "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  ),
  showcaseRow(
    "Electrical & lighting",
    "Find an electrician",
    "/browse?category=services&serviceMode=results&serviceSubcategory=Electricians",
    [
      previewCard(
        "Gem State Electric",
        "Boise, ID",
        "From $110 service call",
        "Residential · Licensed",
        "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Valley Panel Upgrades",
        "Meridian, ID",
        "Free estimates",
        "Panels · EV chargers",
        "https://images.unsplash.com/photo-1621905251918-48416bd8575a?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Caldwell Lighting Co.",
        "Caldwell, ID",
        "From $85 / visit",
        "Fixtures · Recessed lighting",
        "https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Eagle Generator Service",
        "Eagle, ID",
        "Call for quote",
        "Generators · Backup power",
        "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Boise Smart Home Wiring",
        "Boise, ID",
        "From $125",
        "Networking · Audio",
        "https://images.unsplash.com/photo-1558008258-3256797b43f3?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Treasure Valley Solar",
        "Nampa, ID",
        "Free consultation",
        "Solar · Battery storage",
        "https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  ),
  showcaseRow(
    "Lawn & landscaping",
    "Find lawn care",
    "/browse?category=services&serviceMode=results&serviceSubcategory=Landscape Contractors",
    [
      previewCard(
        "Treasure Valley Lawn Co.",
        "Meridian, ID",
        "From $45 / visit",
        "Lawn care · Sprinklers",
        "https://images.unsplash.com/photo-1558904541-efa843a96f01?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Boise Landscape Design",
        "Boise, ID",
        "Free estimates",
        "Design · Planting · Mulch",
        "https://images.unsplash.com/photo-1558521958-0a228e77e984?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Canyon County Tree Care",
        "Nampa, ID",
        "From $175",
        "Trimming · Removal",
        "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Eagle Irrigation Repair",
        "Eagle, ID",
        "From $85",
        "Sprinklers · Winterization",
        "https://images.unsplash.com/photo-1599685315640-3f3c8e3d9b4b?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Caldwell Fence & Yard",
        "Caldwell, ID",
        "Call for quote",
        "Fences · Cleanup",
        "https://images.unsplash.com/photo-1580130732478-4e339fb6836f?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Seasonal Leaf Cleanup",
        "Star, ID",
        "From $75",
        "Leaf removal · Hauling",
        "https://images.unsplash.com/photo-1599685315640-3f3c8e3d9b4b?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  ),
  showcaseRow(
    "Cleaning & move-out",
    "Find a cleaner",
    "/browse?category=services&serviceMode=results&serviceSubcategory=House Cleaning",
    [
      previewCard(
        "ClearView Home Cleaning",
        "Boise, ID",
        "From $120",
        "Recurring · Deep clean",
        "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Move-Out Ready",
        "Meridian, ID",
        "From $160",
        "Turnovers · Deep clean",
        "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Caldwell Carpet Care",
        "Caldwell, ID",
        "From $95",
        "Carpet · Upholstery",
        "https://images.unsplash.com/photo-1581858726788-75bc0f6a952d?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Eagle Window Care",
        "Eagle, ID",
        "From $120",
        "Windows · Screens",
        "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Boise Office Cleaning",
        "Boise, ID",
        "Call for quote",
        "Commercial · Weekly",
        "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Pet-Friendly Home Clean",
        "Nampa, ID",
        "From $110",
        "Homes · Apartments",
        "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  ),
  showcaseRow(
    "Automotive & mobile repair",
    "Find auto service",
    "/browse?category=services&serviceMode=results&serviceSubcategory=Automotive",
    [
      previewCard(
        "Gem State Mobile Mechanic",
        "Boise, ID",
        "From $95 diagnostic",
        "Mobile repair · Brakes",
        "https://images.unsplash.com/photo-1486006920555-c77dcf18193c?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Treasure Valley Auto Detail",
        "Meridian, ID",
        "From $150",
        "Interior · Exterior detail",
        "https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Caldwell Tire Service",
        "Caldwell, ID",
        "From $25 / tire",
        "Mounting · Repair",
        "https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Boise Paintless Dent Repair",
        "Boise, ID",
        "Free estimates",
        "Dents · Hail damage",
        "https://images.unsplash.com/photo-1504215680853-026ed2a45def?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Eagle RV & Boat Repair",
        "Eagle, ID",
        "Call for quote",
        "RV · Boat systems",
        "https://images.unsplash.com/photo-1544986581-efac024faf62?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Valley Glass & Windshield",
        "Nampa, ID",
        "From $175",
        "Windshields · Auto glass",
        "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  ),
  showcaseRow(
    "Home improvement pros",
    "Plan a home project",
    "/browse?category=services&serviceMode=results",
    [
      previewCard(
        "Boise Home Works",
        "Boise, ID",
        "Call for quote",
        "Handyman · Drywall",
        "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Valley Fence & Gate",
        "Nampa, ID",
        "Call for quote",
        "Fence repair · Install",
        "https://images.unsplash.com/photo-1580130732478-4e339fb6836f?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Interior Painting Refresh",
        "Eagle, ID",
        "Free estimates",
        "Walls · Trim · Cabinets",
        "https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Kitchen Countertop Install",
        "Nampa, ID",
        "Call for quote",
        "Quartz · Granite",
        "https://images.unsplash.com/photo-1556912167-f556f1f39fdf?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Carpet & Flooring Install",
        "Boise, ID",
        "From $3.50 / sqft",
        "Carpet · LVP · Tile",
        "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Mountain Air HVAC",
        "Caldwell, ID",
        "From $89 service call",
        "Heating · Cooling",
        "https://images.unsplash.com/photo-1631545806609-ccf5d6f5c2ab?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  ),
  showcaseRow(
    "Technology & business help",
    "Find local tech help",
    "/browse?category=services&serviceMode=results",
    [
      previewCard(
        "Gem State Tech Help",
        "Boise, ID",
        "From $85 / visit",
        "Wi-Fi · Computer setup",
        "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Small Business Bookkeeping",
        "Meridian, ID",
        "From $65 / hour",
        "Books · Payroll · Reports",
        "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Local Website Studio",
        "Eagle, ID",
        "Projects from $900",
        "Websites · SEO",
        "https://images.unsplash.com/photo-1467232004584-a241de8bcf5d?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Home Network Setup",
        "Nampa, ID",
        "From $125",
        "Wi-Fi · Mesh systems",
        "https://images.unsplash.com/photo-1558008258-3256797b43f3?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Business Sign Design",
        "Caldwell, ID",
        "From $250",
        "Signs · Branding",
        "https://images.unsplash.com/photo-1561070791-2526d30994b5?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Drone Photo & Video",
        "Boise, ID",
        "From $300",
        "Real estate · Business",
        "https://images.unsplash.com/photo-1473968512647-3e447244af8f?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  ),
  showcaseRow(
    "Moving & hauling",
    "Find movers",
    "/browse?category=services&serviceMode=results&serviceSubcategory=Movers",
    [
      previewCard(
        "Treasure Valley Movers",
        "Boise, ID",
        "From $125 / hour",
        "Local moves · Packing",
        "https://images.unsplash.com/photo-1600518464441-9154a4dea21b?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Eagle Apartment Movers",
        "Eagle, ID",
        "Free estimates",
        "Apartments · Loading",
        "https://images.unsplash.com/photo-1600518464441-9154a4dea21b?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Caldwell Haul Away",
        "Caldwell, ID",
        "From $85",
        "Junk removal · Hauling",
        "https://images.unsplash.com/photo-1590496793929-36417d3117de?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Boise Office Relocation",
        "Boise, ID",
        "Call for quote",
        "Commercial · Moving",
        "https://images.unsplash.com/photo-1556761175-4b46a572b786?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Meridian Packing Help",
        "Meridian, ID",
        "From $45 / hour",
        "Packing · Unpacking",
        "https://images.unsplash.com/photo-1603796846097-7e42da9a3d2d?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Valley Donation Pickup",
        "Nampa, ID",
        "From $60",
        "Furniture · Donation runs",
        "https://images.unsplash.com/photo-1600518464441-9154a4dea21b?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  ),
  showcaseRow(
    "Pet care & family help",
    "Find local care",
    "/browse?category=services&serviceMode=results",
    [
      previewCard(
        "Boise Dog Walker",
        "Boise, ID",
        "From $25 / visit",
        "Dog walks · Drop-ins",
        "https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Treasure Valley Pet Sitting",
        "Meridian, ID",
        "From $45 / night",
        "In-home · Overnight",
        "https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Puppy Training Basics",
        "Nampa, ID",
        "From $85 / session",
        "Training · Behavior",
        "https://images.unsplash.com/photo-1587300003388-59208cc962cb?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Eagle Family Childcare",
        "Eagle, ID",
        "From $12 / hour",
        "Childcare · Weekdays",
        "https://images.unsplash.com/photo-1484820540004-14229fe36ca4?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Caldwell Senior Companion",
        "Caldwell, ID",
        "From $22 / hour",
        "Companionship · Errands",
        "https://images.unsplash.com/photo-1576765608866-5b51046452be?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Boise Pet Grooming Mobile",
        "Boise, ID",
        "From $75",
        "Grooming · At-home",
        "https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&w=900&q=80",
      ),
    ],
  ),
  showcaseRow(
    "Roofing & exterior work",
    "Find exterior pros",
    "/browse?category=services&serviceMode=results",
    [
      previewCard(
        "Gem State Roofing",
        "Boise, ID",
        "Free inspection",
        "Roof repair · Replacement",
        "https://images.unsplash.com/photo-1632759145351-1d592919f522?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Valley Gutter Pros",
        "Meridian, ID",
        "From $12 / foot",
        "Gutters · Downspouts",
        "https://images.unsplash.com/photo-1632759145351-1d592919f522?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Nampa Siding & Windows",
        "Nampa, ID",
        "Free estimates",
        "Siding · Windows",
        "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Boise Concrete & Masonry",
        "Boise, ID",
        "Call for quote",
        "Driveways · Patios",
        "https://images.unsplash.com/photo-1590644365607-1c5a0f3a2c4a?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Canyon County Paving",
        "Caldwell, ID",
        "From $4 / sqft",
        "Asphalt · Sealcoating",
        "https://images.unsplash.com/photo-1516939884455-1445c8652f83?auto=format&fit=crop&w=900&q=80",
      ),
      previewCard(
        "Eagle Deck Builders",
        "Eagle, ID",
        "Free estimates",
        "Decks · Pergolas",
        "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=900&q=80",
      ),
    ],
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
      aria-label="GemList all classifieds"
      className="relative isolate min-h-[430px] overflow-hidden rounded-[32px] bg-secondary px-5 py-14 shadow-xl sm:min-h-[500px] sm:px-10 sm:py-20"
    >
      <span className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-brand-warm/15" />
      <span className="absolute -bottom-36 left-1/3 h-80 w-80 rounded-full bg-primary/5" />
      <div className="absolute left-5 top-5 z-20 sm:left-7 sm:top-7">
        <SponsoredHeroBadge />
      </div>
      <div className="relative mx-auto max-w-[920px] text-center">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
          GemList Classifieds
        </p>
        <h1 className="mx-auto mt-3 max-w-[22ch] text-[36px] font-bold leading-[1.05] tracking-tight sm:text-[56px]">
          Discover <span className="text-primary">local gems.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-[54ch] text-[14px] leading-relaxed text-muted-foreground sm:text-[15px]">
          Browse local listings from people and businesses across Idaho and surrounding states.
        </p>

        <form
          className="mx-auto mt-8 flex max-w-[860px] flex-col gap-2 rounded-[24px] bg-card p-2 shadow-lg sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch();
          }}
        >
          <label className="flex min-w-0 flex-1 items-center gap-2 px-3">
            <MagnifyingGlass size={19} className="shrink-0 text-primary" aria-hidden="true" />
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
      listings: generalListings.slice(0, Math.ceil(generalListings.length / 2)),
    },
    {
      title: "Newest listings",
      listings: generalListings.slice(Math.ceil(generalListings.length / 2)),
    },
  ].filter((row) => row.listings.length > 0);

  return (
    <div className="mt-10 space-y-12 sm:mt-14 sm:space-y-16">
      <section aria-labelledby="top-general-categories">
        <div className="mb-4 flex items-end justify-between gap-3 border-b border-border pb-3">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
              GemList Classifieds
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
                GemList Classifieds
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
          <ul className="no-scrollbar flex gap-4 overflow-x-auto pb-2">
            {row.listings.map((listing) => (
              <li
                key={row.title + "-" + listing.id}
                className="min-w-[220px] flex-1 sm:min-w-[245px]"
              >
                <ListingCard listing={listing} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
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
          <ul className="no-scrollbar grid grid-flow-col auto-cols-[minmax(215px,1fr)] gap-4 overflow-x-auto pb-2 sm:auto-cols-[minmax(240px,1fr)] lg:grid-flow-row lg:grid-cols-6 lg:overflow-visible">
            {row.cards.map((card) => (
              <li key={`${row.title}-${card.title}`}>
                <HomepagePreviewCard
                  card={card}
                  eyebrow={eyebrow}
                  href={getHomepagePreviewCardHref(row.href, card)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function getHomepagePreviewCardHref(rowHref: string, card: HomepagePreviewCard) {
  const [pathname, rawSearch = ""] = rowHref.split("?", 2);
  const params = new URLSearchParams(rawSearch);
  params.set("q", card.title);
  return `${pathname}?${params.toString()}`;
}

function HomepagePreviewCard({
  card,
  eyebrow,
  href,
}: {
  card: HomepagePreviewCard;
  eyebrow: string;
  href: string;
}) {
  return (
    <a
      href={href}
      aria-label={`View listings for ${card.title}`}
      className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <article className="relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-shadow group-hover:shadow-lg">
        <div className="relative aspect-[4/3] overflow-hidden bg-secondary">
          <img
            src={card.image}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
          <span className="absolute left-3 top-3 rounded-md bg-primary/85 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-primary-foreground">
            {card.badge ?? eyebrow.replace("GemList ", "")}
          </span>
        </div>
        <div className="p-3.5">
          <p className="numeric text-[16px] font-bold text-primary">{card.price}</p>
          <h3 className="mt-1 line-clamp-2 min-h-[34px] text-[13px] font-bold leading-tight">
            {card.title}
          </h3>
          <p className="mt-1 truncate text-[11.5px] text-muted-foreground">{card.location}</p>
          <p className="mt-2 truncate text-[11px] text-muted-foreground">{card.detail}</p>
        </div>
      </article>
    </a>
  );
}

function SponsoredHeroBadge() {
  return (
    <Link
      to="/advertise"
      aria-label="Sponsored by GemList — learn about advertising with us"
      className="inline-flex items-center gap-2.5 rounded-full border border-accent/70 bg-primary/90 px-3.5 py-2 text-left text-primary-foreground shadow-lg backdrop-blur-md transition-transform hover:-translate-y-0.5"
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
        <Megaphone size={15} weight="fill" aria-hidden="true" />
      </span>
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
        Sponsored by GemList
      </span>
      <ArrowRight size={15} weight="bold" className="ml-1 text-accent" aria-hidden="true" />
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
      aria-label="GemList Homes"
      className="relative isolate min-h-[610px] overflow-hidden rounded-[32px] bg-primary bg-cover bg-center shadow-xl sm:min-h-[680px]"
      style={{
        backgroundImage:
          "linear-gradient(90deg, rgb(11 26 38 / 72%), rgb(11 26 38 / 38%) 52%, rgb(11 26 38 / 18%)), url(https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=2200&q=85)",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-primary/55 via-transparent to-primary/15" />
      <div className="absolute left-5 top-5 z-20 sm:left-7 sm:top-7">
        <SponsoredHeroBadge />
      </div>
      <div className="relative flex min-h-[610px] items-center justify-center px-4 py-12 sm:min-h-[680px] sm:px-8">
        <div className="w-full max-w-[650px] rounded-[28px] border border-white/20 bg-primary/80 p-5 text-primary-foreground shadow-2xl backdrop-blur-md sm:p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
            GemList Homes
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
                GemList Homes
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
          <ul className="no-scrollbar grid grid-flow-col auto-cols-[minmax(215px,1fr)] gap-4 overflow-x-auto pb-2 sm:auto-cols-[minmax(240px,1fr)] lg:grid-flow-row lg:grid-cols-6 lg:overflow-visible">
            {row.cards.map((card) => (
              <li key={`${row.title}-${card.name}`}>
                <HomePreviewCard card={card} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function HomePreviewCard({ card }: { card: (typeof homePreviewRows)[number]["cards"][number] }) {
  return (
    <article className="group overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-shadow hover:shadow-lg">
      <div className="relative aspect-[4/3] overflow-hidden bg-secondary">
        <img
          src={card.image}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
        <span className="absolute left-3 top-3 rounded-full bg-primary/85 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-primary-foreground backdrop-blur">
          GemList Homes
        </span>
      </div>
      <div className="p-3.5">
        <p className="numeric text-[16px] font-bold text-primary">{card.price}</p>
        <h3 className="mt-1 text-[13px] font-bold leading-tight">{card.name}</h3>
        <p className="mt-1 text-[11.5px] text-muted-foreground">{card.location}</p>
        <p className="mt-2 truncate text-[11px] text-muted-foreground">{card.facts}</p>
      </div>
    </article>
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
      aria-label="GemList Services"
      className="relative isolate min-h-[610px] overflow-hidden rounded-[32px] bg-primary bg-cover bg-center shadow-xl sm:min-h-[680px]"
      style={{
        backgroundImage:
          "linear-gradient(90deg, rgb(11 26 38 / 64%), rgb(11 26 38 / 30%) 58%, rgb(11 26 38 / 12%)), url(https://images.unsplash.com/photo-1556912167-f556f1f39fdf?auto=format&fit=crop&w=2200&q=85)",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-primary/60 via-transparent to-primary/10" />
      <div className="absolute left-5 top-5 z-20 sm:left-7 sm:top-7">
        <SponsoredHeroBadge />
      </div>
      <div className="relative flex min-h-[610px] items-center justify-center px-4 py-12 sm:min-h-[680px] sm:px-8">
        <div className="w-full max-w-[720px] rounded-[28px] border border-white/20 bg-primary/80 p-5 text-primary-foreground shadow-2xl backdrop-blur-md sm:p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
            GemList Services
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
              GemList Services
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
            GemList Services
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
  onApply,
  onSave,
  onPost,
}: {
  search: Search;
  listings: ClassifiedBrowseResult["listings"];
  onApply: (patch: Partial<Search>) => void;
  onSave: (patch?: Partial<Search>) => void;
  onPost: () => void;
}) {
  const [showAll, setShowAll] = useState(true);
  const [term, setTerm] = useState(search.q ?? "");
  const [subcategory, setSubcategory] = useState(search.serviceSubcategory ?? "");
  const [priceMin, setPriceMin] = useState(search.priceMin == null ? "" : String(search.priceMin));
  const [priceMax, setPriceMax] = useState(search.priceMax == null ? "" : String(search.priceMax));
  const [expandSearch, setExpandSearch] = useState(search.serviceExpandSearch === "true");
  const [photos, setPhotos] = useState(search.servicePhotos === "true");
  const [video, setVideo] = useState(search.serviceVideo === "true");
  const [sellerType, setSellerType] = useState(search.serviceSellerType ?? "");
  const [condition, setCondition] = useState(search.serviceCondition ?? "");
  const [timeOnSite, setTimeOnSite] = useState(search.serviceTimeOnSite ?? "");

  useEffect(() => {
    setTerm(search.q ?? "");
    setSubcategory(search.serviceSubcategory ?? "");
    setPriceMin(search.priceMin == null ? "" : String(search.priceMin));
    setPriceMax(search.priceMax == null ? "" : String(search.priceMax));
    setExpandSearch(search.serviceExpandSearch === "true");
    setPhotos(search.servicePhotos === "true");
    setVideo(search.serviceVideo === "true");
    setSellerType(search.serviceSellerType ?? "");
    setCondition(search.serviceCondition ?? "");
    setTimeOnSite(search.serviceTimeOnSite ?? "");
  }, [search]);

  function currentPatch(): Partial<Search> {
    const numberValue = (value: string) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
    };
    return {
      q: term.trim() || undefined,
      serviceSubcategory: subcategory || undefined,
      priceMin: numberValue(priceMin),
      priceMax: numberValue(priceMax),
      serviceExpandSearch: expandSearch ? "true" : undefined,
      servicePhotos: photos ? "true" : undefined,
      serviceVideo: video ? "true" : undefined,
      serviceSellerType: sellerType || undefined,
      serviceCondition: condition || undefined,
      serviceTimeOnSite: timeOnSite || undefined,
    };
  }

  function apply() {
    onApply(currentPatch());
  }

  // priceMin/priceMax already filter server-side via inputFromSearch; only
  // subcategory needs a client-side pass since it has no matching field on
  // ClassifiedBrowseInput.
  const filteredListings = listings.filter(
    (listing) => !subcategory || listing.service?.subcategory === subcategory,
  );
  const sortedListings = [...filteredListings].sort((a, b) => {
    if (search.sort === "price_high") return b.priceCents - a.priceCents;
    if (search.sort === "price_low") return a.priceCents - b.priceCents;
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
          <button
            type="button"
            onClick={() => setShowAll((current) => !current)}
            className="inline-flex items-center gap-2 rounded-full border border-primary px-4 py-2.5 text-[12px] font-bold text-primary hover:bg-secondary"
          >
            <FunnelSimple size={15} aria-hidden="true" />
            {showAll ? "Hide all filters" : "Show all filters"}
            <CaretDown size={14} className={showAll ? "rotate-180" : ""} aria-hidden="true" />
          </button>
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

      <div className="mt-7 grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        {showAll && (
          <aside className="space-y-3">
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
            <ServiceFilterGroup title="Photos/Video">
              <ServiceToggle
                label="Only show listings with photos"
                checked={photos}
                onChange={setPhotos}
              />
              <ServiceToggle
                label="Only show listings with a video"
                checked={video}
                onChange={setVideo}
              />
            </ServiceFilterGroup>
            <ServiceFilterGroup title="Seller Type">
              <div className="space-y-2">
                {["Private", "Business"].map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setSellerType(sellerType === option ? "" : option)}
                    className={`h-10 w-full rounded-lg border px-3 text-[12px] font-bold ${sellerType === option ? "border-primary bg-primary text-primary-foreground" : "border-primary text-primary hover:bg-secondary"}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
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
              Show {sortedListings.length.toLocaleString()} results
            </button>
          </aside>
        )}

        <section aria-label="Service listings">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <p className="text-[13px] text-muted-foreground">
              <strong className="numeric text-foreground">{sortedListings.length}</strong>{" "}
              {sortedListings.length === 1 ? "service" : "services"} in Idaho
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
                className="h-9 rounded-lg border border-input bg-card px-2 text-[12px] text-foreground"
              >
                <option value="newest">Newest to oldest</option>
                <option value="price_low">Lowest price</option>
                <option value="price_high">Highest price</option>
              </select>
            </label>
          </div>
          {sortedListings.length === 0 ? (
            <div className="soft-card mt-5 px-5 py-12 text-center">
              <p className="text-[14px] font-medium">No services match these filters.</p>
              <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">
                Try widening your subcategory, price range, or search terms.
              </p>
              <button
                type="button"
                onClick={() =>
                  onApply({
                    q: undefined,
                    serviceSubcategory: undefined,
                    priceMin: undefined,
                    priceMax: undefined,
                  })
                }
                className="mt-4 inline-flex h-9 items-center rounded-md border border-input px-3 text-[12px] font-semibold hover:bg-secondary"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
  onSearch: (term: string) => void;
  onMoreFilters: () => void;
  onPost: () => void;
}) {
  const [mode, setMode] = useState<"search" | "post">("search");
  const [draft, setDraft] = useState(search.q ?? "");

  useEffect(() => setDraft(search.q ?? ""), [search.q]);

  return (
    <section
      aria-label="GemList Jobs"
      className="relative isolate min-h-[590px] overflow-hidden rounded-[32px] bg-primary bg-cover bg-center shadow-xl sm:min-h-[670px]"
      style={{
        backgroundImage:
          "linear-gradient(90deg, rgb(11 26 38 / 78%), rgb(11 26 38 / 42%) 55%, rgb(11 26 38 / 18%)), url(https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=2200&q=85)",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-primary/60 via-transparent to-primary/10" />
      <div className="absolute left-5 top-5 z-20 sm:left-7 sm:top-7">
        <SponsoredHeroBadge />
      </div>
      <div className="relative flex min-h-[590px] items-center justify-center px-4 py-12 sm:min-h-[670px] sm:px-8">
        <div className="w-full max-w-[720px] rounded-[28px] border border-white/20 bg-primary/80 p-5 text-primary-foreground shadow-2xl backdrop-blur-md sm:p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
            GemList Jobs
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
                  onSearch(draft);
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
                <JobSelect label="Category" options={jobCategoryOptions} />
                <JobSelect label="Job type" options={jobTypeOptions} />
                <JobSelect label="Job pay range" options={jobPayTypeOptions} />
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-[12px]">
                <span className="text-white/70">
                  {resultCount.toLocaleString()} local jobs to explore
                </span>
                <button
                  type="button"
                  onClick={onMoreFilters}
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
  onApply,
  onSave,
  onPost,
}: {
  search: Search;
  listings: ClassifiedBrowseResult["listings"];
  onApply: (patch: Partial<Search>) => void;
  onSave: (patch?: Partial<Search>) => void;
  onPost: () => void;
}) {
  const [showAll, setShowAll] = useState(true);
  const [term, setTerm] = useState(search.q ?? "");
  const [category, setCategory] = useState(search.jobCategory ?? "");
  const [jobType, setJobType] = useState(search.jobType ?? "");
  const [payType, setPayType] = useState(search.jobPayType ?? "");
  const [payMin, setPayMin] = useState(search.jobPayMin == null ? "" : String(search.jobPayMin));
  const [payMax, setPayMax] = useState(search.jobPayMax == null ? "" : String(search.jobPayMax));
  const [experience, setExperience] = useState(search.jobExperience ?? "");
  const [posted, setPosted] = useState(search.jobPosted ?? "");
  const [education, setEducation] = useState(search.jobEducation ?? "");
  const [photos, setPhotos] = useState(search.jobPhotos === "true");
  const [video, setVideo] = useState(search.jobVideo === "true");
  const [timeOnSite, setTimeOnSite] = useState(search.jobTimeOnSite ?? "");

  useEffect(() => {
    setTerm(search.q ?? "");
    setCategory(search.jobCategory ?? "");
    setJobType(search.jobType ?? "");
    setPayType(search.jobPayType ?? "");
    setPayMin(search.jobPayMin == null ? "" : String(search.jobPayMin));
    setPayMax(search.jobPayMax == null ? "" : String(search.jobPayMax));
    setExperience(search.jobExperience ?? "");
    setPosted(search.jobPosted ?? "");
    setEducation(search.jobEducation ?? "");
    setPhotos(search.jobPhotos === "true");
    setVideo(search.jobVideo === "true");
    setTimeOnSite(search.jobTimeOnSite ?? "");
  }, [search]);

  function currentPatch(): Partial<Search> {
    const numberValue = (value: string) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
    };
    return {
      q: term.trim() || undefined,
      jobCategory: category || undefined,
      jobType: jobType || undefined,
      jobPayType: payType || undefined,
      jobPayMin: numberValue(payMin),
      jobPayMax: numberValue(payMax),
      jobExperience: experience || undefined,
      jobPosted: posted || undefined,
      jobEducation: education || undefined,
      jobPhotos: photos ? "true" : undefined,
      jobVideo: video ? "true" : undefined,
      jobTimeOnSite: timeOnSite || undefined,
    };
  }

  function apply() {
    onApply(currentPatch());
  }

  const filteredListings = listings
    .filter((listing) => !search.jobType || listing.job?.employmentType === search.jobType)
    .filter((listing) => !search.jobPayType || listing.job?.payType === search.jobPayType)
    .filter((listing) => search.jobPayMin == null || (listing.job?.payMax ?? 0) >= search.jobPayMin)
    .filter(
      (listing) => search.jobPayMax == null || (listing.job?.payMin ?? 0) <= search.jobPayMax,
    );
  const sortedListings = [...filteredListings].sort((a, b) => {
    if (search.sort === "price_high") return b.priceCents - a.priceCents;
    if (search.sort === "price_low") return a.priceCents - b.priceCents;
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
          <button
            type="button"
            onClick={() => setShowAll((current) => !current)}
            className="inline-flex items-center gap-2 rounded-full border border-primary px-4 py-2.5 text-[12px] font-bold text-primary hover:bg-secondary"
          >
            <FunnelSimple size={15} aria-hidden="true" />
            {showAll ? "Hide all filters" : "Show all filters"}
            <CaretDown size={14} className={showAll ? "rotate-180" : ""} aria-hidden="true" />
          </button>
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

      <div className="mt-7 grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        {showAll && (
          <aside className="space-y-3">
            <JobFilterGroup title="Category">
              <JobChecklist
                label="Category"
                value={category}
                options={jobCategoryOptions}
                onChange={setCategory}
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
            <JobFilterGroup title="Photos / video">
              <JobToggle
                label="Only show listings with photos"
                checked={photos}
                onChange={setPhotos}
              />
              <JobToggle
                label="Only show listings with a video"
                checked={video}
                onChange={setVideo}
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
          </aside>
        )}

        <section aria-label="Job listings">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <p className="text-[13px] text-muted-foreground">
              <strong className="numeric text-foreground">{sortedListings.length}</strong>{" "}
              {sortedListings.length === 1 ? "job" : "jobs"} in Idaho
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
                className="h-9 rounded-lg border border-input bg-card px-2 text-[12px] text-foreground"
              >
                <option value="newest">Newest to oldest</option>
                <option value="price_high">Highest pay</option>
                <option value="price_low">Lowest pay</option>
              </select>
            </label>
          </div>
          {sortedListings.length === 0 ? (
            <div className="soft-card mt-5 px-5 py-12 text-center">
              <p className="text-[14px] font-medium">No jobs match these filters.</p>
              <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">
                Try widening your job type, pay range, or search terms.
              </p>
              <button
                type="button"
                onClick={() =>
                  onApply({
                    q: undefined,
                    jobType: undefined,
                    jobPayType: undefined,
                    jobPayMin: undefined,
                    jobPayMax: undefined,
                  })
                }
                className="mt-4 inline-flex h-9 items-center rounded-md border border-input px-3 text-[12px] font-semibold hover:bg-secondary"
              >
                Clear filters
              </button>
            </div>
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
    onChange(next.join("|"));
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
  onTabChange,
  onApply,
  onSave,
}: {
  activeTab: HomeTab;
  search: Search;
  resultCount: number;
  onTabChange: (tab: HomeTab) => void;
  onApply: (patch: Partial<Search>) => void;
  onSave: (patch?: Partial<Search>) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [location, setLocation] = useState(search.homeLocation ?? search.q ?? "");
  const [propertyType, setPropertyType] = useState(search.propertyType ?? "");
  const [homePrice, setHomePrice] = useState(search.homePrice ?? "");
  const [bedrooms, setBedrooms] = useState(search.bedrooms ?? "");
  const [bathrooms, setBathrooms] = useState(search.bathrooms ?? "");
  const [extra, setExtra] = useState<Record<string, string>>({
    homeSquareFeet: search.homeSquareFeet ?? "",
    homeBuilder: search.homeBuilder ?? "",
    constructionType: search.constructionType ?? "",
    homeAcres: search.homeAcres ?? "",
    homeSellerType: search.homeSellerType ?? "",
    petsCats: search.petsCats ?? "",
    petsDogs: search.petsDogs ?? "",
    homeAmenities: search.homeAmenities ?? "",
    communityAmenities: search.communityAmenities ?? "",
    leaseLength: search.leaseLength ?? "",
  });

  useEffect(() => {
    setLocation(search.homeLocation ?? search.q ?? "");
    setPropertyType(search.propertyType ?? "");
    setHomePrice(search.homePrice ?? "");
    setBedrooms(search.bedrooms ?? "");
    setBathrooms(search.bathrooms ?? "");
  }, [
    search.homeLocation,
    search.q,
    search.homePrice,
    search.propertyType,
    search.bedrooms,
    search.bathrooms,
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
            key: "homeBuilder",
            label: "Home builder",
            options: ["Any builder", "Local builders", "National builders"],
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
              key: "constructionType",
              label: "Construction type",
              options: ["Any construction", "New construction", "Existing home"],
              multi: true,
            },
            { key: "homeAcres", label: "Acres", options: homeAcresOptions, multi: false },
            {
              key: "homeSellerType",
              label: "Seller type",
              options: ["Any seller", "Owner", "Agent", "Builder"],
              multi: true,
            },
          ]
        : [
            {
              key: "petsCats",
              label: "Cats",
              options: ["Any cat policy", "Cats allowed", "Cats not allowed"],
              multi: false,
            },
            {
              key: "petsDogs",
              label: "Dogs",
              options: ["Any dog policy", "Dogs allowed", "Dogs not allowed"],
              multi: false,
            },
            {
              key: "homeAmenities",
              label: "Home amenities",
              options: homeAmenitiesOptions,
              multi: true,
            },
            {
              key: "communityAmenities",
              label: "Community amenities",
              options: communityAmenitiesOptions,
              multi: true,
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
          ];

  function currentPatch(): Partial<Search> {
    return {
      q: location.trim() || undefined,
      homeLocation: location.trim() || undefined,
      propertyType: propertyType || undefined,
      homePrice: homePrice || undefined,
      bedrooms: bedrooms || undefined,
      bathrooms: bathrooms || undefined,
      ...Object.fromEntries(extraFields.map(({ key }) => [key, extra[key] || undefined])),
    };
  }

  function apply() {
    onApply(currentPatch());
  }

  return (
    <section className="floating-card relative mt-2 overflow-visible bg-surface px-4 py-5 sm:px-7 sm:py-7">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
            GemList Homes
          </p>
          <h1 className="mt-2 text-[28px] font-bold tracking-tight sm:text-[36px]">
            Find a gem to call home.
          </h1>
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
        className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.45fr_repeat(4,minmax(0,1fr))_auto]"
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
        <div className="grid grid-cols-2 gap-2 sm:contents">
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
          onClick={() => setShowAll((current) => !current)}
          aria-expanded={showAll}
          className="inline-flex items-center gap-2 rounded-full border border-primary px-4 py-2.5 text-[12px] font-bold text-primary hover:bg-secondary"
        >
          <FunnelSimple size={15} aria-hidden="true" />
          {showAll ? "Hide all filters" : "All filters"}
          <CaretDown size={14} className={showAll ? "rotate-180" : ""} aria-hidden="true" />
        </button>
      </div>

      {showAll && (
        <div className="mt-4 grid gap-2 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4">
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
      )}
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
    <label className="flex h-[88px] min-w-0 items-center gap-2 rounded-xl border border-input bg-card px-3 focus-within:border-primary">
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
        className="h-[88px] w-full appearance-none rounded-xl border border-input bg-card px-3 pr-8 text-[12px] text-foreground outline-none focus:border-primary"
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
        className="flex h-[88px] w-full items-center justify-between gap-3 rounded-xl border border-input bg-card px-3 text-left text-[12px] text-foreground outline-none focus:border-primary"
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
  const selected = value ? value.split("||").filter(Boolean) : [];
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
        className="flex h-[88px] w-full items-center justify-between gap-3 rounded-xl border border-input bg-card px-3 text-left text-[12px] text-foreground outline-none focus:border-primary"
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
  onApply,
  onSave,
  onSell,
}: {
  search: Search;
  result: ClassifiedBrowseResult;
  onApply: (patch: Partial<Search>) => void;
  onSave: (patch?: Partial<Search>) => void;
  onSell: () => void;
}) {
  const [showAll, setShowAll] = useState(true);
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
  const [sellerType, setSellerType] = useState(search.sellerType ?? "");
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
    setSellerType(search.sellerType ?? "");
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
    const numberValue = (value: string) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
    };
    return {
      q: term.trim() || undefined,
      make: make || undefined,
      model: model || undefined,
      yearMin: numberValue(yearMin),
      yearMax: numberValue(yearMax),
      priceMin: numberValue(priceMin),
      priceMax: numberValue(priceMax),
      mileageBands: mileageBands || undefined,
      bodyStyle: bodyStyle || undefined,
      sellerType: sellerType || undefined,
      condition: condition || undefined,
      fulfillment: fulfillment || undefined,
      drivetrain: drivetrain || undefined,
      transmission: transmission || undefined,
      fuelType: fuelType || undefined,
      exteriorColor: exteriorColor || undefined,
      titleStatus: titleStatus || undefined,
      region: region || undefined,
      state: state || undefined,
      city: city.trim() || undefined,
    };
  }

  function apply() {
    onApply(currentPatch());
  }

  return (
    <div className="mt-8">
      <section className="floating-card overflow-visible p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
              Gem State motors
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
            <button
              type="button"
              onClick={() => setShowAll((current) => !current)}
              className="inline-flex items-center gap-2 rounded-full border border-primary px-4 py-2.5 text-[12px] font-bold text-primary hover:bg-secondary"
            >
              <FunnelSimple size={15} aria-hidden="true" />
              {showAll ? "Hide all filters" : "Show all filters"}
              <CaretDown size={14} className={showAll ? "rotate-180" : ""} aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      <div className="mt-7 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        {showAll && (
          <aside className="space-y-3">
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
            <VehicleFilterGroup title="Seller type">
              <VehicleCheckboxList
                label="Seller type"
                value={sellerType}
                options={vehicleSellerTypeOptions}
                onChange={setSellerType}
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
              <select
                aria-label="Region"
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                className="filter-input w-full"
              >
                <option value="">All of Idaho</option>
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
                <option value="">All states</option>
                {usStates.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
              <VehicleTextField label="City" value={city} onChange={setCity} placeholder="City" />
            </VehicleFilterGroup>
            <button
              type="button"
              onClick={apply}
              className="h-11 w-full rounded-xl bg-primary text-[12px] font-bold text-primary-foreground hover:opacity-90"
            >
              Show {result.total.toLocaleString()} results
            </button>
          </aside>
        )}

        <section id="results" aria-label="Car listings">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <p className="text-[13px] text-muted-foreground">
              <strong className="numeric text-foreground">{result.total}</strong> cars and trucks
            </p>
            <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
              Sort by
              <select
                className="h-9 rounded-lg border border-input bg-card px-2 text-[12px] text-foreground"
                defaultValue="newest"
              >
                <option value="newest">Newest first</option>
                <option value="price_low">Lowest price</option>
                <option value="price_high">Highest price</option>
              </select>
            </label>
          </div>
          {result.listings.length === 0 ? (
            <div className="soft-card mt-5 px-5 py-12 text-center">
              <p className="text-[14px] font-medium">No cars match these filters.</p>
              <p className="mt-1.5 text-[13px] text-muted-foreground">
                Try widening your year, price, make, model, or location choices.
              </p>
            </div>
          ) : (
            <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3 xl:grid-cols-4">
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
    : (search.region ?? search.state ?? "All of Idaho");
  const yearLabel =
    search.yearMin != null || search.yearMax != null
      ? `${search.yearMin ?? "Any"}–${search.yearMax ?? "Any"}`
      : "Year";
  const priceLabel =
    search.priceMin != null || search.priceMax != null
      ? `$${search.priceMin ?? 0}–${search.priceMax ?? "up"}`
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
    { key: "sellerType", label: selectedSummary(search.sellerType, "Seller type") },
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
      case "sellerType":
        return (
          <InlineMultiFilter
            label="Seller type"
            value={search.sellerType}
            options={vehicleSellerTypeOptions}
            onApply={(value) => applyInlineFilter({ sellerType: value })}
          />
        );
    }
  }

  return (
    <section className="floating-card relative min-h-[500px] overflow-visible bg-surface px-5 py-12 sm:min-h-[590px] sm:px-8 sm:py-14">
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
              Gem State motors
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
    const parsed = Number(value);
    return value.trim() && Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
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
      <InlineApplyButton onClick={() => onApply(parse(first), parse(second))} />
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
          const parsed = Number(draft);
          onApply(draft.trim() && Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined);
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

  useEffect(() => {
    setRegion(search.region ?? "");
    setState(search.state ?? "");
    setCity(search.city ?? "");
  }, [search.region, search.state, search.city]);

  return (
    <div className="w-full space-y-2.5">
      <select
        value={region}
        onChange={(event) => setRegion(event.target.value)}
        className="filter-input w-full"
      >
        <option value="">All of Idaho</option>
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
        <option value="">All states</option>
        {usStates.map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
      <input
        value={city}
        onChange={(event) => setCity(event.target.value)}
        placeholder="City"
        className="filter-input w-full"
      />
      <InlineApplyButton
        onClick={() =>
          onApply({
            region: region || undefined,
            state: state || undefined,
            city: city.trim() || undefined,
          })
        }
      />
    </div>
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
      "sellerType",
    );
  if (pets)
    keys.push(
      "petSubcategory",
      "petSpecies",
      "petBreed",
      "petPlacementType",
      "petOfferedBy",
      "petSex",
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
  if (search.group === "motors" && !search.category) labels.push("Cars & motors");
  if (search.region) labels.push(search.region);
  if (search.state) labels.push(search.state);
  if (search.city) labels.push(search.city);
  if (search.postalCode) labels.push(search.postalCode);
  if (search.priceMin != null || search.priceMax != null)
    labels.push(`$${search.priceMin ?? 0}–${search.priceMax ?? "up"}`);
  if (motors) {
    if (search.make) labels.push(search.make);
    if (search.model) labels.push(search.model);
    if (search.yearMin != null || search.yearMax != null)
      labels.push(`${search.yearMin ?? "Any"}–${search.yearMax ?? "Any"}`);
    if (search.drivetrain) labels.push(search.drivetrain);
    if (search.mileageMax != null) labels.push(`≤ ${search.mileageMax.toLocaleString()} mi`);
  }
  if (pets) {
    if (search.petSubcategory)
      labels.push(
        petSubcategories.find(([slug]) => slug === search.petSubcategory)?.[1] ??
          search.petSubcategory,
      );
    if (search.petSpecies) labels.push(search.petSpecies);
    if (search.petBreed) labels.push(search.petBreed);
    if (search.petPlacementType)
      labels.push(
        petPlacementTypes.find(([value]) => value === search.petPlacementType)?.[1] ??
          search.petPlacementType,
      );
    if (search.petOfferedBy) labels.push(search.petOfferedBy);
    if (search.petSex) labels.push(search.petSex);
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
      className={`shrink-0 rounded-full border px-3 py-1.5 text-[11.5px] ${active ? "border-primary bg-accent font-semibold text-accent-foreground" : "border-input"}`}
    >
      {children}
    </Link>
  );
}
