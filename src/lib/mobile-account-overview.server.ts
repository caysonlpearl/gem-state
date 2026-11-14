/* eslint-disable @typescript-eslint/no-explicit-any -- private owner-scoped, closed database projections */
import { MobileApiError } from "./mobile-api.ts";
import { mobileListingAllowed } from "./mobile-contract.ts";
import { sellerListingState } from "./seller-listing-state.ts";

export type MobileAccountOverview = {
  ownerId: string;
  watchlistCount: number;
  activeListings: number;
  pendingListings: number;
  completedSalesCount: number;
};
const unavailable = () =>
  new MobileApiError(
    503,
    "overview_unavailable",
    "Your account overview could not be loaded. Please retry.",
  );
const productColumns = "name,description,status,categories!inner(slug)";
/** No provider reads, photo signing, maintenance writes, private content or payment details leave this adapter. */
export async function loadMobileAccountOverview(
  client: any,
  ownerId: string,
): Promise<MobileAccountOverview> {
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]);
  const load = async (table: "asks" | "orders" | "watchlist") => {
    const watchlist = table === "watchlist";
    const fields = watchlist
      ? `user_id,variant_id,product_variants!inner(products!inner(${productColumns}))`
      : table === "asks"
        ? `id,seller_id,status,approved_at,sold_at,is_demo,products!inner(${productColumns})`
        : `id,seller_id,status,is_demo,products!inner(${productColumns})`;
    const rows: any[] = [];
    const seen = new Set<string>();
    let expected: number | undefined;
    for (let offset = 0; offset < 5000; offset += 500) {
      signal.throwIfAborted();
      let query = client
        .from(table)
        .select(fields, { count: "exact" })
        .eq(watchlist ? "user_id" : "seller_id", ownerId);
      if (!watchlist) query = query.eq("is_demo", false);
      if (table === "orders") query = query.eq("status", "completed");
      const result = await query
        .order(watchlist ? "variant_id" : "id")
        .range(offset, offset + 499)
        .abortSignal(signal)
        .retry(false);
      signal.throwIfAborted();
      if (
        result.error !== null ||
        !Array.isArray(result.data) ||
        !Number.isSafeInteger(result.count) ||
        result.count < 0 ||
        result.count > 5000 ||
        (expected !== undefined && expected !== result.count)
      )
        throw unavailable();
      const count = result.count as number;
      expected = count;
      for (const row of result.data) {
        if (!row || row[watchlist ? "user_id" : "seller_id"] !== ownerId) throw unavailable();
        const id = row[watchlist ? "variant_id" : "id"];
        if (typeof id !== "string" || !id || seen.has(id)) throw unavailable();
        seen.add(id);
        rows.push(row);
      }
      if (rows.length > count) throw unavailable();
      if (rows.length === count) return rows;
      // A provider row cap or concurrent deletion is an incomplete read, not zero activity.
      if (result.data.length !== 500) throw unavailable();
    }
    throw unavailable();
  };
  try {
    const pending = [load("asks"), load("orders"), load("watchlist")].map((work) =>
      work.catch((error) => {
        controller.abort();
        throw error;
      }),
    );
    const results = await Promise.allSettled(pending);
    if (results.some((r) => r.status === "rejected")) throw unavailable();
    const [asks, orders, watchlist] = results.map((r) => (r.status === "fulfilled" ? r.value : []));
    const allowed = (row: any, saved = false) => {
      const product = saved ? row.product_variants?.products : row.products;
      return (
        (saved || row.is_demo === false) &&
        mobileListingAllowed({
          categorySlug: product?.categories?.slug,
          title: product?.name,
          description: product?.description,
        })
      );
    };
    const states = asks
      .filter((row) => allowed(row))
      .map((row) =>
        sellerListingState({
          status: row.status,
          approvedAt: row.approved_at,
          soldAt: row.sold_at,
          productStatus: row.products?.status,
        }),
      );
    return {
      ownerId,
      watchlistCount: watchlist.filter((row) => allowed(row, true)).length,
      activeListings: states.filter((state) => state.group === "active").length,
      pendingListings: states.filter((state) => state.group === "pending").length,
      completedSalesCount: orders.filter((row) => row.status === "completed" && allowed(row))
        .length,
    };
  } catch {
    throw unavailable();
  }
}
