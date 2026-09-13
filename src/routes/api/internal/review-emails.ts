import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/internal/review-emails")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
        if (!token) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const check = await (supabaseAdmin as any).rpc("consume_review_worker_token", {
          _token: token,
        });
        if (check.error || check.data !== true)
          return new Response("Unauthorized", { status: 401 });
        const { processReviewEmails } = await import("@/lib/review-email-worker.server");
        return Response.json(await processReviewEmails());
      },
    },
  },
});
