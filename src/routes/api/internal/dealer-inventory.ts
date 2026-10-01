import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/internal/dealer-inventory")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { processScheduledDealerInventorySources } =
          await import("@/lib/dealer-inventory.functions");
        return Response.json(await processScheduledDealerInventorySources());
      },
    },
  },
});
