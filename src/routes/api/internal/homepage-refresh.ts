import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/internal/homepage-refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { refreshHomepageSnapshot } = await import("@/lib/homepage-snapshot.server");
        try {
          return Response.json(await refreshHomepageSnapshot());
        } catch {
          return Response.json({ refreshed: false, reason: "unavailable" }, { status: 503 });
        }
      },
    },
  },
});
