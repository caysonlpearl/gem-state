import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/internal/homepage-refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { refreshHomepageSnapshot } = await import("@/lib/homepage-snapshot.server");
        const { prewarmSeoPages } = await import("@/lib/seo-prewarm.server");
        // Independent public cache maintenance; a homepage-source failure
        // must not cancel preparation of an otherwise available SEO page.
        const seo = prewarmSeoPages().catch(() => ({ checked: 0, available: 0 }));
        try {
          const result = await refreshHomepageSnapshot();
          return Response.json({ ...result, seo: await seo });
        } catch {
          await seo;
          return Response.json({ refreshed: false, reason: "unavailable" }, { status: 503 });
        }
      },
    },
  },
});
