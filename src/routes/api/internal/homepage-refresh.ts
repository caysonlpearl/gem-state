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
        const result = await refreshHomepageSnapshot().catch(() => null);
        // Warming still runs on failure, with its own connection window.
        const seo = await prewarmSeoPages().catch(() => ({ checked: 0, available: 0 }));
        return result
          ? Response.json({ ...result, seo })
          : Response.json({ refreshed: false, reason: "unavailable", seo }, { status: 503 });
      },
    },
  },
});
