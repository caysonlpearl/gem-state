import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

type NhtsaResult = {
  Variable?: string;
  Value?: string | null;
};

type NhtsaResponse = {
  Results?: NhtsaResult[];
  Message?: string;
  ErrorCode?: string;
};

export type VehicleDecodeFields = {
  make?: string | undefined;
  model?: string | undefined;
  year?: string | undefined;
  trim?: string | undefined;
  bodyStyle?:
    | "Sedan"
    | "SUV"
    | "Pickup"
    | "Coupe"
    | "Hatchback"
    | "Wagon"
    | "Van"
    | "Convertible"
    | undefined;
  transmission?: "Automatic" | "Manual" | "CVT" | undefined;
  drivetrain?: "FWD" | "RWD" | "AWD" | "4WD" | undefined;
  fuelType?: "Gasoline" | "Diesel" | "Hybrid" | "Plug-in hybrid" | "Electric" | "Other" | undefined;
  exteriorColor?: string | undefined;
};

export type VehicleDecodeResult = {
  vin: string;
  fields: VehicleDecodeFields;
  source: "nhtsa_vpic";
};

function cleanValue(value: string | null | undefined) {
  const cleaned = value?.trim() ?? "";
  if (!cleaned || /^(not applicable|not available|unknown|null)$/i.test(cleaned)) return undefined;
  return cleaned;
}

function valueFor(results: NhtsaResult[], ...names: string[]) {
  for (const name of names) {
    const result = results.find((item) => item.Variable?.toLowerCase() === name.toLowerCase());
    const value = cleanValue(result?.Value);
    if (value) return value;
  }
  return undefined;
}

function bodyStyleFor(value: string | undefined): VehicleDecodeFields["bodyStyle"] {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized.includes("suv") || normalized.includes("sport utility")) return "SUV";
  if (normalized.includes("pickup") || normalized.includes("pick-up")) return "Pickup";
  if (normalized.includes("coupe")) return "Coupe";
  if (normalized.includes("convertible")) return "Convertible";
  if (normalized.includes("hatchback")) return "Hatchback";
  if (normalized.includes("wagon")) return "Wagon";
  if (normalized.includes("van") || normalized.includes("mpv")) return "Van";
  if (normalized.includes("sedan")) return "Sedan";
  return undefined;
}

function transmissionFor(value: string | undefined): VehicleDecodeFields["transmission"] {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized.includes("continuously variable") || normalized.includes("cvt")) return "CVT";
  if (normalized.includes("manual")) return "Manual";
  if (normalized.includes("automatic")) return "Automatic";
  return undefined;
}

function drivetrainFor(value: string | undefined): VehicleDecodeFields["drivetrain"] {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized.includes("all-wheel") || normalized.includes("awd")) return "AWD";
  if (normalized.includes("four-wheel") || normalized.includes("4wd") || normalized.includes("4x4"))
    return "4WD";
  if (normalized.includes("front-wheel") || normalized.includes("fwd")) return "FWD";
  if (normalized.includes("rear-wheel") || normalized.includes("rwd")) return "RWD";
  return undefined;
}

function fuelTypeFor(value: string | undefined): VehicleDecodeFields["fuelType"] {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized.includes("plug-in") || normalized.includes("plug in")) return "Plug-in hybrid";
  if (normalized.includes("electric") || normalized.includes("battery")) return "Electric";
  if (normalized.includes("hybrid")) return "Hybrid";
  if (normalized.includes("diesel")) return "Diesel";
  if (normalized.includes("gasoline") || normalized.includes("petrol")) return "Gasoline";
  return "Other";
}

function exteriorColorFor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  const colors = [
    ["black", "Black"],
    ["white", "White"],
    ["gray", "Gray"],
    ["grey", "Gray"],
    ["silver", "Silver"],
    ["red", "Red"],
    ["blue", "Blue"],
    ["green", "Green"],
    ["brown", "Brown"],
    ["gold", "Gold"],
    ["orange", "Orange"],
    ["yellow", "Yellow"],
    ["purple", "Purple"],
  ] as const;
  return colors.find(([needle]) => normalized.includes(needle))?.[1] ?? "Other";
}

export const decodeVehicleVin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { vin: string }) => {
    const vin = String(input.vin ?? "")
      .replace(/[\s-]/g, "")
      .toUpperCase();
    if (!VIN_PATTERN.test(vin)) {
      throw new Error("Enter a valid 17-character VIN. VINs do not use I, O, or Q.");
    }
    return { vin };
  })
  .handler(async ({ data }): Promise<VehicleDecodeResult> => {
    const response = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${encodeURIComponent(data.vin)}?format=json`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) throw new Error("The vehicle decoder is temporarily unavailable.");
    const payload = (await response.json()) as NhtsaResponse;
    const results = payload.Results ?? [];
    const make = valueFor(results, "Make");
    const model = valueFor(results, "Model");
    const year = valueFor(results, "Model Year");
    if (!make || !model || !year) {
      throw new Error(
        payload.ErrorCode && payload.ErrorCode !== "0"
          ? "NHTSA could not validate that VIN. Check the characters and try again."
          : "NHTSA could not find enough details for that VIN. You can enter the vehicle manually.",
      );
    }
    return {
      vin: data.vin,
      source: "nhtsa_vpic",
      fields: {
        make,
        model,
        year: /^\d{4}$/.test(year) ? year : undefined,
        trim: valueFor(results, "Trim", "Series", "Series2"),
        bodyStyle: bodyStyleFor(valueFor(results, "Body Class", "NCSA Body Type")),
        transmission: transmissionFor(valueFor(results, "Transmission Style")),
        drivetrain: drivetrainFor(valueFor(results, "Drive Type")),
        fuelType: fuelTypeFor(valueFor(results, "Fuel Type - Primary")),
        exteriorColor: exteriorColorFor(valueFor(results, "Color", "Exterior Color")),
      },
    };
  });
