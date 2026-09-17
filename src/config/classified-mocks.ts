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
];
