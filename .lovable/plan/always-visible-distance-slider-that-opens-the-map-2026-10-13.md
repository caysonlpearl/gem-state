# Always-visible distance slider that opens the map

All changes in `src/routes/index.tsx` (home search area, lines ~387-432).

## Behavior
- The "Distance" slider is always shown (no longer hidden until a city or map point is chosen).
- When the visitor starts dragging it (pointer down or keyboard change) and the map is closed, the map opens automatically.
- On that first open, if no location is chosen yet, the map centers on the visitor's location:
  - Ask the browser for location (one-time prompt).
  - If allowed: use that point as the search center.
  - If denied, unavailable, or slow (about 4 seconds): use Boise.
- The slider stays draggable while location is being looked up; the circle on the map updates as it moves.
- If the visitor already typed a city or clicked the map, that choice is kept and no lookup happens.
- Because the radius now applies whenever a center exists, the search/browse links keep passing `radiusMiles` only when a city or map point exists (unchanged).

## Technical details
- Add `openMapWithDefault()` : sets `mapOpen` true; if no `mapPoint` and no parsed city, calls `navigator.geolocation.getCurrentPosition` (timeout 4000ms), then `setMapPoint({latitude, longitude, city: nearest classified city within 20 mi})` using `nearestClassifiedCity`; on error sets Boise via `classifiedCoordinatesForCity("Boise")` with city "Boise". Guard against double calls with a ref.
- Slider `onPointerDown` and `onChange` call `openMapWithDefault()` when `!mapOpen`.
- Remove the `parsedLocation.city || mapPoint ?` condition around the slider label.
- Update `setLocation` with the resolved city name so "Search area" summary reflects it.
- No backend, data, or other UI changes.
