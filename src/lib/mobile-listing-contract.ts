import { mobileListingAllowed } from "./mobile-contract";
import { vehicleForRpc } from "./classified-listing-rpc";
import { z } from "zod";
import { classifiedListingSchema } from "./classified-listing-contracts";
import { normalizeClassifiedItemDetails } from "../config/classified-item-fields";

const parcel = z.number().finite().positive().max(10000).nullable().optional();
const extras = z.object({
  parcelLengthIn: parcel,
  parcelWidthIn: parcel,
  parcelHeightIn: parcel,
  parcelWeightLb: parcel,
  publicMediaPaths: z.array(z.string().min(1).max(1000)).max(8).default([]),
});
const allowed = new Set([
  "title",
  "description",
  "category",
  "condition",
  "priceCents",
  "state",
  "region",
  "city",
  "postalCode",
  "fulfillmentMode",
  "sellerNote",
  "itemDetails",
  "vehicle",
  "home",
  "job",
  "service",
  "pet",
  "parcelLengthIn",
  "parcelWidthIn",
  "parcelHeightIn",
  "parcelWeightLb",
  "publicMediaPaths",
]);
export const mobileListingActionSchema = z
  .object({
    action: z.enum(["edit", "archive", "relist"]),
    version: z.string().regex(/^[0-9a-f]{64}$/),
    input: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
/** Match the website's validation and SQL compatibility mapping. Never forward caller identity. */
export function mobileListingEditInput(value: Record<string, unknown>, ownerId: string) {
  if (Object.keys(value).some((key) => !allowed.has(key)))
    throw Error("Check the listing details.");
  const parsed = classifiedListingSchema.parse(value),
    extra = extras.parse(value);
  if (
    !mobileListingAllowed({
      categorySlug: parsed.category,
      title: parsed.title,
      description: parsed.description,
    })
  )
    throw Error("This listing is not supported in the app.");
  const paths = extra.publicMediaPaths;
  if (
    new Set(paths).size !== paths.length ||
    paths.some(
      (p) =>
        !p.startsWith(ownerId + "/") ||
        p.includes("..") ||
        p.includes("\\") ||
        [...p].some((char) => char.charCodeAt(0) < 32),
    )
  )
    throw Error("Choose your own listing photos.");
  return {
    ...parsed,
    ...extra,
    itemDetails: normalizeClassifiedItemDetails(parsed.category, parsed.itemDetails),
    vehicle: vehicleForRpc(parsed.vehicle),
    home: parsed.home ?? {},
    job: parsed.job ?? {},
    service: parsed.service ?? {},
    pet: parsed.pet ?? {},
    parcelLengthIn: extra.parcelLengthIn ?? null,
    parcelWidthIn: extra.parcelWidthIn ?? null,
    parcelHeightIn: extra.parcelHeightIn ?? null,
    parcelWeightLb: extra.parcelWeightLb ?? null,
  };
}
