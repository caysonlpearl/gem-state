import type { MobileHome } from "../../../src/lib/mobile-contract";

/** Home is a discovery feed, not an explicit search sort. A deliberate refresh
 * checks the current saved pool and gives its other available listings a turn.
 * No inventory is invented, relabeled as newly posted, or fetched upstream. */
export function refreshedHomeSelection(home: MobileHome, sequence: number): MobileHome {
  if (!Number.isSafeInteger(sequence) || sequence <= 0) return home;
  const rotate = <T>(values: T[]) => {
    if (values.length < 2) return values;
    const offset = (sequence * Math.min(4, values.length - 1)) % values.length;
    return [...values.slice(offset), ...values.slice(0, offset)];
  };
  return { motors: rotate(home.motors), recent: rotate(home.recent) };
}
