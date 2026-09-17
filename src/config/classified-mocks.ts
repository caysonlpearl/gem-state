export type ClassifiedFloorplan = {
  name: string;
  bedrooms: number;
  bathrooms: number;
  squareFeet?: number | null;
  image: string;
  builderUrl?: string | null;
};

export type ClassifiedHomeCommunity = {
  slug: string;
  name: string;
  floorplans?: ClassifiedFloorplan[];
};

export type ClassifiedHomeDetails = {
  mode: "rent" | "buy" | "build";
  propertyType: string;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFeet: number | null;
  yearBuilt?: number | null;
  available?: string | null;
  pets?: string | null;
  smoking?: string | null;
  leaseLength?: string | null;
  sellerType?: string | null;
  utilities?: { label: string; paidBy: string }[];
  amenities?: string[];
  openHouse?: string | null;
  community?: { slug: string; name: string } | null;
  schoolDistrict?: string | null;
  acreage?: string | null;
  heating?: string | null;
  cooling?: string | null;
  garageParking?: string | null;
  yard?: string | null;
  appliancesIncluded?: string | null;
  basementType?: string | null;
  floorCoverings?: string | null;
  exteriorMaterial?: string | null;
  specialFeatures?: string | null;
  hoaFees?: string | null;
};

export const homeCommunities: Record<string, ClassifiedHomeCommunity> = {
  "banbury-meadows": {
    slug: "banbury-meadows",
    name: "Banbury Meadows",
    floorplans: [
      {
        name: "Aspen",
        bedrooms: 4,
        bathrooms: 2.5,
        squareFeet: 2410,
        image:
          "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=900&q=80",
        builderUrl: "https://www.riverstonehomes.example/plans/aspen",
      },
      {
        name: "Birch",
        bedrooms: 3,
        bathrooms: 2,
        squareFeet: 1950,
        image:
          "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=900&q=80",
        builderUrl: "https://www.riverstonehomes.example/plans/birch",
      },
    ],
  },
  "sage-creek": {
    slug: "sage-creek",
    name: "Sage Creek",
    floorplans: [
      {
        name: "Cottonwood",
        bedrooms: 3,
        bathrooms: 2,
        squareFeet: 1860,
        image:
          "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=900&q=80",
        builderUrl: "https://www.riverstonehomes.example/plans/cottonwood",
      },
      {
        name: "Sagewood",
        bedrooms: 4,
        bathrooms: 2.5,
        squareFeet: 2240,
        image:
          "https://images.unsplash.com/photo-1605146769289-440113cc3d00?auto=format&fit=crop&w=900&q=80",
        builderUrl: "https://www.riverstonehomes.example/plans/sagewood",
      },
    ],
  },
  "north-bench-highlands": {
    slug: "north-bench-highlands",
    name: "North Bench Highlands",
    floorplans: [
      {
        name: "Highlands Custom",
        bedrooms: 4,
        bathrooms: 3,
        squareFeet: 2780,
        image:
          "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80",
        builderUrl: "https://www.riverstonehomes.example/plans/highlands-custom",
      },
    ],
  },
};

export type MockClassifiedListing = {
  id: string;
  listingNumber: string;
  title: string;
  productId: string;
  productSlug: string;
  priceCents: number;
  city: string;
  state: string;
  region: string;
  categorySlug: string;
  categoryName: string;
  condition: string;
  fulfillmentMode: string;
  createdAt: string;
  expiresAt: string;
  description: string;
  postalCode: string;
  sellerNote: string;
  home?: ClassifiedHomeDetails;
  seller: {
    slug: string;
    displayName: string;
    bio: string;
    avatarUrl: string | null;
    payoutVerified: boolean;
    ratingAverage: number;
    reviewCount: number;
  };
  images: { url: string; alt: string }[];
};

const image = (id: string, alt: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=85`;

const sellers = {
  stacie: {
    slug: "mock-stacie",
    displayName: "Stacie",
    bio: "Local collector and occasional seller in West Jordan.",
    avatarUrl: null,
    payoutVerified: true,
    ratingAverage: 5,
    reviewCount: 12,
    memberSince: 2011,
    sellerType: "Private",
  },
  marcus: {
    slug: "mock-marcus",
    displayName: "Marcus R.",
    bio: "Downsizing a longtime collection of toys and small treasures.",
    avatarUrl: null,
    payoutVerified: true,
    ratingAverage: 4.9,
    reviewCount: 8,
    memberSince: 2018,
    sellerType: "Private",
  },
  jenna: {
    slug: "mock-jenna",
    displayName: "Jenna K.",
    bio: "Vintage finds and gently used home goods from the Treasure Valley.",
    avatarUrl: null,
    payoutVerified: false,
    ratingAverage: 4.8,
    reviewCount: 5,
    memberSince: 2021,
    sellerType: "Private",
  },
  crescent: {
    slug: "mock-crescent-apartments",
    displayName: "Crescent Apartments",
    bio: "A local property team helping renters find well-kept homes in the Salt Lake Valley.",
    avatarUrl: null,
    payoutVerified: true,
    ratingAverage: 4.8,
    reviewCount: 34,
    memberSince: 2017,
    sellerType: "Property manager",
  },
  sagebrush: {
    slug: "mock-sagebrush-property-group",
    displayName: "Sagebrush Property Group",
    bio: "Local property managers with a small collection of homes across the Treasure Valley.",
    avatarUrl: null,
    payoutVerified: true,
    ratingAverage: 4.9,
    reviewCount: 21,
    memberSince: 2019,
    sellerType: "Property manager",
  },
  riverstone: {
    slug: "mock-riverstone-homes",
    displayName: "Riverstone Homes",
    bio: "A local home builder and seller focused on comfortable, move-in-ready Idaho homes.",
    avatarUrl: null,
    payoutVerified: true,
    ratingAverage: 5,
    reviewCount: 16,
    memberSince: 2015,
    sellerType: "Business",
  },
} as const;

export const mockClassifiedListings: MockClassifiedListing[] = [
  {
    id: "mock-general-squishmallows",
    listingNumber: "80786961",
    title: "Squishmallows 8-Piece Collector Box",
    productId: "mock-product-squishmallows",
    productSlug: "squishmallows-8-piece-collector-box",
    priceCents: 5_00,
    city: "West Jordan",
    state: "UT",
    region: "Salt Lake Valley",
    categorySlug: "general",
    categoryName: "General",
    condition: "new_with_tags",
    fulfillmentMode: "local_pickup",
    createdAt: "2026-09-15T18:30:00.000Z",
    expiresAt: "2026-10-16T18:30:00.000Z",
    description:
      "New and unopened Squishmallows collector box with eight small plush figures. Only this set is available. Coley the dragon, Heidi the husky dog, Chelsea the cheetah, and five more are included. $5 each if separated, or take the whole box for $30.",
    postalCode: "84084",
    sellerNote: "Porch pickup in West Jordan. Please message before coming by.",
    seller: sellers.stacie,
    images: [
      {
        url: image("photo-1596461404969-9ae70f2830c1", "Box of colorful collectible plush toys"),
        alt: "Box of colorful collectible plush toys",
      },
      {
        url: image("photo-1607453998774-d533f65dac99", "Small plush toys arranged for sale"),
        alt: "Small plush toys arranged for sale",
      },
    ],
  },
  {
    id: "mock-general-vintage-plush",
    listingNumber: "80786912",
    title: "Vintage House of Lloyd Plush Reindeer",
    productId: "mock-product-vintage-plush",
    productSlug: "vintage-house-of-lloyd-plush-reindeer",
    priceCents: 15_00,
    city: "Sandy",
    state: "UT",
    region: "Salt Lake Valley",
    categorySlug: "general",
    categoryName: "General",
    condition: "used_excellent",
    fulfillmentMode: "both",
    createdAt: "2026-09-14T20:15:00.000Z",
    expiresAt: "2026-10-15T20:15:00.000Z",
    description:
      "Vintage House of Lloyd holiday plush in excellent displayed condition. The reindeer has a soft red nose, stitched details, and no odors, stains, or repairs. A fun seasonal collectible or gift for a longtime House of Lloyd fan.",
    postalCode: "84070",
    sellerNote: "Shipping is available if the buyer covers the actual postage cost.",
    seller: sellers.marcus,
    images: [
      {
        url: image("photo-1558060370-d644479cb6f7", "Vintage stuffed animal collectible"),
        alt: "Vintage stuffed animal collectible",
      },
    ],
  },
  {
    id: "mock-general-princess-doll",
    listingNumber: "80786874",
    title: "Super Mario Galaxy Princess Peach Doll",
    productId: "mock-product-princess-peach",
    productSlug: "super-mario-galaxy-princess-peach-doll",
    priceCents: 27_00,
    city: "Murray",
    state: "UT",
    region: "Salt Lake Valley",
    categorySlug: "general",
    categoryName: "General",
    condition: "new_with_tags",
    fulfillmentMode: "local_pickup",
    createdAt: "2026-09-13T16:45:00.000Z",
    expiresAt: "2026-10-14T16:45:00.000Z",
    description:
      "New Super Mario Galaxy Princess Peach doll with original hang tag. Clean display piece for a Nintendo collection, game room, or kid's shelf. Never played with and stored in a smoke-free home.",
    postalCode: "84123",
    sellerNote: "Meet at the Murray library during daylight hours.",
    seller: sellers.jenna,
    images: [
      {
        url: image("photo-1575361204480-aadea25e6e68", "Collectible character doll"),
        alt: "Collectible character doll",
      },
    ],
  },
  {
    id: "mock-general-vintage-lighter",
    listingNumber: "80786841",
    title: "S.T. Dupont Ligne 2 Gold Finish Lighter",
    productId: "mock-product-dupont-lighter",
    productSlug: "st-dupont-ligne-2-gold-finish-lighter",
    priceCents: 225_00,
    city: "Draper",
    state: "UT",
    region: "Salt Lake Valley",
    categorySlug: "general",
    categoryName: "General",
    condition: "used_excellent",
    fulfillmentMode: "both",
    createdAt: "2026-09-12T19:20:00.000Z",
    expiresAt: "2026-10-13T19:20:00.000Z",
    description:
      "S.T. Dupont Ligne 2 lighter with a textured gold finish. It has been kept in a display case and shows light signs of age on the base. Includes the original presentation box; fuel is not included for shipping.",
    postalCode: "84020",
    sellerNote: "Adult buyer only. Local handoff preferred.",
    seller: sellers.marcus,
    images: [
      {
        url: image("photo-1523275335684-37898b6baf30", "Gold-toned collectible accessory"),
        alt: "Gold-toned collectible accessory",
      },
    ],
  },
  {
    id: "mock-general-fuggler",
    listingNumber: "80786795",
    title: "Teenage Mutant Ninja Turtles Fuggler Limited Edition",
    productId: "mock-product-fuggler",
    productSlug: "teenage-mutant-ninja-turtles-fuggler",
    priceCents: 25_00,
    city: "South Jordan",
    state: "UT",
    region: "Salt Lake Valley",
    categorySlug: "general",
    categoryName: "General",
    condition: "new_with_tags",
    fulfillmentMode: "local_pickup",
    createdAt: "2026-09-11T14:05:00.000Z",
    expiresAt: "2026-10-12T14:05:00.000Z",
    description:
      "Limited edition Teenage Mutant Ninja Turtles Fuggler in original packaging. The box has been opened for photos, but the figure has never been displayed. Great oddball collectible for a TMNT or Fuggler fan.",
    postalCode: "84095",
    sellerNote: "Can meet near the District in South Jordan.",
    seller: sellers.stacie,
    images: [
      {
        url: image("photo-1560963689-7e8c4e0b5cf2", "Colorful boxed collectible figure"),
        alt: "Colorful boxed collectible figure",
      },
    ],
  },
  {
    id: "mock-general-fisher-price-doll",
    listingNumber: "80786742",
    title: "Vintage 1986 Fisher-Price Doll in Yellow Dress",
    productId: "mock-product-fisher-price-doll",
    productSlug: "vintage-1986-fisher-price-doll-yellow-dress",
    priceCents: 25_00,
    city: "Boise",
    state: "ID",
    region: "Treasure Valley",
    categorySlug: "general",
    categoryName: "General",
    condition: "used_good",
    fulfillmentMode: "both",
    createdAt: "2026-09-10T21:10:00.000Z",
    expiresAt: "2026-10-11T21:10:00.000Z",
    description:
      "Vintage Fisher-Price doll wearing a yellow dress with the original shoes. The dress has gentle age wear, but the doll is clean and displays well. A sweet addition to a vintage toy collection.",
    postalCode: "83702",
    sellerNote: "I can bundle this with other vintage toys from my listings.",
    seller: sellers.jenna,
    images: [
      {
        url: image("photo-1607453998774-d533f65dac99", "Vintage doll collectible"),
        alt: "Vintage doll collectible",
      },
    ],
  },
  {
    id: "mock-home-rental-crescent-townhome",
    listingNumber: "40630044",
    title: "New Luxury 2 Bedroom Townhome in SLC!!",
    productId: "mock-product-crescent-townhome",
    productSlug: "new-luxury-2-bedroom-townhome-slc",
    priceCents: 216_000,
    city: "Salt Lake City",
    state: "UT",
    region: "Salt Lake Valley",
    categorySlug: "other-real-estate",
    categoryName: "Homes",
    condition: "new_with_tags",
    fulfillmentMode: "local_pickup",
    createdAt: "2026-09-15T16:00:00.000Z",
    expiresAt: "2026-10-16T16:00:00.000Z",
    description:
      "Available now. Discover upscale urban living in this brand-new 2 bedroom, 2 bathroom townhome with 1,139 square feet and a 2025 build. The open layout has bright natural light, a modern kitchen with stainless appliances, a full-size washer and dryer, private fenced patio, attached garage, and smart-home features. Pets are allowed with approval. No smoking. 12 to 15 month lease preferred. Resident pays electric, gas, internet, and renter's insurance; water, sewer, and trash are included. Schedule a tour with Crescent Apartments.",
    postalCode: "84104",
    sellerNote: "Tours are available by appointment. Apply after viewing the home.",
    seller: sellers.crescent,
    home: {
      mode: "rent",
      propertyType: "Townhome",
      bedrooms: 2,
      bathrooms: 2,
      squareFeet: 1139,
      yearBuilt: 2025,
      available: "Available now",
      pets: "Allowed with approval",
      smoking: "Not allowed",
      leaseLength: "12–15 months",
      sellerType: "Property manager",
      utilities: [
        { label: "Electric", paidBy: "Resident" },
        { label: "Gas", paidBy: "Resident" },
        { label: "Internet", paidBy: "Resident" },
        { label: "Water, sewer, and trash", paidBy: "Landlord" },
      ],
      amenities: [
        "Stainless steel appliances",
        "Full-size washer and dryer",
        "Attached garage",
        "Private fenced patio",
        "Smart locks and thermostat",
        "Google Fiber ready",
      ],
    },
    images: [
      {
        url: image("photo-1600607687920-4e2a09cf159d", "Bright townhome living room"),
        alt: "Bright townhome living room",
      },
      {
        url: image("photo-1600607687939-ce8a6c25118c", "Modern home kitchen"),
        alt: "Modern home kitchen",
      },
      {
        url: image("photo-1600607688969-a5bfcd646154", "Townhome bedroom"),
        alt: "Townhome bedroom",
      },
    ],
  },
  {
    id: "mock-home-rental-parkside-flats",
    listingNumber: "40630038",
    title: "Parkside Flats | Bright 1 Bedroom Apartment",
    productId: "mock-product-parkside-flats",
    productSlug: "parkside-flats-bright-1-bedroom-apartment",
    priceCents: 165_000,
    city: "Murray",
    state: "UT",
    region: "Salt Lake Valley",
    categorySlug: "other-real-estate",
    categoryName: "Homes",
    condition: "used_excellent",
    fulfillmentMode: "local_pickup",
    createdAt: "2026-09-14T18:30:00.000Z",
    expiresAt: "2026-10-15T18:30:00.000Z",
    description:
      "Bright 1 bedroom, 1 bathroom apartment with 742 square feet near parks, transit, and neighborhood coffee shops. Available October 1. The home includes an updated kitchen, in-unit laundry, reserved parking, and a shared courtyard. Cats welcome; dogs considered. No smoking. 12 month lease. Resident pays electric and internet; water, sewer, and trash are included.",
    postalCode: "84107",
    sellerNote: "Message Parkside Flats to schedule a weekday or Saturday tour.",
    seller: sellers.crescent,
    home: {
      mode: "rent",
      propertyType: "Apartment",
      bedrooms: 1,
      bathrooms: 1,
      squareFeet: 742,
      yearBuilt: 2018,
      available: "October 1",
      pets: "Cats welcome; dogs considered",
      smoking: "Not allowed",
      leaseLength: "12 months",
      sellerType: "Property manager",
      utilities: [
        { label: "Electric", paidBy: "Resident" },
        { label: "Internet", paidBy: "Resident" },
        { label: "Water, sewer, and trash", paidBy: "Landlord" },
      ],
      amenities: ["Updated kitchen", "In-unit laundry", "Reserved parking", "Shared courtyard"],
    },
    images: [
      {
        url: image("photo-1505693416388-ac5ce068fe85", "Bright apartment living room"),
        alt: "Bright apartment living room",
      },
      {
        url: image("photo-1600607687920-4e2a09cf159d", "Apartment kitchen and living area"),
        alt: "Apartment kitchen and living area",
      },
    ],
  },
  {
    id: "mock-home-rental-warm-springs",
    listingNumber: "40630029",
    title: "Warm Springs 3 Bedroom Home with Yard",
    productId: "mock-product-warm-springs",
    productSlug: "warm-springs-3-bedroom-home-with-yard",
    priceCents: 275_000,
    city: "Boise",
    state: "ID",
    region: "Treasure Valley",
    categorySlug: "other-real-estate",
    categoryName: "Homes",
    condition: "used_good",
    fulfillmentMode: "local_pickup",
    createdAt: "2026-09-13T20:15:00.000Z",
    expiresAt: "2026-10-14T20:15:00.000Z",
    description:
      "Comfortable 3 bedroom, 2 bathroom home with 1,684 square feet, a two-car garage, and a fenced backyard in Boise's Warm Springs area. Available now. The kitchen opens to the living room and the primary suite has a walk-in closet. Dogs and cats are welcome with an additional deposit. No smoking. 12 month lease. Resident pays all utilities.",
    postalCode: "83712",
    sellerNote: "Please include your preferred move-in date when you message.",
    seller: sellers.sagebrush,
    home: {
      mode: "rent",
      propertyType: "Single-family home",
      bedrooms: 3,
      bathrooms: 2,
      squareFeet: 1684,
      yearBuilt: 2006,
      available: "Available now",
      pets: "Allowed with additional deposit",
      smoking: "Not allowed",
      leaseLength: "12 months",
      sellerType: "Property manager",
      utilities: [{ label: "All utilities", paidBy: "Resident" }],
      amenities: [
        "Two-car garage",
        "Fenced backyard",
        "Walk-in closet",
        "Near Warm Springs trails",
      ],
    },
    images: [
      {
        url: image("photo-1564013799919-ab600027ffc6", "Boise rental home exterior"),
        alt: "Boise rental home exterior",
      },
      {
        url: image("photo-1600566753086-00f18fb6b3ea", "Rental home kitchen"),
        alt: "Rental home kitchen",
      },
    ],
  },
  {
    id: "mock-home-sale-riverstone",
    listingNumber: "40630021",
    title: "Riverstone at Banbury | Move-In Ready Home",
    productId: "mock-product-riverstone-banbury",
    productSlug: "riverstone-at-banbury-move-in-ready-home",
    priceCents: 524_900_00,
    city: "Eagle",
    state: "ID",
    region: "Treasure Valley",
    categorySlug: "other-real-estate",
    categoryName: "Homes",
    condition: "new_with_tags",
    fulfillmentMode: "local_pickup",
    createdAt: "2026-09-12T17:45:00.000Z",
    expiresAt: "2026-10-13T17:45:00.000Z",
    description:
      "Move-in ready 3 bedroom, 2.5 bathroom home with 2,146 square feet in Eagle. Built in 2024 with an open kitchen, quartz counters, covered patio, attached 2-car garage, and a low-maintenance yard. Clean title. Seller is accepting showings and offers now.",
    postalCode: "83616",
    sellerNote: "Buyer to verify all measurements, fees, and included features.",
    seller: sellers.riverstone,
    home: {
      mode: "buy",
      propertyType: "Single-family home",
      bedrooms: 3,
      bathrooms: 2.5,
      squareFeet: 2146,
      yearBuilt: 2024,
      available: "For sale",
      sellerType: "Builder",
      community: { slug: "banbury-meadows", name: "Banbury Meadows" },
      amenities: [
        "Quartz counters",
        "Covered patio",
        "Attached 2-car garage",
        "Low-maintenance yard",
      ],
    },
    images: [
      {
        url: image("photo-1564013799919-ab600027ffc6", "Move-in ready Idaho home"),
        alt: "Move-in ready Idaho home",
      },
      {
        url: image("photo-1600607687920-4e2a09cf159d", "Open home interior"),
        alt: "Open home interior",
      },
    ],
  },
  {
    id: "mock-home-sale-north-end",
    listingNumber: "40630012",
    title: "North End Craftsman with Garden Studio",
    productId: "mock-product-north-end-craftsman",
    productSlug: "north-end-craftsman-with-garden-studio",
    priceCents: 649_000_00,
    city: "Boise",
    state: "ID",
    region: "Treasure Valley",
    categorySlug: "other-real-estate",
    categoryName: "Homes",
    condition: "used_excellent",
    fulfillmentMode: "local_pickup",
    createdAt: "2026-09-11T15:10:00.000Z",
    expiresAt: "2026-10-12T15:10:00.000Z",
    description:
      "Charming North End craftsman with 4 bedrooms, 2 bathrooms, and 1,988 square feet. The 1928 home has original character, an updated kitchen, mature landscaping, and a detached garden studio. Seller welcomes private showings and a September open house.",
    postalCode: "83702",
    sellerNote: "Open house details available by message.",
    seller: sellers.sagebrush,
    home: {
      mode: "buy",
      propertyType: "Single-family home",
      bedrooms: 4,
      bathrooms: 2,
      squareFeet: 1988,
      yearBuilt: 1928,
      available: "For sale",
      sellerType: "By owner",
      openHouse: "September 20, 2026 · 1:00–3:00 pm",
      amenities: [
        "Updated kitchen",
        "Mature landscaping",
        "Detached garden studio",
        "Original craftsman details",
      ],
    },
    images: [
      {
        url: image("photo-1600585154340-be6161a56a0c", "North End craftsman home"),
        alt: "North End craftsman home",
      },
      {
        url: image("photo-1600566753190-17f0baa2a6c3", "Craftsman home interior"),
        alt: "Craftsman home interior",
      },
    ],
  },
  {
    id: "mock-home-sale-sage-creek",
    listingNumber: "40630003",
    title: "Sage Creek Home with Mountain Views",
    productId: "mock-product-sage-creek-home",
    productSlug: "sage-creek-home-with-mountain-views",
    priceCents: 419_900_00,
    city: "Meridian",
    state: "ID",
    region: "Treasure Valley",
    categorySlug: "other-real-estate",
    categoryName: "Homes",
    condition: "new_with_tags",
    fulfillmentMode: "local_pickup",
    createdAt: "2026-09-10T19:00:00.000Z",
    expiresAt: "2026-10-11T19:00:00.000Z",
    description:
      "Nearly new 3 bedroom, 2.5 bathroom Meridian home with 1,742 square feet and views toward the foothills. Built in 2023 with a bright great room, flexible loft, covered front porch, and fenced side yard. Clean title and ready for a new owner.",
    postalCode: "83642",
    sellerNote: "All information is provided as a courtesy; buyer to verify details.",
    seller: sellers.riverstone,
    home: {
      mode: "buy",
      propertyType: "Single-family home",
      bedrooms: 3,
      bathrooms: 2.5,
      squareFeet: 1742,
      yearBuilt: 2023,
      available: "For sale",
      sellerType: "Builder",
      community: { slug: "sage-creek", name: "Sage Creek" },
      amenities: ["Bright great room", "Flexible loft", "Covered front porch", "Fenced side yard"],
    },
    images: [
      {
        url: image("photo-1605146769289-440113cc3d00", "Meridian home exterior"),
        alt: "Meridian home exterior",
      },
      {
        url: image("photo-1600607688969-a5bfcd646154", "Nearly new home bedroom"),
        alt: "Nearly new home bedroom",
      },
    ],
  },
  {
    id: "mock-home-build-banbury-meadows",
    listingNumber: "40630058",
    title: "Banbury Meadows | The Aspen Plan by Riverstone Homes",
    productId: "mock-product-banbury-meadows-aspen",
    productSlug: "banbury-meadows-aspen-plan-riverstone-homes",
    priceCents: 549_900_00,
    city: "Eagle",
    state: "ID",
    region: "Treasure Valley",
    categorySlug: "other-real-estate",
    categoryName: "Homes",
    condition: "new_with_tags",
    fulfillmentMode: "local_pickup",
    createdAt: "2026-09-16T17:30:00.000Z",
    expiresAt: "2026-10-17T17:30:00.000Z",
    description:
      "The Aspen plan from Riverstone Homes is under construction now in the Banbury Meadows community. This 4 bedroom, 2.5 bathroom home offers 2,410 square feet with a main-floor primary suite, a chef's kitchen with a walk-in pantry, and a 3-car garage. Buyers can still select flooring, counters, and paint at this stage. Estimated completion is December 2026.",
    postalCode: "83616",
    sellerNote: "Message to tour the model home or ask about remaining lots in the phase.",
    seller: sellers.riverstone,
    home: {
      mode: "build",
      propertyType: "Single-family home",
      bedrooms: 4,
      bathrooms: 2.5,
      squareFeet: 2410,
      yearBuilt: 2026,
      available: "Est. completion December 2026",
      sellerType: "Builder",
      community: { slug: "banbury-meadows", name: "Banbury Meadows" },
      schoolDistrict: "West Ada School District",
      acreage: "0.18 acres",
      heating: "Forced air, gas",
      cooling: "Central air",
      garageParking: "3-car attached garage",
      yard: "Sod front and back, sprinkler system",
      appliancesIncluded: "Range, dishwasher, microwave",
      basementType: "Crawl space",
      floorCoverings: "Luxury vinyl plank, carpet",
      exteriorMaterial: "Stucco with stone accents",
      specialFeatures: "Smart thermostat, covered patio",
      hoaFees: "$45/month",
      amenities: [
        "Main-floor primary suite",
        "Walk-in pantry",
        "3-car garage",
        "Buyer design selections available",
      ],
    },
    images: [
      {
        url: image("photo-1600585154526-990dced4db0d", "New construction home framing"),
        alt: "New construction home framing",
      },
      {
        url: image("photo-1600607687939-ce8a6c25118c", "New build kitchen rendering"),
        alt: "New build kitchen rendering",
      },
    ],
  },
  {
    id: "mock-home-build-sage-creek-cottonwood",
    listingNumber: "40630052",
    title: "Sage Creek | The Cottonwood Plan, Move-In Ready",
    productId: "mock-product-sage-creek-cottonwood",
    productSlug: "sage-creek-cottonwood-plan-move-in-ready",
    priceCents: 462_500_00,
    city: "Meridian",
    state: "ID",
    region: "Treasure Valley",
    categorySlug: "other-real-estate",
    categoryName: "Homes",
    condition: "new_with_tags",
    fulfillmentMode: "local_pickup",
    createdAt: "2026-09-15T15:00:00.000Z",
    expiresAt: "2026-10-16T15:00:00.000Z",
    description:
      "Move-in ready new build in the Sage Creek community. The Cottonwood plan has 3 bedrooms, 2 bathrooms, and 1,860 square feet with a covered patio, a flex room off the entry, and a 2-car garage. Builder warranty included. Photos are of the finished home at this address.",
    postalCode: "83642",
    sellerNote: "Sales office is open daily; ask about current builder incentives.",
    seller: sellers.riverstone,
    home: {
      mode: "build",
      propertyType: "Single-family home",
      bedrooms: 3,
      bathrooms: 2,
      squareFeet: 1860,
      yearBuilt: 2026,
      available: "Move-in ready",
      sellerType: "Builder",
      community: { slug: "sage-creek", name: "Sage Creek" },
      schoolDistrict: "West Ada School District",
      acreage: "0.14 acres",
      heating: "Forced air, gas",
      cooling: "Central air",
      garageParking: "2-car attached garage",
      yard: "Sod front yard, xeriscape backyard",
      appliancesIncluded: "Range, dishwasher, microwave",
      basementType: "Slab, no basement",
      floorCoverings: "Luxury vinyl plank, carpet",
      exteriorMaterial: "Vinyl siding with stone accents",
      specialFeatures: "Builder warranty, covered patio",
      hoaFees: "$30/month",
      amenities: ["Covered patio", "Flex room off entry", "2-car garage", "Builder warranty"],
    },
    images: [
      {
        url: image("photo-1600566753151-384129cf4e3e", "New build home exterior"),
        alt: "New build home exterior",
      },
      {
        url: image("photo-1600210492486-724fe5c67fb0", "New construction living room"),
        alt: "New construction living room",
      },
    ],
  },
  {
    id: "mock-home-build-north-bench-highlands",
    listingNumber: "40630047",
    title: "North Bench Highlands | Custom Build on Your Lot",
    productId: "mock-product-north-bench-highlands",
    productSlug: "north-bench-highlands-custom-build",
    priceCents: 612_000_00,
    city: "Boise",
    state: "ID",
    region: "Treasure Valley",
    categorySlug: "other-real-estate",
    categoryName: "Homes",
    condition: "new_with_tags",
    fulfillmentMode: "local_pickup",
    createdAt: "2026-09-14T14:20:00.000Z",
    expiresAt: "2026-10-15T14:20:00.000Z",
    description:
      "Custom build opportunity on a North Bench Highlands view lot. Riverstone Homes offers a 4 bedroom, 3 bathroom plan at 2,780 square feet with a daylight basement, a covered deck facing the foothills, and an oversized 3-car garage. Base pricing shown; final price depends on selected finishes and lot premium. Groundbreaking available for buyers who reserve this quarter.",
    postalCode: "83703",
    sellerNote: "Ask about available lots and current framing lumber pricing lock.",
    seller: sellers.riverstone,
    home: {
      mode: "build",
      propertyType: "Single-family home",
      bedrooms: 4,
      bathrooms: 3,
      squareFeet: 2780,
      yearBuilt: 2027,
      available: "Reserve now, groundbreaking this quarter",
      sellerType: "Builder",
      community: { slug: "north-bench-highlands", name: "North Bench Highlands" },
      schoolDistrict: "Boise School District",
      acreage: "0.42 acres",
      heating: "Forced air, gas (final selections pending)",
      cooling: "Central air (final selections pending)",
      garageParking: "3-car attached garage",
      yard: "Graded lot, landscaping not yet installed",
      appliancesIncluded: "Buyer selects at design center",
      basementType: "Daylight basement",
      floorCoverings: "Buyer selects at design center",
      exteriorMaterial: "Board-and-batten siding with stone accents",
      specialFeatures: "View lot, custom design center selections",
      hoaFees: "$0",
      amenities: [
        "Daylight basement",
        "Covered deck with foothill views",
        "Oversized 3-car garage",
        "Custom finish selections",
      ],
    },
    images: [
      {
        url: image("photo-1600047509807-ba8f99d2cdde", "Foothill view building lot"),
        alt: "Foothill view building lot",
      },
      {
        url: image("photo-1600585154340-be6161a56a0c", "Custom home exterior rendering"),
        alt: "Custom home exterior rendering",
      },
    ],
  },
];
