import { z } from "zod";

import { classifiedCategories, vehicleOptions } from "@/config/classifieds";

type NonEmpty = [string, ...string[]];
const categorySlugs = classifiedCategories.map((category) => category.slug) as NonEmpty;
const bodyStyles = [...vehicleOptions.bodyStyles] as NonEmpty;
const transmissions = [...vehicleOptions.transmissions] as NonEmpty;
const drivetrains = [...vehicleOptions.drivetrains] as NonEmpty;
const fuelTypes = [...vehicleOptions.fuelTypes] as NonEmpty;
const titleStatuses = [...vehicleOptions.titleStatuses] as NonEmpty;

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export const classifiedListingSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(20).max(5000),
    category: z.enum(categorySlugs),
    condition: z.enum(["new_with_tags", "new_without_tags", "used_excellent", "used_good"]),
    priceCents: z.number().int().min(100).max(50_000_000),
    state: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/),
    region: z.string().trim().min(2).max(80),
    city: z.string().trim().min(2).max(80),
    postalCode: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(/^\d{5}$/)
        .optional(),
    ),
    fulfillmentMode: z.enum(["local_pickup", "shipping", "both"]),
    sellerNote: z.string().trim().max(500).optional(),
    vehicle: z
      .object({
        make: z.string().trim().min(1).max(80),
        model: z.string().trim().min(1).max(80),
        year: z.number().int().min(1900).max(2100),
        trim: z.string().trim().max(80).optional(),
        mileage: z.number().int().min(0).max(2_000_000),
        bodyStyle: z.enum(bodyStyles),
        transmission: z.enum(transmissions),
        drivetrain: z.enum(drivetrains),
        fuelType: z.enum(fuelTypes),
        exteriorColor: z.string().trim().max(50).optional(),
        titleStatus: z.enum(titleStatuses),
        vin: z.preprocess(
          emptyToUndefined,
          z
            .string()
            .trim()
            .toUpperCase()
            .regex(/^[A-HJ-NPR-Z0-9]{17}$/)
            .optional(),
        ),
      })
      .optional(),
  })
  .superRefine((listing, context) => {
    const automotive = classifiedCategories.some(
      (category) => category.slug === listing.category && category.group === "motors",
    );
    if (automotive && !listing.vehicle) {
      context.addIssue({
        code: "custom",
        path: ["vehicle"],
        message: "Vehicle details are required for motor listings.",
      });
    }
  });

export type ClassifiedListingInput = z.infer<typeof classifiedListingSchema>;
