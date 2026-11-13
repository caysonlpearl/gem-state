import { SHOPPING_POLICY_VERSION } from "./shopping-contract.ts";
import type { ContactAcknowledgement } from "./contact-contract.ts";
import { isInternalAnalyticsQuery } from "./analytics-policy.ts";

// Public identifier from Bluebird Marketplace's existing Ads Manager data source.
export const DEALER_ADS_PIXEL_ID = "QwZ496FXpY5Z2pc8bAJS2Y";
export const OPENAI_PIXEL_SCRIPT = "https://bzrcdn.openai.com/sdk/oaiq.min.js";
type PixelQueue = ((...args: unknown[]) => void) & { q?: unknown[][] };
type PixelWindow = Window & { oaiq?: PixelQueue };
const measured = new Set<string>();
let initialized = false;

/** Call from the success screen after the form and its contact fields unmount. */
export function trackDealerLead(acknowledgement: ContactAcknowledgement): boolean {
  if (
    typeof window === "undefined" ||
    acknowledgement.ok !== true ||
    acknowledgement.interest !== "dealership" ||
    !acknowledgement.eventId ||
    measured.has(acknowledgement.eventId)
  )
    return false;
  const w = window as PixelWindow;
  const nav = w.navigator as Navigator & { globalPrivacyControl?: boolean };
  if (
    !/^(www\.)?onbluebird\.com$/.test(w.location.hostname) ||
    isInternalAnalyticsQuery(w.location.search) ||
    nav.globalPrivacyControl ||
    nav.doNotTrack === "1" ||
    /bot\b|spider|crawler|HeadlessChrome|Lighthouse/i.test(nav.userAgent)
  )
    return false;
  try {
    const privacy = JSON.parse(w.localStorage.getItem("bb.shopping.privacy.v1") ?? "null");
    if (privacy?.version !== SHOPPING_POLICY_VERSION || privacy.advertising !== true) return false;
    if (!w.oaiq) {
      const queue: PixelQueue = (...args: unknown[]) => {
        queue.q!.push(args);
      };
      queue.q = [];
      w.oaiq = queue;
      const script = w.document.createElement("script");
      script.async = true;
      script.src = OPENAI_PIXEL_SCRIPT;
      script.dataset.bluebirdDealerPixel = "true";
      w.document.head.appendChild(script);
    }
    if (!initialized) {
      // Do not override an existing SDK measurement-consent denial.
      w.oaiq("init", { pixelId: DEALER_ADS_PIXEL_ID });
      initialized = true;
    }
    w.oaiq(
      "measure",
      "lead_created",
      { type: "customer_action" },
      { event_id: acknowledgement.eventId, opt_out: true },
    );
    measured.add(acknowledgement.eventId);
    return true;
  } catch {
    // Advertising outages must never change an accepted contact submission.
    return false;
  }
}
