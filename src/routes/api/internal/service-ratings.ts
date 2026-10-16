import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Called by the database scheduler (pg_cron) every 30 minutes: rates one
// trade in one town in the services directory, and advances the homes feed
// (list refreshes, then full details once per home), each within its own
// OpenWeb Ninja budget.
export const Route = createFileRoute("/api/internal/service-ratings")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { rateNextTradeCity } = await import("@/lib/service-directory.server");
        const { advanceHomeFeed } = await import("@/lib/openwebninja-listings.server");
        // The same schedule also advances the homes feed: at most one Zillow
        // call per run, paced to about three a day.
        const [ratings, homes] = await Promise.all([
          rateNextTradeCity().catch(() => null),
          advanceHomeFeed().catch((error) => ({ error: String(error?.message ?? error) })),
        ]);
        return Response.json({ ratings: ratings ?? { skipped: true }, homes });
      },
    },
  },
});
