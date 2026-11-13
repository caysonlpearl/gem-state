/** Nearby search needs a general center, never a precise device coordinate. */
export function approximateSearchPosition(coords: { latitude: number; longitude: number }) {
  if (
    !Number.isFinite(coords.latitude) ||
    !Number.isFinite(coords.longitude) ||
    Math.abs(coords.latitude) > 90 ||
    Math.abs(coords.longitude) > 180
  )
    throw Error("Location is unavailable.");
  return {
    coords: {
      latitude: Number(coords.latitude.toFixed(2)),
      longitude: Number(coords.longitude.toFixed(2)),
    },
  };
}
