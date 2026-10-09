import { MapPin, NavigationArrow } from "@phosphor-icons/react";
import { useMemo, type MouseEvent } from "react";

import {
  classifiedCoordinatesForCity,
  idahoCities,
  nearestClassifiedCity,
} from "@/config/classifieds";

const MAP_BOUNDS = {
  north: 49.2,
  south: 40.1,
  west: -117.5,
  east: -110.4,
};

const markerCities = [
  ...idahoCities,
  "Salt Lake City",
  "Murray",
  "West Jordan",
  "Sandy",
  "Draper",
  "South Jordan",
];

export type LocationPoint = {
  latitude: number;
  longitude: number;
  city?: string;
};

type Props = {
  city?: string;
  latitude?: number;
  longitude?: number;
  radiusMiles: number;
  onChange: (point: LocationPoint) => void;
  className?: string;
};

function project(latitude: number, longitude: number) {
  return {
    left: ((longitude - MAP_BOUNDS.west) / (MAP_BOUNDS.east - MAP_BOUNDS.west)) * 100,
    top: ((MAP_BOUNDS.north - latitude) / (MAP_BOUNDS.north - MAP_BOUNDS.south)) * 100,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function LocationRadiusPicker({
  city,
  latitude,
  longitude,
  radiusMiles,
  onChange,
  className,
}: Props) {
  const fallback = classifiedCoordinatesForCity(city) ?? [44.15, -114.45];
  const center = {
    latitude: latitude ?? fallback[0],
    longitude: longitude ?? fallback[1],
  };
  const centerPosition = project(center.latitude, center.longitude);
  const nearest = useMemo(
    () => nearestClassifiedCity(center.latitude, center.longitude),
    [center.latitude, center.longitude],
  );
  const radiusSize = clamp((radiusMiles / 500) * 180, 7, 180);

  function handleMapClick(event: MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const left = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
    const top = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);
    const nextLatitude = MAP_BOUNDS.north - top * (MAP_BOUNDS.north - MAP_BOUNDS.south);
    const nextLongitude = MAP_BOUNDS.west + left * (MAP_BOUNDS.east - MAP_BOUNDS.west);
    const nextNearest = nearestClassifiedCity(nextLatitude, nextLongitude);
    onChange({
      latitude: Number(nextLatitude.toFixed(5)),
      longitude: Number(nextLongitude.toFixed(5)),
      city: nextNearest?.distanceMiles <= 20 ? nextNearest.city : undefined,
    });
  }

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
          <NavigationArrow size={14} weight="fill" className="text-primary" />
          Click anywhere to choose your search center
        </span>
        <span className="whitespace-nowrap font-semibold text-foreground">Up to 500 miles</span>
      </div>
      <div
        role="application"
        tabIndex={0}
        aria-label="Interactive search radius map"
        onClick={handleMapClick}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onChange({
              latitude: Number(center.latitude.toFixed(5)),
              longitude: Number(center.longitude.toFixed(5)),
              city: nearest?.distanceMiles <= 20 ? nearest.city : undefined,
            });
          }
        }}
        className="relative isolate h-56 cursor-crosshair overflow-hidden rounded-2xl border border-border bg-[#dceae8] shadow-inner outline-none focus-visible:ring-2 focus-visible:ring-primary sm:h-64"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-80 [background-image:linear-gradient(135deg,rgba(255,255,255,.55)_25%,transparent_25%),linear-gradient(45deg,rgba(255,255,255,.4)_25%,transparent_25%),linear-gradient(135deg,transparent_75%,rgba(255,255,255,.45)_75%),linear-gradient(45deg,transparent_75%,rgba(255,255,255,.3)_75%)] [background-position:0_0,0_18px,18px_-18px,-18px_0] [background-size:36px_36px]"
        />
        <div className="absolute inset-x-[18%] top-[8%] h-[84%] rounded-[48%_42%_50%_38%] border border-white/80 bg-[#edf3e9]/80 shadow-[inset_-22px_-16px_0_rgba(178,207,193,.3)]" />
        <div className="absolute left-[61%] top-[2%] h-[42%] w-[20%] rounded-full bg-[#f6e6ab]/70 blur-[1px]" />
        <div className="absolute left-[7%] top-[56%] h-[28%] w-[24%] rounded-full bg-[#c4dfdc]/70 blur-[1px]" />
        {markerCities.map((markerCity) => {
          const point = classifiedCoordinatesForCity(markerCity);
          if (!point) return null;
          const position = project(point[0], point[1]);
          return (
            <span
              key={markerCity}
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${position.left}%`, top: `${position.top}%` }}
              title={markerCity}
            >
              <span className="block size-1.5 rounded-full bg-primary/65 ring-2 ring-white/80" />
              <span className="mt-0.5 block whitespace-nowrap text-[8px] font-semibold text-primary/80">
                {markerCity}
              </span>
            </span>
          );
        })}
        <div
          aria-hidden="true"
          className="absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary/70 bg-primary/15 shadow-[0_0_0_9999px_rgba(255,255,255,.03)]"
          style={{
            left: `${centerPosition.left}%`,
            top: `${centerPosition.top}%`,
            width: `${radiusSize}%`,
            aspectRatio: "1",
          }}
        />
        <MapPin
          aria-hidden="true"
          size={25}
          weight="fill"
          className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-full text-primary drop-shadow"
          style={{ left: `${centerPosition.left}%`, top: `${centerPosition.top}%` }}
        />
        <div className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-card/90 px-2.5 py-1 text-[10px] font-semibold text-foreground shadow-sm">
          {nearest?.city ?? "Selected map point"} · {radiusMiles} miles
        </div>
      </div>
      <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
        Results use the selected point and include listings whose saved city falls inside the circle.
        City labels are shown as reference points; the map point is the search center.
      </p>
    </div>
  );
}
