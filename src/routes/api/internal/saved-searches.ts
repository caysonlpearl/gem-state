import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/internal/saved-searches")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { processSavedSearchAlerts } = await import("@/lib/saved-search-worker.server");
        return Response.json(await processSavedSearchAlerts());
      },
    },
  },
});
