import { fieldClass } from "./shared";
import type { ListingFormState } from "./types";

const homeModes = [
  ["buy", "For sale"],
  ["rent", "For rent"],
  ["build", "New construction"],
] as const;

const propertyTypes = [
  "Single-family home",
  "Townhome",
  "Condo",
  "Apartment",
  "Duplex",
  "Manufactured home",
  "Land",
] as const;

export function HomeFields({
  form,
  set,
}: {
  form: ListingFormState;
  set: (key: keyof ListingFormState, value: string) => void;
}) {
  const isRent = form.homeMode === "rent";
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[12px] font-medium">Listing type</p>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {homeModes.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={form.homeMode === value}
              onClick={() => set("homeMode", value)}
              className={`h-10 rounded-md border text-[12.5px] font-semibold transition-colors ${
                form.homeMode === value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input hover:bg-secondary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-[12px] font-medium">
          Property type
          <select
            required
            value={form.propertyType}
            onChange={(event) => set("propertyType", event.target.value)}
            className={fieldClass}
          >
            {propertyTypes.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] font-medium">
          Bedrooms
          <input
            inputMode="decimal"
            value={form.bedrooms}
            onChange={(event) => set("bedrooms", event.target.value)}
            placeholder="3"
            className={`${fieldClass} numeric`}
          />
        </label>
        <label className="text-[12px] font-medium">
          Bathrooms
          <input
            inputMode="decimal"
            value={form.bathrooms}
            onChange={(event) => set("bathrooms", event.target.value)}
            placeholder="2.5"
            className={`${fieldClass} numeric`}
          />
        </label>
        <label className="text-[12px] font-medium">
          Square feet
          <input
            inputMode="numeric"
            value={form.squareFeet}
            onChange={(event) => set("squareFeet", event.target.value)}
            placeholder="1800"
            className={`${fieldClass} numeric`}
          />
        </label>
        <label className="text-[12px] font-medium">
          Year built
          <input
            inputMode="numeric"
            value={form.yearBuilt}
            onChange={(event) => set("yearBuilt", event.target.value)}
            placeholder="2015"
            className={`${fieldClass} numeric`}
          />
        </label>
        <label className="text-[12px] font-medium">
          Acreage <span className="font-normal text-muted-foreground">(optional)</span>
          <input
            value={form.acreage}
            onChange={(event) => set("acreage", event.target.value)}
            placeholder="0.25 acres"
            className={fieldClass}
          />
        </label>
        <label className="text-[12px] font-medium">
          Heating <span className="font-normal text-muted-foreground">(optional)</span>
          <input
            value={form.heating}
            onChange={(event) => set("heating", event.target.value)}
            placeholder="Forced air, gas"
            className={fieldClass}
          />
        </label>
        <label className="text-[12px] font-medium">
          Cooling <span className="font-normal text-muted-foreground">(optional)</span>
          <input
            value={form.cooling}
            onChange={(event) => set("cooling", event.target.value)}
            placeholder="Central air"
            className={fieldClass}
          />
        </label>
        <label className="text-[12px] font-medium">
          Garage / parking <span className="font-normal text-muted-foreground">(optional)</span>
          <input
            value={form.garageParking}
            onChange={(event) => set("garageParking", event.target.value)}
            placeholder="2-car attached garage"
            className={fieldClass}
          />
        </label>
        <label className="text-[12px] font-medium">
          Yard <span className="font-normal text-muted-foreground">(optional)</span>
          <input
            value={form.yard}
            onChange={(event) => set("yard", event.target.value)}
            placeholder="Fenced backyard"
            className={fieldClass}
          />
        </label>
        <label className="text-[12px] font-medium">
          School district <span className="font-normal text-muted-foreground">(optional)</span>
          <input
            value={form.schoolDistrict}
            onChange={(event) => set("schoolDistrict", event.target.value)}
            placeholder="West Ada School District"
            className={fieldClass}
          />
        </label>
      </div>

      {isRent ? (
        <div className="grid gap-4 border-t border-border/70 pt-5 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-[12px] font-medium">
            Lease length <span className="font-normal text-muted-foreground">(optional)</span>
            <input
              value={form.leaseLength}
              onChange={(event) => set("leaseLength", event.target.value)}
              placeholder="12 months"
              className={fieldClass}
            />
          </label>
          <label className="text-[12px] font-medium">
            Available <span className="font-normal text-muted-foreground">(optional)</span>
            <input
              value={form.available}
              onChange={(event) => set("available", event.target.value)}
              placeholder="Available now"
              className={fieldClass}
            />
          </label>
          <label className="text-[12px] font-medium sm:col-span-2 lg:col-span-1">
            Pets policy <span className="font-normal text-muted-foreground">(optional)</span>
            <input
              value={form.petsPolicy}
              onChange={(event) => set("petsPolicy", event.target.value)}
              placeholder="Cats welcome; dogs considered"
              className={fieldClass}
            />
          </label>
          <label className="text-[12px] font-medium sm:col-span-2 lg:col-span-3">
            Smoking policy <span className="font-normal text-muted-foreground">(optional)</span>
            <input
              value={form.smokingPolicy}
              onChange={(event) => set("smokingPolicy", event.target.value)}
              placeholder="Not allowed"
              className={fieldClass}
            />
          </label>
        </div>
      ) : (
        <div className="grid gap-4 border-t border-border/70 pt-5 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-[12px] font-medium">
            Appliances included{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
            <input
              value={form.appliancesIncluded}
              onChange={(event) => set("appliancesIncluded", event.target.value)}
              placeholder="Range, dishwasher, microwave"
              className={fieldClass}
            />
          </label>
          <label className="text-[12px] font-medium">
            Floor coverings <span className="font-normal text-muted-foreground">(optional)</span>
            <input
              value={form.floorCoverings}
              onChange={(event) => set("floorCoverings", event.target.value)}
              placeholder="Luxury vinyl plank, carpet"
              className={fieldClass}
            />
          </label>
          <label className="text-[12px] font-medium">
            Basement type <span className="font-normal text-muted-foreground">(optional)</span>
            <input
              value={form.basementType}
              onChange={(event) => set("basementType", event.target.value)}
              placeholder="Daylight basement"
              className={fieldClass}
            />
          </label>
          <label className="text-[12px] font-medium">
            Exterior material <span className="font-normal text-muted-foreground">(optional)</span>
            <input
              value={form.exteriorMaterial}
              onChange={(event) => set("exteriorMaterial", event.target.value)}
              placeholder="Stucco with stone accents"
              className={fieldClass}
            />
          </label>
          <label className="text-[12px] font-medium">
            Special features <span className="font-normal text-muted-foreground">(optional)</span>
            <input
              value={form.specialFeatures}
              onChange={(event) => set("specialFeatures", event.target.value)}
              placeholder="Smart thermostat, covered patio"
              className={fieldClass}
            />
          </label>
          <label className="text-[12px] font-medium">
            HOA fees <span className="font-normal text-muted-foreground">(optional)</span>
            <input
              value={form.hoaFees}
              onChange={(event) => set("hoaFees", event.target.value)}
              placeholder="$45/month or None"
              className={fieldClass}
            />
          </label>
          <label className="text-[12px] font-medium sm:col-span-2 lg:col-span-3">
            Open house <span className="font-normal text-muted-foreground">(optional)</span>
            <input
              value={form.openHouse}
              onChange={(event) => set("openHouse", event.target.value)}
              placeholder="September 20, 2026 · 1:00–3:00 pm"
              className={fieldClass}
            />
          </label>
        </div>
      )}
    </div>
  );
}
