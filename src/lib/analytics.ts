import { loadSupabase } from "@/integrations/supabase/lazy-client";
import { classifyLatency, sanitizeTelemetryText } from "@/lib/release-gate";
import { classifyTrafficSource } from "@/lib/traffic-source";

/**
 * Validation analytics. Instrumented from the foundation phase onward: every
 * feature adds its events as it ships, not at the end.
 *
 * Never pass form contents, addresses, emails, search terms, or any other text
 * the user typed. Names, ids, counts, lengths and price buckets only.
 */
export type AnalyticsEventName =
  | "page_view"
  | "glossary_viewed"
  | "onboarding_started"
  | "onboarding_completed"
  | "profile_updated"
  | "search_performed"
  | "search_no_results"
  | "filter_applied"
  | "product_viewed"
  | "variation_selected"
  | "buy_now_started"
  | "sell_now_started"
  | "market_option_viewed"
  | "bid_started"
  | "ask_started"
  | "form_abandoned"
  | "bid_submitted"
  | "bid_cancelled"
  | "ask_submitted"
  | "ask_cancelled"
  | "ask_marked_sold"
  | "ask_evidence_uploaded"
  | "sourcing_request_submitted"
  | "sourcing_request_cancelled"
  | "sourcing_ask_submitted"
  | "sourcing_offer_requested"
  | "sourcing_board_viewed"
  | "shopper_application_submitted"
  | "quote_submitted"
  | "quote_withdrawn"
  | "quote_accepted"
  | "order_started"
  | "order_viewed"
  | "order_completed"
  | "returning_request"
  // Phase 6 — community & signals.
  | "sighting_reported"
  | "sighting_confirmed"
  | "sighting_flagged"
  | "watchlist_added"
  | "watchlist_removed"
  | "product_suggested"
  // Phase 6.5 — shopper service profiles & dynamic sourcing options.
  | "sourcing_option_viewed"
  | "sourcing_option_selected"
  | "sourcing_purchase_started"
  | "price_confirmation_needed"
  | "shopper_availability_enabled"
  | "shopper_availability_expired"
  // Phase 7 — manual pilot & trust operations.
  | "pilot_console_viewed"
  | "order_status_advanced"
  | "payment_evidence_recorded"
  | "purchase_evidence_submitted"
  | "purchase_evidence_confirmed"
  | "revised_max_approved"
  | "shipment_recorded"
  | "delivery_confirmed"
  | "verified_sale_confirmed"
  | "payout_recorded"
  | "dispute_opened"
  | "dispute_resolved"
  | "review_submitted"
  | "notifications_viewed"
  | "classified_listing_submit_started"
  | "classified_listing_submit_succeeded"
  | "classified_listing_submit_failed"
  | "search_completed"
  | "mutation_started"
  | "mutation_completed"
  | "mutation_failed"
  | "mutation_slow"
  | "browser_error"
  | "unhandled_rejection"
  | "visit_started"
  | "listing_viewed"
  | "seller_contacted"
  | "storefront_share";

type Props = Record<string, string | number | boolean | null>;

export type MutationTelemetry = {
  flow: string;
  thresholdMs?: number;
  props?: Props;
};

const SESSION_KEY = "pv_session_id";

function sessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let id = window.localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

type Visit = { id: string; source: string; channel: string; landing: string };

const VISIT_KEY = "bb_visit";
let currentVisit: Visit | null = null;

/**
 * The visit this tab is in: where it came from (search engine, AI assistant,
 * social site, another site or direct) and the page it landed on. Worked out
 * once per tab session and attached to every event, so contacts can be traced
 * back to the source that brought the visitor. The first call in a visit also
 * records a visit_started event.
 */
export function ensureVisit(): Visit | null {
  if (typeof window === "undefined") return null;
  if (currentVisit) return currentVisit;
  try {
    const stored = window.sessionStorage.getItem(VISIT_KEY);
    if (stored) {
      currentVisit = JSON.parse(stored) as Visit;
      return currentVisit;
    }
  } catch {
    // Storage blocked: classify this page on its own below.
  }
  const { source, channel } = classifyTrafficSource(
    document.referrer,
    window.location.search,
    window.location.host,
    window.location.pathname,
  );
  currentVisit = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Date.now()),
    source,
    channel,
    landing: window.location.pathname.slice(0, 200),
  };
  try {
    window.sessionStorage.setItem(VISIT_KEY, JSON.stringify(currentVisit));
  } catch {
    // Without storage the visit is still known for this page load.
  }
  void trackEvent("visit_started", { landing_path: currentVisit.landing });
  return currentVisit;
}

export type SellerContactMethod =
  "message" | "call" | "text" | "email" | "apply" | "apply_external";

/** A buyer reaching out about a listing, the number this tracking exists for. */
export function trackSellerContact(
  method: SellerContactMethod,
  listing: { id: string; categorySlug?: string | null; isMock?: boolean | undefined },
) {
  void trackEvent(
    "seller_contacted",
    { method, listing_id: listing.id, category: listing.categorySlug ?? null },
    { isDemo: listing.isMock === true },
  );
}

/**
 * `isDemo` marks the event as generated against demonstration catalog data so
 * validation and conversion metrics can exclude it.
 */
export async function trackEvent(
  name: AnalyticsEventName,
  props: Props = {},
  options: { isDemo?: boolean } = {},
): Promise<void> {
  if (typeof window === "undefined" || window.location.pathname === "/claim-seller") return;
  try {
    const supabase = await loadSupabase();
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id ?? null;
    const visit = ensureVisit();
    await supabase.from("analytics_events").insert({
      name,
      props: visit
        ? {
            ...props,
            traffic_source: visit.source,
            traffic_channel: visit.channel,
            traffic_visit: visit.id,
            // Lets reports drop events from dev servers and preview builds.
            site_host: window.location.hostname,
          }
        : props,
      is_demo: options.isDemo ?? false,
      session_id: sessionId(),
      user_id: userId,
    });
  } catch (error) {
    // Analytics must never break a user flow.
    console.warn("analytics event dropped", name, error);
  }
}

function telemetryError(error: unknown): Props {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  return {
    error_name: error instanceof Error ? error.name : "UnknownError",
    error_message: sanitizeTelemetryText(message),
  };
}

/** Record a bounded browser failure without allowing telemetry to interrupt the flow. */
export function trackBrowserError(error: unknown, kind: "error" | "unhandled_rejection" = "error") {
  void trackEvent(kind === "error" ? "browser_error" : "unhandled_rejection", {
    route: typeof window === "undefined" ? null : window.location.pathname,
    ...telemetryError(error),
  });
}

/** Trace an async mutation and emit a slow marker when it exceeds the user-facing threshold. */
export async function traceMutation<T>(
  telemetry: MutationTelemetry,
  task: () => Promise<T>,
): Promise<T> {
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  void trackEvent("mutation_started", { flow: telemetry.flow, ...(telemetry.props ?? {}) });
  try {
    const result = await task();
    const latencyMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt,
    );
    const latency = classifyLatency(latencyMs, telemetry.thresholdMs);
    const props = {
      flow: telemetry.flow,
      latency_ms: latency.durationMs,
      threshold_ms: latency.thresholdMs,
      slow: latency.slow,
      ...(telemetry.props ?? {}),
    } satisfies Props;
    void trackEvent("mutation_completed", props);
    if (latency.slow) void trackEvent("mutation_slow", props);
    return result;
  } catch (error) {
    const latencyMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt,
    );
    void trackEvent("mutation_failed", {
      flow: telemetry.flow,
      latency_ms: latencyMs,
      ...(telemetry.props ?? {}),
      ...telemetryError(error),
    });
    throw error;
  }
}
