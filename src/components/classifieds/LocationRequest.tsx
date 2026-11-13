import { createContext, useContext, type ReactNode } from "react";
export type SearchPosition = { coords: { latitude: number; longitude: number } };
export type LocationRequest = () => Promise<SearchPosition>;
export function requestBrowserLocation(): Promise<SearchPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(Error("Location is unavailable."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: 300000,
      timeout: 10000,
    });
  });
}
const Context = createContext<LocationRequest>(requestBrowserLocation);
export function LocationRequestProvider({
  request,
  children,
}: {
  request: LocationRequest;
  children: ReactNode;
}) {
  return <Context.Provider value={request}>{children}</Context.Provider>;
}
export const useLocationRequest = () => useContext(Context);
