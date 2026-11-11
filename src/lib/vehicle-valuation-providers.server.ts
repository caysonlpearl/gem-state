import type {
  ValuationInput,
  ValuationProvider,
  VehicleEstimate,
} from "./vehicle-price-insights.ts";

type Json = Record<string, unknown>;
const record = (v: unknown): Json =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {};
const price = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 500 && v <= 2000000
    ? Math.round(v * 100)
    : null;

export type ProviderConfig = {
  provider: ValuationProvider;
  key: string;
  lifetimeLimit: number;
  monthlyLimit: number;
};
export function valuationProviders(env: (name: string) => string): ProviderConfig[] {
  const limit = (key: string, fallback: number) => {
    const text = env(key),
      n = Number(text);
    return text && Number.isSafeInteger(n) && n >= 0 ? n : fallback;
  };
  return (["vehicles", "vinaudit", "marketcheck"] as const).flatMap((provider) => {
    const prefix = provider === "vehicles" ? "VEHICLES" : provider.toUpperCase();
    const key = env(`${prefix}_API_KEY`);
    // Trial licenses are not production licenses. Never silently turn on a paid fallback.
    if (
      !key ||
      (provider !== "vehicles" && env(`${prefix}_VALUATION_PRODUCTION_ALLOWED`) !== "true")
    )
      return [];
    return [
      {
        provider,
        key,
        lifetimeLimit: limit(
          `${prefix}_VALUATION_LIFETIME_LIMIT`,
          provider === "vehicles" ? 250 : provider === "vinaudit" ? 100 : 0,
        ),
        monthlyLimit: limit(
          `${prefix}_VALUATION_MONTHLY_LIMIT`,
          provider === "marketcheck" ? 100 : 250,
        ),
      },
    ];
  });
}

export function providerRequest(config: ProviderConfig, input: ValuationInput) {
  if (config.provider !== "vehicles" && (!input.vin || input.condition === "new")) return null;
  // This provider requires the actual dealer class. Never guess it for private sellers.
  if (config.provider === "marketcheck" && !input.dealerType) return null;
  const url = new URL(
    config.provider === "vehicles"
      ? "https://api.vehicles.dev/v1/vehicles/market-value"
      : config.provider === "vinaudit"
        ? "https://marketvalue.vinaudit.com/v2/marketvalue"
        : "https://api.marketcheck.com/v2/predict/car/us/marketcheck_price",
  );
  const headers: Record<string, string> = { Accept: "application/json" };
  if (config.provider === "vehicles") {
    headers.Authorization = `Bearer ${config.key}`;
    const params: Record<string, string> = {
      year: String(input.year),
      make: input.make,
      model: input.model,
      miles: String(input.miles),
      state: input.state,
      condition: input.certified ? "cpo" : input.condition,
    };
    if (input.trim) params.trim = input.trim;
    if (input.drivetrain) params.drivetrain = input.drivetrain;
    if (input.fuel) params.fuel = input.fuel;
    if (input.transmission) params.transmission = input.transmission;
    if (input.bodyStyle) params.body_style = input.bodyStyle;
    if (input.color) params.color = input.color;
    if (input.baseMsrp) params.base_msrp = String(input.baseMsrp);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  } else if (config.provider === "vinaudit") {
    for (const [key, value] of Object.entries({
      key: config.key,
      vin: input.vin!,
      mileage: String(input.miles),
      type: "retail",
      format: "json",
      period: "90",
      country: "usa",
    }))
      url.searchParams.set(key, value);
  } else {
    const params: Record<string, string> = {
      api_key: config.key,
      vin: input.vin!,
      miles: String(input.miles),
      dealer_type: input.dealerType!,
      is_certified: String(input.certified),
    };
    if (input.zip) params.zip = input.zip;
    else if (input.city && input.state) {
      params.city = input.city;
      params.state = input.state;
    } else return null;
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  }
  return { url, headers };
}

export function normalizeVehicleEstimate(
  provider: ValuationProvider,
  body: unknown,
  input: ValuationInput,
  now = new Date(),
): VehicleEstimate | null {
  const row = record(body);
  let estimateCents: number | null = null;
  let modelErrorPct: number | null = null;
  let dataThrough: string | null = null;
  let providerInputs: string[] = [];
  const unconfirmedInputs: string[] = [];
  if (provider === "vehicles") {
    const used = record(row.inputs);
    const coverage = record(row.coverage);
    const date = record(row.meta).dataThrough;
    if (
      coverage.status !== "in_domain" ||
      typeof date !== "string" ||
      !Number.isFinite(Date.parse(date)) ||
      now.getTime() - Date.parse(date) > 90 * 86400000 ||
      Date.parse(date) > now.getTime() + 86400000
    )
      return null;
    dataThrough = date;
    // The model always returns a number, even for unrecognized models. Reject lost or altered inputs.
    if (
      row.currency !== "USD" ||
      row.source !== "vehicles.dev" ||
      used.year !== input.year ||
      String(used.make).toLowerCase() !== input.make.toLowerCase() ||
      used.model !== input.model ||
      used.miles !== input.miles ||
      used.state !== input.state ||
      (input.trim && used.trim !== input.trim) ||
      used.condition !== (input.certified ? "cpo" : input.condition)
    )
      return null;
    const optionalFeatures = {
      drivetrain: input.drivetrain,
      fuel: input.fuel,
      transmission: input.transmission,
      body_style: input.bodyStyle,
      color: input.color,
      base_msrp: input.baseMsrp,
    };
    // Echoed features prove what the model used, rather than presenting submitted fields as confirmed.
    providerInputs = [
      "year",
      "make",
      "model",
      "miles",
      "state",
      "condition",
      ...(input.trim ? ["trim"] : []),
    ];
    for (const [key, value] of Object.entries(optionalFeatures)) {
      if (value == null) continue;
      // Some model versions accept extra parameters but omit them from the scored vector.
      // Keep the valid core estimate, but never claim these optional inputs affected it.
      if (used[key] == null) {
        unconfirmedInputs.push(key);
        continue;
      }
      if (String(used[key]).toLowerCase() !== String(value).toLowerCase()) return null;
      providerInputs.push(key);
    }
    estimateCents = price(row.estimateUsd);
    if (
      typeof row.medianApePct !== "number" ||
      !Number.isFinite(row.medianApePct) ||
      row.medianApePct <= 0 ||
      row.medianApePct > 15
    )
      return null;
    modelErrorPct = row.medianApePct;
  } else if (provider === "vinaudit") {
    if (
      row.success !== true ||
      row.vin !== input.vin ||
      Number(row.count) < 20 ||
      Number(row.certainty) < 80 ||
      row.type !== "retail" ||
      Number(row.mileage) !== input.miles
    )
      return null;
    estimateCents = price(record(row.prices).average);
  } else {
    estimateCents = price(row.marketcheck_price);
  }
  return estimateCents
    ? {
        provider,
        estimateCents,
        modelErrorPct,
        updatedAt: now.toISOString(),
        dataThrough,
        providerInputs,
        unconfirmedInputs,
      }
    : null;
}
