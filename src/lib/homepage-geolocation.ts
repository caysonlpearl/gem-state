export const HOME_LOCATION_REQUESTED = "bluebird.location.permission-requested.v1";
let askedThisSession = false;
type Point = { latitude: number; longitude: number };
let pending: Promise<Point | null> | undefined;
type LocationBrowser = {
  geolocation?: Pick<Geolocation, "getCurrentPosition">;
  permissions?: Pick<Permissions, "query">;
  storage?: Pick<Storage, "getItem" | "setItem">;
};

/** Request permission once, then use an existing grant on later visits.
 * Persist only the fact we asked, never the visitor's coordinates. */
export async function requestHomepageLocation(
  browser: LocationBrowser,
  automatic = true,
): Promise<Point | null> {
  if (!browser.geolocation) return null;
  if (pending) return pending;
  const permission = await browser.permissions?.query({ name: "geolocation" }).catch(() => null);
  if (permission?.state === "denied") return null;
  if (pending) return pending;
  let asked = askedThisSession;
  try {
    asked ||= browser.storage?.getItem(HOME_LOCATION_REQUESTED) === "1";
  } catch {
    /* Storage may be blocked. */
  }
  if (automatic && permission?.state !== "granted" && asked) return null;
  askedThisSession = true;
  try {
    browser.storage?.setItem(HOME_LOCATION_REQUESTED, "1");
  } catch {
    /* In-memory guard still applies. */
  }
  pending = new Promise<Point | null>((resolve) => {
    try {
      browser.geolocation!.getCurrentPosition(
        ({ coords }) => {
          const { latitude, longitude } = coords;
          if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            Math.abs(latitude) > 90 ||
            Math.abs(longitude) > 180
          )
            resolve(null);
          else
            resolve({
              latitude: Number(latitude.toFixed(3)),
              longitude: Number(longitude.toFixed(3)),
            });
        },
        () => resolve(null),
        { enableHighAccuracy: false, maximumAge: 5 * 60_000, timeout: 8000 },
      );
    } catch {
      resolve(null);
    }
  }).finally(() => {
    pending = undefined;
  });
  return pending;
}
