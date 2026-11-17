import type { ListingCardSummary } from "./listing-card-summary";
export type ComparisonItem = {
  id: string;
  title: string;
  image: string | null;
  kind: "vehicle" | "home";
  rows: [string, string][];
};
export function comparisonItem(card: ListingCardSummary): ComparisonItem | null {
  if (!card.vehicle && !card.home) return null;
  const v = card.vehicle,
    h = card.home;
  const text = (value: string | number | null | undefined) =>
    value == null || value === ""
      ? "—"
      : typeof value === "number"
        ? value.toLocaleString("en-US")
        : value;
  const price =
    card.priceCents > 0
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: card.currency || "USD",
          maximumFractionDigits: 0,
        }).format(card.priceCents / 100)
      : "Contact for price";
  return {
    id: card.id,
    title: card.title,
    image: card.imageUrl,
    kind: v ? "vehicle" : "home",
    rows: [
      ["Price", price + (h?.mode === "rent" && card.priceCents > 0 ? "/month" : "")],
      ["Location", [card.city, card.state].filter(Boolean).join(", ") || "—"],
      ...(v
        ? ([
            ["Year", v.year == null ? "—" : String(v.year)],
            ["Mileage", text(v.mileage)],
            ["Trim", text(v.trim)],
            ["Transmission", text(v.transmission)],
            ["Drivetrain", text(v.drivetrain)],
            ["Fuel", text(v.fuelType)],
          ] as [string, string][])
        : ([
            [
              "Listing type",
              h?.mode === "rent" ? "For rent" : h?.mode === "build" ? "New build" : "For sale",
            ],
            ["Bedrooms", text(h?.bedrooms)],
            ["Bathrooms", text(h?.bathrooms)],
            ["Square feet", text(h?.squareFeet)],
            ["Year built", h?.yearBuilt == null ? "—" : String(h.yearBuilt)],
            ["Property type", text(h?.propertyType)],
          ] as [string, string][])),
    ],
  };
}
export function addComparison(items: ComparisonItem[], next: ComparisonItem) {
  if (items.some((item) => item.id === next.id)) return items.filter((item) => item.id !== next.id);
  if (items.length >= 3 || (items[0] && items[0].kind !== next.kind)) return items;
  return [...items, next];
}
