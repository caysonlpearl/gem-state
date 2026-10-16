import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Called by the database scheduler (pg_cron) every 30 minutes: rates one
// trade in one town in the services directory per call, within the
// OpenWeb Ninja budget.
export const Route = createFileRoute("/api/internal/service-ratings")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { rateNextTradeCity } = await import("@/lib/service-directory.server");
        return Response.json((await rateNextTradeCity()) ?? { skipped: true });
      },
    },
  },
});
