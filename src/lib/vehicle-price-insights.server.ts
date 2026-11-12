/* eslint-disable @typescript-eslint/no-explicit-any -- migration-backed valuation cache */
import {
  compareVehiclePrice,
  valuationInput,
  type VehicleEstimate,
  type ValuationInput,
} from "./vehicle-price-insights.ts";
import {
  normalizeVehicleEstimate,
  providerRequest,
  valuationProviders,
  type ProviderConfig,
} from "./vehicle-valuation-providers.server.ts";
import { serverEnv } from "./runtime-env.server.ts";

export async function valuationCacheKey(input: ValuationInput) {
  const bytes = new TextEncoder().encode(JSON.stringify(input));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return "v2:" + Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Dependencies are injected for deterministic budget/fallback tests. No raw provider payload is stored. */
export async function resolveVehicleEstimate(
  db: any,
  input: ValuationInput,
  configs: ProviderConfig[],
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<VehicleEstimate | null> {
  const key = await valuationCacheKey(input);
  const cached = await db
    .from("vehicle_price_insight_cache")
    .select("payload,expires_at")
    .eq("cache_key", key)
    .maybeSingle();
  if (cached.error) return null; // A missing migration must never produce unbudgeted calls.
  if (cached.data && Date.parse(cached.data.expires_at) > now.getTime())
    return cached.data.payload ?? null;
  const claim = await db.rpc("claim_vehicle_price_insight", { _key: key });
  if (claim.error || claim.data !== true) return null;
  let estimate: VehicleEstimate | null = null;
  for (const config of configs) {
    const request = providerRequest(config, input);
    if (!request) continue;
    const reserved = await db.rpc("reserve_vehicle_valuation_call", {
      _provider: config.provider,
      _key: key,
      _lifetime_limit: config.lifetimeLimit,
      _monthly_limit: config.monthlyLimit,
    });
    if (reserved.error) break;
    if (!reserved.data?.allowed) {
      // Avoid changing providers just because another request is in flight at this instant.
      if (reserved.data?.reason === "rate_limit") break;
      continue;
    }
    if (config.provider === "marketcheck") {
      // Inventory and valuation use the same provider account allowance.
      const shared = await db.rpc("reserve_marketcheck_call", {
        p_cache_key: `valuation:${key}`,
        p_monthly_limit: Number(serverEnv("MARKETCHECK_MONTHLY_LIMIT")) || 450,
      });
      if (shared.error || shared.data?.allowed !== true) continue;
    }
    try {
      const response = await fetcher(request.url, {
        headers: request.headers,
        signal: AbortSignal.timeout(17000),
        // The edge fetch implementation supports follow/manual only. A redirect
        // stays an unsuccessful response; credentials never follow it elsewhere.
        redirect: "manual",
      });
      if (!response.ok) {
        console.warn("Vehicle valuation provider response", config.provider, response.status);
        await db.from("vehicle_valuation_provider_state").upsert({
          provider: config.provider,
          blocked_until: new Date(now.getTime() + 60000).toISOString(),
          reason: `http_${response.status}`,
        });
        if ([401, 402, 403, 429].includes(response.status)) {
          const until =
            response.status === 429
              ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
              : new Date(now.getTime() + (response.status === 402 ? 3650 : 1) * 86400000);
          await db.from("vehicle_valuation_provider_state").upsert({
            provider: config.provider,
            blocked_until: until.toISOString(),
            reason: `http_${response.status}`,
          });
        }
        continue;
      }
      const body = await response.json();
      const diagnostics: { reason?: string } = {};
      estimate = normalizeVehicleEstimate(config.provider, body, input, now, diagnostics);
      if (!estimate)
        console.warn("Vehicle valuation response rejected", config.provider, {
          fields: Object.keys(body ?? {}),
          coverage: body?.coverage?.status ?? "missing",
          reason: diagnostics.reason ?? "unknown",
        });
      if (!estimate)
        await db.from("vehicle_valuation_provider_state").upsert({
          provider: config.provider,
          blocked_until: new Date(now.getTime() + 60000).toISOString(),
          reason: `invalid_response:${diagnostics.reason ?? "unknown"}`.slice(0, 400),
        });
      if (estimate) break;
    } catch (error) {
      console.warn(
        "Vehicle valuation request failed",
        config.provider,
        error instanceof Error ? error.name : "Error",
      );
      await db.from("vehicle_valuation_provider_state").upsert({
        provider: config.provider,
        blocked_until: new Date(now.getTime() + 60000).toISOString(),
        reason:
          `request_failed:${error instanceof Error ? `${error.name}:${error.message}` : "Error"}`
            .replaceAll(config.key, "[redacted]")
            .replace(/https?:\/\/\S+/g, "[url]")
            .slice(0, 400),
      });
      /* provider errors never break the listing or reveal credential-bearing URLs */
    }
  }
  await db.from("vehicle_price_insight_cache").upsert({
    cache_key: key,
    payload: estimate,
    expires_at: new Date(
      Math.min(
        now.getTime() + (estimate ? 7 * 86400000 : 300000),
        estimate?.dataThrough ? Date.parse(estimate.dataThrough) + 90 * 86400000 : Infinity,
      ),
    ).toISOString(),
    locked_until: now.toISOString(),
    updated_at: now.toISOString(),
  });
  return estimate;
}

export async function listingPriceInsight(listing: Parameters<typeof valuationInput>[0], db: any) {
  const input = valuationInput(listing);
  if (!input) return null;
  if (input.sellerType === "dealer") {
    // Resolve the real dealership on the server. Unassociated syndicated dealers stay unrated.
    const slug = (listing.dealer as { slug?: string } | undefined)?.slug;
    if (!slug) return null;
    const result = await db
      .from("dealer_profiles")
      .select("price_insights_enabled,valuation_dealer_type")
      .eq("slug", slug)
      .maybeSingle();
    if (result.error || !result.data || result.data.price_insights_enabled !== true) return null;
    input.dealerType = result.data.valuation_dealer_type ?? null;
  }
  const configs = valuationProviders(serverEnv);
  if (!configs.length)
    return { status: "unavailable" as const, reason: "service_unavailable" as const };
  const estimate = await resolveVehicleEstimate(db, input, configs);
  return estimate
    ? { ...compareVehiclePrice(estimate, listing.priceCents), vehicleDetails: input }
    : { status: "unavailable" as const, reason: "vehicle_estimate_unavailable" as const };
}
