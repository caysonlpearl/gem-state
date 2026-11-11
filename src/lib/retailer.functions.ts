import { createServerFn } from "@tanstack/react-start";
import { gunsComProfile } from "@/config/retailers";

export const getPublicRetailer = createServerFn({ method: "GET" })
  .validator((input: { slug: string; page?: number }) => ({
    slug: String(input?.slug ?? ""),
    page: Math.max(1, Math.floor(Number(input?.page) || 1)),
  }))
  .handler(async ({ data }) => {
    if (data.slug !== gunsComProfile.slug) return null;
    const { merchandiseCards } = await import("./avantlink-listings.server");
    const { shortCache, PUBLIC_PAGE_CACHE_MS } = await import("./short-cache.server");
    const result = await shortCache("retailer-guns-com-catalog", PUBLIC_PAGE_CACHE_MS, () =>
      merchandiseCards({ sort: "newest" }),
    );
    const pageCount = Math.max(1, Math.ceil(result.cards.length / 24));
    const page = Math.min(data.page, pageCount);
    return {
      ...gunsComProfile,
      page,
      pageCount,
      listingCount: result.cards.length,
      listings: result.cards.slice((page - 1) * 24, page * 24),
    };
  });
