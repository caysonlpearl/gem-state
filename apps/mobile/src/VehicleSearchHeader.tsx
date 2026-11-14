import { useEffect, useState, type ReactNode } from "react";
import { BookmarkSimple, CaretDown } from "@phosphor-icons/react";
import { Popover, PopoverContent, PopoverTrigger } from "../../../src/components/ui/popover";
import {
  VehicleCheckboxList,
  VehicleSingleSelectList,
  VehicleTextField,
  modelsForMakes,
  splitVehicleFilter,
  mileageBandOptions,
  isPostalCode,
} from "../../../src/components/classifieds/BrowseFilterViews";
import { vehicleOptions } from "../../../src/config/classifieds";
import type { Search } from "../../../src/lib/browse-search";
import {
  optionalNonNegativeInteger,
  optionalNonNegativeNumber,
} from "../../../src/lib/classifieds-query";

export function NativeCategorySearchHeader({
  title,
  onSave,
}: {
  title: string;
  onSave: () => void;
}) {
  return (
    <section className="flex min-h-11 items-center justify-between gap-3" aria-label={title}>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <button
        type="button"
        onClick={onSave}
        aria-label="Save search"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-card"
      >
        <BookmarkSimple size={20} />
      </button>
    </section>
  );
}
/** The website's filter vocabulary and controls in one small native rail. */
export function NativeVehicleSearchHeader({
  search,
  onApply,
  onSave,
}: {
  search: Search;
  onApply: (patch: Partial<Search>) => void;
  onSave: () => void;
}) {
  const fields = [
    "make",
    "model",
    "priceMin",
    "priceMax",
    "yearMin",
    "yearMax",
    "mileageBands",
    "bodyStyle",
    "titleStatus",
    "city",
  ] as const;
  const values = () =>
    Object.fromEntries(
      fields.map((key) => [
        key,
        key === "city"
          ? (search.city ?? search.postalCode ?? "")
          : search[key] == null
            ? ""
            : String(search[key]),
      ]),
    ) as Record<(typeof fields)[number], string>;
  const [draft, setDraft] = useState(values),
    [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    setDraft(values());
    setOpen(null);
  }, [search]);
  const set = (key: (typeof fields)[number]) => (value: string) =>
    setDraft((prior) => ({ ...prior, [key]: value, ...(key === "make" ? { model: "" } : {}) }));
  const apply = () => {
    const patch: Partial<Search> = {
      make: draft.make || undefined,
      model: draft.model || undefined,
      priceMin: optionalNonNegativeNumber(draft.priceMin),
      priceMax: optionalNonNegativeNumber(draft.priceMax),
      yearMin: optionalNonNegativeInteger(draft.yearMin),
      yearMax: optionalNonNegativeInteger(draft.yearMax),
      mileageBands: draft.mileageBands || undefined,
      bodyStyle: draft.bodyStyle || undefined,
      titleStatus: draft.titleStatus || undefined,
      city: isPostalCode(draft.city) ? undefined : draft.city || undefined,
      postalCode: isPostalCode(draft.city) ? draft.city : undefined,
      ...(draft.city !== (search.city ?? search.postalCode ?? "")
        ? {
            latitude: undefined,
            longitude: undefined,
            radiusMiles: isPostalCode(draft.city) ? undefined : search.radiusMiles,
          }
        : {}),
    };
    onApply(patch);
    setOpen(null);
  };
  const choices: { label: string; active: boolean; content: ReactNode }[] = [
    {
      label: "Make",
      active: !!draft.make,
      content: (
        <VehicleCheckboxList
          label="Makes"
          value={draft.make}
          options={vehicleOptions.makes}
          onChange={set("make")}
        />
      ),
    },
    {
      label: "Model",
      active: !!draft.model,
      content: draft.make ? (
        <VehicleCheckboxList
          label="Models"
          value={draft.model}
          options={modelsForMakes(splitVehicleFilter(draft.make))}
          onChange={set("model")}
        />
      ) : (
        <p className="text-sm">Choose a make first.</p>
      ),
    },
    {
      label: "Price",
      active: !!(draft.priceMin || draft.priceMax),
      content: (
        <div className="grid grid-cols-2 gap-2">
          <VehicleTextField
            label="Minimum price"
            value={draft.priceMin}
            onChange={set("priceMin")}
            placeholder="Any"
            numeric
          />
          <VehicleTextField
            label="Maximum price"
            value={draft.priceMax}
            onChange={set("priceMax")}
            placeholder="Any"
            numeric
          />
        </div>
      ),
    },
    {
      label: "Year",
      active: !!(draft.yearMin || draft.yearMax),
      content: (
        <div className="grid grid-cols-2 gap-2">
          <VehicleTextField
            label="Year from"
            value={draft.yearMin}
            onChange={set("yearMin")}
            placeholder="Any"
            numeric
          />
          <VehicleTextField
            label="Year to"
            value={draft.yearMax}
            onChange={set("yearMax")}
            placeholder="Any"
            numeric
          />
        </div>
      ),
    },
    {
      label: "Mileage",
      active: !!draft.mileageBands,
      content: (
        <VehicleSingleSelectList
          label="Mileage"
          value={draft.mileageBands}
          options={mileageBandOptions}
          onChange={set("mileageBands")}
        />
      ),
    },
    {
      label: "Body type",
      active: !!draft.bodyStyle,
      content: (
        <VehicleCheckboxList
          label="Body type"
          value={draft.bodyStyle}
          options={vehicleOptions.bodyStyles}
          onChange={set("bodyStyle")}
        />
      ),
    },
    {
      label: "Title type",
      active: !!draft.titleStatus,
      content: (
        <VehicleCheckboxList
          label="Title type"
          value={draft.titleStatus}
          options={vehicleOptions.titleStatuses}
          onChange={set("titleStatus")}
        />
      ),
    },
    {
      label: "Location",
      active: !!draft.city,
      content: (
        <VehicleTextField
          label="City or ZIP code"
          value={draft.city}
          onChange={set("city")}
          placeholder="Boise or 83702"
        />
      ),
    },
  ];
  return (
    <section aria-label="Vehicle search" className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-[18px] font-semibold tracking-tight">Find your next gem on wheels.</h1>
        <button
          type="button"
          onClick={onSave}
          aria-label="Save this search"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-card"
        >
          <BookmarkSimple size={20} />
        </button>
      </div>
      <div
        className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1"
        aria-label="Quick vehicle filters"
      >
        {choices.map((choice) => (
          <Popover
            key={choice.label}
            open={open === choice.label}
            onOpenChange={(value) => setOpen(value ? choice.label : null)}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`Filter by ${choice.label.toLowerCase()}`}
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-medium ${choice.active ? "border-primary bg-primary/10 text-primary" : "border-border bg-card"}`}
              >
                {choice.label}
                <CaretDown size={12} />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              collisionPadding={16}
              className="max-h-[65dvh] w-[min(320px,calc(100vw-32px))] overflow-y-auto p-4"
            >
              <div className="space-y-3">{choice.content}</div>
              <button
                type="button"
                onClick={apply}
                className="mt-4 min-h-11 w-full rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
              >
                Apply {choice.label.toLowerCase()}
              </button>
            </PopoverContent>
          </Popover>
        ))}
      </div>
    </section>
  );
}
