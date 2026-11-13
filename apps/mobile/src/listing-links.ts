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
  if (to === "/sellers/$slug")
    return /^[a-z0-9-]{1,60}$/i.test(params.slug ?? "")
      ? browseDestination({ sellerSlug: params.slug })
      : null;
  if (to === "/dealers/$slug")
    return /^[a-z0-9-]{1,80}$/i.test(params.slug ?? "")
      ? browseDestination({
          dealerSlug: params.slug,
          category: "cars-trucks",
          vehicleMode: "results",
        })
      : null;
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
