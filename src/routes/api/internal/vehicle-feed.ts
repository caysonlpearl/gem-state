import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Called weekly by the database scheduler (pg_cron): refreshes the cached
// Idaho MarketCheck inventory (dealer and private seller) that every car
// search filters, so searches themselves never spend provider calls.
export const Route = createFileRoute("/api/internal/vehicle-feed")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { refreshMarketCheckSearches } = await import("@/lib/marketcheck.server");
        return Response.json(await refreshMarketCheckSearches());
      },
    },
  },
});
