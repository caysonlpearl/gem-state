import { Capacitor, registerPlugin } from "@capacitor/core";
import { FirebaseAnalytics, ConsentStatus, ConsentType } from "@capacitor-firebase/analytics";
import { FacebookLogin } from "@capacitor-community/facebook-login";
import {
  mobileAdvertisingAllowed,
  mobileAdEvent,
  type MobileAdConsent,
  type MobileTrackingStatus,
} from "../../../src/lib/mobile-advertising";
import { api } from "./client";
const privacy = registerPlugin<{
  trackingStatus(): Promise<{ status: MobileTrackingStatus }>;
  requestTracking(): Promise<{ status: MobileTrackingStatus }>;
}>("BluebirdPrivacy");
let enabled = false,
  configured = false,
  generation = 0;
export function configureAdvertising(available: boolean) {
  configured =
    available &&
    Capacitor.isNativePlatform() &&
    Capacitor.isPluginAvailable("FirebaseAnalytics") &&
    Capacitor.isPluginAvailable("FacebookLogin");
  return configured;
}
const seen = new Set<string>();
export async function disableAdvertising() {
  generation++;
  enabled = false;
  seen.clear();
  if (!Capacitor.isNativePlatform() || !configured) return;
  await Promise.allSettled([
    FirebaseAnalytics.setEnabled({ enabled: false }),
    ...[
      ConsentType.AdStorage,
      ConsentType.AdUserData,
      ConsentType.AdPersonalization,
      ConsentType.AnalyticsStorage,
    ].map((type) => FirebaseAnalytics.setConsent({ type, status: ConsentStatus.Denied })),
    FacebookLogin.setAutoLogAppEventsEnabled({ enabled: false }),
    FacebookLogin.setAdvertiserTrackingEnabled({ enabled: false }),
    FacebookLogin.setAdvertiserIDCollectionEnabled({ enabled: false }),
  ]);
}
export async function setAdvertising(
  allow: boolean,
  requestPermission: boolean,
): Promise<MobileAdConsent> {
  if (!configured || !Capacitor.isNativePlatform())
    throw Error("Advertising measurement is not configured for this app.");
  await disableAdvertising();
  const current = generation;
  const platform = Capacitor.getPlatform() as "ios" | "android";
  const att =
    platform === "ios"
      ? (await (allow && requestPermission ? privacy.requestTracking() : privacy.trackingStatus()))
          .status
      : "not_applicable";
  const consent: MobileAdConsent = { advertising: allow, platform, att };
  const confirmed = await api<MobileAdConsent>("advertising", "PUT", consent);
  if (!mobileAdvertisingAllowed(confirmed) || generation !== current) return confirmed;
  await FirebaseAnalytics.setEnabled({ enabled: true });
  for (const type of [
    ConsentType.AdStorage,
    ConsentType.AdUserData,
    ConsentType.AdPersonalization,
    ConsentType.AnalyticsStorage,
  ])
    await FirebaseAnalytics.setConsent({ type, status: ConsentStatus.Granted });
  await FacebookLogin.setAdvertiserTrackingEnabled({ enabled: true });
  await FacebookLogin.setAdvertiserIDCollectionEnabled({ enabled: true });
  // Automatic events remain off: only the explicit shared allowlist is exported.
  if (generation === current) enabled = true;
  else await disableAdvertising();
  return confirmed;
}
export async function trackAdvertising(
  kind: string,
  category: string,
  eventId = crypto.randomUUID(),
) {
  const event = mobileAdEvent(kind, eventId, category);
  if (!enabled || !event || seen.has(eventId)) return;
  const current = generation;
  try {
    if (
      Capacitor.getPlatform() === "ios" &&
      (await privacy.trackingStatus()).status !== "authorized"
    ) {
      await disableAdvertising();
      return;
    }
    const consent = await api<MobileAdConsent | null>(
      `advertising?platform=${Capacitor.getPlatform()}`,
    );
    if (!mobileAdvertisingAllowed(consent) || !enabled || generation !== current) {
      await disableAdvertising();
      return;
    }
  } catch {
    await disableAdvertising();
    return;
  }
  seen.add(eventId);
  if (seen.size > 500) seen.delete(seen.values().next().value!);
  await Promise.allSettled([
    FacebookLogin.logEvent({ eventName: event.meta, parameters: event.parameters }),
    FirebaseAnalytics.logEvent({ name: event.google, params: event.parameters }),
  ]);
}
