import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/feeds/chatgpt.csv")({
  server: {
    handlers: {
      GET: async () => {
        const { publicServerClient } = await import("@/lib/supabase-public.server");
        const { chatgptFeedResponse } = await import("@/lib/chatgpt-product-feed.server");
        return chatgptFeedResponse(publicServerClient());
      },
    },
  },
});
