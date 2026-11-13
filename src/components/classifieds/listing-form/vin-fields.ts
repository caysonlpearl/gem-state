import { vehicleOptions } from "@/config/classifieds";
import type { VehicleDecodeResult } from "@/lib/vehicle.functions";
import type { ListingFormState } from "./types";

export function applyDecodedVin(
  result: VehicleDecodeResult,
  set: (key: keyof ListingFormState, value: string) => void,
) {
  const fields = result.fields;
  if (fields.make) {
    const catalogMake = vehicleOptions.makes.find(
      (make) => make.toLowerCase() === fields.make?.toLowerCase(),
    );
    set("make", catalogMake ?? fields.make);
  }
  if (fields.model) set("model", fields.model);
  if (fields.year) set("year", fields.year);
  if (fields.trim) set("trim", fields.trim);
  if (fields.bodyStyle) set("bodyStyle", fields.bodyStyle);
  if (fields.transmission) set("transmission", fields.transmission);
  if (fields.drivetrain) set("drivetrain", fields.drivetrain);
  if (fields.fuelType) set("fuelType", fields.fuelType);
  if (fields.exteriorColor) set("exteriorColor", fields.exteriorColor);
}
