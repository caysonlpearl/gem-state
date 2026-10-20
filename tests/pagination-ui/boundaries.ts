/** Test-only server boundaries. No database clients, providers, fetches or credentials. */
import type {
  ClassifiedBrowseInput,
  ClassifiedBrowseResult,
  ClassifiedCard,
} from "../../src/lib/classifieds.functions";
import imageUrl from "../fixtures/bluebird-sofa.svg?url";

const calls: number[] = [];
const waiting = new Map<number, () => void>();
let repeatedResponseSent = false;

export const fixture = {
  calls,
  pending: () => [...waiting.keys()],
  release(page: number) {
    const resolve = waiting.get(page);
    if (!resolve) throw new Error(`No pending fixture page ${page}`);
    waiting.delete(page);
    resolve();
  },
};
Object.assign(window, { __bluebirdPaginationFixture: fixture });

export async function browseClassifieds({
  data,
}: {
  data: ClassifiedBrowseInput;
}): Promise<ClassifiedBrowseResult> {
  const requestedPage = data.page ?? 1;
  calls.push(requestedPage);
  if (requestedPage === 2 || requestedPage === 3) {
    await new Promise<void>((resolve) => waiting.set(requestedPage, resolve));
  }
  const page =
    data.q === "repeat" && requestedPage === 2 && !repeatedResponseSent
      ? ((repeatedResponseSent = true), 1)
      : requestedPage;
  const total = requestedPage >= 50 ? 1201 : 53;
  const offset = (page - 1) * 24;
  const listings = Array.from(
    { length: Math.max(0, Math.min(24, total - offset)) },
    (_, index): ClassifiedCard => {
      const id = offset + index + 1;
      return {
        id: `fixture-${id}`,
        productId: `fixture-product-${id}`,
        productSlug: `fixture-listing-${id}`,
        title: `Fixture listing ${id}`,
        city: "Boise",
        state: "ID",
        region: "Treasure Valley",
        postalCode: "83702",
        priceCents: 2500,
        currency: "USD",
        categorySlug: "furniture",
        categoryName: "Furniture",
        condition: "used_good",
        fulfillmentMode: "local_pickup",
        createdAt: "2026-10-20T00:00:00Z",
        isFeatured: false,
        isMock: true,
        imageUrl,
        vehicle: null,
      };
    },
  );
  return { listings, total, page, pageSize: 24, limitedResults: data.q === "limited" };
}

export const useServerFn = <T>(fn: T) => fn;
export const trackEvent = async () => {};
export const traceMutation = async <T>(_props: unknown, action: () => Promise<T>) => action();
export const getServiceTradeCounts = async () => ({});
export const createSavedSearch = async () => {
  throw new Error("Saving searches is outside the offline pagination fixture");
};
export const updateSavedSearch = createSavedSearch;
