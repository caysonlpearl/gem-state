/** Offline data/auth boundaries. No provider, database, credential or fetch. */
import type {
  ClassifiedBrowseInput,
  ClassifiedBrowseResult,
  ClassifiedCard,
} from "../../src/lib/classifieds.functions";
import { productionHomeLead } from "virtual:production-home-query";

const mode = new URLSearchParams(location.search).get("fixture") ?? "success";
const allocation = mode.startsWith("allocation");
const paginated = mode === "allocation-pagination" || mode === "allocation-inflight";
const calls: ClassifiedBrowseInput[] = [];
const feedCalls: number[] = [];
const feedWaiting = new Map<number, () => void>();
let release: (() => void) | undefined;
let attempts = 0;
const make = (id: string, categorySlug: string): ClassifiedCard => ({
  id,
  productId: id,
  productSlug: id,
  title: id.replaceAll("-", " "),
  city: "Boise",
  state: "ID",
  region: "Treasure Valley",
  postalCode: "83702",
  priceCents: 2500000,
  currency: "USD",
  categorySlug,
  categoryName: categorySlug === "cars-trucks" ? "Cars & Trucks" : categorySlug,
  condition: "used_good",
  fulfillmentMode: "local_pickup",
  createdAt: "2026-10-20T00:00:00Z",
  isFeatured: false,
  isMock: true,
  imageUrl: "/category-icons/cars-trucks.webp",
  vehicle:
    categorySlug === "cars-trucks"
      ? {
          year: 2022,
          make: "Example",
          model: "Synthetic",
          trim: null,
          mileage: 10000,
          bodyStyle: allocation ? "Sedan" : "Pickup",
          transmission: null,
          drivetrain: null,
          fuelType: null,
          exteriorColor: null,
          titleStatus: null,
          vin: null,
        }
      : null,
});
// More than a full newer Motors page precedes the cars. Client-side filtering
// after a broad page would leave the featured row empty or filled with noise.
const noise = Array.from({ length: 40 }, (_, i) =>
  make(`Synthetic-noise-${i}`, i % 2 ? "trailers" : "auto-parts"),
);
const cars =
  mode === "empty"
    ? []
    : Array.from({ length: allocation ? (paginated ? 72 : 24) : 6 }, (_, i) =>
        make(`Synthetic-car-${i + 1}`, "cars-trucks"),
      );
const rows = allocation
  ? cars
  : [...noise, ...cars, { ...make("Synthetic-far-car", "cars-trucks"), state: "UT" }];
const categoryData = {
  totalActive: rows.length,
  categoryCounts: {
    "cars-trucks": cars.length,
    "auto-parts": allocation ? 0 : 20,
    trailers: allocation ? 0 : 20,
  },
};
const cache = new Map<string, Promise<unknown>>();
const shortCache = <T>(key: string, _ttl: number, load: () => Promise<T>): Promise<T> => {
  if (cache.has(key)) return cache.get(key) as Promise<T>;
  const pending = load();
  cache.set(key, pending);
  pending.catch(() => cache.delete(key));
  return pending;
};
async function runBrowseClassifieds(input: ClassifiedBrowseInput): Promise<ClassifiedBrowseResult> {
  calls.push(input);
  attempts++;
  if ((mode === "loading" || allocation) && attempts === 1)
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  if (mode === "error" && attempts === 1) throw new Error("Synthetic offline request failure");
  const matching = rows.filter(
    (row) => (!input.category || row.categorySlug === input.category) && row.state === input.state,
  );
  return { listings: matching.slice(0, 24), total: matching.length, page: 1, pageSize: 24 };
}
export const fixture = {
  calls,
  feedCalls,
  pendingFeedPages: () => [...feedWaiting.keys()],
  releaseFeedPage(page: number) {
    const resolve = feedWaiting.get(page);
    if (!resolve) throw new Error(`No pending feed page ${page}`);
    feedWaiting.delete(page);
    resolve();
  },
  release() {
    if (!release) throw new Error("Nothing pending");
    release();
  },
};
Object.assign(window, { __bluebirdHomepageFixture: fixture });
export const getClassifiedsHomeLead = () =>
  productionHomeLead({
    shortCache,
    PUBLIC_PAGE_CACHE_MS: 60000,
    runBrowseClassifieds,
    loadClassifiedsHomeCategoryData: async () => categoryData,
  });
// The secondary homepage feeds can be warm while the independent lead query
// loads or fails. Keep their data synthetic and their wider Motors pool intact.
export const getClassifiedsHome = async () => ({
  ...categoryData,
  motors: allocation ? cars.slice(0, 24) : [...noise.slice(0, 2), ...cars],
  recent: allocation ? cars.slice(0, 24) : [...noise.slice(0, 2), ...cars],
});
export const browseClassifieds = async ({
  data,
}: {
  data: ClassifiedBrowseInput;
}): Promise<ClassifiedBrowseResult> => {
  if (!paginated) throw new Error("Offline fixture refuses live browse requests");
  const page = data.page ?? 1;
  feedCalls.push(page);
  if (mode === "allocation-inflight" && page === 2)
    await new Promise<void>((resolve) => feedWaiting.set(page, resolve));
  return {
    listings: cars.slice((page - 1) * 24, page * 24),
    total: cars.length,
    page,
    pageSize: 24,
  };
};
export const useServerFn = <T>(fn: T) => fn;
export const trackEvent = async () => {};
export const useAuth = () => ({ isSignedIn: false });
export const getMyAccount = async () => null;
export const getMyNotifications = async () => [];
export const getMyConversations = async () => [];
export const NotificationBell = () => null;
export const loadSupabase = async () => {
  throw new Error("Offline fixture refuses database access");
};
