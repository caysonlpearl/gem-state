export const idahoRegions = [
  "Treasure Valley",
  "Southwest Idaho",
  "Magic Valley",
  "Southeast Idaho",
  "Eastern Idaho",
  "Central Idaho",
  "North Central Idaho",
  "North Idaho",
] as const;

export const classifiedCategories = [
  { slug: "cars-trucks", name: "Cars & Trucks", group: "motors" },
  { slug: "motorcycles", name: "Motorcycles", group: "motors" },
  { slug: "rvs-campers", name: "RVs & Campers", group: "motors" },
  { slug: "powersports", name: "Powersports", group: "motors" },
  { slug: "auto-parts", name: "Auto Parts", group: "motors" },
  { slug: "trailers", name: "Trailers", group: "motors" },
  { slug: "furniture", name: "Furniture", group: "classifieds" },
  { slug: "electronics", name: "Electronics", group: "classifieds" },
  { slug: "tools-equipment", name: "Tools & Equipment", group: "classifieds" },
  { slug: "outdoor-sporting", name: "Outdoor & Sporting", group: "classifieds" },
  { slug: "farm-garden", name: "Farm & Garden", group: "classifieds" },
  { slug: "general", name: "General", group: "classifieds" },
] as const;

export const vehicleOptions = {
  bodyStyles: ["Sedan", "SUV", "Pickup", "Coupe", "Hatchback", "Wagon", "Van", "Convertible"],
  transmissions: ["Automatic", "Manual", "CVT"],
  drivetrains: ["FWD", "RWD", "AWD", "4WD"],
  fuelTypes: ["Gasoline", "Diesel", "Hybrid", "Plug-in hybrid", "Electric", "Other"],
  titleStatuses: ["Clean", "Rebuilt", "Salvage", "Lien", "Other"],
} as const;

export type ClassifiedCategorySlug = (typeof classifiedCategories)[number]["slug"];
export type IdahoRegion = (typeof idahoRegions)[number];