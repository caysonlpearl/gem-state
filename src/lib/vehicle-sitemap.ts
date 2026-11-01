/** Public cached vehicle cards qualify landing pages, not member listings or seller pages. */
export function vehicleLandingReferences(cards: readonly {
  id: string;
  createdAt: string;
  city: string;
  state: string;
  region: string;
  vehicle?: { make?: string | null; model?: string | null } | null;
}[]) {
  const seen = new Set<string>();
  return cards.filter((card) => {
    if (seen.has(card.id) || !Number.isFinite(Date.parse(card.createdAt))) return false;
    seen.add(card.id);
    return true;
  }).map((card) => ({
    createdAt: card.createdAt,
    details: {
      city: card.city,
      state: card.state,
      region: card.region,
      vehicle_make: card.vehicle?.make ?? null,
      vehicle_model: card.vehicle?.model ?? null,
    },
  }));
}