import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { requestBrowserLocation } from "../../../src/components/classifieds/LocationRequest";
import { approximateSearchPosition } from "./location-contract";
/** Called only from the shared picker's explicit Use my location action. */
export async function requestNearbyLocation() {
  if (!Capacitor.isNativePlatform())
    return approximateSearchPosition((await requestBrowserLocation()).coords);
  const permission = await Geolocation.checkPermissions();
  if (permission.coarseLocation !== "granted") {
    const requested = await Geolocation.requestPermissions({ permissions: ["coarseLocation"] });
    if (requested.coarseLocation !== "granted") throw Error("Location was not shared.");
  }
  const position = await Geolocation.getCurrentPosition({
    enableHighAccuracy: false,
    maximumAge: 300000,
    timeout: 10000,
  });
  return approximateSearchPosition(position.coords);
}
