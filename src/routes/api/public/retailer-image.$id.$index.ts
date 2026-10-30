import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/retailer-image/$id/$index")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { serveMerchandiseImage } = await import("@/lib/avantlink-images.server");
        const { merchandiseDetail } = await import("@/lib/avantlink-listings.server");
        return serveMerchandiseImage(
          params.id, params.index, (id) => merchandiseDetail(id, undefined, true),
        );
      },
    },
  },
});