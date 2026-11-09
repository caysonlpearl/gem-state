import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
export const Route = createFileRoute("/api/internal/dealer-inquiries")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { processDealerInquiryNotifications } = await import("@/lib/dealer-inquiry.server");
        return Response.json(await processDealerInquiryNotifications());
      },
    },
  },
});
