export type InventorySourceType = "manual_upload" | "file_url" | "sftp" | "api" | "webhook";
export type InventoryFileFormat = "csv" | "xml" | "json";
export type InventoryStatus =
  "active" | "sold" | "pending" | "reserved" | "removed" | "stale" | "invalid";

export type InventoryField =
  | "source_record_key"
  | "stock_number"
  | "vin"
  | "title"
  | "description"
  | "price"
  | "city"
  | "state"
  | "postal_code"
  | "status"
  | "make"
  | "model"
  | "year"
  | "trim"
  | "mileage"
  | "body_style"
  | "transmission"
  | "drivetrain"
  | "fuel_type"
  | "exterior_color"
  | "title_status"
  | "source_updated_at"
  | "photos";

export type InventoryMapping = Partial<Record<InventoryField, string>>;

export const defaultInventoryMapping: InventoryMapping = {
  source_record_key: "stock_number",
  stock_number: "stock_number",
  vin: "vin",
  title: "title",
  description: "description",
  price: "price",
  city: "city",
  state: "state",
  postal_code: "postal_code",
  status: "status",
  make: "make",
  model: "model",
  year: "year",
  trim: "trim",
  mileage: "mileage",
  body_style: "body_style",
  transmission: "transmission",
  drivetrain: "drivetrain",
  fuel_type: "fuel_type",
  exterior_color: "exterior_color",
  title_status: "title_status",
  source_updated_at: "source_updated_at",
  photos: "photos",
};

export type InventoryMedia = {
  mediaUrl: string;
  position: number;
  altText: string | null;
  contentHash: string;
};

export type NormalizedInventoryRecord = {
  sourceRecordKey: string;
  stockNumber: string | null;
  vin: string | null;
  title: string;
  description: string | null;
  priceCents: number;
  city: string;
  state: string;
  postalCode: string | null;
  inventoryStatus: InventoryStatus;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehicleTrim: string | null;
  vehicleMileage: number | null;
  vehicleBodyStyle: string | null;
  vehicleTransmission: string | null;
  vehicleDrivetrain: string | null;
  vehicleFuelType: string | null;
  vehicleExteriorColor: string | null;
  vehicleTitleStatus: string | null;
  sourceUpdatedAt: string | null;
  contentHash: string;
  rawRecord: Record<string, string>;
  media: InventoryMedia[];
};

export type InventoryRowError = {
  rowNumber: number;
  message: string;
  field?: InventoryField;
};

export type InventoryParseResult = {
  headers: string[];
  rows: Record<string, string>[];
  records: NormalizedInventoryRecord[];
  errors: InventoryRowError[];
  duplicateKeys: string[];
  duplicateVins: string[];
};

/**
 * Adapter boundary for future XML, JSON, API, and webhook feeds. Reconciliation
 * consumes the same normalized result regardless of how the source arrived.
 */
export type InventoryFeedAdapter = {
  format: InventoryFileFormat;
  parse: (input: string, mapping?: InventoryMapping) => InventoryParseResult;
};

export type InventoryDiff = {
  created: number;
  updated: number;
  unchanged: number;
  stale: number;
};

export type ExistingInventoryRecord = {
  sourceRecordKey: string;
  vin: string | null;
  contentHash: string;
  inventoryStatus: InventoryStatus;
};

const REQUIRED_FIELDS: Array<[InventoryField, string]> = [
  ["source_record_key", "a stock number or source record key"],
  ["make", "make"],
  ["model", "model"],
  ["year", "year"],
  ["price", "price"],
  ["city", "city"],
  ["state", "state"],
];

const STATUS_ALIASES: Record<string, InventoryStatus> = {
  active: "active",
  available: "active",
  "in stock": "active",
  inventory: "active",
  "on lot": "active",
  sold: "sold",
  pending: "pending",
  reserved: "reserved",
  hold: "reserved",
  removed: "removed",
  deleted: "removed",
  stale: "stale",
};

const clean = (value: unknown) => String(value ?? "").trim();

function normalizeHeader(value: string): string {
  return value.trim().replace(/^\uFEFF/, "");
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];
    if (character === '"') {
      if (quoted && next === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field");
  values.push(value);
  return values;
}

export function parseCsv(input: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = input.replace(/^\uFEFF/, "").split(/\r?\n/);
  const logicalLines: string[] = [];
  let current = "";
  let quoted = false;
  for (const line of lines) {
    current = current ? `${current}\n${line}` : line;
    let quoteCount = 0;
    for (let index = 0; index < line.length; index += 1) {
      if (line[index] === '"' && line[index - 1] !== "\\") quoteCount += 1;
    }
    if (quoteCount % 2 !== 0) quoted = !quoted;
    if (!quoted) {
      if (current.trim()) logicalLines.push(current);
      current = "";
    }
  }
  if (current.trim()) throw new Error("CSV contains an unterminated quoted field");
  if (logicalLines.length === 0) throw new Error("CSV is empty");

  const headers = splitCsvLine(logicalLines[0]!).map(normalizeHeader);
  if (headers.length === 0 || headers.some((header) => !header))
    throw new Error("CSV needs a header row");
  const rows = logicalLines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
  return { headers, rows };
}

function toSnakeCase(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function jsonValueToString(value: unknown, key: string): string {
  if (Array.isArray(value)) {
    if (key === "photos" || key === "photo_urls" || key === "images") {
      return value
        .map((item) =>
          typeof item === "object" && item !== null
            ? ((item as Record<string, unknown>)["url"] ??
              (item as Record<string, unknown>)["src"] ??
              "")
            : item,
        )
        .map(clean)
        .filter(Boolean)
        .join("|");
    }
    return value.map(clean).filter(Boolean).join("|");
  }
  if (value && typeof value === "object") return JSON.stringify(value);
  return clean(value);
}

function rowsFromJson(input: string): Record<string, string>[] {
  const parsed: unknown = JSON.parse(input);
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? Object.values(parsed as Record<string, unknown>).find(Array.isArray)
      : null;
  const candidates = rows ?? (parsed && typeof parsed === "object" ? [parsed] : []);
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error("JSON must contain an array of inventory records.");
  }
  if (
    candidates.some(
      (candidate) => !candidate || typeof candidate !== "object" || Array.isArray(candidate),
    )
  ) {
    throw new Error("JSON inventory records must be objects.");
  }
  return candidates.map((candidate) => {
    const row: Record<string, string> = {};
    for (const [key, value] of Object.entries(candidate as Record<string, unknown>)) {
      const stringValue = jsonValueToString(value, toSnakeCase(key));
      row[key] = stringValue;
      row[toSnakeCase(key)] = stringValue;
    }
    return row;
  });
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function rowsFromXml(input: string): Record<string, string>[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(input)) {
    throw new Error("XML declarations and entities are not allowed in feed uploads.");
  }
  const recordTags = ["vehicle", "item", "listing", "ad", "record"];
  let matches: RegExpMatchArray[] = [];
  for (const tag of recordTags) {
    const tagMatches = [
      ...input.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi")),
    ];
    if (tagMatches.length > 0) {
      matches = tagMatches;
      break;
    }
  }
  if (matches.length === 0)
    throw new Error("XML must contain repeated vehicle or listing records.");

  return matches.map((match) => {
    const row: Record<string, string> = {};
    const body = match[1] ?? "";
    const leafTags = /<([A-Za-z_][\w:.-]*)\b[^>]*>([^<]*)<\/\1>/gi;
    for (const leaf of body.matchAll(leafTags)) {
      const originalKey = leaf[1] ?? "";
      const key = toSnakeCase(originalKey);
      const value = decodeXml(leaf[2] ?? "");
      row[originalKey] = value;
      row[key] = value;
    }
    const photoValues = [
      ...body.matchAll(/<(?:photo|photo_url|image|image_url|url)\b[^>]*>([^<]+)<\//gi),
    ]
      .map((photo) => decodeXml(photo[1] ?? ""))
      .filter(Boolean);
    if (photoValues.length > 0) row["photos"] = photoValues.join("|");
    return row;
  });
}

function valueFor(
  row: Record<string, string>,
  field: InventoryField,
  mapping: InventoryMapping,
): string {
  const column = mapping[field] ?? defaultInventoryMapping[field] ?? field;
  return clean(row[column]);
}

function normalizePriceCents(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const number = Number(cleaned.includes(".") ? cleaned : Number(cleaned));
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.round(number * 100);
}

function normalizeInteger(value: string): number | null {
  const cleaned = value.replace(/[,\s]/g, "");
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isInteger(number) ? number : null;
}

function normalizeVin(value: string): string | null {
  const vin = value.replace(/[\s-]/g, "").toUpperCase();
  return vin || null;
}

function normalizeStatus(value: string): InventoryStatus {
  return STATUS_ALIASES[value.toLowerCase()] ?? "active";
}

function splitPhotos(value: string): string[] {
  return value
    .split(/[|;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function contentHash(value: unknown): string {
  const input = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function errorFor(rowNumber: number, field: InventoryField, message: string): InventoryRowError {
  return { rowNumber, field, message };
}

export function normalizeInventoryRows(
  rows: Record<string, string>[],
  mapping: InventoryMapping = {},
): InventoryParseResult {
  const errors: InventoryRowError[] = [];
  const records: NormalizedInventoryRecord[] = [];
  const duplicateKeys: string[] = [];
  const duplicateVins: string[] = [];
  const seenKeys = new Set<string>();
  const seenVins = new Set<string>();

  rows.forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 2;
    const sourceRecordKey =
      valueFor(row, "source_record_key", mapping) ||
      valueFor(row, "stock_number", mapping) ||
      valueFor(row, "vin", mapping);
    const vin = normalizeVin(valueFor(row, "vin", mapping));
    for (const [field, label] of REQUIRED_FIELDS) {
      const value = field === "source_record_key" ? sourceRecordKey : valueFor(row, field, mapping);
      if (!value) errors.push(errorFor(rowNumber, field, `Missing ${label}.`));
    }
    if (sourceRecordKey && seenKeys.has(sourceRecordKey)) {
      duplicateKeys.push(sourceRecordKey);
      errors.push(
        errorFor(
          rowNumber,
          "source_record_key",
          `Duplicate source record key: ${sourceRecordKey}.`,
        ),
      );
    }
    if (vin && seenVins.has(vin)) {
      duplicateVins.push(vin);
      errors.push(errorFor(rowNumber, "vin", `Duplicate VIN in feed: ${vin}.`));
    }
    if (sourceRecordKey) seenKeys.add(sourceRecordKey);
    if (vin) seenVins.add(vin);

    const year = normalizeInteger(valueFor(row, "year", mapping));
    if (year != null && (year < 1900 || year > 2100))
      errors.push(errorFor(rowNumber, "year", "Year must be between 1900 and 2100."));
    const mileage = normalizeInteger(valueFor(row, "mileage", mapping));
    if (mileage != null && (mileage < 0 || mileage > 2000000))
      errors.push(errorFor(rowNumber, "mileage", "Mileage must be between 0 and 2,000,000."));
    const priceCents = normalizePriceCents(valueFor(row, "price", mapping));
    if (priceCents == null)
      errors.push(errorFor(rowNumber, "price", "Price must be a positive dollar amount."));
    if (vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin))
      errors.push(errorFor(rowNumber, "vin", "VIN must contain 17 valid characters."));
    const state = valueFor(row, "state", mapping).toUpperCase();
    if (state && !/^[A-Z]{2}$/.test(state))
      errors.push(errorFor(rowNumber, "state", "State must be a two-letter code."));
    const postalCode = valueFor(row, "postal_code", mapping) || null;
    if (postalCode && !/^\d{5}$/.test(postalCode))
      errors.push(errorFor(rowNumber, "postal_code", "Postal code must contain five digits."));
    const sourceUpdatedAt = valueFor(row, "source_updated_at", mapping) || null;
    if (sourceUpdatedAt && Number.isNaN(Date.parse(sourceUpdatedAt))) {
      errors.push(
        errorFor(rowNumber, "source_updated_at", "Source updated time must be a valid date."),
      );
    }
    const photos = splitPhotos(valueFor(row, "photos", mapping));
    for (const mediaUrl of photos) {
      try {
        const parsedUrl = new URL(mediaUrl);
        if (!["http:", "https:"].includes(parsedUrl.protocol))
          throw new Error("Unsupported protocol");
      } catch {
        errors.push(errorFor(rowNumber, "photos", `Photo URL is invalid: ${mediaUrl}.`));
      }
    }

    const rowErrors = errors.filter((error) => error.rowNumber === rowNumber);
    if (rowErrors.length > 0) return;

    const make = valueFor(row, "make", mapping);
    const model = valueFor(row, "model", mapping);
    const trim = valueFor(row, "trim", mapping) || null;
    const title =
      valueFor(row, "title", mapping) || [year, make, model, trim].filter(Boolean).join(" ");
    records.push({
      sourceRecordKey,
      stockNumber: valueFor(row, "stock_number", mapping) || null,
      vin,
      title,
      description: valueFor(row, "description", mapping) || null,
      priceCents: priceCents!,
      city: valueFor(row, "city", mapping),
      state,
      postalCode,
      inventoryStatus: normalizeStatus(valueFor(row, "status", mapping)),
      vehicleMake: make,
      vehicleModel: model,
      vehicleYear: year!,
      vehicleTrim: trim,
      vehicleMileage: mileage,
      vehicleBodyStyle: valueFor(row, "body_style", mapping) || null,
      vehicleTransmission: valueFor(row, "transmission", mapping) || null,
      vehicleDrivetrain: valueFor(row, "drivetrain", mapping) || null,
      vehicleFuelType: valueFor(row, "fuel_type", mapping) || null,
      vehicleExteriorColor: valueFor(row, "exterior_color", mapping) || null,
      vehicleTitleStatus: valueFor(row, "title_status", mapping) || null,
      sourceUpdatedAt,
      contentHash: contentHash({ row, photos }),
      rawRecord: row,
      media: photos.map((mediaUrl, position) => ({
        mediaUrl,
        position,
        altText: title,
        contentHash: contentHash(mediaUrl),
      })),
    });
  });

  return {
    headers: Object.keys(rows[0] ?? {}),
    rows,
    records,
    errors,
    duplicateKeys,
    duplicateVins,
  };
}

export function parseAndNormalizeInventoryCsv(
  input: string,
  mapping: InventoryMapping = {},
): InventoryParseResult {
  const parsed = parseCsv(input);
  return { ...normalizeInventoryRows(parsed.rows, mapping), headers: parsed.headers };
}

export const csvInventoryAdapter: InventoryFeedAdapter = {
  format: "csv",
  parse: parseAndNormalizeInventoryCsv,
};

export function parseAndNormalizeInventoryJson(
  input: string,
  mapping: InventoryMapping = {},
): InventoryParseResult {
  return normalizeInventoryRows(rowsFromJson(input), mapping);
}

export function parseAndNormalizeInventoryXml(
  input: string,
  mapping: InventoryMapping = {},
): InventoryParseResult {
  return normalizeInventoryRows(rowsFromXml(input), mapping);
}

export const jsonInventoryAdapter: InventoryFeedAdapter = {
  format: "json",
  parse: parseAndNormalizeInventoryJson,
};

export const xmlInventoryAdapter: InventoryFeedAdapter = {
  format: "xml",
  parse: parseAndNormalizeInventoryXml,
};

export function calculateInventoryDiff(
  incoming: NormalizedInventoryRecord[],
  existing: ExistingInventoryRecord[],
): InventoryDiff {
  const existingByKey = new Map(existing.map((record) => [record.sourceRecordKey, record]));
  const existingByVin = new Map(
    existing.filter((record) => record.vin).map((record) => [record.vin as string, record]),
  );
  const incomingKeys = new Set(incoming.map((record) => record.sourceRecordKey));
  const incomingVins = new Set(incoming.flatMap((record) => (record.vin ? [record.vin] : [])));
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  for (const record of incoming) {
    const current =
      existingByKey.get(record.sourceRecordKey) ??
      (record.vin ? existingByVin.get(record.vin) : undefined);
    if (!current) created += 1;
    else if (current.contentHash === record.contentHash) unchanged += 1;
    else updated += 1;
  }
  return {
    created,
    updated,
    unchanged,
    stale: existing.filter(
      (record) =>
        !incomingKeys.has(record.sourceRecordKey) &&
        !(record.vin && incomingVins.has(record.vin)) &&
        !["sold", "removed"].includes(record.inventoryStatus),
    ).length,
  };
}

export function recordsForDatabase(records: NormalizedInventoryRecord[]) {
  return records.map((record) => ({
    source_record_key: record.sourceRecordKey,
    stock_number: record.stockNumber,
    vin: record.vin,
    title: record.title,
    description: record.description,
    price_cents: record.priceCents,
    city: record.city,
    state: record.state,
    postal_code: record.postalCode,
    inventory_status: record.inventoryStatus,
    vehicle_make: record.vehicleMake,
    vehicle_model: record.vehicleModel,
    vehicle_year: record.vehicleYear,
    vehicle_trim: record.vehicleTrim,
    vehicle_mileage: record.vehicleMileage,
    vehicle_body_style: record.vehicleBodyStyle,
    vehicle_transmission: record.vehicleTransmission,
    vehicle_drivetrain: record.vehicleDrivetrain,
    vehicle_fuel_type: record.vehicleFuelType,
    vehicle_exterior_color: record.vehicleExteriorColor,
    vehicle_title_status: record.vehicleTitleStatus,
    source_updated_at: record.sourceUpdatedAt,
    content_hash: record.contentHash,
    raw_record: record.rawRecord,
    media: record.media.map((media) => ({
      media_url: media.mediaUrl,
      position: media.position,
      alt_text: media.altText,
      content_hash: media.contentHash,
    })),
  }));
}
