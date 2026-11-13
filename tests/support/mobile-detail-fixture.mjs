import { normalizeMarketCheckListing } from "../../src/lib/marketcheck-contract.ts";
import { mobileListingDetail } from "../../src/lib/mobile-listing-detail.ts";
export const detailActors = {
  buyer: "11111111-1111-4111-8111-111111111111",
  seller: "22222222-2222-4222-8222-222222222222",
};
const base = (n, category, title) => ({
  id: `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  productId: `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  variantId: `50000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  productSlug: "fixture",
  title,
  categorySlug: category,
  categoryName: category,
  priceCents: 42000,
  currency: "USD",
  city: "Boise",
  state: "ID",
  region: "Treasure Valley",
  condition: "used",
  fulfillmentMode: "local_pickup",
  createdAt: "2026-11-12T15:00:00Z",
  expiresAt: "2027-01-12T15:00:00Z",
  imageUrl: "https://fixture.images.invalid/photo.jpg",
  images: [
    { url: "https://fixture.images.invalid/photo.jpg", alt: title },
    { url: "https://fixture.images.invalid/second.jpg", alt: "Second photo" },
  ],
  vehicle: null,
  isFeatured: false,
  description: "A detailed fixture description for the listing. " + "Public details. ".repeat(65),
  postalCode: "83702",
  sellerNote: "Please confirm availability.",
  seller: {
    userId: detailActors.seller,
    slug: "fixture-seller",
    displayName: "Fixture seller",
    bio: "A local fixture seller",
    avatarUrl: null,
    payoutVerified: false,
    managedByBluebird: false,
    ratingAverage: 4.8,
    reviewCount: 3,
    memberSince: 2022,
    contactPhone: "208-555-0100",
    contactTextPhone: "208-555-0100",
    contactEmail: "seller@example.invalid",
    allowInternalMessages: true,
  },
  itemDetails: {},
  privateFutureField: "PRIVATE NEVER EXPORT",
});
export function detailFixture() {
  const general = base(1, "home-garden", "Garden patio table");
  general.itemDetails = { itemType: "Patio furniture", brand: "Fixture brand" };
  const vehicle = base(2, "cars-trucks", "2024 Ford F-150");
  vehicle.priceCents = 3590000;
  vehicle.vehicle = {
    year: 2024,
    make: "Ford",
    model: "F-150",
    trim: "XLT",
    mileage: 42000,
    bodyStyle: "Pickup",
    transmission: "Automatic",
    drivetrain: "4WD",
    fuelType: "Gasoline",
    exteriorColor: "Blue",
    titleStatus: "Clean",
    vin: "1FTFW1E50PFA00000",
  };
  vehicle.dealer = {
    slug: "fixture-dealer",
    displayName: "Fixture Motors",
    logoUrl: null,
    city: "Boise",
    state: "ID",
    website: "https://dealer.example.invalid",
    address: "100 Public Main St",
    postalCode: "83702",
  };
  const rent = base(3, "other-real-estate", "Sunny two-bedroom apartment");
  rent.priceCents = 180000;
  rent.home = {
    mode: "rent",
    propertyType: "Apartment",
    bedrooms: 2,
    bathrooms: 1,
    squareFeet: 900,
    available: "Available now",
    pets: "Cats allowed",
    leaseLength: "12 months",
    utilities: [{ label: "Water", paidBy: "Landlord" }],
    amenities: ["Dishwasher", "Air conditioning"],
    garageParking: "One assigned space",
  };
  const buy = base(4, "other-real-estate", "House with a garden");
  buy.priceCents = 41000000;
  buy.home = {
    mode: "buy",
    propertyType: "House",
    bedrooms: 3,
    bathrooms: 2,
    squareFeet: 1700,
    yearBuilt: 2007,
    acres: 0.2,
    heating: "Forced air",
    cooling: "Central air",
    hoaFees: "$30/month",
    priceHistory: [{ label: "Listed", amount: 410000, date: "2026-11-10" }],
    taxHistory: [{ date: "2025", amount: 2500, value: 390000 }],
  };
  const job = base(5, "jobs", "Community support specialist");
  job.priceCents = 0;
  job.job = {
    employerName: "Fixture Employer",
    employerAddress: "Boise, ID",
    payType: "Hourly",
    payMin: 22,
    payMax: 27,
    employmentType: "Full-time",
    jobSummary: "Help local customers with their questions.",
    responsibilities: ["Answer customer questions"],
    qualifications: ["Customer support experience"],
    applicationMethod: "gemlist",
  };
  const partnerJob = base(6, "jobs", "Partner customer support role");
  partnerJob.id = "adzuna-123456789";
  partnerJob.seller = null;
  partnerJob.job = {
    ...job.job,
    applicationMethod: "external",
    applicationExternalContact: "https://employer.example.invalid/apply",
  };
  partnerJob.externalJob = {
    source: "Adzuna",
    url: "https://employer.example.invalid/apply",
    logoUrl: "https://fixture.images.invalid/logo.png",
  };
  const service = base(7, "services", "Fixture Plumbing");
  service.id = "fsq-aaaaaaaaaaaaaaaaaaaaaaaa";
  service.priceCents = 0;
  service.seller = null;
  service.directory = {
    source: "Foursquare",
    claimed: false,
    logoUrl: null,
    phone: "208-555-0100",
    website: "https://business.example.invalid",
    email: null,
    trades: ["Plumbing"],
    rating: 4.6,
    reviewCount: 5,
    googleUrl: "https://maps.google.com",
    hours: [{ day: "Monday", hours: "9:00–17:00" }],
    address: "100 Public Main St",
  };
  service.service = {
    subcategory: "Plumbing",
    pricing: "Contact for a quote",
    serviceArea: "Boise",
    availability: "Weekdays",
    serviceSummary: "A fixture plumbing service.",
    offerings: ["Repairs", "Installations"],
    businessAddress: "100 Public Main St",
    licenseNumber: "FIXTURE-123",
    licenseLookupUrl: "https://license.example.invalid",
    reviews: [
      {
        author: "Fixture reviewer",
        rating: 5,
        date: "2026-11-01",
        title: "Helpful service",
        body: "A public fixture review.",
      },
    ],
  };
  const memberService = base(10, "services", "Handy repair service");
  memberService.priceCents = 0;
  memberService.service = { ...service.service };
  const pet = base(8, "pets", "Luna the dog");
  pet.priceCents = 25000;
  pet.pet = {
    subcategory: "Dogs",
    species: "Dog",
    breed: "Mixed",
    name: "Luna",
    age: "2 years",
    sex: "Female",
    placementType: "adoption",
    offeredBy: "Rescue",
    hypoallergenic: null,
    vaccinated: "Yes",
    spayedNeutered: "Yes",
    microchipped: "Yes",
    recordsAvailable: "Yes",
    goodWithKids: "Yes",
    goodWithDogs: "Yes",
    goodWithCats: "Unknown",
    indoorOutdoor: "Indoors",
    specialNeeds: null,
    breedingTerms: null,
  };
  const ended = {
    ...base(9, "general", "Expired fixture item"),
    ended: { reason: "expired", endedAt: "2026-11-12" },
    expiresAt: "2026-11-12T12:00:00Z",
  };
  const partnerHome = {
    ...base(11, "other-real-estate", "Partner apartment with agent contact"),
    priceCents: 190000,
    home: { ...rent.home, bedrooms: 0 },
    seller: null,
    externalHome: {
      source: "OpenWeb Ninja",
      sourceUrl: "https://housing.example.invalid/listing",
      address: "100 Public Main St, Boise, ID",
      latitude: 43.6,
      longitude: -116.2,
      schools: ["Fixture School"],
      listedBy: {
        agentName: "Fixture Agent",
        agentPhone: "208-555-0100",
        brokerName: "Fixture Realty",
        brokerPhone: null,
        mlsName: "Fixture MLS",
      },
    },
  };
  partnerHome.id = "openwebninja-redfin-12345";
  const rescue = {
    ...base(12, "pets", "Rescue dog Luna"),
    seller: null,
    pet: { ...pet.pet },
    externalPet: {
      sourceUrl: "https://rescue.example.invalid/adopt",
      orgName: "Fixture Rescue",
      orgPhone: "208-555-0100",
      orgEmail: "rescue@example.invalid",
      size: "Medium",
    },
  };
  rescue.id = "rescuegroups-12345";
  const build = {
    ...base(13, "other-real-estate", "New home community"),
    priceCents: 48000000,
    home: {
      mode: "build",
      propertyType: "House",
      bedrooms: 3,
      bathrooms: 2,
      squareFeet: 1900,
      community: { slug: "fixture-community", name: "Fixture Community" },
    },
    communityListings: [rent],
    communityFloorplans: [
      {
        name: "Fixture floorplan",
        bedrooms: 3,
        bathrooms: 2,
        squareFeet: 1900,
        image: "https://fixture.images.invalid/plan.jpg",
        builderUrl: "https://builder.example.invalid/plan",
      },
    ],
  };
  const externalVehicle = {
    ...base(14, "cars-trucks", "2024 Ford F-150 XLT"),
    seller: null,
    vehicle: { ...vehicle.vehicle },
    priceCents: 3590000,
  };
  externalVehicle.externalVehicle = normalizeMarketCheckListing(
    {
      id: "fixture-car",
      heading: externalVehicle.title,
      price: 35900,
      miles: 42000,
      vin: vehicle.vehicle.vin,
      build: { year: 2024, make: "Ford", model: "F-150", trim: "XLT", transmission: "Automatic" },
      dealer: {
        name: "Public fixture dealership",
        phone: "208-555-0100",
        website: "https://dealer.example.invalid",
        city: "Boise",
        state: "ID",
      },
      vdp_url: "https://dealer.example.invalid/car",
      media: { photo_links: ["https://fixture.images.invalid/car.jpg"] },
      extra: { features: ["Blind spot monitor"] },
    },
    "dealer",
  );
  externalVehicle.id = externalVehicle.externalVehicle.id;
  return Object.fromEntries(
    Object.entries({
      general,
      vehicle,
      rent,
      buy,
      job,
      partnerJob,
      service,
      memberService,
      pet,
      ended,
      partnerHome,
      rescue,
      build,
      externalVehicle,
    }).map(([name, raw]) => [
      name,
      {
        raw,
        listing: mobileListingDetail(raw),
        stats: { views: 12, favorites: 3 },
        canSave: name !== "ended",
        canMessage: !!raw.seller && !raw.ended,
      },
    ]),
  );
}
