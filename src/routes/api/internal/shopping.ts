import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
export const Route = createFileRoute("/api/internal/shopping")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        return Response.json(
          await (await import("@/lib/shopping-worker.server")).processShoppingWorker(),
        );
      },
    },
  },
});
