import { isInternalAnalyticsBrowser, markInternalAnalyticsBrowser } from "./analytics-browser.ts";
import { loadSupabase } from "@/integrations/supabase/lazy-client";
import { shoppingAnalytics, shoppingPrivacy } from "./shopping-client";
import { classifyLatency, sanitizeTelemetryText } from "@/lib/release-gate";
import { classifyTrafficSource } from "@/lib/traffic-source";
import { isKnownAutomatedAgent } from "@/lib/analytics-policy";
import { listingBusinessProps } from "./business-context";

/**
 * Validation analytics. Instrumented from the foundation phase onward: every
 * feature adds its events as it ships, not at the end.
 *
 * Never pass form contents, addresses, emails, search terms, or any other text
 * the user typed. Names, ids, counts, lengths and price buckets only.
 */
export type AnalyticsEventName =
  | "business_listing_clicked"
  | "business_action"
  | "business_profile_viewed"
  | "business_inquiry_completed"
  | "dealer_cta_clicked"
  | "dealer_inquiry_started"
  | "dealer_inquiry_submitted"
  | "dealer_inquiry_error"
  | "media_article_viewed"
  | "media_cta_clicked"
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
  | "classified_listing_started"
  | "classified_listing_submit_succeeded"
  | "classified_listing_submit_failed"
  | "search_completed"
  | "mutation_started"
  | "mutation_completed"
  | "mutation_failed"
  | "mutation_slow"
  | "browser_error"
  | "unhandled_rejection"
  | "visit_engaged"
  | "visit_started"
  | "listing_viewed"
  | "seller_contacted"
  | "storefront_share"
  | "inquiry_completed"
  | "web_vital";

type Props = Record<string, string | number | boolean | null>;

export type MutationTelemetry = {
  flow: string;
  thresholdMs?: number;
  props?: Props;
};

const SESSION_KEY = "pv_session_id";

function sessionId(): string | null {
  if (!shoppingPrivacy().personalization) return null;
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

// One role check per signed-in identity per document, shared by simultaneous events.
const analyticsStaffChecks = new Map<string, Promise<boolean | null>>();
async function analyticsStaffStatus(
  supabase: Awaited<ReturnType<typeof loadSupabase>>,
  userId: string,
) {
  let check = analyticsStaffChecks.get(userId);
  if (!check) {
    check = Promise.all(
      ["admin", "moderator"].map((_role) =>
        supabase.rpc("has_role", { _user_id: userId, _role: _role as "admin" | "moderator" }),
      ),
    )
      .then((results) =>
        results.some((r) => r.data === true)
          ? true
          : results.some((r) => r.error || typeof r.data !== "boolean")
            ? null
            : false,
      )
      .catch(() => null);
    analyticsStaffChecks.set(userId, check);
    void check.then((value) => {
      if (value === null) analyticsStaffChecks.delete(userId);
    });
  }
  return check;
}

/** Genuine page interaction is an engagement signal, not proof of a unique person. */
export function startTrafficEngagement() {
  const visit = ensureVisit();
  if (!visit || typeof document === "undefined") return () => {};
  try {
    if (window.sessionStorage.getItem("bb_engaged_visit") === visit.id) return () => {};
  } catch {
    /* Optional storage. */
  }
  let pending = false;
  let recorded = false;
  const onInteraction = (event: Event) => {
    if (!event.isTrusted || document.visibilityState !== "visible" || pending || recorded) return;
    pending = true;
    void trackEvent("visit_engaged", { signal: "interaction" }).then((saved) => {
      pending = false;
      if (!saved) return;
      recorded = true;
      try {
        window.sessionStorage.setItem("bb_engaged_visit", visit.id);
      } catch {
        /* Optional storage. */
      }
      cleanup();
    });
  };
  const events = ["pointerdown", "keydown", "touchstart", "wheel"] as const;
  const cleanup = () =>
    events.forEach((name) => document.removeEventListener(name, onInteraction, true));
  events.forEach((name) =>
    document.addEventListener(name, onInteraction, { capture: true, passive: true }),
  );
  return cleanup;
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
  if (!shoppingPrivacy().personalization) return null;
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
): Promise<boolean> {
  if (typeof window === "undefined" || window.location.pathname === "/claim-seller") return false;
  try {
    if (!options.isDemo) shoppingAnalytics(name, props);
  } catch {
    /* Optional personalization cannot interrupt a marketplace action. */
  }
  props = { ...listingBusinessProps(props.listing_id), ...props };
  const eventAt = Date.now();
  try {
    const supabase = await loadSupabase();
    const { data } = await supabase.auth.getSession();
    const viewerId = data.session?.user.id ?? null;
    const userId = shoppingPrivacy().personalization ? viewerId : null;
    const visit = ensureVisit();
    if (
      [
        "search_completed",
        "listing_viewed",
        "seller_contacted",
        "inquiry_completed",
        "classified_listing_submit_started",
        "classified_listing_started",
        "classified_listing_submit_succeeded",
      ].includes(name)
    ) {
      try {
        const origin = JSON.parse(
          window.sessionStorage.getItem("bluebird_editorial_origin") || "null",
        ) as { article?: string; placement?: string; category?: string; at?: number } | null;
        if (
          origin?.article &&
          typeof origin.at === "number" &&
          eventAt - origin.at < 2 * 60 * 60_000
        )
          props = {
            ...props,
            media_article: origin.article.slice(0, 150),
            media_placement: origin.placement?.slice(0, 80) || "",
            media_category: origin.category?.slice(0, 80) || "",
          };
      } catch {
        /* Optional attribution must never affect browsing or posting. */
      }
    }
    let internal = isInternalAnalyticsBrowser(window, props.is_internal === true);
    let internalReason: string | null = internal ? "testing_browser" : null;
    if (viewerId && !internal) {
      const staff = await analyticsStaffStatus(supabase, viewerId);
      if (staff === true) {
        markInternalAnalyticsBrowser(window);
        internal = true;
        internalReason = "staff";
      } else if (staff === null) {
        // An unavailable role check must not turn an operator into a public visitor.
        // This event is excluded; a normal user's browser is not permanently marked.
        internal = true;
        internalReason = "role_check_unavailable";
      }
    }
    const { error } = await supabase.from("analytics_events").insert({
      name,
      props: {
        ...props,
        ...(visit
          ? {
              traffic_source: visit.source,
              traffic_channel: visit.channel,
              traffic_visit: visit.id,
            }
          : {}),
        site_host: window.location.hostname,
        device: window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop",
        event_at: eventAt,
        traffic_policy: 2,
        is_internal: internal,
        internal_reason: internalReason,
        is_bot:
          props.is_bot === true ||
          isKnownAutomatedAgent(navigator.userAgent, navigator.webdriver === true),
      },
      is_demo: options.isDemo ?? false,
      session_id: sessionId(),
      user_id: userId,
    });
    if (error) console.warn("analytics event dropped", name, error.code);
    return !error;
  } catch (error) {
    // Analytics must never break a user flow.
    console.warn("analytics event dropped", name, error);
    return false;
  }
}

export function flushEditorialAttribution() {
  try {
    const raw = window.sessionStorage.getItem("bluebird_editorial_pending_click");
    if (!raw) return;
    window.sessionStorage.removeItem("bluebird_editorial_pending_click");
    const click = JSON.parse(raw);
    if (
      typeof click.article !== "string" ||
      typeof click.placement !== "string" ||
      typeof click.destination !== "string" ||
      typeof click.at !== "number" ||
      Date.now() - click.at > 120_000
    )
      return;
    void trackEvent("media_cta_clicked", {
      article: click.article.slice(0, 150),
      placement: click.placement.slice(0, 80),
      category: typeof click.category === "string" ? click.category.slice(0, 80) : "",
      destination: click.destination.slice(0, 1000),
    });
  } catch {
    /* Optional analytics never blocks reading or navigating. */
  }
}

/** Server acknowledged a message/application; opening a form is not a conversion. */
export function trackCompletedInquiry(
  method: "message" | "apply",
  recordId: string,
  listing: { id: string; categorySlug?: string | null; isMock?: boolean },
) {
  void trackEvent(
    "inquiry_completed",
    {
      method,
      listing_id: listing.id,
      category: listing.categorySlug ?? null,
      event_id: `${method}:${recordId}`,
    },
    { isDemo: listing.isMock === true },
  );
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
