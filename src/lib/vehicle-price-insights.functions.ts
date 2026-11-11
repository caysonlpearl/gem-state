import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getVehiclePriceInsight = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        listingId: z
          .string()
          .max(200)
          .regex(
            /^(?:[0-9a-f-]{36}|dealerfeed-[0-9a-f-]{36}|marketcheck-(?:dealer|fsbo)-[A-Za-z0-9._:-]{1,160})$/,
          ),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const agent = getRequest().headers.get("user-agent") ?? "";
    if (/bot|crawl|spider|preview|lighthouse|headless|monitor|curl|wget|python/i.test(agent))
      return null;
    try {
      const [{ getClassifiedListing }, { listingPriceInsight }, { supabaseAdmin }] =
        await Promise.all([
          import("./classifieds.functions"),
          import("./vehicle-price-insights.server"),
          import("@/integrations/supabase/client.server"),
        ]);
      // Client only supplies the ID; asking price, seller and vehicle identity come from public inventory.
      const listing = await getClassifiedListing({ data: { id: data.listingId } });
      return listing ? await listingPriceInsight(listing, supabaseAdmin) : null;
    } catch {
      return null;
    }
  });
