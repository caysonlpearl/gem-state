import { supabase } from "@/integrations/supabase/client";
import { classifyLatency, sanitizeTelemetryText } from "@/lib/release-gate";

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
  | "unhandled_rejection";

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

/**
 * `isDemo` marks the event as generated against demonstration catalog data so
 * validation and conversion metrics can exclude it.
 */
export async function trackEvent(
  name: AnalyticsEventName,
  props: Props = {},
  options: { isDemo?: boolean } = {},
): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id ?? null;
    await supabase.from("analytics_events").insert({
      name,
      props,
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
