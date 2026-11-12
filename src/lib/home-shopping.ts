/** Public property addresses are supplied by home feeds; private sellers retain city-only maps. */
export function homeMapLocation(listing: {
  title: string;
  city: string;
  state: string;
  postalCode?: string | null;
  externalHome?: { address?: string | null; latitude?: number | null; longitude?: number | null };
}) {
  const address =
    listing.externalHome?.address ||
    (listing.externalHome && /^\d[\w\s.-]*\s+\S/.test(listing.title) ? listing.title : null);
  const label = [address, listing.city, listing.state, listing.postalCode]
    .filter(Boolean)
    .join(", ");
  const lat = listing.externalHome?.latitude,
    lng = listing.externalHome?.longitude;
  const coordinates =
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    (lat !== 0 || lng !== 0);
  return {
    label,
    exact: Boolean(address || coordinates),
    query: encodeURIComponent(address ? label : coordinates ? `${lat},${lng}` : label),
  };
}

/** A cut in the current listing, never appreciation against a historical sale price. */
export function homePriceCut(
  priceCents: number,
  history: { label: string; amount: number; date?: string | null }[],
) {
  const current = priceCents / 100;
  if (!(current > 0)) return null;
  const dated = history
    .filter((r) => r.date && Number.isFinite(Date.parse(r.date)) && r.amount > 0)
    .slice()
    .sort((a, b) => Date.parse(b.date!) - Date.parse(a.date!));
  const latest = dated[0];
  if (
    latest &&
    /price|reduc/i.test(latest.label) &&
    !/sold|closed|last recorded sale|tax/i.test(latest.label) &&
    latest.amount === current
  ) {
    for (const previous of dated.slice(1)) {
      if (/sold|closed|last recorded sale|off.market|removed/i.test(previous.label)) break;
      if (/list|price/i.test(previous.label) && previous.amount !== current)
        return previous.amount > current
          ? { amount: previous.amount - current, date: latest.date }
          : null;
    }
  }
  const original = history.find((r) => /^original list price$/i.test(r.label));
  return original && original.amount > current
    ? { amount: original.amount - current, date: latest?.amount === current ? latest.date : null }
    : null;
}

type HomeCard = {
  id: string;
  title: string;
  city: string;
  state: string;
  priceCents: number;
  home?: { mode: string; bedrooms: number | null; squareFeet: number | null } | null;
};
/** Rank actual available homes by location, mode, price, size and bedrooms. No provider calls. */
export function homeRecommendationRows<T extends HomeCard>(current: HomeCard, candidates: T[]) {
  const seen = new Set([current.id]);
  const addressKey = (row: HomeCard) =>
    /^\d.*\s\S/.test(row.title)
      ? `${row.state}|${row.city}|${row.title}`.toLowerCase().replace(/[^a-z0-9|]/g, "")
      : null;
  const addresses = new Set(
    [addressKey(current)].filter((value): value is string => value !== null),
  );
  const scored = candidates
    .filter((row) => {
      if (!row.home || row.home.mode !== current.home?.mode || seen.has(row.id)) return false;
      const address = addressKey(row);
      if (address && addresses.has(address)) return false;
      seen.add(row.id);
      if (address) addresses.add(address);
      return true;
    })
    .map((row) => {
      const local =
        row.city.toLowerCase() === current.city.toLowerCase() && row.state === current.state
          ? 0
          : row.state === current.state
            ? 1
            : row.state === "ID"
              ? 2
              : 3;
      const price =
        current.priceCents > 0 && row.priceCents > 0
          ? Math.abs(Math.log(row.priceCents / current.priceCents))
          : 2;
      const beds =
        current.home?.bedrooms != null && row.home?.bedrooms != null
          ? Math.abs(current.home.bedrooms - row.home.bedrooms) * 0.2
          : 0.3;
      const size =
        current.home?.squareFeet && row.home?.squareFeet
          ? Math.abs(Math.log(row.home.squareFeet / current.home.squareFeet)) * 0.5
          : 0.2;
      return { row, local, score: price + beds + size };
    })
    .sort(
      (a, b) =>
        Number(a.local === 3) - Number(b.local === 3) ||
        a.score + a.local * 0.4 - (b.score + b.local * 0.4) ||
        a.row.id.localeCompare(b.row.id),
    )
    .map((x) => x.row);
  return { similar: scored.slice(0, 8), moreHomes: scored.slice(8, 16) };
}
