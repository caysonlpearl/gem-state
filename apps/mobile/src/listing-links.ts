import { storefrontDestination } from "../../../src/lib/storefront-url.ts";
import { listingIdFromParam } from "../../../src/lib/listing-url.ts";
import { mobileCategoryAllowed } from "../../../src/lib/mobile-contract.ts";
import {
  categoryFromUrlSlug,
  isKnownPlacePage,
  makeFromSlug,
  modelFromSlug,
  placeFromSlug,
} from "../../../src/lib/place-pages.ts";
import { placeInventoryFilters } from "../../../src/lib/seo-policy.ts";
import { browseDestination } from "./browse-state.ts";
/** Explicit internal routing keeps seller/category journeys inside the eligible app catalog. */
export function nativeListingDestination(
  to: string,
  params: Record<string, string> = {},
  search: Record<string, unknown> = {},
) {
  if (to === "/") return "/";
  if (to === "/browse") return browseDestination(search);
  if (to === "/auth") return "/auth";
  if (to === "/create-listing") return "/post";
  if (to === "/sellers/$slug" || to === "/dealers/$slug")
    return storefrontDestination(to.replace("$slug", params.slug ?? ""), search);
  if (/^\/(sellers|dealers)\//i.test(to)) return storefrontDestination(to, search);
  if (to === "/account") {
    if (search.section === "messages")
      return typeof search.conversation === "string" && /^[0-9a-f-]{36}$/i.test(search.conversation)
        ? `/messages/${search.conversation}`
        : "/messages";
    return ["profile", "settings", "searches", "notifications"].includes(String(search.section))
      ? `/account/${search.section}`
      : Object.keys(search).length
        ? null
        : "/account/profile";
  }
  const listing = /^\/listings\/([a-z0-9][a-z0-9._:-]{0,279})$/i.exec(to);
  if (listing) {
    const id = listingIdFromParam(listing[1]);
    return !id.startsWith("avantlink-") ? `/listings/${id}` : null;
  }
  const car = /^\/cars\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?$/.exec(to);
  if (car) {
    const make = makeFromSlug(car[1]),
      model = make && car[2] ? modelFromSlug(make, car[2]) : undefined;
    return make && (!car[2] || model)
      ? browseDestination({ category: "cars-trucks", make, model, vehicleMode: "results" })
      : null;
  }
  const nearby = /^\/idaho(?:\/([a-z0-9-]+))?(?:\/([a-z0-9-]+))?$/.exec(to);
  if (nearby) {
    const place = placeFromSlug(nearby[1] ?? "");
    const category = categoryFromUrlSlug(nearby[2] ?? (place ? "" : nearby[1]) ?? "");
    return isKnownPlacePage(nearby[1] ?? "", nearby[2]) &&
      (!category || mobileCategoryAllowed(category.slug))
      ? browseDestination({
          ...placeInventoryFilters(place, category?.slug),
          ...category?.collection?.filters,
          vehicleMode: "results",
          homeMode: "results",
          jobMode: "results",
          serviceMode: "results",
          petMode: "results",
        })
      : null;
  }
  return null;
}
