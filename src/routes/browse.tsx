import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CaretDown,
  Check,
  FunnelSimple,
  MapPin,
  MagnifyingGlass,
  X,
} from "@phosphor-icons/react";

import { brand } from "@/config/brand";
import { classifiedCategories, idahoRegions, usStates, vehicleOptions } from "@/config/classifieds";
import { ListingCard, ListingRow } from "@/components/classifieds/ListingCard";
import { conditionLabels, isMotorsCategory } from "@/lib/classifieds-display";
import { browseClassifieds, type ClassifiedBrowseInput, type ClassifiedBrowseResult } from "@/lib/classifieds.functions";
import { trackEvent } from "@/lib/analytics";
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

type Search = {
  q?: string | undefined;
  category?: string | undefined;
  group?: "motors" | "classifieds" | undefined;
  state?: string | undefined;
  region?: string | undefined;
  city?: string | undefined;
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

const homePropertyTypes = ["Any property type", "Single family", "Townhome", "Condo", "Land", "Multi-family"];
const homeBedroomOptions = ["Any bedrooms", "Studio", "1+ bedrooms", "2+ bedrooms", "3+ bedrooms", "4+ bedrooms"];
const homeBathroomOptions = ["Any bathrooms", "1+ bathrooms", "2+ bathrooms", "3+ bathrooms", "4+ bathrooms"];
const homeSquareFeetOptions = ["Any", "<250", "250+", "500+", "1000+", "1500+", "2000+", "3000+", "4000+", "5000+", "10000+"];
const homeAcresOptions = ["Any", "< .10", ".10+", ".20+", ".25+", ".30+", ".5+", ".75+", "1+", "1.5+", "2+", "2.5+"];
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

const jobListingCount = 1780;
const serviceListingCount = 1568;
const mileageBandOptions = ["Under 25,000 miles", "Under 50,000 miles", "Under 75,000 miles", "Under 100,000 miles", "Under 150,000 miles"] as const;
const vehicleModelsByMake: Record<string, readonly string[]> = {
  Acura: ["Integra", "TLX", "MDX", "RDX"],
  Audi: ["A3", "A4", "Q5", "Q7"],
  BMW: ["3 Series", "5 Series", "X3", "X5"],
  Buick: ["Encore", "Enclave", "Envision"],
  Cadillac: ["CT4", "CT5", "XT4", "XT5", "Escalade"],
  Chevrolet: ["Equinox", "Malibu", "Silverado 1500", "Tahoe", "Traverse"],
  Chrysler: ["300", "Pacifica", "Voyager"],
  Dodge: ["Challenger", "Charger", "Durango", "Hornet"],
  Ford: ["Bronco", "Edge", "Escape", "Explorer", "F-150", "Maverick", "Mustang"],
  Genesis: ["G70", "G80", "GV70", "GV80"],
  GMC: ["Canyon", "Sierra 1500", "Terrain", "Acadia", "Yukon"],
  Honda: ["Accord", "Civic", "CR-V", "Pilot", "Ridgeline"],
  Hyundai: ["Elantra", "Santa Fe", "Sonata", "Tucson", "Palisade"],
  Infiniti: ["Q50", "QX50", "QX60"],
  Jeep: ["Cherokee", "Compass", "Grand Cherokee", "Gladiator", "Wrangler"],
  Kia: ["Forte", "K5", "Sorento", "Sportage", "Telluride"],
  "Land Rover": ["Defender", "Discovery", "Range Rover"],
  Lexus: ["ES", "IS", "NX", "RX", "GX"],
  Lincoln: ["Aviator", "Corsair", "Nautilus", "Navigator"],
  Mazda: ["Mazda3", "CX-5", "CX-30", "CX-50", "CX-90"],
  "Mercedes-Benz": ["C-Class", "E-Class", "GLC", "GLE", "Sprinter"],
  Mitsubishi: ["Eclipse Cross", "Outlander", "Outlander Sport"],
  Nissan: ["Altima", "Frontier", "Kicks", "Rogue", "Titan"],
  Porsche: ["911", "Cayenne", "Macan", "Taycan"],
  Ram: ["1500", "2500", "3500", "ProMaster"],
  Subaru: ["Ascent", "Crosstrek", "Forester", "Outback", "Impreza"],
  Tesla: ["Model 3", "Model S", "Model X", "Model Y"],
  Toyota: ["4Runner", "Camry", "Corolla", "RAV4", "Tacoma", "Tundra"],
  Volkswagen: ["Atlas", "Golf", "Jetta", "Tiguan"],
  Volvo: ["S60", "XC40", "XC60", "XC90"],
};
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
type JobPreviewCard = {
  title: string;
  employer: string;
  location: string;
  pay: string;
  image: string;
};

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
const jobTypeOptions = ["Any job type", "Contract", "Full-time", "Internships", "Part-time", "Seasonal", "Temporary", "Weekend only"] as const;
const jobPayTypeOptions = ["All pay types", "Hourly", "Salary"] as const;
const jobExperienceOptions = ["Any experience", "1–2 years", "3–4 years", "5–7 years", "8–10 years", "10+ years"] as const;
const jobPostedOptions = ["Any time", "Last hour", "Last 24 hours", "Last 7 days", "Last 30 days"] as const;
const jobEducationOptions = ["Any education", "2-year Degree", "4-year Degree", "Advanced Degree", "High School", "None"] as const;

const jobPreviewRows: { title: string; action: string; cards: JobPreviewCard[] }[] = [
  {
    title: "Newest listings",
    action: "Browse all jobs",
    cards: [
      { title: "Laborer needed", employer: "JB Landscaping & Construction", location: "Salt Lake City, UT", pay: "$18–$20/hr", image: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=900&q=80" },
      { title: "Development Director", employer: "Weber State University", location: "Ogden, UT", pay: "$75k–$145k/yr", image: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=900&q=80" },
      { title: "Sales Representative", employer: "Gem State Home Services", location: "Salt Lake City, UT", pay: "$18–$26/hr", image: "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=900&q=80" },
      { title: "Human Resources Coordinator", employer: "B&D Bush Excavation", location: "Bluffdale, UT", pay: "Salary", image: "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=900&q=80" },
    ],
  },
  {
    title: "Jobs near you",
    action: "Explore local work",
    cards: [
      { title: "Associate Attorney", employer: "International Law Group", location: "Eagle Mountain, UT", pay: "Salary", image: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=900&q=80" },
      { title: "Shipping Associate", employer: "Growing local team", location: "Salt Lake City, UT", pay: "$18–$21/hr", image: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=900&q=80" },
      { title: "Servers, Hosts & Bussers", employer: "Porcupine Pub & Grille", location: "Salt Lake City, UT", pay: "$13/hr", image: "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=900&q=80" },
      { title: "Utility Superintendent", employer: "Staker Parson", location: "Draper, UT", pay: "Salary", image: "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&w=900&q=80" },
    ],
  },
];

const homePreviewRows = [
  {
    title: "Featured homes for sale",
    action: "Browse homes for sale",
    cards: [
      { name: "Riverstone at Banbury", location: "Eagle, ID", price: "$524,900", facts: "3 bed · 2.5 bath · 2,146 sqft", image: "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=900&q=80" },
      { name: "North End Bungalow", location: "Boise, ID", price: "$649,000", facts: "4 bed · 2 bath · 1,988 sqft", image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80" },
      { name: "Sage Creek Townhomes", location: "Meridian, ID", price: "$419,900", facts: "3 bed · 2.5 bath · 1,742 sqft", image: "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=900&q=80" },
      { name: "Canyon Rim Estates", location: "Nampa, ID", price: "$489,900", facts: "3 bed · 2 bath · 1,876 sqft", image: "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=900&q=80" },
      { name: "Juniper Ridge", location: "Star, ID", price: "$719,000", facts: "4 bed · 3 bath · 2,492 sqft", image: "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=900&q=80" },
      { name: "The Owyhee Collection", location: "Kuna, ID", price: "$379,900", facts: "3 bed · 2 bath · 1,604 sqft", image: "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=900&q=80" },
    ],
  },
  {
    title: "New builds to explore",
    action: "Find new construction",
    cards: [
      { name: "Aspen Grove", location: "Meridian, ID", price: "From $499,900", facts: "2–5 bed · 1,550–2,800 sqft", image: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=900&q=80" },
      { name: "Cottonwood Crossing", location: "Star, ID", price: "From $559,900", facts: "3–4 bed · 2–3 bath", image: "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=900&q=80" },
      { name: "The Preserve", location: "Eagle, ID", price: "From $799,900", facts: "3–5 bed · 2,100+ sqft", image: "https://images.unsplash.com/photo-1600047508788-786f386c0f2d?auto=format&fit=crop&w=900&q=80" },
      { name: "Overland Park", location: "Boise, ID", price: "From $449,900", facts: "Townhomes · 2–3 bed", image: "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=900&q=80" },
      { name: "Hillside Terrace", location: "Nampa, ID", price: "Call for pricing", facts: "Single-family homes", image: "https://images.unsplash.com/photo-1600585152915-d208bec867a1?auto=format&fit=crop&w=900&q=80" },
      { name: "Harvest Point", location: "Caldwell, ID", price: "From $389,900", facts: "2–4 bed · 2 bath", image: "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=900&q=80" },
    ],
  },
  {
    title: "Rentals worth a look",
    action: "Browse rentals",
    cards: [
      { name: "The Franklin", location: "Boise, ID", price: "$1,895 / mo", facts: "2 bed · 2 bath · Downtown", image: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80" },
      { name: "Parkside Flats", location: "Meridian, ID", price: "$1,650 / mo", facts: "1 bed · 1 bath · Pet friendly", image: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=900&q=80" },
      { name: "Warm Springs House", location: "Boise, ID", price: "$2,750 / mo", facts: "3 bed · 2 bath · Fenced yard", image: "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=900&q=80" },
      { name: "The Village Lofts", location: "Meridian, ID", price: "$2,150 / mo", facts: "2 bed · 2 bath · Garage", image: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=900&q=80" },
      { name: "Canyon View Apartments", location: "Nampa, ID", price: "$1,425 / mo", facts: "1 bed · 1 bath · Pool", image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=80" },
      { name: "Maple Street Cottage", location: "Eagle, ID", price: "$2,400 / mo", facts: "3 bed · 2 bath · No HOA", image: "https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&w=900&q=80" },
    ],
  },
] as const;

type ServiceCategory = { name: string; count: number; image: string };

const serviceCategoryRows: { title: string; categories: ServiceCategory[] }[] = [
  {
    title: "Popular services",
    categories: [
      { name: "Drywall", count: 49, image: "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=700&q=80" },
      { name: "Electricians", count: 48, image: "https://images.unsplash.com/photo-1621905251918-48416bd8575a?auto=format&fit=crop&w=700&q=80" },
      { name: "Handyman", count: 75, image: "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=700&q=80" },
      { name: "Heating & Air Conditioning", count: 66, image: "https://images.unsplash.com/photo-1631545806609-ccf5d6f5c2ab?auto=format&fit=crop&w=700&q=80" },
      { name: "Movers", count: 19, image: "https://images.unsplash.com/photo-1600518464441-9154a4dea21b?auto=format&fit=crop&w=700&q=80" },
      { name: "Painters", count: 55, image: "https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=700&q=80" },
    ],
  },
  {
    title: "Seasonal categories",
    categories: [
      { name: "Lawn Care & Maintenance", count: 38, image: "https://images.unsplash.com/photo-1599685315640-3f3c8e3d9b4b?auto=format&fit=crop&w=700&q=80" },
      { name: "Landscape Contractors", count: 100, image: "https://images.unsplash.com/photo-1558904541-efa843a96f01?auto=format&fit=crop&w=700&q=80" },
      { name: "House Cleaning", count: 54, image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=700&q=80" },
      { name: "Cabinet & Countertops", count: 18, image: "https://images.unsplash.com/photo-1556912167-f556f1f39fdf?auto=format&fit=crop&w=700&q=80" },
      { name: "Carpet & Flooring Installation", count: 39, image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=700&q=80" },
      { name: "Automotive", count: 54, image: "https://images.unsplash.com/photo-1486006920555-c77dcf18193c?auto=format&fit=crop&w=700&q=80" },
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

const serviceSubcategoryOptions = ["Any subcategory", ...allServiceCategories.map((category) => category.name)] as const;
const serviceConditionOptions = ["Any condition", "New", "Used", "Like new"] as const;
const serviceTimeOnSiteOptions = ["Any time", "Last hour", "Last 24 hours", "Last 7 days", "Last 30 days"] as const;

type ServicePreviewCard = {
  title: string;
  location: string;
  age: string;
  price: string;
  image: string;
};

const servicePreviewRows: ServicePreviewCard[] = [
  { title: "Hardwood | LVP | Laminate flooring", location: "South Jordan, UT", age: "", price: "Call for quote", image: "https://images.unsplash.com/photo-1560185008-b033106af5c3?auto=format&fit=crop&w=900&q=80" },
  { title: "General Contractor | New Home Construction | Home Additions", location: "Salt Lake City, UT", age: "", price: "Call for quote", image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80" },
  { title: "Fence Installation & Repair | Vinyl Fence | Wood Fence", location: "Salt Lake City, UT", age: "", price: "Call for quote", image: "https://images.unsplash.com/photo-1558904541-efa843a96f01?auto=format&fit=crop&w=900&q=80" },
  { title: "All Pro Handyman | Home Repairs | Remodels | Drywall", location: "West Jordan, UT", age: "", price: "Call for quote", image: "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=900&q=80" },
  { title: "NT llc", location: "Salt Lake City, UT", age: "1 Hour", price: "Call for quote", image: "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=900&q=80" },
  { title: "Medico Excavation & Landscape", location: "Collinston, UT", age: "1 Hour", price: "Call for quote", image: "https://images.unsplash.com/photo-1558904541-efa843a96f01?auto=format&fit=crop&w=900&q=80" },
  { title: "Slate Canyon Landscaping", location: "Springville, UT", age: "1 Hour", price: "Call for quote", image: "https://images.unsplash.com/photo-1599685315640-3f3c8e3d9b4b?auto=format&fit=crop&w=900&q=80" },
  { title: "C Buxton Exteriors LLC", location: "Salt Lake City, UT", age: "1 Hour", price: "Call for quote", image: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=900&q=80" },
];

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
    group: search.group,
    state: search.state,
    region: search.region,
    city: search.city,
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
    const page = Number(search["page"]);
    return {
      q: stringParam(search, "q"),
      category: stringParam(search, "category", 60),
      group: group === "motors" || group === "classifieds" ? group : undefined,
      state: stringParam(search, "state", 2)?.toUpperCase(),
      region: stringParam(search, "region"),
      city: stringParam(search, "city"),
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
      homeTab: homeTab === "build" || homeTab === "rent" ? homeTab : homeTab === "buy" ? "buy" : undefined,
      jobMode: jobMode === "results" ? "results" : jobMode === "landing" ? "landing" : undefined,
      serviceMode: serviceMode === "results" ? "results" : serviceMode === "landing" ? "landing" : undefined,
      vehicleMode: vehicleMode === "results" ? "results" : vehicleMode === "landing" ? "landing" : undefined,
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
  const motors = search.group === "motors" || isMotorsCategory(search.category);
  const homes = search.category === "other-real-estate";
  const jobs = search.category === "jobs";
  const services = search.category === "services";
  const vehicleLanding = motors && search.vehicleMode !== "results";
  const showGenericBrowse = !motors || vehicleLanding;
  const homeTab: HomeTab = search.homeTab ?? "buy";
  const homeLanding = homes && search.homeMode !== "results";
  const jobLanding = jobs && search.jobMode !== "results";
  const serviceLanding = services && search.serviceMode !== "results";
  const page = search.page ?? 1;
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const activeFilterCount = countActiveFilters(search, motors);
  const heading =
    selectedCategory?.name ??
    (search.group === "motors" ? "Cars & motors" : "All classifieds");

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
      }),
    });
    setFiltersOpen(false);
  }

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-10 sm:px-8">
      {motors && vehicleLanding && (
        <VehicleBrowseHero
          search={search}
          resultCount={result.total}
          activeFilterCount={activeFilterCount}
          term={term}
          onTermChange={setTerm}
          onSearch={() => void navigate({ to: "/browse", search: scoped({ q: term.trim() || undefined, vehicleMode: "results" }) })}
          onFilterChange={(patch) => void navigate({ to: "/browse", search: scoped(patch) })}
          onSell={() => void navigate({ to: "/create-listing" })}
        />
      )}

      {motors && !vehicleLanding && (
        <VehicleResultsPage
          search={search}
          result={result}
          onApply={(patch) => void navigate({ to: "/browse", search: scoped({ vehicleMode: "results", ...patch }) })}
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
              search: scoped({ category: "other-real-estate", homeTab, homeMode: "results", ...patch }),
            })
          }
        />
      )}

      {homeLanding && <HomeShowcaseRows />}

      {jobs && jobLanding && (
        <JobsLandingHero
          search={search}
          onSearch={(term) =>
            void navigate({
              to: "/browse",
              search: scoped({ category: "jobs", jobMode: "results", q: term.trim() || undefined }),
            })
          }
          onMoreFilters={() =>
            void navigate({ to: "/browse", search: scoped({ category: "jobs", jobMode: "results" }) })
          }
          onPost={() => void navigate({ to: "/create-listing" })}
        />
      )}

      {jobs && !jobLanding && (
        <JobsFilterPage
          search={search}
          onApply={(patch) =>
            void navigate({ to: "/browse", search: scoped({ category: "jobs", jobMode: "results", ...patch }) })
          }
          onPost={() => void navigate({ to: "/create-listing" })}
        />
      )}

      {services && serviceLanding && (
        <ServicesLandingHero
          resultCount={serviceListingCount}
          onSearch={(subcategory) =>
            void navigate({
              to: "/browse",
              search: scoped({ category: "services", serviceMode: "results", q: undefined, serviceSubcategory: subcategory || undefined }),
            })
          }
          onPost={() => void navigate({ to: "/create-listing" })}
        />
      )}

      {services && !serviceLanding && (
        <ServicesFilterPage
          search={search}
          onApply={(patch) =>
            void navigate({
              to: "/browse",
              search: scoped({ category: "services", serviceMode: "results", ...patch }),
            })
          }
          onPost={() => void navigate({ to: "/create-listing" })}
        />
      )}

      {services && serviceLanding && (
        <ServicesCategoryShowcase
          onCategorySelect={(category) =>
            void navigate({
              to: "/browse",
              search: scoped({ category: "services", serviceMode: "results", q: undefined, serviceSubcategory: category }),
            })
          }
        />
      )}

      <div className={`flex flex-wrap items-end justify-between gap-3 ${motors || homes || jobs || services ? "mt-7" : ""} ${homes || jobs || services || serviceLanding || !showGenericBrowse ? "hidden" : ""}`}>
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

      {!motors && !homes && !jobs && !services && (
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

      {!motors && !homes && !jobs && !services && <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto pb-1">
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
      </div>}

      {!jobs && !services && showGenericBrowse && <div className={`${motors || homes ? "mt-6" : "mt-8"} ${homeLanding ? "hidden" : ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={motors || homes ? "hidden" : "text-[13px] text-muted-foreground"}>
            <span className="numeric font-semibold text-foreground">{result.total}</span>{" "}
            {result.total === 1 ? "listing" : "listings"}
          </p>
          {!motors && !homes && <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
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
                <SheetTitle className="text-[22px] tracking-tight">Filter listings</SheetTitle>
                <SheetDescription>
                  Narrow down local items, or add every vehicle detail that matters.
                </SheetDescription>
              </SheetHeader>
              <form onSubmit={applyFilters} className="space-y-6 px-6 py-6">
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

            <FilterSection title="Location" icon={<MapPin size={13} className="text-primary" />}>
              <select name="region" defaultValue={search.region ?? ""} className="filter-input">
                <option value="">All of Idaho</option>
                {idahoRegions.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
              <select name="state" defaultValue={search.state ?? ""} className="filter-input">
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

                <button
                  type="submit"
                  className="mt-2 inline-flex h-12 w-full items-center justify-center rounded-full bg-primary px-3 text-[13px] font-semibold text-primary-foreground shadow-sm hover:opacity-90"
                >
                  Show {result.total} {result.total === 1 ? "listing" : "listings"}
                </button>
              </form>
            </SheetContent>
          </Sheet>}
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
                {activeFilterLabels(search, motors).map((label) => (
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
                {homes
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
      </div>}
    </main>
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
      <div className="relative flex min-h-[610px] items-center justify-center px-4 py-12 sm:min-h-[680px] sm:px-8">
        <div className="w-full max-w-[650px] rounded-[28px] border border-white/20 bg-primary/80 p-5 text-primary-foreground shadow-2xl backdrop-blur-md sm:p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">GemList Homes</p>
          <h1 className="mt-3 text-center font-display text-[34px] font-bold leading-[1.05] tracking-tight sm:text-[52px]">
            Build. Buy. Rent.
            <span className="block text-accent">All in one place.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-[43ch] text-center text-[14px] leading-relaxed text-white/80 sm:text-[15px]">
            Find your next home, discover new communities, and explore rentals from local Idaho sellers and property managers.
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
              <MapPin size={19} weight="duotone" className="shrink-0 text-primary" aria-hidden="true" />
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
            <span className="text-white/70">{resultCount.toLocaleString()} local listings to explore</span>
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

function HomeShowcaseRows() {
  return (
    <div className="mt-10 space-y-12 sm:mt-14 sm:space-y-16">
      {homePreviewRows.map((row) => (
        <section key={row.title} aria-labelledby={row.title.replaceAll(" ", "-").toLowerCase()}>
          <div className="mb-4 flex items-end justify-between gap-3 border-b border-border pb-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">GemList Homes</p>
              <h2 id={row.title.replaceAll(" ", "-").toLowerCase()} className="mt-1 text-[22px] font-bold tracking-tight sm:text-[27px]">
                {row.title}
              </h2>
            </div>
            <Link
              to="/browse"
              search={{ category: "other-real-estate", homeMode: "results", homeTab: row.title.includes("Rent") ? "rent" : row.title.includes("build") ? "build" : "buy" }}
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

function HomePreviewCard({
  card,
}: {
  card: (typeof homePreviewRows)[number]["cards"][number];
}) {
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
      <div className="relative flex min-h-[610px] items-center justify-center px-4 py-12 sm:min-h-[680px] sm:px-8">
        <div className="w-full max-w-[720px] rounded-[28px] border border-white/20 bg-primary/80 p-5 text-primary-foreground shadow-2xl backdrop-blur-md sm:p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">GemList Services</p>
          <h1 className="mt-3 text-center font-display text-[34px] font-bold leading-[1.05] tracking-tight sm:text-[54px]">
            Find qualified <span className="text-accent">local pros.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-[46ch] text-center text-[14px] leading-relaxed text-white/80 sm:text-[15px]">
            Connect with trusted service providers across Idaho and surrounding states — or share what you do with local customers.
          </p>

          <div className="mt-7 grid grid-cols-2 rounded-2xl bg-white/10 p-1.5 ring-1 ring-white/20">
            <button type="button" aria-pressed={mode === "search"} onClick={() => setMode("search")} className={`rounded-xl px-2 py-3 text-[13px] font-bold transition-colors sm:text-[15px] ${mode === "search" ? "bg-accent text-accent-foreground shadow-sm" : "text-white/85 hover:bg-white/10"}`}>Search Listings</button>
            <button type="button" aria-pressed={mode === "post"} onClick={() => setMode("post")} className={`rounded-xl px-2 py-3 text-[13px] font-bold transition-colors sm:text-[15px] ${mode === "post" ? "bg-accent text-accent-foreground shadow-sm" : "text-white/85 hover:bg-white/10"}`}>Post a Listing</button>
          </div>

          {mode === "search" ? (
            <form className="mt-3" onSubmit={(event) => { event.preventDefault(); onSearch(subcategory.trim()); }}>
              <ServiceCategoryPicker value={subcategory} onChange={setSubcategory} />
              <button type="submit" className="mx-auto mt-4 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-[13px] font-bold text-accent-foreground shadow-sm transition-transform hover:-translate-y-0.5"><MagnifyingGlass size={17} aria-hidden="true" />Show {resultCount.toLocaleString()} results</button>
            </form>
          ) : (
            <div className="mt-3 rounded-2xl bg-card p-6 text-center text-foreground sm:p-8">
              <p className="text-[18px] font-bold">Have a service to offer?</p>
              <p className="mx-auto mt-2 max-w-[40ch] text-[13px] leading-relaxed text-muted-foreground">Reach local customers and show them what makes your work worth choosing.</p>
              <button type="button" onClick={onPost} className="mt-5 inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 text-[13px] font-bold text-primary-foreground hover:opacity-90">Post a Service Listing</button>
            </div>
          )}

          {mode === "search" && <div className="mt-5 text-center text-[12px] text-white/70">{resultCount.toLocaleString()} local services to explore</div>}
        </div>
      </div>
    </section>
  );
}

function ServiceCategoryPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const options = allServiceCategories.filter((category) =>
    !value.trim() || category.name.toLowerCase().includes(value.trim().toLowerCase()),
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
          onChange={(event) => { onChange(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="What service are you looking for?"
          aria-label="What service are you looking for?"
          aria-expanded={open}
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
        />
        <CaretDown size={16} className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </label>
      {open && (
        <div role="listbox" aria-label="Service categories" className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-b-xl border border-border bg-card shadow-xl">
          {options.length > 0 ? options.map((category) => (
            <button
              key={category.name}
              type="button"
              role="option"
              aria-selected={value === category.name}
              onClick={() => { onChange(category.name); setOpen(false); }}
              className="flex w-full items-center justify-between border-b border-border/70 px-3 py-2.5 text-left text-[13px] last:border-b-0 hover:bg-secondary"
            >
              <span>{category.name}</span>
              <span className="numeric text-[11px] text-muted-foreground">{category.count}</span>
            </button>
          )) : <p className="px-3 py-3 text-[12px] text-muted-foreground">No service categories found.</p>}
        </div>
      )}
    </div>
  );
}

function ServicesCategoryShowcase({ onCategorySelect }: { onCategorySelect: (category: string) => void }) {
  return (
    <div className="mt-10 space-y-12 sm:mt-14 sm:space-y-16">
      {serviceCategoryRows.map((row) => (
        <section key={row.title} aria-labelledby={row.title.replaceAll(" ", "-").toLowerCase()}>
          <div className="mb-4 border-b border-border pb-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">GemList Services</p>
            <h2 id={row.title.replaceAll(" ", "-").toLowerCase()} className="mt-1 text-[22px] font-bold tracking-tight sm:text-[27px]">{row.title}</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {row.categories.map((category) => (
              <button key={category.name} type="button" onClick={() => onCategorySelect(category.name)} className="group text-left">
                <div className="aspect-[1.65/1] overflow-hidden rounded-2xl border border-border/70 bg-secondary shadow-sm">
                  <img src={category.image} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                </div>
                <p className="mt-2 text-center text-[13px] font-semibold leading-tight group-hover:text-primary">{category.name}</p>
              </button>
            ))}
          </div>
        </section>
      ))}

      <section aria-labelledby="browse-all-service-categories">
        <div className="mb-4 border-b border-border pb-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">GemList Services</p>
          <h2 id="browse-all-service-categories" className="mt-1 text-[22px] font-bold tracking-tight sm:text-[27px]">Browse all categories</h2>
        </div>
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
          {allServiceCategories.map((category) => (
            <button key={category.name} type="button" onClick={() => onCategorySelect(category.name)} className="flex items-center justify-between border-b border-border/60 py-2 text-left text-[13px] transition-colors hover:text-primary">
              <span>{category.name}</span><span className="numeric text-muted-foreground">({category.count})</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ServicesFilterPage({
  search,
  onApply,
  onPost,
}: {
  search: Search;
  onApply: (patch: Partial<Search>) => void;
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

  function apply() {
    const numberValue = (value: string) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
    };
    onApply({
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
    });
  }

  return (
    <div className="mt-8">
      <section className="floating-card overflow-visible p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="grid w-full max-w-[390px] grid-cols-2 rounded-2xl bg-secondary p-1.5 ring-1 ring-border/70">
            <button type="button" aria-pressed="true" className="rounded-xl bg-primary px-3 py-3 text-[13px] font-bold text-primary-foreground shadow-sm">Search Listings</button>
            <button type="button" onClick={onPost} className="rounded-xl px-3 py-3 text-[13px] font-bold hover:bg-card">Post a Listing</button>
          </div>
          <button type="button" onClick={() => setShowAll((current) => !current)} className="inline-flex items-center gap-2 rounded-full border border-primary px-4 py-2.5 text-[12px] font-bold text-primary hover:bg-secondary"><FunnelSimple size={15} aria-hidden="true" />{showAll ? "Hide all filters" : "Show all filters"}<CaretDown size={14} className={showAll ? "rotate-180" : ""} aria-hidden="true" /></button>
        </div>
        <form className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.65fr_minmax(0,1fr)_auto]" onSubmit={(event) => { event.preventDefault(); apply(); }}>
          <label className="flex h-12 min-w-0 items-center gap-2 rounded-xl border border-input bg-card px-3 focus-within:border-primary"><MagnifyingGlass size={16} className="shrink-0 text-primary" aria-hidden="true" /><span className="sr-only">Search services</span><input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Search for a service, company, or description" className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground" /></label>
          <ServiceOptionSelect label="Subcategory" value={subcategory} options={serviceSubcategoryOptions} onChange={setSubcategory} />
          <button type="submit" className="h-12 rounded-xl bg-primary px-5 text-[12px] font-bold text-primary-foreground hover:opacity-90">Search</button>
        </form>
      </section>

      <div className="mt-7 grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        {showAll && (
          <aside className="space-y-3">
            <ServiceFilterGroup title="Category">
              <ServiceOptionSelect label="Category" value="Services" options={["Any category", "Services"]} onChange={() => undefined} />
              <ServiceOptionSelect label="Subcategory" value={subcategory} options={serviceSubcategoryOptions} onChange={setSubcategory} />
            </ServiceFilterGroup>
            <ServiceFilterGroup title="Price">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"><input inputMode="numeric" value={priceMin} onChange={(event) => setPriceMin(event.target.value)} placeholder="$0" className="filter-input" /><span className="text-muted-foreground">–</span><input inputMode="numeric" value={priceMax} onChange={(event) => setPriceMax(event.target.value)} placeholder="$200,000+" className="filter-input" /></div>
            </ServiceFilterGroup>
            <ServiceFilterGroup title="Expand Your Search">
              <ServiceToggle label="Include listing descriptions in keyword searches" checked={expandSearch} onChange={setExpandSearch} />
            </ServiceFilterGroup>
            <ServiceFilterGroup title="Photos/Video">
              <ServiceToggle label="Only show listings with photos" checked={photos} onChange={setPhotos} />
              <ServiceToggle label="Only show listings with a video" checked={video} onChange={setVideo} />
            </ServiceFilterGroup>
            <ServiceFilterGroup title="Seller Type">
              <div className="space-y-2">{["Private", "Business"].map((option) => <button key={option} type="button" onClick={() => setSellerType(sellerType === option ? "" : option)} className={`h-10 w-full rounded-lg border px-3 text-[12px] font-bold ${sellerType === option ? "border-primary bg-primary text-primary-foreground" : "border-primary text-primary hover:bg-secondary"}`}>{option}</button>)}</div>
            </ServiceFilterGroup>
            <ServiceFilterGroup title="Condition" initiallyOpen={false}>
              <ServiceOptionSelect label="Condition" value={condition} options={serviceConditionOptions} onChange={setCondition} />
            </ServiceFilterGroup>
            <ServiceFilterGroup title="Time On Site" initiallyOpen={false}>
              <div className="space-y-2">{serviceTimeOnSiteOptions.slice(1).map((option) => <button key={option} type="button" onClick={() => setTimeOnSite(timeOnSite === option ? "" : option)} className={`h-10 w-full rounded-lg border px-3 text-[12px] font-bold ${timeOnSite === option ? "border-primary bg-primary text-primary-foreground" : "border-primary text-primary hover:bg-secondary"}`}>{option.replace("Last ", "Last ")}</button>)}</div>
            </ServiceFilterGroup>
            <button type="button" onClick={apply} className="h-11 w-full rounded-xl bg-primary text-[12px] font-bold text-primary-foreground hover:opacity-90">Show {serviceListingCount.toLocaleString()} results</button>
          </aside>
        )}

        <section aria-label="Service listings">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4"><p className="text-[13px] text-muted-foreground"><strong className="numeric text-foreground">{serviceListingCount.toLocaleString()}</strong> services in Idaho, Utah, and Wyoming</p><label className="flex items-center gap-2 text-[12px] text-muted-foreground">Sort by<select className="h-9 rounded-lg border border-input bg-card px-2 text-[12px] text-foreground" defaultValue="newest"><option value="newest">Newest to oldest</option><option value="price_low">Lowest price</option><option value="price_high">Highest price</option></select></label></div>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{servicePreviewRows.map((card, index) => <ServiceCard key={card.title} card={card} favorites={index % 4 === 0 ? 7 : index + 1} />)}</div>
        </section>
      </div>
    </div>
  );
}

function ServiceOptionSelect({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return <label className="relative block"><span className="sr-only">{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="h-12 w-full appearance-none rounded-xl border border-input bg-card px-3 pr-8 text-[12px] text-foreground outline-none focus:border-primary">{options.map((option, index) => <option key={option} value={index === 0 ? "" : option}>{option}</option>)}</select><CaretDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /></label>;
}

function ServiceFilterGroup({ title, children, initiallyOpen = true }: { title: string; children: React.ReactNode; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return <section className="overflow-visible rounded-2xl border border-border bg-card shadow-sm"><button type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="flex w-full items-center justify-between px-3.5 py-3 text-left text-[13px] font-bold"><span>{title}</span><CaretDown size={15} className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" /></button>{open && <div className="space-y-2 border-t border-border px-3.5 pb-3.5 pt-3">{children}</div>}</section>;
}

function ServiceToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex items-center justify-between gap-3 text-[12px] leading-tight"><span>{label}</span><button type="button" aria-label={label} aria-pressed={checked} onClick={() => onChange(!checked)} className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted"}`}><span className={`absolute top-1.5 size-5 rounded-full bg-card shadow-sm transition-transform ${checked ? "translate-x-7" : "translate-x-1.5"}`} /></button></label>;
}

function ServiceCard({ card, favorites }: { card: ServicePreviewCard; favorites: number }) {
  return <article className="group overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-shadow hover:shadow-lg"><div className="relative aspect-[4/3] overflow-hidden bg-secondary"><img src={card.image} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" /><span className="absolute left-3 top-3 rounded-md bg-primary/85 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-primary-foreground">Service</span></div><div className="p-4"><h3 className="min-h-[36px] text-[15px] font-bold leading-tight">{card.title}</h3><p className="mt-2 flex items-center gap-1 text-[11.5px] text-primary"><MapPin size={12} aria-hidden="true" />{card.location}{card.age ? <><span className="text-muted-foreground">|</span><span className="text-foreground">{card.age}</span></> : null}</p><div className="mt-5 flex items-end justify-between gap-2"><p className="text-[18px] font-bold text-primary">{card.price}</p><span className="text-[12px] text-muted-foreground">♡ {favorites}</span></div></div></article>;
}

function JobsLandingHero({
  search,
  onSearch,
  onMoreFilters,
  onPost,
}: {
  search: Search;
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
      <div className="relative flex min-h-[590px] items-center justify-center px-4 py-12 sm:min-h-[670px] sm:px-8">
        <div className="w-full max-w-[720px] rounded-[28px] border border-white/20 bg-primary/80 p-5 text-primary-foreground shadow-2xl backdrop-blur-md sm:p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">GemList Jobs</p>
          <h1 className="mt-3 text-center font-display text-[34px] font-bold leading-[1.05] tracking-tight sm:text-[54px]">
            Find <span className="text-accent">local</span> work that fits your life.
          </h1>
          <p className="mx-auto mt-4 max-w-[46ch] text-center text-[14px] leading-relaxed text-white/80 sm:text-[15px]">
            Search jobs from local employers across Idaho and surrounding states — or post your next opportunity.
          </p>

          <div className="mt-7 grid grid-cols-2 rounded-2xl bg-white/10 p-1.5 ring-1 ring-white/20">
            <button type="button" aria-pressed={mode === "search"} onClick={() => setMode("search")} className={`rounded-xl px-2 py-3 text-[13px] font-bold transition-colors sm:text-[15px] ${mode === "search" ? "bg-accent text-accent-foreground shadow-sm" : "text-white/85 hover:bg-white/10"}`}>Search Jobs</button>
            <button type="button" aria-pressed={mode === "post"} onClick={() => setMode("post")} className={`rounded-xl px-2 py-3 text-[13px] font-bold transition-colors sm:text-[15px] ${mode === "post" ? "bg-accent text-accent-foreground shadow-sm" : "text-white/85 hover:bg-white/10"}`}>Post a Job</button>
          </div>

          {mode === "search" ? (
            <>
              <form className="mt-3 flex flex-col gap-2 rounded-2xl bg-card p-2 text-foreground" onSubmit={(event) => { event.preventDefault(); onSearch(draft); }}>
                <label className="flex min-w-0 items-center gap-2 px-3">
                  <MagnifyingGlass size={19} className="shrink-0 text-primary" aria-hidden="true" />
                  <span className="sr-only">Search jobs</span>
                  <input type="search" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="What job are you looking for?" aria-label="Search jobs" className="h-12 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground" />
                  <button type="submit" className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-[13px] font-bold text-primary-foreground hover:opacity-90">Search</button>
                </label>
              </form>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <JobSelect label="Category" options={jobCategoryOptions} />
                <JobSelect label="Job type" options={jobTypeOptions} />
                <JobSelect label="Job pay range" options={jobPayTypeOptions} />
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-[12px]">
                <span className="text-white/70">{jobListingCount.toLocaleString()} local jobs to explore</span>
                <button type="button" onClick={onMoreFilters} className="inline-flex items-center gap-1.5 rounded-full border border-accent/70 px-4 py-2 font-bold text-accent transition-colors hover:bg-accent hover:text-accent-foreground">More filters <ArrowRight size={14} aria-hidden="true" /></button>
              </div>
            </>
          ) : (
            <div className="mt-3 rounded-2xl bg-card p-6 text-center text-foreground sm:p-8">
              <p className="text-[18px] font-bold">Have a great opportunity?</p>
              <p className="mx-auto mt-2 max-w-[40ch] text-[13px] leading-relaxed text-muted-foreground">Reach local candidates and share the details that make your team worth joining.</p>
              <button type="button" onClick={onPost} className="mt-5 inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 text-[13px] font-bold text-primary-foreground hover:opacity-90">Post a Job Listing</button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function JobsFilterPage({
  search,
  onApply,
  onPost,
}: {
  search: Search;
  onApply: (patch: Partial<Search>) => void;
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

  function apply() {
    const numberValue = (value: string) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
    };
    onApply({
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
    });
  }

  return (
    <div className="mt-8">
      <section className="floating-card overflow-visible p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="grid w-full max-w-[390px] grid-cols-2 rounded-2xl bg-secondary p-1.5 ring-1 ring-border/70">
            <button type="button" aria-pressed="true" className="rounded-xl bg-primary px-3 py-3 text-[13px] font-bold text-primary-foreground shadow-sm">Search Jobs</button>
            <button type="button" onClick={onPost} className="rounded-xl px-3 py-3 text-[13px] font-bold hover:bg-card">Post a Job</button>
          </div>
          <button type="button" onClick={() => setShowAll((current) => !current)} className="inline-flex items-center gap-2 rounded-full border border-primary px-4 py-2.5 text-[12px] font-bold text-primary hover:bg-secondary"><FunnelSimple size={15} aria-hidden="true" />{showAll ? "Hide all filters" : "Show all filters"}<CaretDown size={14} className={showAll ? "rotate-180" : ""} aria-hidden="true" /></button>
        </div>
        <form className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.65fr_repeat(3,minmax(0,1fr))_auto]" onSubmit={(event) => { event.preventDefault(); apply(); }}>
          <label className="flex h-12 min-w-0 items-center gap-2 rounded-xl border border-input bg-card px-3 focus-within:border-primary"><MagnifyingGlass size={16} className="shrink-0 text-primary" aria-hidden="true" /><span className="sr-only">Search jobs</span><input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Search for a job, company, or title" className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground" /></label>
          <JobChecklist label="Category" value={category} options={jobCategoryOptions} onChange={setCategory} />
          <JobChecklist label="Job type" value={jobType} options={jobTypeOptions} onChange={setJobType} />
          <JobSelect label="Job pay range" value={payType} options={jobPayTypeOptions} onChange={setPayType} />
          <button type="submit" className="h-12 rounded-xl bg-primary px-5 text-[12px] font-bold text-primary-foreground hover:opacity-90">Search</button>
        </form>
      </section>

      <div className="mt-7 grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        {showAll && (
          <aside className="space-y-3">
            <JobFilterGroup title="Category"><JobChecklist label="Category" value={category} options={jobCategoryOptions} onChange={setCategory} /></JobFilterGroup>
            <JobFilterGroup title="Job type"><JobChecklist label="Job type" value={jobType} options={jobTypeOptions} onChange={setJobType} /></JobFilterGroup>
            <JobFilterGroup title="Education level"><JobChecklist label="Education level" value={education} options={jobEducationOptions} onChange={setEducation} /></JobFilterGroup>
            <JobFilterGroup title="Years of experience"><JobChecklist label="Years of experience" value={experience} options={jobExperienceOptions} onChange={setExperience} /></JobFilterGroup>
            <JobFilterGroup title="Job pay range">
              <div className="grid grid-cols-3 gap-1.5">{jobPayTypeOptions.map((option, index) => { const value = index === 0 ? "" : option; return <button key={option} type="button" onClick={() => setPayType(value)} className={`rounded-lg border px-2 py-2 text-[11px] font-semibold ${payType === value ? "border-primary bg-primary text-primary-foreground" : "border-primary text-primary hover:bg-secondary"}`}>{index === 0 ? "All" : option}</button>; })}</div>
              <div className="grid grid-cols-2 gap-2"><input inputMode="numeric" value={payMin} onChange={(event) => setPayMin(event.target.value)} placeholder="$ From" className="filter-input" /><input inputMode="numeric" value={payMax} onChange={(event) => setPayMax(event.target.value)} placeholder="$ To" className="filter-input" /></div>
            </JobFilterGroup>
            <JobFilterGroup title="Photos / video"><JobToggle label="Only show listings with photos" checked={photos} onChange={setPhotos} /><JobToggle label="Only show listings with a video" checked={video} onChange={setVideo} /></JobFilterGroup>
            <JobFilterGroup title="Time on site"><JobSelect label="Time on site" value={timeOnSite} options={jobPostedOptions} onChange={setTimeOnSite} /></JobFilterGroup>
          </aside>
        )}

        <section aria-label="Job listings">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4"><p className="text-[13px] text-muted-foreground"><strong className="numeric text-foreground">{jobListingCount.toLocaleString()}</strong> jobs in Idaho, Utah, and Wyoming</p><label className="flex items-center gap-2 text-[12px] text-muted-foreground">Sort by<select className="h-9 rounded-lg border border-input bg-card px-2 text-[12px] text-foreground" defaultValue="newest"><option value="newest">Newest to oldest</option><option value="pay_high">Highest pay</option><option value="pay_low">Lowest pay</option></select></label></div>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{jobPreviewRows.flatMap((row) => row.cards).map((card) => <JobCard key={`${card.title}-${card.employer}`} card={card} />)}</div>
        </section>
      </div>
    </div>
  );
}

function JobSelect({ label, value, options, onChange }: { label: string; value?: string; options: readonly string[]; onChange?: (value: string) => void }) {
  return <label className="relative block min-w-0"><span className="sr-only">{label}</span><select aria-label={label} value={value ?? ""} onChange={(event) => onChange?.(event.target.value)} className="h-12 w-full appearance-none rounded-xl border border-input bg-card px-3 pr-8 text-[12px] text-foreground outline-none focus:border-primary">{options.map((option, index) => <option key={option} value={index === 0 ? "" : option}>{option}</option>)}</select><CaretDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /></label>;
}

function JobChecklist({ label, value, options, onChange }: { label: string; value?: string; options: readonly string[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = value ? value.split("|").filter(Boolean) : [];
  const anyOption = options[0] ?? "Any";
  const displayValue = selected.length === 0 ? anyOption : selected.length === 1 ? selected[0] : `${selected.length} selected`;

  function toggle(option: string) {
    if (option === anyOption) {
      onChange("");
      return;
    }
    const next = selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option];
    onChange(next.join("|"));
  }

  return (
    <div className="relative min-w-0">
      <button type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="flex h-12 w-full items-center justify-between gap-2 rounded-xl border border-input bg-card px-3 text-left text-[12px] text-foreground outline-none focus:border-primary">
        <span className="truncate">{displayValue}</span>
        <CaretDown size={14} className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div role="listbox" aria-label={`${label} options`} className="absolute left-0 top-[calc(100%+6px)] z-30 max-h-72 w-full min-w-[220px] overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-xl">
          {[anyOption, ...options.slice(1)].map((option) => {
            const checked = option === anyOption ? selected.length === 0 : selected.includes(option);
            return <label key={option} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-[12px] hover:bg-secondary"><input type="checkbox" checked={checked} onChange={() => toggle(option)} className="size-4 accent-primary" />{option}</label>;
          })}
        </div>
      )}
    </div>
  );
}

function JobFilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-border bg-card p-3 shadow-sm"><h2 className="mb-3 text-[13px] font-bold">{title}</h2><div className="space-y-2">{children}</div></section>;
}

function JobToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex items-center justify-between gap-3 text-[12px] leading-tight"><span>{label}</span><button type="button" aria-label={label} aria-pressed={checked} onClick={() => onChange(!checked)} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted"}`}><span className={`absolute top-1 size-5 rounded-full bg-card shadow-sm transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} /></button></label>;
}

function JobCard({ card }: { card: (typeof jobPreviewRows)[number]["cards"][number] }) {
  return <article className="group overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-shadow hover:shadow-lg"><div className="relative aspect-[4/3] overflow-hidden bg-secondary"><img src={card.image} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" /><span className="absolute left-3 top-3 rounded-md bg-primary/85 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-primary-foreground">Job</span></div><div className="p-4"><h3 className="min-h-[36px] text-[15px] font-bold leading-tight">{card.title}</h3><p className="mt-1 text-[12px] text-muted-foreground">{card.employer}</p><p className="mt-2 flex items-center gap-1 text-[11.5px] text-muted-foreground"><MapPin size={12} className="text-primary" aria-hidden="true" />{card.location}</p><p className="mt-5 text-[18px] font-bold text-primary">{card.pay}</p></div></article>;
}

function HomesFilterPage({
  activeTab,
  search,
  resultCount,
  onTabChange,
  onApply,
}: {
  activeTab: HomeTab;
  search: Search;
  resultCount: number;
  onTabChange: (tab: HomeTab) => void;
  onApply: (patch: Partial<Search>) => void;
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
  }, [search.homeLocation, search.q, search.homePrice, search.propertyType, search.bedrooms, search.bathrooms]);

  const extraFields = activeTab === "build"
      ? [
          { key: "homeSquareFeet", label: "Square feet", options: homeSquareFeetOptions, multi: false },
          { key: "homeBuilder", label: "Home builder", options: ["Any builder", "Local builders", "National builders"], multi: true },
        ]
      : activeTab === "buy"
      ? [
          { key: "homeSquareFeet", label: "Square feet", options: homeSquareFeetOptions, multi: false },
          { key: "constructionType", label: "Construction type", options: ["Any construction", "New construction", "Existing home"], multi: true },
          { key: "homeAcres", label: "Acres", options: homeAcresOptions, multi: false },
          { key: "homeSellerType", label: "Seller type", options: ["Any seller", "Owner", "Agent", "Builder"], multi: true },
        ]
      : [
          { key: "petsCats", label: "Cats", options: ["Any cat policy", "Cats allowed", "Cats not allowed"], multi: false },
          { key: "petsDogs", label: "Dogs", options: ["Any dog policy", "Dogs allowed", "Dogs not allowed"], multi: false },
          { key: "homeAmenities", label: "Home amenities", options: homeAmenitiesOptions, multi: true },
          { key: "communityAmenities", label: "Community amenities", options: communityAmenitiesOptions, multi: true },
          { key: "leaseLength", label: "Lease length", options: leaseLengthOptions, multi: false },
          { key: "homeSquareFeet", label: "Square feet", options: homeSquareFeetOptions, multi: false },
        ];

  function apply() {
    onApply({
      q: location.trim() || undefined,
      homeLocation: location.trim() || undefined,
      propertyType: propertyType || undefined,
      homePrice: homePrice || undefined,
      bedrooms: bedrooms || undefined,
      bathrooms: bathrooms || undefined,
      ...Object.fromEntries(extraFields.map(({ key }) => [key, extra[key] || undefined])),
    });
  }

  return (
    <section className="floating-card relative mt-2 overflow-visible bg-surface px-4 py-5 sm:px-7 sm:py-7">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">GemList Homes</p>
          <h1 className="mt-2 text-[28px] font-bold tracking-tight sm:text-[36px]">Find a gem to call home.</h1>
          <p className="mt-1 max-w-[55ch] text-[13px] text-muted-foreground">Search new builds, homes for sale, and rentals across Idaho.</p>
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
        <HomeFilterControl label="County, city, neighborhood, or ZIP" value={location} onChange={setLocation} input />
        <HomeFilterControl label="Property type" value={propertyType} options={homePropertyTypes} multi onChange={setPropertyType} />
        <HomePriceRangeControl value={homePrice} onChange={setHomePrice} />
        <HomeFilterControl label="Bedrooms" value={bedrooms} options={homeBedroomOptions} multi={false} onChange={setBedrooms} />
        <HomeFilterControl label={activeTab === "rent" ? "Bathrooms" : "Bathrooms"} value={bathrooms} options={homeBathroomOptions} multi={false} onChange={setBathrooms} />
        <button type="submit" className="h-11 rounded-xl border border-primary px-4 text-[12px] font-bold text-primary hover:bg-primary hover:text-primary-foreground">Search</button>
      </form>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-[12px] text-muted-foreground"><strong className="numeric text-foreground">{resultCount.toLocaleString()}</strong> {homeTabs.find((tab) => tab.value === activeTab)?.eyebrow.toLowerCase()}</span>
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
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{field.label}</p>
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
    return <HomeMultiSelectControl label={label} value={value} options={options} multi={multi} onChange={onChange} />;
  }

  return input ? (
    <label className="flex h-[88px] min-w-0 items-center gap-2 rounded-xl border border-input bg-card px-3 focus-within:border-primary">
      <MapPin size={15} className="shrink-0 text-primary" aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={label} className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground" />
    </label>
  ) : (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} className="h-[88px] w-full appearance-none rounded-xl border border-input bg-card px-3 pr-8 text-[12px] text-foreground outline-none focus:border-primary">
        {options?.map((option) => <option key={option} value={option === options[0] ? "" : option}>{option}</option>)}
      </select>
      <CaretDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
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
        <CaretDown size={14} className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 w-full min-w-[260px] rounded-xl border border-border bg-card p-3 shadow-xl">
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Min price</span>
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
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Max price</span>
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
          <button type="button" onClick={() => setOpen(false)} className="mt-3 h-10 w-full rounded-lg bg-primary text-[12px] font-semibold text-primary-foreground">Done</button>
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
  const summary = visibleSelected.length === 0
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
        <CaretDown size={14} className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 max-h-72 w-full min-w-[230px] overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-xl">
          {options.map((option) => {
            const checked = option === options[0] ? visibleSelected.length === 0 : visibleSelected.includes(option);
            return (
              <button
                key={option}
                type="button"
                aria-pressed={checked}
                onClick={() => toggle(option)}
                className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[12px] hover:bg-secondary"
              >
                <span className={`flex size-4 shrink-0 items-center justify-center rounded border ${checked ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>
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
  onSell,
}: {
  search: Search;
  result: ClassifiedBrowseResult;
  onApply: (patch: Partial<Search>) => void;
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
  const [mileageBands, setMileageBands] = useState(splitVehicleFilter(search.mileageBands)[0] ?? "");
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
    setModel((current) => splitVehicleFilter(current).filter((value) => available.has(value)).join("||"));
  }, [make]);

  function apply() {
    const numberValue = (value: string) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
    };
    onApply({
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
    });
  }

  return (
    <div className="mt-8">
      <section className="floating-card overflow-visible p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">Gem State motors</p>
            <h1 className="mt-1 text-[28px] font-bold tracking-tight">Cars & Trucks</h1>
          </div>
          <div className="grid w-full max-w-[330px] grid-cols-2 rounded-2xl bg-secondary p-1.5 ring-1 ring-border/70">
            <button type="button" aria-pressed="true" className="rounded-xl bg-primary px-3 py-3 text-[13px] font-bold text-primary-foreground shadow-sm">Buy</button>
            <button type="button" onClick={onSell} className="rounded-xl px-3 py-3 text-[13px] font-bold hover:bg-card">Sell</button>
          </div>
        </div>
        <form className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto]" onSubmit={(event) => { event.preventDefault(); apply(); }}>
          <label className="flex h-12 min-w-0 items-center gap-2 rounded-xl border border-input bg-card px-3 focus-within:border-primary"><MagnifyingGlass size={16} className="shrink-0 text-primary" aria-hidden="true" /><span className="sr-only">Search cars</span><input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Search cars, trucks, and more" className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground" /></label>
          <button type="submit" className="h-12 rounded-xl bg-primary px-5 text-[12px] font-bold text-primary-foreground hover:opacity-90">Search</button>
        </form>
        <div className="mt-5 flex justify-end border-t border-border pt-4"><button type="button" onClick={() => setShowAll((current) => !current)} className="inline-flex items-center gap-2 rounded-full border border-primary px-4 py-2.5 text-[12px] font-bold text-primary hover:bg-secondary"><FunnelSimple size={15} aria-hidden="true" />{showAll ? "Hide all filters" : "Show all filters"}<CaretDown size={14} className={showAll ? "rotate-180" : ""} aria-hidden="true" /></button></div>
      </section>

      <div className="mt-7 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        {showAll && <aside className="space-y-3">
          <VehicleFilterGroup title="Make / model">
            <VehicleCheckboxList label="Makes" value={make} options={vehicleOptions.makes} onChange={setMake} />
            {selectedMakes.length > 0 && <VehicleCheckboxList label="Models" value={model} options={availableModels} onChange={setModel} />}
          </VehicleFilterGroup>
          <VehicleFilterGroup title="Year">
            <div className="grid grid-cols-2 gap-2"><VehicleTextField label="Year from" value={yearMin} onChange={setYearMin} placeholder="From" numeric /><VehicleTextField label="Year to" value={yearMax} onChange={setYearMax} placeholder="To" numeric /></div>
          </VehicleFilterGroup>
          <VehicleFilterGroup title="Price"><div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"><VehicleTextField label="Minimum price" value={priceMin} onChange={setPriceMin} placeholder="$ From" numeric /><span className="text-muted-foreground">–</span><VehicleTextField label="Maximum price" value={priceMax} onChange={setPriceMax} placeholder="$ To" numeric /></div></VehicleFilterGroup>
          <VehicleFilterGroup title="Mileage"><VehicleSingleSelectList label="Mileage" value={mileageBands} options={mileageBandOptions} onChange={setMileageBands} /></VehicleFilterGroup>
          <VehicleFilterGroup title="Body type"><VehicleCheckboxList label="Body type" value={bodyStyle} options={vehicleOptions.bodyStyles} onChange={setBodyStyle} /></VehicleFilterGroup>
          <VehicleFilterGroup title="Seller type"><VehicleCheckboxList label="Seller type" value={sellerType} options={vehicleSellerTypeOptions} onChange={setSellerType} /></VehicleFilterGroup>
          <VehicleFilterGroup title="Condition"><VehicleCheckboxList label="Condition" value={condition} options={vehicleConditionOptions} onChange={setCondition} /></VehicleFilterGroup>
          <VehicleFilterGroup title="Delivery"><VehicleCheckboxList label="Delivery" value={fulfillment} options={[{ value: "local_pickup", label: "Local pickup" }, { value: "shipping", label: "Ships" }, { value: "both", label: "Pickup or shipping" }]} onChange={setFulfillment} /></VehicleFilterGroup>
          <VehicleFilterGroup title="Drive type"><VehicleCheckboxList label="Drive type" value={drivetrain} options={vehicleOptions.drivetrains} onChange={setDrivetrain} /></VehicleFilterGroup>
          <VehicleFilterGroup title="Transmission"><VehicleCheckboxList label="Transmission" value={transmission} options={vehicleOptions.transmissions} onChange={setTransmission} /></VehicleFilterGroup>
          <VehicleFilterGroup title="Fuel type"><VehicleCheckboxList label="Fuel type" value={fuelType} options={vehicleOptions.fuelTypes} onChange={setFuelType} /></VehicleFilterGroup>
          <VehicleFilterGroup title="Exterior color"><VehicleCheckboxList label="Exterior color" value={exteriorColor} options={vehicleOptions.exteriorColors} onChange={setExteriorColor} /></VehicleFilterGroup>
          <VehicleFilterGroup title="Title type"><VehicleCheckboxList label="Title type" value={titleStatus} options={vehicleOptions.titleStatuses} onChange={setTitleStatus} /></VehicleFilterGroup>
          <VehicleFilterGroup title="Location"><select aria-label="Region" value={region} onChange={(event) => setRegion(event.target.value)} className="filter-input w-full"><option value="">All of Idaho</option>{idahoRegions.map((option) => <option key={option} value={option}>{option}</option>)}</select><select aria-label="State" value={state} onChange={(event) => setState(event.target.value)} className="filter-input w-full"><option value="">All states</option>{usStates.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select><VehicleTextField label="City" value={city} onChange={setCity} placeholder="City" /></VehicleFilterGroup>
          <button type="button" onClick={apply} className="h-11 w-full rounded-xl bg-primary text-[12px] font-bold text-primary-foreground hover:opacity-90">Show {result.total.toLocaleString()} results</button>
        </aside>}

        <section id="results" aria-label="Car listings">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4"><p className="text-[13px] text-muted-foreground"><strong className="numeric text-foreground">{result.total}</strong> cars and trucks</p><label className="flex items-center gap-2 text-[12px] text-muted-foreground">Sort by<select className="h-9 rounded-lg border border-input bg-card px-2 text-[12px] text-foreground" defaultValue="newest"><option value="newest">Newest first</option><option value="price_low">Lowest price</option><option value="price_high">Highest price</option></select></label></div>
          {result.listings.length === 0 ? <div className="soft-card mt-5 px-5 py-12 text-center"><p className="text-[14px] font-medium">No cars match these filters.</p><p className="mt-1.5 text-[13px] text-muted-foreground">Try widening your year, price, make, model, or location choices.</p></div> : <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3 xl:grid-cols-4">{result.listings.map((listing) => <li key={listing.id}><ListingCard listing={listing} /></li>)}</ul>}
        </section>
      </div>
    </div>
  );
}

type VehicleFilterOption = string | { value: string; label: string };

function VehicleCheckboxList({ label, value, options, onChange }: { label: string; value: string; options: readonly VehicleFilterOption[]; onChange: (value: string) => void }) {
  const selected = value.split("||").filter(Boolean);
  const toggle = (option: VehicleFilterOption) => {
    const optionValue = typeof option === "string" ? option : option.value;
    onChange(selected.includes(optionValue) ? selected.filter((item) => item !== optionValue).join("||") : [...selected, optionValue].join("||"));
  };
  return <div role="group" aria-label={label} className="max-h-56 space-y-1 overflow-y-auto pr-1">{options.map((option) => { const optionValue = typeof option === "string" ? option : option.value; const optionLabel = typeof option === "string" ? option : option.label; const checked = selected.includes(optionValue); return <label key={optionValue} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 text-[12px] hover:bg-secondary"><span>{optionLabel}</span><input type="checkbox" checked={checked} onChange={() => toggle(option)} className="size-4 accent-primary" /></label>; })}</div>;
}

function VehicleSingleSelectList({ label, value, options, onChange }: { label: string; value: string; options: readonly VehicleFilterOption[]; onChange: (value: string) => void }) {
  const selected = splitVehicleFilter(value)[0] ?? "";
  const radioName = label.toLowerCase().replace(/\s+/g, "-");
  return <div role="radiogroup" aria-label={label} className="max-h-56 space-y-1 overflow-y-auto pr-1">{options.map((option) => { const optionValue = typeof option === "string" ? option : option.value; const optionLabel = typeof option === "string" ? option : option.label; return <label key={optionValue} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 text-[12px] hover:bg-secondary"><span>{optionLabel}</span><input type="radio" name={radioName} value={optionValue} checked={selected === optionValue} onChange={() => onChange(optionValue)} className="size-4 accent-primary" /></label>; })}</div>;
}

function VehicleMultiSelectPanel({ label, value, options, onApply }: { label: string; value: string; options: readonly string[]; onApply: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <div className="min-w-0"><VehicleCheckboxList label={label} value={draft} options={options} onChange={setDraft} /><button type="button" onClick={() => onApply(draft)} className="mt-2 h-9 w-full rounded-lg border border-primary text-[11px] font-bold text-primary hover:bg-secondary">Apply {label}</button></div>;
}

function VehicleTextField({ label, value, onChange, placeholder, numeric = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; numeric?: boolean }) {
  return <label className="block min-w-0"><span className="sr-only">{label}</span><input aria-label={label} inputMode={numeric ? "numeric" : undefined} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="filter-input w-full" /></label>;
}

function VehicleFilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-border bg-card p-3 shadow-sm"><h2 className="mb-3 text-[13px] font-bold">{title}</h2><div className="space-y-2">{children}</div></section>;
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
    : search.region ?? search.state ?? "All of Idaho";
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
    return values.length === 0 ? fallback : values.length === 1 ? values[0] ?? fallback : `${values.length} selected`;
  };
  const makeModelValues = [search.make, search.model]
    .flatMap((value) => value?.split("||").filter(Boolean) ?? []);
  const makeModelLabel =
    makeModelValues.length === 0
      ? "Make / model"
      : makeModelValues.length === 1
        ? makeModelValues[0] ?? "Make / model"
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
      label: selectedSummary(search.mileageBands, search.mileageMax != null ? `≤ ${search.mileageMax.toLocaleString()} mi` : "Mileage"),
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
            onApply={(first, second) =>
              applyInlineFilter({ yearMin: first, yearMax: second })
            }
          />
        );
      case "price":
        return (
          <InlineRangeFilter
            firstLabel="Min price"
            secondLabel="Max price"
            firstValue={search.priceMin}
            secondValue={search.priceMax}
            onApply={(first, second) =>
              applyInlineFilter({ priceMin: first, priceMax: second })
            }
            prefix="$"
          />
        );
      case "mileage":
        return <InlineSingleFilter label="Mileage" value={search.mileageBands} options={mileageBandOptions} onApply={(value) => applyInlineFilter({ mileageBands: value })} />;
      case "bodyStyle":
        return <InlineMultiFilter label="Body type" value={search.bodyStyle} options={vehicleOptions.bodyStyles} onApply={(value) => applyInlineFilter({ bodyStyle: value })} />;
      case "titleStatus":
        return <InlineMultiFilter label="Title type" value={search.titleStatus} options={vehicleOptions.titleStatuses} onApply={(value) => applyInlineFilter({ titleStatus: value })} />;
      case "drivetrain":
        return <InlineMultiFilter label="Drive type" value={search.drivetrain} options={vehicleOptions.drivetrains} onApply={(value) => applyInlineFilter({ drivetrain: value })} />;
      case "transmission":
        return <InlineMultiFilter label="Transmission" value={search.transmission} options={vehicleOptions.transmissions} onApply={(value) => applyInlineFilter({ transmission: value })} />;
      case "fuelType":
        return <InlineMultiFilter label="Fuel type" value={search.fuelType} options={vehicleOptions.fuelTypes} onApply={(value) => applyInlineFilter({ fuelType: value })} />;
      case "exteriorColor":
        return <InlineMultiFilter label="Exterior color" value={search.exteriorColor} options={vehicleOptions.exteriorColors} onApply={(value) => applyInlineFilter({ exteriorColor: value })} />;
      case "location":
        return <InlineLocationFilter search={search} onApply={applyInlineFilter} />;
      case "condition":
        return <InlineMultiFilter label="Condition" value={search.condition} options={vehicleConditionOptions} onApply={(value) => applyInlineFilter({ condition: value })} />;
      case "fulfillment":
        return <InlineMultiFilter label="Delivery" value={search.fulfillment} options={[{ value: "local_pickup", label: "Local pickup" }, { value: "shipping", label: "Ships" }, { value: "both", label: "Pickup or shipping" }]} onApply={(value) => applyInlineFilter({ fulfillment: value })} />;
      case "sellerType":
        return <InlineMultiFilter label="Seller type" value={search.sellerType} options={vehicleSellerTypeOptions} onApply={(value) => applyInlineFilter({ sellerType: value })} />;
    }
  }

  return (
    <section className="floating-card relative overflow-visible bg-surface px-5 py-6 sm:px-8 sm:py-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
        <div className="absolute -right-24 -top-32 h-72 w-72 rounded-full bg-brand-warm/35" />
        <div className="absolute -bottom-36 left-1/3 h-64 w-64 rounded-full bg-primary/5" />
      </div>

      <div className="relative">
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
            <MagnifyingGlass size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
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
              onClick={() => setExpandedFilter((current) => (current === "location" ? null : "location"))}
              className="inline-flex items-center gap-2 text-primary hover:underline"
            >
              <MapPin size={18} weight="duotone" aria-hidden="true" />
              <span className="flex flex-col items-start leading-tight">
                <span className="text-[10px] font-bold uppercase tracking-[0.08em]">Select location</span>
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
            <button type="button" onClick={onSearch} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 font-bold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5">
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
    setModel((current) => splitVehicleFilter(current).filter((value) => available.has(value)).join("||"));
  }, [make]);

  return (
    <div className="w-full space-y-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Makes</p>
      <VehicleCheckboxList label="Makes" value={make} options={vehicleOptions.makes} onChange={setMake} />
      {selectedMakes.length > 0 && (
        <>
          <p className="pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Models</p>
          <VehicleCheckboxList label="Models" value={model} options={availableModels} onChange={setModel} />
        </>
      )}
      <InlineApplyButton onClick={() => onApply({ make: make || undefined, model: model || undefined })} />
    </div>
  );
}

function InlineMultiFilter({ label, value, options, onApply }: { label: string; value: string | undefined; options: readonly VehicleFilterOption[]; onApply: (value: string) => void }) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  return <div className="space-y-2"><p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p><VehicleCheckboxList label={label} value={draft} options={options} onChange={setDraft} /><InlineApplyButton onClick={() => onApply(draft)} /></div>;
}

function InlineSingleFilter({ label, value, options, onApply }: { label: string; value: string | undefined; options: readonly VehicleFilterOption[]; onApply: (value: string) => void }) {
  const [draft, setDraft] = useState(splitVehicleFilter(value)[0] ?? "");
  useEffect(() => setDraft(splitVehicleFilter(value)[0] ?? ""), [value]);
  return <div className="space-y-2"><p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p><VehicleSingleSelectList label={label} value={draft} options={options} onChange={setDraft} /><InlineApplyButton onClick={() => onApply(draft)} /></div>;
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
          {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{prefix}</span>}
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
          {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{prefix}</span>}
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
        const label = typeof option === "string" ? optionLabels?.[option] ?? option : option.label;
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
      <select value={region} onChange={(event) => setRegion(event.target.value)} className="filter-input w-full">
        <option value="">All of Idaho</option>
        {idahoRegions.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <select value={state} onChange={(event) => setState(event.target.value)} className="filter-input w-full">
        <option value="">All states</option>
        {usStates.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
      </select>
      <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="City" className="filter-input w-full" />
      <InlineApplyButton onClick={() => onApply({ region: region || undefined, state: state || undefined, city: city.trim() || undefined })} />
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

function countActiveFilters(search: Search, motors: boolean) {
  const keys: (keyof Search)[] = [
    "category",
    "group",
    "state",
    "region",
    "city",
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
  return keys.filter((key) => search[key] !== undefined && search[key] !== "").length;
}

function activeFilterLabels(search: Search, motors: boolean) {
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
