import { vehicleModelsByMake, vehicleOptions } from "@/config/classifieds";
import { fieldClass } from "./shared";
import type { ListingFormState } from "./types";

export function VehicleFields({
  form,
  set,
}: {
  form: ListingFormState;
  set: (key: keyof ListingFormState, value: string) => void;
}) {
  const availableModels = vehicleModelsByMake[form.make] ?? [];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-[12px] font-medium">
        Make / brand
        <input
          required
          value={form.make}
          onChange={(event) => set("make", event.target.value)}
          placeholder="Toyota"
          list="vehicle-make-options"
          className={fieldClass}
        />
      </label>
      <label className="text-[12px] font-medium">
        Model
        <input
          required
          value={form.model}
          onChange={(event) => set("model", event.target.value)}
          placeholder="Tacoma"
          list="vehicle-model-options"
          className={fieldClass}
        />
      </label>
      <datalist id="vehicle-make-options">
        {vehicleOptions.makes.map((make) => (
          <option key={make} value={make} />
        ))}
      </datalist>
      <datalist id="vehicle-model-options">
        {availableModels.map((model) => (
          <option key={model} value={model} />
        ))}
      </datalist>
      <label className="text-[12px] font-medium">
        Year
        <input
          required
          type="number"
          min="1900"
          max="2100"
          value={form.year}
          onChange={(event) => set("year", event.target.value)}
          placeholder="2019"
          className={`${fieldClass} numeric`}
        />
      </label>
      <label className="text-[12px] font-medium">
        Trim <span className="font-normal text-muted-foreground">(optional)</span>
        <input
          value={form.trim}
          onChange={(event) => set("trim", event.target.value)}
          placeholder="TRD Off-Road"
          className={fieldClass}
        />
      </label>
      <label className="text-[12px] font-medium">
        Mileage
        <input
          required
          type="number"
          min="0"
          max="2000000"
          value={form.mileage}
          onChange={(event) => set("mileage", event.target.value)}
          placeholder="85000"
          className={`${fieldClass} numeric`}
        />
      </label>
      <label className="text-[12px] font-medium">
        Body style
        <select
          required
          value={form.bodyStyle}
          onChange={(event) => set("bodyStyle", event.target.value)}
          className={fieldClass}
        >
          <option value="">Choose body style</option>
          {vehicleOptions.bodyStyles.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="text-[12px] font-medium">
        Drivetrain
        <select
          required
          value={form.drivetrain}
          onChange={(event) => set("drivetrain", event.target.value)}
          className={fieldClass}
        >
          <option value="">Choose drivetrain</option>
          {vehicleOptions.drivetrains.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="text-[12px] font-medium">
        Transmission
        <select
          required
          value={form.transmission}
          onChange={(event) => set("transmission", event.target.value)}
          className={fieldClass}
        >
          {vehicleOptions.transmissions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="text-[12px] font-medium">
        Fuel type
        <select
          required
          value={form.fuelType}
          onChange={(event) => set("fuelType", event.target.value)}
          className={fieldClass}
        >
          {vehicleOptions.fuelTypes.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="text-[12px] font-medium">
        Exterior color
        <select
          value={form.exteriorColor}
          onChange={(event) => set("exteriorColor", event.target.value)}
          className={fieldClass}
        >
          <option value="">Choose color</option>
          {vehicleOptions.exteriorColors.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="text-[12px] font-medium">
        Title status
        <select
          required
          value={form.titleStatus}
          onChange={(event) => set("titleStatus", event.target.value)}
          className={fieldClass}
        >
          {vehicleOptions.titleStatuses.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="text-[12px] font-medium">
        VIN <span className="font-normal text-muted-foreground">(optional)</span>
        <input
          value={form.vin}
          onChange={(event) => set("vin", event.target.value.toUpperCase())}
          maxLength={17}
          placeholder="17-character VIN"
          className={`${fieldClass} uppercase`}
        />
      </label>
    </div>
  );
}
