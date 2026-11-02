import { seoPrewarmTargets } from "./seo-collections";
import { pendingSeoPageRefreshes } from "./seo-page-cache.server";

export async function prewarmSeoPages(now = Date.now()) {
  const { getPlacePage } = await import("./place-pages.functions");
  const targets = seoPrewarmTargets(now);
  const results = await Promise.allSettled(targets.map((data) => getPlacePage({ data })));
  await Promise.allSettled(pendingSeoPageRefreshes());
  return {
    checked: targets.length,
    available: results.filter((result) => result.status === "fulfilled" && result.value).length,
  };
}
