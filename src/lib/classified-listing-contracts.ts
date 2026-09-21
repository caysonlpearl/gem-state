import { z } from "zod";

import { classifiedCategories, vehicleOptions } from "@/config/classifieds";
import { petOfferedBy, petPlacementTypes, petSexes } from "@/config/pets";

type NonEmpty = [string, ...string[]];
const categorySlugs = classifiedCategories.map((category) => category.slug) as NonEmpty;
const bodyStyles = [...vehicleOptions.bodyStyles] as NonEmpty;
const transmissions = [...vehicleOptions.transmissions] as NonEmpty;
const drivetrains = [...vehicleOptions.drivetrains] as NonEmpty;
const fuelTypes = [...vehicleOptions.fuelTypes] as NonEmpty;
const titleStatuses = [...vehicleOptions.titleStatuses] as NonEmpty;
const petPlacements = petPlacementTypes.map(([value]) => value) as NonEmpty;
const petOfferedByValues = [...petOfferedBy] as NonEmpty;
const petSexValues = [...petSexes] as NonEmpty;

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export const classifiedListingSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(20).max(5000),
    category: z.enum(categorySlugs),
    condition: z.enum(["new_with_tags", "new_without_tags", "used_excellent", "used_good"]),
    priceCents: z.number().int().min(0).max(1_000_000_000),
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
    home: z
      .object({
        mode: z.enum(["rent", "buy", "build"]),
        propertyType: z.string().trim().min(1).max(80),
        bedrooms: z.number().min(0).max(20).optional(),
        bathrooms: z.number().min(0).max(20).optional(),
        squareFeet: z.number().int().min(0).max(50_000).optional(),
        yearBuilt: z.number().int().min(1800).max(2100).optional(),
        acreage: z.string().trim().max(40).optional(),
        heating: z.string().trim().max(80).optional(),
        cooling: z.string().trim().max(80).optional(),
        garageParking: z.string().trim().max(120).optional(),
        yard: z.string().trim().max(120).optional(),
        appliancesIncluded: z.string().trim().max(200).optional(),
        floorCoverings: z.string().trim().max(120).optional(),
        basementType: z.string().trim().max(80).optional(),
        exteriorMaterial: z.string().trim().max(120).optional(),
        specialFeatures: z.string().trim().max(200).optional(),
        hoaFees: z.string().trim().max(40).optional(),
        schoolDistrict: z.string().trim().max(120).optional(),
        leaseLength: z.string().trim().max(60).optional(),
        available: z.string().trim().max(60).optional(),
        pets: z.string().trim().max(120).optional(),
        smoking: z.string().trim().max(60).optional(),
        openHouse: z.string().trim().max(120).optional(),
      })
      .optional(),
    job: z
      .object({
        category: z.string().trim().min(1).max(80),
        employerName: z.string().trim().min(1).max(120),
        employerAddress: z.string().trim().max(200).optional(),
        payType: z.enum(["Hourly", "Salary", "Commission", "Contract"]),
        payMin: z.number().min(0).max(10_000_000),
        payMax: z.number().min(0).max(10_000_000),
        employmentType: z.enum(["Full-time", "Part-time", "Seasonal", "Contract", "Temporary"]),
        experienceRequired: z.string().trim().max(80).optional(),
        educationLevel: z.string().trim().max(80).optional(),
        responsibilities: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
        qualifications: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
      })
      .optional(),
    service: z
      .object({
        subcategory: z.string().trim().min(1).max(80),
        serviceArea: z.string().trim().min(1).max(200),
        availability: z.string().trim().max(120).optional(),
        businessAddress: z.string().trim().max(200).optional(),
        licenseNumber: z.string().trim().max(60).optional(),
        licenseLookupUrl: z.string().trim().url().max(300).optional(),
        offerings: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
      })
      .optional(),
    pet: z
      .object({
        subcategory: z.string().trim().min(1).max(80),
        species: z.string().trim().min(1).max(40),
        breed: z.string().trim().max(100).optional(),
        name: z.string().trim().max(80).optional(),
        age: z.string().trim().max(60).optional(),
        sex: z.enum(petSexValues),
        placementType: z.enum(petPlacements),
        offeredBy: z.enum(petOfferedByValues),
        hypoallergenic: z.string().trim().max(20),
        vaccinated: z.string().trim().max(20),
        spayedNeutered: z.string().trim().max(20),
        microchipped: z.string().trim().max(20),
        recordsAvailable: z.string().trim().max(20),
        goodWithKids: z.string().trim().max(20),
        goodWithDogs: z.string().trim().max(20),
        goodWithCats: z.string().trim().max(20),
        indoorOutdoor: z.string().trim().max(30),
        specialNeeds: z.string().trim().max(1000).optional(),
        breedingTerms: z.string().trim().max(1000).optional(),
      })
      .optional(),
  })
  .superRefine((listing, context) => {
    if (listing.priceCents === 0 && listing.category !== "pets") {
      context.addIssue({
        code: "custom",
        path: ["priceCents"],
        message: "A price is required for this listing category.",
      });
    }
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
    if (listing.category === "other-real-estate" && !listing.home) {
      context.addIssue({
        code: "custom",
        path: ["home"],
        message: "Home details are required for real estate listings.",
      });
    }
    if (listing.category === "jobs" && !listing.job) {
      context.addIssue({
        code: "custom",
        path: ["job"],
        message: "Job details are required for job listings.",
      });
    }
    if (listing.category === "services" && !listing.service) {
      context.addIssue({
        code: "custom",
        path: ["service"],
        message: "Service details are required for service listings.",
      });
    }
    if (listing.category === "pets" && !listing.pet) {
      context.addIssue({
        code: "custom",
        path: ["pet"],
        message: "Pet details are required for pet listings.",
      });
    }
  });

export type ClassifiedListingInput = z.infer<typeof classifiedListingSchema>;
