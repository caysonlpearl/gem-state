import {
  normalizeOpenWebNinjaHome,
  normalizeOpenWebNinjaProperty,
  type OpenWebNinjaMode,
} from "./openwebninja-contract.ts";
const object = (v: unknown): Record<string, any> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {};
const data = (v: unknown) => {
  const root = object(v);
  return object(root.data ?? root);
};
const redfinUrl = (v: unknown) => {
  if (typeof v !== "string" || !v.trim()) return null;
  try {
    const url = new URL(v, "https://www.redfin.com");
    return /(^|\.)redfin\.com$/.test(url.hostname) && ["http:", "https:"].includes(url.protocol)
      ? url.href.replace(/^http:/, "https:")
      : null;
  } catch {
    return null;
  }
};
const unitAddress = (row: Record<string, any>) => {
  const street = String(row.street_address ?? ""),
    unit = String(row.unit_number ?? "")
      .trim()
      .replace(/^(?:(?:UNIT|APT|APARTMENT|SUITE|STE)\s*#?\s*|#\s*)/i, "")
      .trim();
  if (!unit) return street;
  const normalized = street
    .toUpperCase()
    .replace(/\b(APT|SUITE|STE)\s*#?|#/g, "UNIT ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.endsWith(`UNIT ${unit.toUpperCase()}`) ? street : `${street} UNIT ${unit}`;
};

/** The Redfin API uses its own property IDs and response schema. */
export function normalizeRedfinResult(
  payload: unknown,
  mode: OpenWebNinjaMode,
  observedAt = Date.now(),
) {
  const rows = data(payload).results;
  if (!Array.isArray(rows)) throw new Error("Redfin search data is unavailable");
  return {
    status: "ok" as const,
    homes: (Array.isArray(rows) ? rows : []).flatMap((raw: unknown) => {
      const row = object(raw);
      // Live for_rent searches returned verified for-sale properties with
      // their sale prices and generic ACTIVE status. The requested mode is
      // not evidence that an individual result is a rental.
      if (
        mode === "rent" &&
        ![row.search_status, row.mls_status].some(
          (status) =>
            typeof status === "string" &&
            /^(?:for[ _-]?rent|rental|for[ _-]?lease)$/i.test(status.trim()),
        )
      )
        return [];
      if (
        !/^\d{1,20}$/.test(String(row.property_id ?? "")) ||
        /sold|off.?market|inactive|pending|contingent/i.test(
          String(row.search_status ?? row.mls_status ?? ""),
        )
      )
        return [];
      const home = normalizeOpenWebNinjaHome(
        {
          id: `redfin-${row.property_id}`,
          streetAddress: unitAddress(row),
          city: row.city,
          state: row.state,
          zipcode: row.zip_code,
          price: row.price,
          homeType: row.property_type,
          beds: row.beds,
          baths: row.baths,
          sqft: row.sqft,
          imgSrc: row.primary_photo_url,
          daysOnMarket: row.days_on_market,
          dateListed: row.list_date,
          latitude: row.latitude,
          longitude: row.longitude,
          detailUrl: redfinUrl(row.listing_url ?? row.url),
        },
        mode,
      );
      return home
        ? [{ ...home, observedAt: new Date(observedAt).toISOString(), provider: "redfin" as const }]
        : [];
    }),
  };
}

export function normalizeRedfinProperty(payload: unknown) {
  const row = data(payload);
  const entries: { label: string; value: string; group: string }[] = [];
  for (const category of Array.isArray(row.amenity_groups) ? row.amenity_groups : []) {
    for (const group of Array.isArray(category.groups) ? category.groups : []) {
      for (const entry of Array.isArray(group.entries) ? group.entries : []) {
        const values = (Array.isArray(entry.values) ? entry.values : []).filter(
          (v: unknown) => typeof v === "string" && v.trim(),
        );
        if (values.length)
          entries.push({
            label: String(entry.name ?? ""),
            value: values.join(", "),
            group: `${category.title ?? ""} ${group.title ?? ""}`,
          });
      }
    }
  }
  const select = (pattern: RegExp) =>
    entries
      .filter((e) => pattern.test(e.label))
      .map((e) => (e.label ? `${e.label}: ${e.value}` : e.value));
  const type =
    typeof row.property_type === "string" && !/^\d+$/.test(row.property_type)
      ? row.property_type
      : null;
  return normalizeOpenWebNinjaProperty({
    data: {
      detailUrl: redfinUrl(row.url),
      source: "Redfin",
      homeType: type,
      yearBuilt: row.year_built,
      bedrooms: row.beds,
      bathrooms: row.baths,
      livingArea: row.sqft,
      publicRemarks: row.public_description,
      photos: row.photos,
      lastSoldPrice: row.sold_price,
      lastSoldDate: row.sold_date,
      lotSize: row.lot_size_sqft,
      priceHistory: row.price_history,
      taxHistory: (Array.isArray(row.tax_history) ? row.tax_history : []).map((tax: any) => ({
        date: tax.year,
        taxPaid: tax.taxes,
        value: tax.assessed_value,
      })),
      schools: row.schools,
      amenities: entries.map((e) => (e.label ? `${e.label}: ${e.value}` : e.value)),
      hoa:
        row.hoa_dues != null
          ? `$${row.hoa_dues}${row.hoa_frequency ? ` ${row.hoa_frequency}` : ""}`
          : null,
      resoFacts: {
        heating: select(/heat|furnace|forced air/i),
        cooling: select(/cool|air condition|central air/i),
        parkingFeatures: entries
          .filter((e) => /parking|garage/i.test(e.group))
          .map((e) => (e.label ? `${e.label}: ${e.value}` : e.value)),
        appliances: select(/appliance|dishwasher|refrigerator|washer|dryer/i),
        constructionMaterials: select(/construction|exterior material|roof/i),
        interiorFeatures: entries
          .filter((e) => /interior|bedroom|bathroom/i.test(e.group))
          .map((e) => (e.label ? `${e.label}: ${e.value}` : e.value)),
      },
      attributionInfo: {
        agentName: object(row.listing_agent).name,
        agentPhoneNumber: object(row.listing_agent).phone,
        brokerName: object(row.listing_broker).name,
        brokerPhoneNumber: object(row.listing_broker).phone,
        mlsName: row.mls_name,
      },
    },
  });
}
