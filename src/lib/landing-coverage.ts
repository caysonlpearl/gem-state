import type { ClassifiedBrowseInput } from "./classifieds.functions";
import type { ListingCardSummary } from "./listing-card-summary";
import {
  classifiedShowcaseRows,
  firearmShowcaseRows,
  jobsShowcaseRows,
  petShowcaseRows,
  vehicleShowcaseRows,
} from "../config/landing-preview-rows.ts";
import { servicesShowcaseRows } from "../config/landing-service-rows.ts";
import { homeRowFilters } from "./landing-home-filters.ts";
import { landingCards } from "./landing-card-pool.ts";

export const landingPreviewInputs = [
  ...classifiedShowcaseRows,
  ...vehicleShowcaseRows,
  ...jobsShowcaseRows,
  ...servicesShowcaseRows,
  ...petShowcaseRows,
  ...firearmShowcaseRows,
].map((row): ClassifiedBrowseInput => {
  const params = Object.fromEntries(new URL(row.href, "https://onbluebird.com").searchParams);
  // Mirror the existing URL-to-search mapping for these fixed row links.
  const { jobType, ...input } = params;
  return {
    ...input,
    ...(jobType ? { jobEmploymentType: jobType } : {}),
    ...Object.fromEntries(
      ["priceMin", "priceMax", "yearMin", "yearMax", "mileageMax"].flatMap((key) =>
        params[key] == null ? [] : [[key, Number(params[key])]],
      ),
    ),
  } as ClassifiedBrowseInput;
});

/** Reserve each row's matches BEFORE any global cap. A busy source/category
 * must not crowd older, cheaper or less common matches out of the preview.
 * Runs only when rebuilding saved data; never starts provider requests. */
export function selectLandingCoverage<T extends ListingCardSummary>(
  cards: readonly T[],
  fillLimit: number,
): T[] {
  const unique = [...new Map(cards.map((card) => [card.id, card])).values()];
  const byId = new Map(unique.map((card) => [card.id, card]));
  const selected = new Map<string, T>();
  const add = (card: ListingCardSummary) => selected.set(card.id, byId.get(card.id)!);
  for (const input of landingPreviewInputs) {
    landingCards(unique, input).slice(0, 12).forEach(add);
    // Preserve Idaho matches as well as regional results for entry links.
    if (!input.state)
      landingCards(unique, { ...input, state: "ID" })
        .slice(0, 12)
        .forEach(add);
  }
  for (const matches of Object.values(homeRowFilters)) {
    unique.filter(matches).slice(0, 12).forEach(add);
    unique
      .filter((card) => card.state === "ID" && matches(card))
      .slice(0, 12)
      .forEach(add);
  }

  // Round-robin the remaining category/type groups rather than slice an
  // ordered feed, which could otherwise eliminate the last groups entirely.
  const groups = new Map<string, T[]>();
  for (const card of unique) {
    const key = [
      card.categorySlug,
      card.state,
      card.home?.mode,
      card.job?.category,
      card.service?.subcategory,
      card.pet?.subcategory,
      card.vehicle?.bodyStyle,
      ...Object.values(card.itemDetails ?? {}),
    ]
      .filter(Boolean)
      .join("/");
    const group = groups.get(key) ?? [];
    group.push(card);
    groups.set(key, group);
  }
  const queues = [...groups.values()];
  for (let index = 0; selected.size < fillLimit && index < unique.length; index++) {
    let added = false;
    for (const queue of queues) {
      const card = queue[index];
      if (!card) continue;
      added = true;
      if (selected.size < fillLimit) add(card);
    }
    if (!added) break;
  }
  return [...selected.values()];
}
