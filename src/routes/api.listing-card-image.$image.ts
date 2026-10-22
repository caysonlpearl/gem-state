import { createFileRoute } from "@tanstack/react-router";
import { serveListingCardImage } from "@/lib/listing-card-image.server";

// Register the endpoint with the application router, just like sitemap.xml.
// No page uses it until its private-preview response is verified.
export const Route = createFileRoute("/api/listing-card-image/$image")({
  server: {
    handlers: {
      GET: ({ request }) => serveListingCardImage(request),
      HEAD: ({ request }) => serveListingCardImage(request),
    },
  },
});
