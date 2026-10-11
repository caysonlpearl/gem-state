import { MapPin, NavigationArrow } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef } from "react";
import type { Map as LeafletMap, LayerGroup, Circle, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";

import {
  classifiedCoordinatesForCity,
  marketplaceCities,
  nearestClassifiedCity,
} from "@/config/classifieds";

const DEFAULT_CENTER: [number, number] = [44.15, -114.45];
const MAP_BOUNDS: [[number, number], [number, number]] = [
  [36.5, -124.5],
  [49.5, -109.0],
];

const markerCities = marketplaceCities;

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

function mapPointFromProps(city?: string, latitude?: number, longitude?: number) {
  const fallback = classifiedCoordinatesForCity(city) ?? DEFAULT_CENTER;
  return {
    latitude: latitude ?? fallback[0],
    longitude: longitude ?? fallback[1],
  };
}

export function LocationRadiusPicker({
  city,
  latitude,
  longitude,
  radiusMiles,
  onChange,
  className,
}: Props) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const cityMarkersRef = useRef<LayerGroup | null>(null);
  const radiusCircleRef = useRef<Circle | null>(null);
  const centerMarkerRef = useRef<Marker | null>(null);
  const point = mapPointFromProps(city, latitude, longitude);
  const center: [number, number] = [point.latitude, point.longitude];
  const nearest = useMemo(
    () => nearestClassifiedCity(point.latitude, point.longitude),
    [point.latitude, point.longitude],
  );

  useEffect(() => {
    let cancelled = false;

    void import("leaflet").then((L) => {
      if (cancelled || !mapElementRef.current || mapRef.current) return;

      const map = L.map(mapElementRef.current, {
        center,
        zoom: 6.15,
        minZoom: 5.7,
        maxZoom: 12,
        maxBounds: MAP_BOUNDS,
        maxBoundsViscosity: 0.7,
        zoomControl: true,
        attributionControl: true,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        crossOrigin: true,
      }).addTo(map);

      const cityMarkers = L.layerGroup().addTo(map);
      for (const markerCity of markerCities) {
        const markerPoint = classifiedCoordinatesForCity(markerCity);
        if (!markerPoint) continue;
        L.circleMarker(markerPoint, {
          radius: 4,
          color: "#17364d",
          weight: 1.5,
          fillColor: "#ffffff",
          fillOpacity: 0.95,
        })
          .bindTooltip(markerCity, { direction: "top", offset: [0, -4] })
          .addTo(cityMarkers);
      }

      map.on("click", (event) => {
        const clickedLatitude = Number(event.latlng.lat.toFixed(5));
        const clickedLongitude = Number(event.latlng.lng.toFixed(5));
        const clickedNearest = nearestClassifiedCity(clickedLatitude, clickedLongitude);
        onChange({
          latitude: clickedLatitude,
          longitude: clickedLongitude,
          city: clickedNearest && (clickedNearest.distanceMiles ?? Infinity) <= 20 ? clickedNearest.city : undefined,
        });
      });

      mapRef.current = map;
      cityMarkersRef.current = cityMarkers;
      map.invalidateSize();
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      cityMarkersRef.current = null;
      radiusCircleRef.current = null;
      centerMarkerRef.current = null;
    };
    // The map is initialized once; the update effect below keeps its state current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !mapRef.current) return;
      const map = mapRef.current;
      map.setView(center, map.getZoom(), { animate: false });

      radiusCircleRef.current?.remove();
      radiusCircleRef.current = L.circle(center, {
        radius: radiusMiles * 1609.344,
        color: "#149fd6",
        weight: 2,
        fillColor: "#149fd6",
        fillOpacity: 0.12,
      }).addTo(map);

      centerMarkerRef.current?.remove();
      centerMarkerRef.current = L.marker(center, {
        icon: L.divIcon({
          className: "bluebird-map-center-marker",
          html: '<span aria-hidden="true"></span>',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
        keyboard: false,
        zIndexOffset: 1000,
      })
        .bindTooltip(nearest?.city ?? "Selected map point", { direction: "top", offset: [0, -10] })
        .addTo(map);
    });

    return () => {
      cancelled = true;
    };
  }, [center[0], center[1], nearest?.city, radiusMiles]);

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
        ref={mapElementRef}
        role="application"
        tabIndex={0}
        aria-label="Interactive Google Maps-style search radius map"
        className="bluebird-radius-map relative isolate h-64 overflow-hidden rounded-2xl border border-border bg-[#dceae8] shadow-inner outline-none focus-visible:ring-2 focus-visible:ring-primary sm:h-72"
      />
      <div className="pointer-events-none -mt-9 relative z-[500] mx-2 mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-card/95 px-2.5 py-1 text-[10px] font-semibold text-foreground shadow-sm">
          <MapPin size={12} weight="fill" className="text-primary" />
          {nearest?.city ?? "Selected map point"} · {radiusMiles} miles
        </span>
        <span className="rounded-full bg-card/90 px-2 py-1 text-[9px] text-muted-foreground shadow-sm">
          Drag to pan · scroll to zoom
        </span>
      </div>
      <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
        Results use the selected point and include listings whose saved city falls inside the circle.
        City labels are reference points; the map point is the search center.
      </p>
    </div>
  );
}
