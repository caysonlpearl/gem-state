import { marketplaceCities, idahoRegions, usStates } from "../config/classifieds";
type ParsedLocationSearch = {
  city?: string;
  region?: string;
  state?: string;
  postalCode?: string;
};
export function parseLocationSearch(value: string): ParsedLocationSearch {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return {};

  const zipMatch = normalized.match(/\b\d{5}(?:-\d{4})?\b$/);
  const postalCode = zipMatch?.[0];
  const withoutPostalCode = normalized.replace(/\s*\b\d{5}(?:-\d{4})?\b$/, "").trim();
  const matchingRegion = idahoRegions.find(
    (option) => option.toLowerCase() === withoutPostalCode.toLowerCase(),
  );
  if (matchingRegion) return { region: matchingRegion, ...(postalCode ? { postalCode } : {}) };
  const matchingStateOnly = usStates.find(
    ([code, name]) =>
      code.toLowerCase() === withoutPostalCode.toLowerCase() ||
      name.toLowerCase() === withoutPostalCode.toLowerCase(),
  );
  if (matchingStateOnly) {
    return { state: matchingStateOnly[0], ...(postalCode ? { postalCode } : {}) };
  }

  const parts = withoutPostalCode
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  let city = parts.length > 1 ? parts.slice(0, -1).join(", ") : withoutPostalCode;
  let stateToken = parts.length > 1 ? parts.at(-1) : undefined;

  if (!stateToken) {
    const stateSuffix =
      usStates.find(([, name]) => {
        const lowerName = name.toLowerCase();
        const lowerValue = withoutPostalCode.toLowerCase();
        return lowerValue.endsWith(` ${lowerName}`);
      }) ??
      usStates.find(([code]) => withoutPostalCode.toLowerCase().endsWith(` ${code.toLowerCase()}`));
    if (stateSuffix) {
      stateToken = stateSuffix[1];
      city = withoutPostalCode.slice(0, -stateToken.length).trim();
    }
  }

  const matchingState = stateToken
    ? usStates.find(
        ([code, name]) =>
          code.toLowerCase() === stateToken?.toLowerCase() ||
          name.toLowerCase() === stateToken?.toLowerCase(),
      )
    : undefined;

  return {
    ...(city ? { city } : {}),
    ...(matchingState ? { state: matchingState[0] } : {}),
    ...(postalCode ? { postalCode } : {}),
  };
}
