import { createFileRoute } from "@tanstack/react-router";
import { handleMobileRequest } from "@/lib/mobile.server";
export const Route = createFileRoute("/api/mobile/v1/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleMobileRequest(request),
      POST: ({ request }) => handleMobileRequest(request),
      PUT: ({ request }) => handleMobileRequest(request),
      DELETE: ({ request }) => handleMobileRequest(request),
      OPTIONS: ({ request }) => handleMobileRequest(request),
    },
  },
});
