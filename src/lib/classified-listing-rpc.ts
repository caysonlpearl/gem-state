import type { ClassifiedListingInput } from "./classified-listing-contracts";
/** The database compatibility function stores vehicle JSON with SQL-style keys. */
export function vehicleForRpc(vehicle: ClassifiedListingInput["vehicle"] | undefined) {
  if (!vehicle) return {};
  return {
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    trim: vehicle.trim,
    mileage: vehicle.mileage,
    body_style: vehicle.bodyStyle,
    transmission: vehicle.transmission,
    drivetrain: vehicle.drivetrain,
    fuel_type: vehicle.fuelType,
    exterior_color: vehicle.exteriorColor,
    title_status: vehicle.titleStatus,
    vin: vehicle.vin,
  };
}
