/** Existing landing rows shared with the background preview allocator. */
export type LandingPreviewRow = { title: string; action: string; href: string; cards: [] };
const showcaseRow = (
  title: string,
  action: string,
  href: string,
  cards: [],
): LandingPreviewRow => ({ title, action, href, cards });

export const firearmShowcaseRows: LandingPreviewRow[] = [
  {
    title: "Rifles near you",
    action: "Browse rifles",
    href: "/browse?category=firearms&firearmMode=results&firearmListingType=Firearm&firearmType=Rifle",
    cards: [],
  },
  {
    title: "Handguns near you",
    action: "Browse handguns",
    href: "/browse?category=firearms&firearmMode=results&firearmListingType=Firearm&firearmType=Handgun",
    cards: [],
  },
  {
    title: "Shotguns near you",
    action: "Browse shotguns",
    href: "/browse?category=firearms&firearmMode=results&firearmListingType=Firearm&firearmType=Shotgun",
    cards: [],
  },
  {
    title: "Ammunition",
    action: "Shop ammunition",
    href: "/browse?category=firearms&firearmMode=results&firearmListingType=Accessory&firearmAccessoryType=Ammunition",
    cards: [],
  },
  {
    title: "Optics and sights",
    action: "Shop optics",
    href: "/browse?category=firearms&firearmMode=results&firearmListingType=Accessory&firearmAccessoryType=Optics%20%26%20sights",
    cards: [],
  },
  {
    title: "Cases and secure storage",
    action: "Shop cases and storage",
    href: "/browse?category=firearms&firearmMode=results&firearmListingType=Accessory&firearmAccessoryType=Cases%20%26%20storage",
    cards: [],
  },
  {
    title: "Safes and locks",
    action: "Shop safes and locks",
    href: "/browse?category=firearms&firearmMode=results&firearmListingType=Accessory&firearmAccessoryType=Safes%20%26%20locks",
    cards: [],
  },
  {
    title: "Targets and range gear",
    action: "Shop range gear",
    href: "/browse?category=firearms&firearmMode=results&firearmListingType=Accessory&firearmAccessoryType=Targets%20%26%20range%20gear",
    cards: [],
  },
];

export const petShowcaseRows: LandingPreviewRow[] = [
  {
    title: "Pets and companions near you",
    action: "Browse all pets",
    href: "/browse?category=pets&petMode=results",
    cards: [],
  },
  {
    title: "Dogs for adoption",
    action: "See adoptable dogs",
    href: "/browse?category=pets&petMode=results&petSubcategory=dogs&petPlacementType=adoption",
    cards: [],
  },
  {
    title: "Cats for adoption",
    action: "See adoptable cats",
    href: "/browse?category=pets&petMode=results&petSubcategory=cats&petPlacementType=adoption",
    cards: [],
  },
  {
    title: "Other pets looking for a home",
    action: "See other pets",
    href: "/browse?category=pets&petMode=results&petSubcategory=other-pets&petPlacementType=adoption",
    cards: [],
  },
];

export const classifiedShowcaseRows: LandingPreviewRow[] = [
  {
    title: "Popular near you",
    action: "See popular listings",
    href: "/browse?allCategories=true",
    cards: [],
  },
  {
    title: "Everyday finds",
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
    title: "Lowest prices",
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

export const vehicleShowcaseRows: LandingPreviewRow[] = [
  {
    title: "Newest in Idaho",
    action: "See the newest vehicles",
    href: "/browse?group=motors&vehicleMode=results&state=ID",
    cards: [],
  },
  {
    title: "Adventure-ready rides",
    action: "Explore outdoor vehicles",
    href: "/browse?group=motors&vehicleMode=results&state=ID&bodyStyle=SUV||Truck",
    cards: [],
  },
  {
    title: "Lowest prices",
    action: "See the lowest prices",
    href: "/browse?group=motors&vehicleMode=results&state=ID&sort=price_low",
    cards: [],
  },
  showcaseRow(
    "Fuel-efficient commuters",
    "Shop efficient cars",
    "/browse?group=motors&vehicleMode=results&state=ID&fuelType=Hybrid||Electric",
    [],
  ),
  showcaseRow(
    "Family SUVs & crossovers",
    "Find family SUVs",
    "/browse?group=motors&vehicleMode=results&state=ID&bodyStyle=SUV",
    [],
  ),
  showcaseRow(
    "Work trucks & vans",
    "Shop work-ready vehicles",
    "/browse?group=motors&vehicleMode=results&state=ID&bodyStyle=Truck||Van",
    [],
  ),
  showcaseRow(
    "RVs, campers & trailers",
    "Explore campers and trailers",
    "/browse?group=motors&vehicleMode=results&state=ID&bodyStyle=RV||Trailer",
    [],
  ),
  showcaseRow(
    "Motorcycles & powersports",
    "Shop powersports",
    "/browse?group=motors&vehicleMode=results&state=ID&bodyStyle=Motorcycle||ATV",
    [],
  ),
  showcaseRow(
    "Cars under $20,000",
    "Find affordable cars",
    "/browse?group=motors&vehicleMode=results&state=ID&priceMax=20000",
    [],
  ),
  showcaseRow(
    "Late-model local vehicles",
    "Browse newer vehicles",
    "/browse?group=motors&vehicleMode=results&state=ID&yearMin=2022",
    [],
  ),
  showcaseRow(
    "Classic & enthusiast vehicles",
    "Explore classic rides",
    "/browse?group=motors&vehicleMode=results&state=ID&yearMax=1995",
    [],
  ),
  showcaseRow(
    "Minivans & people movers",
    "Find minivans",
    "/browse?group=motors&vehicleMode=results&state=ID&bodyStyle=Minivan",
    [],
  ),
  showcaseRow(
    "AWD & winter-ready rides",
    "Shop all-weather vehicles",
    "/browse?group=motors&vehicleMode=results&state=ID&drivetrain=AWD||4WD",
    [],
  ),
];

export const jobsShowcaseRows: LandingPreviewRow[] = [
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
    "/browse?category=jobs&jobMode=results&q=remote",
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
    "/browse?category=jobs&jobMode=results&q=driver",
    [],
  ),
  showcaseRow(
    "Engineering & technical",
    "Browse technical jobs",
    "/browse?category=jobs&jobMode=results&jobCategory=Architecture%20%26%20Engineering",
    [],
  ),
];
