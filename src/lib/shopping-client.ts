import { loadSupabase } from "@/integrations/supabase/lazy-client";
import {
  SHOPPING_POLICY_VERSION,
  shoppingFields,
  type ShoppingEvent,
  type ShoppingPrivacy,
} from "./shopping-contract";

type ShoppingNavigator = Navigator & {
  globalPrivacyControl?: boolean;
  connection?: { effectiveType?: string; rtt?: number; downlink?: number };
};
const PRIVACY = "bb.shopping.privacy.v1",
  EVENTS = "bb.shopping.events.v1",
  SESSION = "bb.shopping.session.v1";
let memoryPrivacy: ShoppingPrivacy | null = null;
let actor: string | null = null,
  flushing = false,
  timer: ReturnType<typeof setTimeout> | undefined;
let memoryVisit = { id: crypto.randomUUID(), at: Date.now() };
let queue: (ShoppingEvent & { owner: string | null })[] = [];
export function shoppingPrivacy(): ShoppingPrivacy {
  if (memoryPrivacy)
    return {
      ...memoryPrivacy,
      advertising:
        memoryPrivacy.advertising &&
        !(
          typeof navigator !== "undefined" && (navigator as ShoppingNavigator).globalPrivacyControl
        ),
    };
  try {
    const stored = JSON.parse(localStorage.getItem(PRIVACY) ?? "null");
    if (stored?.version === SHOPPING_POLICY_VERSION)
      return {
        personalization: stored.personalization === true,
        advertising:
          stored.advertising === true &&
          !(
            typeof navigator !== "undefined" &&
            (navigator as ShoppingNavigator).globalPrivacyControl
          ),
        version: SHOPPING_POLICY_VERSION,
      };
  } catch {
    /* Blocked storage means essential-only. */
  }
  return { personalization: false, advertising: false, version: SHOPPING_POLICY_VERSION };
}
export function hasShoppingPrivacyChoice() {
  try {
    return Boolean(localStorage.getItem(PRIVACY));
  } catch {
    return true;
  }
}
export async function setShoppingPrivacy(value: Omit<ShoppingPrivacy, "version">) {
  memoryPrivacy = { ...value, version: SHOPPING_POLICY_VERSION };
  try {
    localStorage.setItem(PRIVACY, JSON.stringify({ ...value, version: SHOPPING_POLICY_VERSION }));
  } catch {
    /* Session controls remain available even if persistence is blocked. */
  }

  if (!value.advertising)
    void import("./shopping-advertising-client").then((m) => m.revokeShoppingAdvertising());
  if (!value.personalization) {
    queue = [];
    try {
      localStorage.removeItem(EVENTS);
      localStorage.removeItem("pv_session_id");
      sessionStorage.removeItem("bb_visit");
      sessionStorage.removeItem(SESSION);
    } catch {
      /* No persistent history. */
    }
  }
  if (!value.personalization) window.dispatchEvent(new Event("shopping-privacy-changed"));
  await shoppingFetch("privacy", value);
  window.dispatchEvent(new Event("shopping-privacy-changed"));
}
export async function shoppingFetch(
  action: string,
  body?: unknown,
  params: Record<string, string> = {},
) {
  const supabase = await loadSupabase();
  const { data } = await supabase.auth.getSession();
  const response = await fetch(
    `/api/shopping?action=${new URLSearchParams({ action, ...params }).toString().replace(/^action=/, "")}`,
    {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  const result = await response.json();
  if (!response.ok)
    throw Error(result.error ?? "Shopping preferences are temporarily unavailable.");
  return result;
}
function visit() {
  try {
    const old = JSON.parse(sessionStorage.getItem(SESSION) ?? "null");
    const now = Date.now();
    const id = old && now - old.at < 30 * 60000 ? old.id : crypto.randomUUID();
    sessionStorage.setItem(SESSION, JSON.stringify({ id, at: now }));
    return id as string;
  } catch {
    const now = Date.now();
    if (now - memoryVisit.at >= 30 * 60000) memoryVisit = { id: crypto.randomUUID(), at: now };
    memoryVisit.at = now;
    return memoryVisit.id;
  }
}
export function shoppingTrack(
  kind: ShoppingEvent["kind"],
  listingId?: string,
  context: Record<string, unknown> = {},
  search?: Record<string, unknown>,
) {
  if (
    typeof window === "undefined" ||
    !(shoppingPrivacy().personalization || shoppingPrivacy().advertising) ||
    /[?&](?:_qa|_verify)=/.test(location.search) ||
    /bot\b|crawler|spider|HeadlessChrome/i.test(navigator.userAgent)
  )
    return;
  const connection = (navigator as ShoppingNavigator).connection;
  const common = {
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    viewport: `${innerWidth}x${innerHeight}`,
    platform: navigator.platform,
    device: matchMedia("(pointer:coarse)").matches ? "touch" : "pointer",
    cores: Math.min(32, navigator.hardwareConcurrency || 0),
    connection: connection?.effectiveType,
    rtt: connection?.rtt,
    downlink: connection?.downlink,
    referrer: (() => {
      try {
        return new URL(document.referrer).hostname;
      } catch {
        return "";
      }
    })(),
    campaign: new URLSearchParams(location.search).get("utm_campaign") ?? "",
  };
  if (shoppingPrivacy().personalization && crypto.subtle)
    void crypto.subtle
      .digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify([
            common.platform,
            common.language,
            common.timezone,
            common.cores,
            Math.round(innerWidth / 200),
          ]),
        ),
      )
      .then((bytes) => {
        const event = queue.find((e) => e.id === eventId);
        if (event)
          event.context = {
            ...event.context,
            fingerprint: [...new Uint8Array(bytes)]
              .map((v) => v.toString(16).padStart(2, "0"))
              .join(""),
          };
      })
      .catch(() => undefined);
  const eventId = crypto.randomUUID();
  queue.push({
    id: eventId,
    kind,
    at: new Date().toISOString(),
    session: visit(),
    ...(listingId ? { listingId } : {}),
    context: shoppingFields({ ...common, ...context }, true),
    search: shoppingFields(search) as ShoppingEvent["search"],
    owner: actor,
  });
  if (shoppingPrivacy().advertising)
    void import("./shopping-advertising-client").then((m) =>
      m.shoppingAdvertisingEvent(kind, eventId),
    );
  queue = queue.slice(-100);
  try {
    localStorage.setItem(EVENTS, JSON.stringify({ at: Date.now(), events: queue }));
  } catch {
    /* Delivery remains best effort. */
  }
  if (!timer)
    timer = setTimeout(() => {
      timer = undefined;
      void flushShopping();
    }, 2000);
}
export async function flushShopping() {
  if (
    flushing ||
    !(shoppingPrivacy().personalization || shoppingPrivacy().advertising) ||
    !queue.length
  )
    return;
  flushing = true;
  const batch = queue.filter((e) => e.owner === actor).slice(0, 50);
  try {
    await shoppingFetch("events", {
      personalization: shoppingPrivacy().personalization,
      events: batch.map(({ owner: _owner, ...event }) => event),
    });
    const sent = new Set(batch.map((e) => e.id));
    queue = queue.filter((e) => !sent.has(e.id) && e.owner === actor);
    localStorage.setItem(EVENTS, JSON.stringify({ at: Date.now(), events: queue }));
  } catch {
    /* Retain ids for retry; server deduplicates. */
  } finally {
    flushing = false;
  }
}
export function shoppingAnalytics(name: string, props: Record<string, unknown>) {
  const mapping: Record<string, ShoppingEvent["kind"]> = {
    listing_viewed: "view",
    watchlist_added: "save",
    watchlist_removed: "unsave",
    seller_contacted: "contact",
    business_action: "contact",
    buy_now_started: "cart",
  };
  if (
    name === "business_action" &&
    !["call", "text", "email", "message"].includes(String(props.method ?? props.action))
  )
    return;
  const kind = mapping[name];
  if (
    !kind ||
    typeof props.listing_id !== "string" ||
    props.ended === true ||
    props.is_internal === true
  )
    return;
  shoppingTrack(kind, props.listing_id, { method: props.method });
}
export function startShopping() {
  let active = true,
    unsubscribe = () => {};
  void loadSupabase().then(async (supabase) => {
    const { data } = await supabase.auth.getSession();
    if (!active) return;
    actor = data.session?.user.id ?? null;
    try {
      const saved = JSON.parse(localStorage.getItem(EVENTS) ?? "null");
      if (saved && Date.now() - saved.at < 2 * 3600000)
        queue = saved.events
          .filter((e: ShoppingEvent & { owner: string | null }) => e.owner === actor)
          .slice(-100);
    } catch {
      /* Corrupt/blocked optional storage. */
    }
    void flushShopping();
    const result = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user.id ?? null;
      if (next !== actor) {
        queue = [];
        actor = next;
        try {
          localStorage.removeItem(EVENTS);
          sessionStorage.removeItem(SESSION);
        } catch {
          /* No persisted identity merge. */
        }
        window.dispatchEvent(new Event("shopping-account-changed"));
      }
    });
    unsubscribe = () => result.data.subscription.unsubscribe();
  });
  const visible = () => {
    if (document.visibilityState === "visible") void flushShopping();
  };
  document.addEventListener("visibilitychange", visible);
  const interval = setInterval(() => void flushShopping(), 30000);
  return () => {
    active = false;
    unsubscribe();
    clearInterval(interval);
    document.removeEventListener("visibilitychange", visible);
  };
}
export function observeShoppingCard(
  element: HTMLElement,
  id: string,
  context: Record<string, unknown> = {},
) {
  if (!("IntersectionObserver" in window)) return () => {};
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting && e.intersectionRatio >= 0.5 && !timeout) {
          timeout = setTimeout(() => {
            if (document.visibilityState === "visible")
              shoppingTrack("impression", id, { ...context, visible: true });
            observer.disconnect();
          }, 1000);
        } else if (!e.isIntersecting && timeout) {
          clearTimeout(timeout);
          timeout = undefined;
        }
      }
    },
    { threshold: 0.5 },
  );
  observer.observe(element);
  return () => {
    observer.disconnect();
    if (timeout) clearTimeout(timeout);
  };
}
export function trackActiveListing(id: string) {
  let seconds = 0,
    lastInteraction = Date.now();
  const interact = () => {
    lastInteraction = Date.now();
  };
  for (const name of ["pointerdown", "scroll", "keydown"])
    window.addEventListener(name, interact, { passive: true });
  const timer = setInterval(() => {
    if (document.visibilityState === "visible" && Date.now() - lastInteraction < 60000)
      seconds += 15;
  }, 15000);
  return () => {
    clearInterval(timer);
    for (const name of ["pointerdown", "scroll", "keydown"])
      window.removeEventListener(name, interact);
    if (seconds) shoppingTrack("active", id, { seconds: Math.min(seconds, 3600) });
  };
}
