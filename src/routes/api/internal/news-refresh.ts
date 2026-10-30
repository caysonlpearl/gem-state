import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/internal/news-refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        try {
          const { refreshEditorialSources } = await import("@/lib/editorial-store.server");
          return Response.json(
            { sources: await refreshEditorialSources() },
            { headers: { "Cache-Control": "no-store" } },
          );
        } catch {
          return Response.json(
            { refreshed: false, reason: "News refresh unavailable; saved stories retained." },
            { status: 503 },
          );
        }
      },
    },
  },
});
