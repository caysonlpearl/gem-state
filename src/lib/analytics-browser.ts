import { isInternalAnalyticsQuery } from "./analytics-policy.ts";

export const INTERNAL_TRAFFIC_KEY = "bb_internal_traffic";
type AnalyticsBrowser = {
  location: { search: string };
  localStorage: Pick<Storage, "getItem" | "setItem">;
  sessionStorage: Pick<Storage, "getItem" | "setItem">;
};

/** An explicit testing marker follows this browser across tabs and sign-outs. */
export function markInternalAnalyticsBrowser(target?: AnalyticsBrowser) {
  const browser = target ?? (typeof window !== "undefined" ? window : undefined);
  if (!browser) return;
  for (const storage of ["localStorage", "sessionStorage"] as const) {
    try {
      browser[storage].setItem(INTERNAL_TRAFFIC_KEY, "1");
    } catch {
      /* Optional storage. */
    }
  }
}
export function isInternalAnalyticsBrowser(target: AnalyticsBrowser, explicit = false) {
  let internal = explicit || isInternalAnalyticsQuery(target.location.search);
  for (const storage of ["localStorage", "sessionStorage"] as const) {
    try {
      internal ||= target[storage].getItem(INTERNAL_TRAFFIC_KEY) === "1";
    } catch {
      /* Optional storage. */
    }
  }
  if (internal) markInternalAnalyticsBrowser(target);
  return internal;
}
