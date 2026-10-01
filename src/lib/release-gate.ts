/** Shared release-candidate coverage and telemetry rules. */

export const RELEASE_GATE_VIEWPORTS = [1440, 768, 390, 320] as const;

export const RELEASE_GATE_ROLES = ["anonymous", "buyer", "seller", "dealership", "admin"] as const;

export const RELEASE_GATE_JOURNEYS = [
  "auth-gate-and-return",
  "seller-setup-to-moderation",
  "buyer-search-save-contact-reply",
  "report-to-admin-resolution",
  "dealer-import-to-public-inventory",
] as const;

export type ReleaseGateStatus = "passed" | "failed" | "blocked" | "untested";

export function classifyLatency(durationMs: number, thresholdMs = 1_500) {
  const duration = Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : 0;
  const threshold = Number.isFinite(thresholdMs) ? Math.max(1, Math.round(thresholdMs)) : 1_500;
  return {
    durationMs: duration,
    thresholdMs: threshold,
    slow: duration > threshold,
  };
}

/** Keep browser telemetry useful without storing typed search terms or credentials. */
export function sanitizeTelemetryText(value: unknown, maxLength = 180) {
  return String(value ?? "Unknown error")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/https?:\/\/\S+/g, "[url]")
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "[id]")
    .slice(0, maxLength);
}

export function controlledRecordLabel(now = new Date()) {
  const stamp = now
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  return `BLUEBIRD-QA-${stamp}`;
}
