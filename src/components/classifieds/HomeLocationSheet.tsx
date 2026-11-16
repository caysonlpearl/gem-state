import { lazy, Suspense, useEffect, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { HomeSearchDropdown } from "./HomeSearchDropdown";
import { locationMapPoint, suggestLocations } from "@/lib/location-suggest";
import type { LocationPoint } from "./LocationRadiusPicker";

const LocationRadiusPicker = lazy(() =>
  import("./LocationRadiusPicker").then((module) => ({ default: module.LocationRadiusPicker })),
);
export function HomeLocationSheet({
  open,
  onOpenChange,
  value,
  point,
  radiusMiles,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  point?: LocationPoint;
  radiusMiles: number;
  onApply: (selection: { value: string; point?: LocationPoint; radiusMiles: number }) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [draftPoint, setDraftPoint] = useState(point);
  const [radius, setRadius] = useState(radiusMiles);
  useEffect(() => {
    if (open) {
      setDraft(value);
      setDraftPoint(point ?? locationMapPoint(value));
      setRadius(radiusMiles);
    }
  }, [open, value, point, radiusMiles]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto flex max-h-[92dvh] w-full max-w-xl flex-col gap-3 overflow-hidden rounded-t-3xl p-4 pb-[calc(16px+env(safe-area-inset-bottom))] sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
      >
        <div className="pr-8">
          <SheetTitle>Search area</SheetTitle>
          <SheetDescription className="mt-1">
            Search by city or ZIP, or choose a point on the map.
          </SheetDescription>
        </div>
        <form
          className="flex min-h-0 flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            onApply({ value: draft.trim(), point: draftPoint, radiusMiles: radius });
            onOpenChange(false);
          }}
        >
          <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain">
            <HomeSearchDropdown
              value={draft}
              onChange={(next) => {
                setDraft(next);
                setDraftPoint(locationMapPoint(next));
              }}
              editable
              label="City or ZIP code"
              placeholder="City or ZIP code"
              options={suggestLocations(draft).map((option) => ({
                ...option,
                value: /^\d/.test(option.value) ? option.value : option.label,
              }))}
            />
            <Suspense
              fallback={
                <div
                  role="status"
                  className="grid h-56 place-items-center rounded-2xl bg-secondary text-sm text-muted-foreground"
                >
                  Loading map…
                </div>
              }
            >
              <LocationRadiusPicker
                city={draftPoint?.city}
                latitude={draftPoint?.latitude}
                longitude={draftPoint?.longitude}
                radiusMiles={radius}
                showLocationButton={false}
                compact
                onChange={(next) => {
                  setDraftPoint(next);
                  setDraft(next.city ?? "");
                }}
              />
            </Suspense>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <span>Distance</span>
              <input
                aria-label="Search radius in miles"
                type="range"
                min="5"
                max="500"
                step="5"
                value={radius}
                onChange={(event) => setRadius(Number(event.target.value))}
                className="min-w-0 flex-1 accent-primary"
              />
              <output className="min-w-12 text-right font-semibold">{radius} mi</output>
            </label>
          </div>
          <div className="grid shrink-0 grid-cols-[auto_1fr] gap-3 border-t pt-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="min-h-11 rounded-full border px-5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm"
            >
              Use search area
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
