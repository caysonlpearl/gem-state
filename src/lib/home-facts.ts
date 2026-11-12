export type HomeFactGroup = [string, [string, string | null | undefined][]];
const placeholder =
  /^(?:—|–|-{1,2}|n\/?a|not provided by listing source|ask seller|confirm with seller|none|unknown|null)$/i;
const aliases: Record<string, string> = {
  beds: "Bedrooms",
  baths: "Bathrooms",
  sqft: "Living area",
  "square feet": "Living area",
  "living area": "Living area",
  "finished sq. ft.": "Finished living area",
  "total sq. ft.": "Total area",
  "building area total": "Total area",
  "parking features": "Parking",
  "garage parking": "Parking",
  "has attached garage": "Attached garage",
  "basement yn": "Has basement",
  basement: "Basement type",
  "interior features": "Interior features",
  "appliances included": "Appliances",
  "floor coverings": "Flooring",
  "lot size acres": "Lot size",
  "high school district": "School district",
  "association fee": "HOA fees",
  "association fee frequency": "HOA frequency",
  "tax annual amount": "Annual property tax",
  "property sub type": "Property subtype",
  "water body name": "Water body",
  "view yn": "Has view",
  "year built": "Year built",
  "year renovated": "Year renovated",
};
function labelFor(raw: string) {
  const label = raw.replace(/\s+/g, " ").trim();
  return aliases[label.toLowerCase()] ?? label.replace(/\bYN\b/g, "available");
}
function groupFor(label: string, fallback: string) {
  if (
    /bedroom|bathroom|living area|^total area$|appliance|floor|heat|cool|interior|laundry|fireplace|basement|window/i.test(
      label,
    )
  )
    return "Interior";
  if (
    /parking|garage|carport|lot|yard|patio|porch|fenc|waterfront|water body|view|exterior features/i.test(
      label,
    )
  )
    return "Property";
  if (
    /roof|construction|material|foundation|year built|year renovated|stories|style|home type|property subtype/i.test(
      label,
    )
  )
    return "Construction";
  if (
    /community|hoa|association|district|utility|utilities|sewer|water source|road|county/i.test(
      label,
    )
  )
    return "Community & utilities";
  return fallback === "Community & HOA" ? "Community & utilities" : fallback;
}
function cleanValue(label: string, raw: string) {
  let value = raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[,;·\s]+|[,;·\s]+$/g, "");
  // Remove a repeated source label without touching meaningful colons inside values.
  const repeated = value.match(/^([^:]{1,65}):\s*(.*)$/);
  if (repeated && labelFor(repeated[1]).toLowerCase() === label.toLowerCase()) value = repeated[2];
  if (!value || placeholder.test(value) || /https?:\/\//i.test(value)) return null;
  if (/^has\b|^attached garage$/i.test(label) && /^(true|yes)$/i.test(value)) return "Yes";
  if (/^has\b|^attached garage$/i.test(label) && /^(false|no)$/i.test(value)) return "No";
  if (/^(Bedrooms|Bathrooms)$/.test(label))
    value = value.replace(/\s*(beds?|baths?)$/i, "").replace(/\.0+$/, "");
  if (/Annual property tax/.test(label) && /^[\d,.]+$/.test(value))
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(Number(value.replaceAll(",", "")));
  if (
    /^(?:Living area|Finished living area|Total area)$/.test(label) &&
    /^[\d,.]+(?:\s*sq\s*ft)?$/i.test(value)
  )
    return `${Number(value.replace(/[^\d.]/g, "")).toLocaleString("en-US")} sq ft`;
  return value;
}

/** Rebuild readable facts from both current structured fields and legacy flattened cache strings. */
export function readableHomeFacts(base: HomeFactGroup[], amenities: string[]) {
  const groups = new Map<string, Map<string, { label: string; values: string[] }>>();
  const links = new Map<string, string>();
  const add = (rawLabel: string, rawValue: string, fallback: string) => {
    const label = labelFor(rawLabel);
    const value = cleanValue(
      label,
      /^lot size acres$/i.test(rawLabel) && /^\d+(?:\.\d+)?$/.test(rawValue)
        ? `${rawValue} acres`
        : rawValue,
    );
    if (!value || /virtual tour|external link|lot size area/i.test(label)) return;
    const group = groupFor(label, fallback);
    if (!groups.has(group)) groups.set(group, new Map());
    const key = label.toLowerCase(),
      entries = groups.get(group)!;
    if (!entries.has(key)) entries.set(key, { label, values: [] });
    const values = entries.get(key)!.values;
    if (!values.some((v) => v.toLowerCase() === value.toLowerCase())) values.push(value);
  };
  const parse = (raw: string, fallbackLabel: string, fallbackGroup: string) => {
    if (!raw?.trim()) return;
    const urls = raw.match(/https?:\/\/[^\s,;]+/g) ?? [];
    if (/virtual tour/i.test(raw))
      for (const value of urls) {
        try {
          const url = new URL(value);
          if (url.protocol === "https:" && !url.username && !url.password)
            links.set(url.href, "View virtual tour");
        } catch {
          /* Invalid source links are omitted. */
        }
      }
    const withoutUrls = raw.replace(/https?:\/\/[^\s,;]+/g, "");
    const text = withoutUrls.replace(
      /(?:^|[,;·]\s*)(Has\s+[A-Za-z ]+)(?=[,;·]|$)/g,
      (_match, label: string) => {
        add(label.replace(/^Has\s+/i, ""), "Yes", fallbackGroup);
        return "";
      },
    );
    const markers = [...text.matchAll(/(?:^|[,;·\n]\s*)([A-Za-z][A-Za-z0-9 &'()/.-]{0,65}):\s*/g)];
    if (markers.length) {
      markers.forEach((match, i) =>
        add(
          match[1],
          text.slice(match.index! + match[0].length, markers[i + 1]?.index ?? text.length),
          fallbackGroup,
        ),
      );
    } else {
      const boolean = text.trim().match(/^Has\s+(.+)$/i);
      if (boolean) add(boolean[1], "Yes", fallbackGroup);
      else add(fallbackLabel, text, fallbackGroup);
    }
  };
  // Source entries are separate in the existing cache even when summary fields were over-flattened.
  for (const amenity of amenities) parse(amenity, "Amenities", "Additional details");
  const hasStructuredSource = amenities.filter((value) => /^[^:]{1,65}:/.test(value)).length > 3;
  for (const [group, rows] of base)
    for (const [label, value] of rows) {
      if (!value) continue;
      // Complete source entries already contain these legacy flattened summaries.
      if (hasStructuredSource && /^special features$/i.test(label)) continue;
      const canonical = labelFor(label).toLowerCase();
      if ([...groups.values()].some((rows) => rows.has(canonical))) continue;
      parse(value, label, group);
    }
  const interior = groups.get("Interior");
  const livingArea = interior?.get("living area")?.values.join(" · ");
  if (livingArea)
    for (const key of ["finished living area", "total area"]) {
      if (interior?.get(key)?.values.join(" · ") === livingArea) interior.delete(key);
    }
  const interiorOrder = [
    "bedrooms",
    "bathrooms",
    "living area",
    "main level bedrooms",
    "main level bathrooms",
    "heating",
    "cooling",
    "appliances",
    "flooring",
  ];
  const order = [
    "Interior",
    "Property",
    "Construction",
    "Community & utilities",
    "Additional details",
  ];
  return {
    groups: [...groups]
      .sort(
        ([a], [b]) =>
          (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) -
          (order.indexOf(b) < 0 ? 99 : order.indexOf(b)),
      )
      .map(([title, rows]) => [
        title,
        [...rows.values()]
          .sort((a, b) =>
            title === "Interior"
              ? (interiorOrder.indexOf(a.label.toLowerCase()) < 0
                  ? 99
                  : interiorOrder.indexOf(a.label.toLowerCase())) -
                (interiorOrder.indexOf(b.label.toLowerCase()) < 0
                  ? 99
                  : interiorOrder.indexOf(b.label.toLowerCase()))
              : 0,
          )
          .map(({ label, values }) => [label, values.join(" · ")]),
      ]) as [string, [string, string][]][],
    links: [...links].map(([url, label]) => ({ url, label })),
  };
}

export function homeParkingSummary(value: string | null | undefined, amenities: string[] = []) {
  const facts = readableHomeFacts([["Property", [["Parking", value]]]], amenities).groups.flatMap(
    ([, rows]) => rows,
  );
  if (facts.some(([label, value]) => /attached garage/i.test(label) && /^yes$/i.test(value)))
    return "Attached garage";
  const parking = facts.find(([label]) => /^Parking$/i.test(label))?.[1];
  if (!parking) return null;
  return parking.split(/[·;,]/)[0].trim();
}
