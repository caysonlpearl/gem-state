/** The website's complete general/category/pet filter form. */
import { isPostalCode } from "@/components/classifieds/BrowseFilterViews";
import { LocationOptions } from "@/components/classifieds/LocationOptions";
import {
  type LocationPoint,
  LocationRadiusPicker,
} from "@/components/classifieds/LocationRadiusPicker";
import {
  classifiedSubcategoryField,
  fieldsForClassifiedItem,
  industrialSubcategories,
} from "@/config/classified-item-fields";
import { classifiedCategories, idahoRegions, usStates, vehicleOptions } from "@/config/classifieds";
import {
  isPetSelectionCompatible,
  normalizePetSpecies,
  petOfferedBy,
  petPlacementTypes,
  petSexes,
  petSpecies,
  petSubcategories,
} from "@/config/pets";
import type { Search } from "@/lib/browse-search";
import { conditionLabels, isMotorsCategory } from "@/lib/classifieds-display";
import { MapPin } from "@phosphor-icons/react";
import type { FormEventHandler, ReactNode } from "react";
import { useEffect, useState } from "react";

export const itemCategorySlugs = new Set<string>(
  classifiedCategories
    .filter(
      (category) =>
        (category.group === "classifieds" || category.group === "motors") &&
        !["other-real-estate", "jobs", "services", "pets"].includes(category.slug),
    )
    .map((category) => category.slug),
);

export const conditionOptions = Object.entries(conditionLabels);

export function BrowseLocationFields({ search }: { search: Search }) {
  const [city, setCity] = useState(search.city ?? search.postalCode ?? "");
  const [radiusMiles, setRadiusMiles] = useState(search.radiusMiles ?? 25);
  const [mapPoint, setMapPoint] = useState<LocationPoint | undefined>(
    search.latitude != null && search.longitude != null
      ? { latitude: search.latitude, longitude: search.longitude, city: search.city }
      : undefined,
  );
  const [mapOpen, setMapOpen] = useState(false);

  useEffect(() => {
    setCity(search.city ?? search.postalCode ?? "");
    setRadiusMiles(search.radiusMiles ?? 25);
    setMapPoint(
      search.latitude != null && search.longitude != null
        ? { latitude: search.latitude, longitude: search.longitude, city: search.city }
        : undefined,
    );
  }, [search.city, search.postalCode, search.radiusMiles, search.latitude, search.longitude]);

  return (
    <>
      <p className="mb-1 text-[11px] leading-relaxed text-muted-foreground">
        Choose a city or ZIP first. Region and state are optional broader browsing controls.
      </p>
      <select name="region" defaultValue={search.region ?? ""} className="filter-input">
        <option value="">Any region (optional)</option>
        {idahoRegions.map((region) => (
          <option key={region} value={region}>
            {region}
          </option>
        ))}
      </select>
      <select name="state" defaultValue={search.state ?? ""} className="filter-input">
        <option value="">Any state (optional)</option>
        {usStates.map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
      <input
        name="city"
        value={city}
        onChange={(event) => {
          setCity(event.target.value);
          setMapPoint(undefined);
        }}
        placeholder="City or ZIP code"
        aria-label="City or ZIP code"
        className="filter-input"
        maxLength={80}
        list="bluebird-browse-city-options"
      />
      <LocationOptions id="bluebird-browse-city-options" query={city} />
      <button
        type="button"
        onClick={() => setMapOpen((open) => !open)}
        className="text-left text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
        aria-expanded={mapOpen}
      >
        {mapOpen ? "Hide map" : "Choose anywhere on map"}
      </button>
      {mapOpen ? (
        <LocationRadiusPicker
          city={city}
          latitude={mapPoint?.latitude}
          longitude={mapPoint?.longitude}
          radiusMiles={radiusMiles}
          onChange={(point) => {
            setMapPoint(point);
            setCity(point.city ?? "");
          }}
        />
      ) : null}
      {isPostalCode(city) ? (
        <p className="rounded-xl bg-secondary px-3 py-2 text-[11px] text-muted-foreground">
          ZIP searches match <strong className="text-foreground">{city.trim()}</strong>. Use a city
          when you want a distance radius.
        </p>
      ) : null}
      <label className="block text-[11px] font-medium text-muted-foreground">
        Search radius: <span className="font-semibold text-foreground">{radiusMiles} miles</span>
        <input
          name="radiusMiles"
          type="range"
          min="5"
          max="500"
          step="5"
          value={radiusMiles}
          onChange={(event) => setRadiusMiles(Number(event.target.value))}
          className="mt-2 w-full accent-primary"
          disabled={(!city.trim() && !mapPoint) || isPostalCode(city)}
        />
      </label>
      <input type="hidden" name="latitude" value={mapPoint?.latitude ?? ""} />
      <input type="hidden" name="longitude" value={mapPoint?.longitude ?? ""} />
    </>
  );
}

export function FilterSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {icon}
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function GenericBrowseFilters({
  search,
  onSubmit,
  onPreview,
  onSave,
  onClear,
  pendingFilterResultCount = null,
  result,
  categories = classifiedCategories,
  renderFirearmFilters,
}: {
  search: Search;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onPreview: (form: HTMLFormElement) => void;
  onSave: (form: HTMLFormElement) => void;
  onClear: () => void;
  pendingFilterResultCount?: number | null;
  result: { total: number };
  categories?: readonly { slug: string; name: string }[];
  renderFirearmFilters?: ReactNode;
}) {
  const searchKey = JSON.stringify(search);
  const motors = search.group === "motors" || isMotorsCategory(search.category);
  const pets = search.category === "pets";
  const firearms = search.category === "firearms";
  return (
    <form
      key={searchKey}
      onSubmit={onSubmit}
      onInput={(event) => onPreview(event.currentTarget)}
      aria-label="Listing filters"
      className="space-y-6"
    >
      <input type="hidden" name="group" value={search.group ?? ""} />
      <FilterSection title="Category">
        <select name="category" defaultValue={search.category ?? ""} className="filter-input">
          <option value="">All categories</option>
          {[...categories]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name}
              </option>
            ))}
        </select>
      </FilterSection>

      {search.category && itemCategorySlugs.has(search.category) && (
        <FilterSection
          title={search.category === "firearms" ? "Firearm filters" : "Category details"}
        >
          {search.category === "firearms" ? (
            renderFirearmFilters
          ) : search.category === "industrial" ? (
            <>
              <input type="hidden" name="itemDetailKey" value="itemType" />
              <select
                name="itemDetailValue"
                aria-label="Industrial subcategory"
                defaultValue={search.itemDetailValue ?? ""}
                className="filter-input"
              >
                <option value="">All Industrial subcategories</option>
                {Array.from(
                  new Set([
                    ...industrialSubcategories,
                    ...(search.itemDetailValue ? [search.itemDetailValue] : []),
                  ]),
                ).map((subcategory) => (
                  <option key={subcategory} value={subcategory}>
                    {subcategory}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <select
                name="itemDetailKey"
                defaultValue={
                  search.itemDetailKey ?? classifiedSubcategoryField(search.category).key
                }
                className="filter-input"
              >
                <option value="">Any detail</option>
                {fieldsForClassifiedItem(search.category).map((field) => (
                  <option key={field.key} value={field.key}>
                    {field.label}
                  </option>
                ))}
              </select>
              <input
                name="itemDetailValue"
                defaultValue={search.itemDetailValue ?? ""}
                placeholder="Match a detail value"
                className="filter-input"
                maxLength={200}
              />
            </>
          )}
        </FilterSection>
      )}

      <FilterSection title="Location" icon={<MapPin size={13} className="text-primary" />}>
        <BrowseLocationFields search={search} />
      </FilterSection>

      <FilterSection title="Price">
        <div className="grid grid-cols-2 gap-2">
          <input
            name="priceMin"
            type="number"
            min="0"
            step="1"
            defaultValue={search.priceMin ?? ""}
            placeholder="Min"
            className="filter-input"
          />
          <input
            name="priceMax"
            type="number"
            min="0"
            step="1"
            defaultValue={search.priceMax ?? ""}
            placeholder="Max"
            className="filter-input"
          />
        </div>
      </FilterSection>

      <FilterSection title="Condition and fulfillment">
        <select name="condition" defaultValue={search.condition ?? ""} className="filter-input">
          <option value="">Any condition</option>
          {conditionOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select name="fulfillment" defaultValue={search.fulfillment ?? ""} className="filter-input">
          <option value="">Any fulfillment</option>
          <option value="local_pickup">Local pickup</option>
          <option value="shipping">Ships</option>
          <option value="both">Pickup or shipping</option>
        </select>
      </FilterSection>

      {pets && (
        <FilterSection title="Pet details">
          <select
            name="petSubcategory"
            defaultValue={search.petSubcategory ?? ""}
            className="filter-input"
            onChange={(event) => {
              const form = event.currentTarget.form;
              const species = form?.elements.namedItem("petSpecies") as HTMLSelectElement | null;
              const breed = form?.elements.namedItem("petBreed") as HTMLInputElement | null;
              if (species && !isPetSelectionCompatible(species.value, event.currentTarget.value))
                species.value = "";
              if (breed) breed.value = "";
            }}
          >
            <option value="">All pet categories</option>
            {petSubcategories.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            name="petSpecies"
            defaultValue={search.petSpecies ?? ""}
            className="filter-input"
            onChange={(event) => {
              const species = normalizePetSpecies(event.currentTarget.value);
              const form = event.currentTarget.form;
              const subcategory = form?.elements.namedItem(
                "petSubcategory",
              ) as HTMLSelectElement | null;
              const breed = form?.elements.namedItem("petBreed") as HTMLInputElement | null;
              if (subcategory && !isPetSelectionCompatible(species, subcategory.value))
                subcategory.value = "";
              if (breed) breed.value = "";
            }}
          >
            <option value="">Any animal</option>
            {petSpecies.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <input
            name="petBreed"
            defaultValue={search.petBreed ?? ""}
            placeholder="Breed"
            className="filter-input"
            maxLength={100}
          />
          <select
            name="petPlacementType"
            defaultValue={search.petPlacementType ?? ""}
            className="filter-input"
          >
            <option value="">Any listing type</option>
            {petPlacementTypes.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            name="petOfferedBy"
            defaultValue={search.petOfferedBy ?? ""}
            className="filter-input"
          >
            <option value="">Any offered by</option>
            {petOfferedBy.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select name="petSex" defaultValue={search.petSex ?? ""} className="filter-input">
            <option value="">Any sex</option>
            {petSexes.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <input
            name="petAge"
            defaultValue={search.petAge ?? ""}
            placeholder="Age or age range"
            className="filter-input"
            maxLength={60}
          />
          {(
            [
              ["petHypoallergenic", "Hypoallergenic"],
              ["petVaccinated", "Vaccinated"],
              ["petSpayedNeutered", "Spayed / neutered"],
              ["petMicrochipped", "Microchipped"],
              ["petRecordsAvailable", "Records available"],
              ["petGoodWithKids", "Good with children"],
              ["petGoodWithDogs", "Good with dogs"],
              ["petGoodWithCats", "Good with cats"],
            ] as const
          ).map(([name, label]) => (
            <select
              key={name}
              name={name}
              defaultValue={search[name as keyof Search] as string | undefined}
              className="filter-input"
            >
              <option value="">Any {label.toLowerCase()}</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
              <option value="Unknown">Unknown</option>
            </select>
          ))}
          <select
            name="petIndoorOutdoor"
            defaultValue={search.petIndoorOutdoor ?? ""}
            className="filter-input"
          >
            <option value="">Any indoor / outdoor</option>
            <option value="Indoor">Indoor</option>
            <option value="Outdoor">Outdoor</option>
            <option value="Indoor / outdoor">Indoor / outdoor</option>
            <option value="Unknown">Unknown</option>
          </select>
        </FilterSection>
      )}

      {motors && (
        <FilterSection title="Vehicle details">
          <input
            list="vehicle-makes"
            name="make"
            defaultValue={search.make ?? ""}
            placeholder="Make / brand"
            className="filter-input"
            maxLength={80}
          />
          <datalist id="vehicle-makes">
            {vehicleOptions.makes.map((make) => (
              <option key={make} value={make} />
            ))}
          </datalist>
          <input
            name="model"
            defaultValue={search.model ?? ""}
            placeholder="Model"
            className="filter-input"
            maxLength={80}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              name="yearMin"
              type="number"
              min="1900"
              max="2100"
              step="1"
              defaultValue={search.yearMin ?? ""}
              placeholder="Year from"
              className="filter-input"
            />
            <input
              name="yearMax"
              type="number"
              min="1900"
              max="2100"
              step="1"
              defaultValue={search.yearMax ?? ""}
              placeholder="Year to"
              className="filter-input"
            />
          </div>
          <input
            name="mileageMax"
            type="number"
            min="0"
            step="1000"
            defaultValue={search.mileageMax ?? ""}
            placeholder="Max mileage"
            className="filter-input"
          />
          <select name="bodyStyle" defaultValue={search.bodyStyle ?? ""} className="filter-input">
            <option value="">Any body style</option>
            {vehicleOptions.bodyStyles.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select name="drivetrain" defaultValue={search.drivetrain ?? ""} className="filter-input">
            <option value="">Any drivetrain</option>
            {vehicleOptions.drivetrains.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            name="transmission"
            defaultValue={search.transmission ?? ""}
            className="filter-input"
          >
            <option value="">Any transmission</option>
            {vehicleOptions.transmissions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select name="fuelType" defaultValue={search.fuelType ?? ""} className="filter-input">
            <option value="">Any fuel type</option>
            {vehicleOptions.fuelTypes.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            name="exteriorColor"
            defaultValue={search.exteriorColor ?? ""}
            className="filter-input"
          >
            <option value="">Any exterior color</option>
            {vehicleOptions.exteriorColors.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            name="titleStatus"
            defaultValue={search.titleStatus ?? ""}
            className="filter-input"
          >
            <option value="">Any title status</option>
            {vehicleOptions.titleStatuses.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </FilterSection>
      )}

      <button
        type="button"
        onClick={onClear}
        className="text-sm font-semibold text-primary underline underline-offset-4"
      >
        Clear filters
      </button>
      <div className="mt-2 grid gap-2">
        <button
          type="submit"
          className="inline-flex h-12 w-full items-center justify-center rounded-full bg-primary px-3 text-[13px] font-semibold text-primary-foreground shadow-sm hover:opacity-90"
        >
          {pendingFilterResultCount == null ? (
            <>
              Show {result.total} {result.total === 1 ? "listing" : "listings"}
            </>
          ) : (
            <>
              Show {pendingFilterResultCount}{" "}
              {pendingFilterResultCount === 1 ? "listing" : "listings"}
            </>
          )}
        </button>
        <button
          type="button"
          onClick={(event) => {
            const form = event.currentTarget.form;
            if (form) onSave(form);
          }}
          className="inline-flex h-12 items-center justify-center rounded-full border border-primary px-5 text-[13px] font-semibold text-primary hover:bg-secondary"
        >
          {search.savedSearchId ? "Update saved search" : "Save this search"}
        </button>
      </div>
    </form>
  );
}
