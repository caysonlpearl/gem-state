/** Shared row definitions let the background cache keep each service trade represented. */
const row = (
  title: string,
  action: string,
  href: string,
  cards: [],
): { title: string; action: string; href: string; cards: [] } => ({ title, action, href, cards });

export const servicesShowcaseRows = [
  row(
    "Plumbing & water",
    "Find a plumber",
    "/browse?category=services&serviceMode=results&serviceSubcategory=Plumbers",
    [],
  ),
  row(
    "Electrical & lighting",
    "Find an electrician",
    "/browse?category=services&serviceMode=results&serviceSubcategory=Electricians",
    [],
  ),
  row(
    "Heating & cooling",
    "Find HVAC service",
    "/browse?category=services&serviceMode=results&serviceSubcategory=Heating%20%26%20Air%20Conditioning",
    [],
  ),
  row(
    "Roofing",
    "Find a roofer",
    "/browse?category=services&serviceMode=results&serviceSubcategory=Roofing",
    [],
  ),
  row(
    "Lawn & landscaping",
    "Find lawn care",
    "/browse?category=services&serviceMode=results&serviceSubcategory=Landscape%20Contractors",
    [],
  ),
  row(
    "Cleaning & move-out",
    "Find a cleaner",
    "/browse?category=services&serviceMode=results&serviceSubcategory=House%20Cleaning",
    [],
  ),
  row(
    "Handyman & repairs",
    "Find a handyman",
    "/browse?category=services&serviceMode=results&serviceSubcategory=Handyman",
    [],
  ),
  row(
    "Home improvement pros",
    "Find a contractor",
    "/browse?category=services&serviceMode=results&serviceSubcategory=General%20Contractors",
    [],
  ),
  row(
    "Painting",
    "Find a painter",
    "/browse?category=services&serviceMode=results&serviceSubcategory=Painters",
    [],
  ),
  row(
    "Pest control",
    "Find pest control",
    "/browse?category=services&serviceMode=results&serviceSubcategory=Pest%20Control",
    [],
  ),
  row(
    "Moving & hauling",
    "Find movers",
    "/browse?category=services&serviceMode=results&serviceSubcategory=Movers",
    [],
  ),
  row(
    "Automotive & mobile repair",
    "Find auto service",
    "/browse?category=services&serviceMode=results&serviceSubcategory=Automotive",
    [],
  ),
  row(
    "Pet care",
    "Find pet care",
    "/browse?category=services&serviceMode=results&serviceSubcategory=Pet%20Care",
    [],
  ),
  row(
    "Technology & business help",
    "Find local tech help",
    "/browse?category=services&serviceMode=results&serviceSubcategory=IT%20Services",
    [],
  ),
];
