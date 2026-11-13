import { createFileRoute } from "@tanstack/react-router";
import { handleShoppingRequest } from "@/lib/shopping.server";
export const Route = createFileRoute("/api/shopping")({
  server: {
    handlers: {
      GET: ({ request }) => handleShoppingRequest(request),
      POST: ({ request }) => handleShoppingRequest(request),
    },
  },
});
