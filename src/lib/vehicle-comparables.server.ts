/* eslint-disable @typescript-eslint/no-explicit-any -- service-role valuation cache */
import {
  valuationInput,
  type ValuationInput,
  type VehicleMarketEvidence,
} from "./vehicle-price-insights.ts";
import type { ProviderConfig } from "./vehicle-valuation-providers.server.ts";

type Comparable = { key: string; priceCents: number; vehicle: ValuationInput };
type Segment = { checkedAt: string; rows: Comparable[] };
const normalizedTrim = (trim: string | null) =>
  (trim ?? "")
    .toLowerCase()
    .replace(/\b(sport utility|sedan|coupe|hatchback|convertible|wagon|van|pickup|truck)\b.*$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const hash = async (text: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
export const comparableMileageTolerance = (input: ValuationInput) =>
  input.condition === "new"
    ? Math.ceil(Math.max(500, input.miles * 0.2) / 500) * 500
    : Math.ceil(Math.max(15000, input.miles * 0.2) / 5000) * 5000;

/** Observed asking-price sample, never a prediction interval derived from model error. */
export function summarizeComparables(
  segment: Segment,
  input: ValuationInput,
  scope: "state" | "national",
  ownKey: string | null,
): VehicleMarketEvidence | null {
  const tolerance = comparableMileageTolerance(input);
  const unique = new Map<string, number[]>();
  for (const row of segment.rows) {
    const v = row.vehicle;
    if (
      row.key === ownKey ||
      v.year !== input.year ||
      v.make.toLowerCase() !== input.make.toLowerCase() ||
      v.model !== input.model ||
      v.condition !== input.condition ||
      v.certified !== input.certified ||
      (scope === "state" && v.state !== input.state) ||
      Math.abs(v.miles - input.miles) > tolerance ||
      (input.trim && normalizedTrim(v.trim) !== normalizedTrim(input.trim)) ||
      (input.drivetrain && v.drivetrain !== input.drivetrain) ||
      (input.fuel && v.fuel !== input.fuel) ||
      (input.bodyStyle && v.bodyStyle !== input.bodyStyle) ||
      (input.transmission && v.transmission !== input.transmission)
    )
      continue;
    const prices = unique.get(row.key) ?? [];
    prices.push(row.priceCents);
    unique.set(row.key, prices);
  }
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b),
      i = (sorted.length - 1) / 2;
    return Math.round((sorted[Math.floor(i)] + sorted[Math.ceil(i)]) / 2);
  };
  const prices = [...unique.values()].map(median).sort((a, b) => a - b);
  if (prices.length < 8) return null;
  const percentile = (p: number) => {
    const i = (prices.length - 1) * p,
      lo = Math.floor(i),
      hi = Math.ceil(i);
    return Math.round(prices[lo] + (prices[hi] - prices[lo]) * (i - lo));
  };
  const lowerCents = percentile(0.25),
    upperCents = percentile(0.75);
  if (lowerCents >= upperCents) return null;
  return {
    lowerCents,
    upperCents,
    medianCents: median(prices),
    count: prices.length,
    checkedAt: segment.checkedAt,
    scope,
    state: input.state,
    mileageTolerance: tolerance,
    trimMatched: Boolean(input.trim),
    drivetrainMatched: Boolean(input.drivetrain),
    provider: "vehicles",
  };
}

export async function resolveComparableEvidence(
  db: any,
  input: ValuationInput,
  config: ProviderConfig,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<VehicleMarketEvidence | null> {
  const ownKey = input.vin ? await hash(input.vin) : null;
  // Without a VIN we cannot prove that the vehicle itself was excluded.
  if (!ownKey) return null;
  const mileageMax = Math.ceil((input.miles + comparableMileageTolerance(input)) / 10000) * 10000;
  for (const scope of ["state", "national"] as const) {
    const identity = [
      input.year,
      input.make,
      input.model,
      input.certified ? "cpo" : input.condition,
      mileageMax,
      scope === "state" ? input.state : "US",
    ];
    const key = "comps:v1:" + (await hash(JSON.stringify(identity)));
    const cached = await db
      .from("vehicle_price_insight_cache")
      .select("payload,expires_at")
      .eq("cache_key", key)
      .maybeSingle();
    if (cached.error) return null;
    let segment: Segment | null = null;
    if (cached.data && Date.parse(cached.data.expires_at) > now.getTime()) {
      segment = cached.data.payload;
    } else {
      const claim = await db.rpc("claim_vehicle_price_insight", { _key: key });
      if (claim.error || claim.data !== true) return null;
      const reserved = await db.rpc("reserve_vehicle_valuation_call", {
        _provider: "vehicles",
        _key: key,
        _lifetime_limit: config.lifetimeLimit,
        _monthly_limit: config.monthlyLimit,
      });
      if (reserved.error || reserved.data?.allowed !== true) return null;
      try {
        const url = new URL("https://api.vehicles.dev/v1/vehicles/listings");
        const params = {
          make: input.make,
          model: input.model,
          year_min: String(input.year),
          year_max: String(input.year),
          mileage_max: String(mileageMax),
          condition: input.certified ? "cpo" : input.condition,
          seller_type: "dealer",
          active: "true",
          sold: "false",
          valid_vin: "true",
          min_quality: "0.8",
          price_min: "500",
          limit: "500",
          sort: "miles",
          order: "asc",
          ...(scope === "state" ? { state: input.state } : {}),
        };
        for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
        const response = await fetcher(url, {
          headers: { Accept: "application/json", Authorization: `Bearer ${config.key}` },
          signal: AbortSignal.timeout(17000),
          redirect: "manual",
        });
        if (!response.ok) {
          console.warn("Vehicle comparable provider response", response.status);
          throw Error("Comparable feed unavailable");
        }
        const body = await response.json();
        // A price/mileage-sorted partial page would bias the range; use complete segments only.
        if (
          body.source !== "vehicles.dev" ||
          !Array.isArray(body.results) ||
          !Number.isSafeInteger(body.total) ||
          body.total !== body.results.length ||
          body.total > 500
        )
          throw Error("Incomplete comparable segment");
        const rows: Comparable[] = [];
        for (const r of body.results) {
          if (
            !(r.is_active === 1 || r.is_active === true) ||
            !(r.vin_valid === 1 || r.vin_valid === true) ||
            r.seller_type !== "dealer" ||
            typeof r.data_quality !== "number" ||
            r.data_quality < 0.8 ||
            typeof r.vin !== "string" ||
            !/^[A-HJ-NPR-Z0-9]{17}$/i.test(r.vin) ||
            typeof r.price !== "number" ||
            !Number.isFinite(r.price) ||
            r.price < 500 ||
            r.price > 2000000 ||
            !Number.isInteger(r.miles) ||
            !["used", "new", "cpo"].includes(r.condition)
          )
            continue;
          const priceCents = Math.round(r.price * 100);
          const vehicle = valuationInput({
            categorySlug: "cars-trucks",
            priceCents,
            state: r.state,
            city: r.city ?? "",
            condition: r.condition === "new" ? "new" : "used",
            externalVehicle: { certified: r.condition === "cpo" },
            vehicle: {
              year: r.year,
              make: r.make,
              model: r.model,
              trim: r.trim ?? null,
              mileage: r.miles,
              vin: null,
              titleStatus: r.title_status ?? null,
              drivetrain: r.drivetrain,
              fuelType: r.fuel,
              transmission: r.transmission,
              bodyStyle: r.body_style,
            },
          });
          if (vehicle) rows.push({ key: await hash(r.vin.toUpperCase()), priceCents, vehicle });
        }
        segment = { checkedAt: now.toISOString(), rows };
      } catch {
        segment = null;
      }
      await db.from("vehicle_price_insight_cache").upsert({
        cache_key: key,
        payload: segment,
        expires_at: new Date(now.getTime() + (segment ? 86400000 : 3600000)).toISOString(),
        locked_until: now.toISOString(),
        updated_at: now.toISOString(),
      });
    }
    if (segment && Array.isArray(segment.rows)) {
      const evidence = summarizeComparables(segment, input, scope, ownKey);
      if (evidence) return evidence;
    }
  }
  return null;
}
