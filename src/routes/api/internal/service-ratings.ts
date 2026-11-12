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
        // Operator-triggered home backfills reuse the same authentication
        // and database budgets without running unrelated provider imports.
        if (new URL(request.url).searchParams.get("homesOnly") === "1") {
          const { advanceHomeFeed } = await import("@/lib/openwebninja-listings.server");
          const steps = Math.max(
            1,
            Math.min(
              5,
              Number.parseInt(new URL(request.url).searchParams.get("steps") ?? "1", 10) || 1,
            ),
          );
          const started = Date.now();
          let homes = await advanceHomeFeed();
          let completedSteps = 1;
          while (completedSteps < steps && Date.now() - started < 15_000) {
            homes = await advanceHomeFeed();
            completedSteps++;
          }
          return Response.json({ homes, completedSteps });
        }
        const { rateNextTradeCity } = await import("@/lib/service-directory.server");
        const { advanceHomeFeed } = await import("@/lib/openwebninja-listings.server");
        const { advanceMerchandiseFeed } = await import("@/lib/avantlink.server");
        const { refreshHomepageSnapshot } = await import("@/lib/homepage-snapshot.server");
        // Each existing homes subscription advances once per run. Database
        // reservations enforce monthly caps and preserve weekly-update credits.
        const [ratings, homes, merchandise, homepage] = await Promise.all([
          rateNextTradeCity().catch(() => null),
          advanceHomeFeed().catch((error) => ({ error: String(error?.message ?? error) })),
          advanceMerchandiseFeed().catch(() => ({ skipped: true, reason: "unavailable" })),
          refreshHomepageSnapshot().catch(() => ({ refreshed: false, reason: "unavailable" })),
        ]);
        return Response.json({
          ratings: ratings ?? { skipped: true },
          homes,
          merchandise,
          homepage,
        });
      },
    },
  },
});
