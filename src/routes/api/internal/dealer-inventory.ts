import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/internal/dealer-inventory")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        try {
          const { processScheduledDealerInventorySources } =
            await import("@/lib/dealer-inventory.functions");
          return Response.json(await processScheduledDealerInventorySources());
        } catch (error) {
          // This endpoint is already cron-authenticated. Preserve a useful,
          // bounded failure reason instead of losing it in the generic SSR page.
          const reason = (error instanceof Error ? error.message : "Unknown scheduler error")
            .replace(/https?:\/\/[^\s"']+/gi, "[private endpoint]")
            .replace(/sb_secret_[A-Za-z0-9_-]+/g, "[redacted]")
            .slice(0, 300);
          return Response.json({ error: "Inventory sweep failed", reason }, { status: 500 });
        }
      },
    },
  },
});
