import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/internal/news-refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const reviews = import("@/lib/seo-review-reports.server")
          .then((module) => module.refreshSeoReviewReports())
          .catch(() => []);
        // This is the installed quarter-hour job. Warming only reads saved
        // marketplace data and remains independent of publisher availability.
        const seo = import("@/lib/seo-prewarm.server")
          .then((module) => module.prewarmSeoPages())
          .catch(() => ({ checked: 0, available: 0 }));
        try {
          const { refreshEditorialSources } = await import("@/lib/editorial-store.server");
          return Response.json(
            { sources: await refreshEditorialSources(), reviews: await reviews, seo: await seo },
            { headers: { "Cache-Control": "no-store" } },
          );
        } catch {
          await Promise.all([reviews, seo]);
          return Response.json(
            { refreshed: false, reason: "News refresh unavailable; saved stories retained." },
            { status: 503 },
          );
        }
      },
    },
  },
});
