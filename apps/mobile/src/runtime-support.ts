/** Ephemeral feature detection only. No device identifiers, UA parsing, logging,
 * network requests or advertising/personalization inputs. */
export function mobileRuntimeSupported() {
  return (
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("color", "oklch(0.5 0.1 200)") &&
    CSS.supports("color", "color-mix(in oklab, black, white)") &&
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function" &&
    typeof AbortController === "function" &&
    typeof fetch === "function" &&
    typeof Object.hasOwn === "function"
  );
}
