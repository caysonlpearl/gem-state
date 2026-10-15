import { trackEvent } from "@/lib/analytics";
import { performancePageTemplate } from "@/lib/analytics-policy";

let started = false;

/** Measure a full browser page load; SPA routes do not invent document samples. */
export function startWebVitals() {
  if (started || typeof window === "undefined") return;
  const template = performancePageTemplate(window.location.pathname);
  if (!template) return;
  started = true;
  const device = window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop";
  void import("web-vitals")
    .then(({ onCLS, onINP, onLCP }) => {
      const report = (metric: { name: string; id: string; value: number; rating: string }) => {
        void trackEvent("web_vital", {
          metric: metric.name,
          metric_id: metric.id,
          value: metric.value,
          rating: metric.rating,
          template,
          device,
        });
      };
      // Early buffered updates survive navigations that cancel a final unload request.
      onCLS(report, { reportAllChanges: true });
      onINP(report, { reportAllChanges: true });
      onLCP(report, { reportAllChanges: true });
    })
    .catch(() => {
      /* Performance telemetry never blocks the page. */
    });
}
