declare module "virtual:production-canonical" {
  export function CanonicalTags(): import("react").ReactNode;
}
declare module "virtual:production-home-query" {
  export function productionHomeLead(deps: {
    shortCache: <T>(key: string, ttl: number, load: () => Promise<T>) => Promise<T>;
    PUBLIC_PAGE_CACHE_MS: number;
    runBrowseClassifieds: (
      input: import("../../src/lib/classifieds.functions").ClassifiedBrowseInput,
    ) => Promise<import("../../src/lib/classifieds.functions").ClassifiedBrowseResult>;
    loadClassifiedsHomeCategoryData: () => Promise<{
      totalActive: number;
      categoryCounts: Record<string, number>;
    }>;
  }): Promise<import("../../src/lib/classifieds.functions").ClassifiedsHomeLead>;
}
