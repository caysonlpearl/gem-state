import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getActiveListingsForVariant } from "@/lib/seller.functions";
import { SellerListingGrid } from "./SellerListingGrid";

export function ActiveSellerListings({
  variantId,
  productName,
  productSlug,
  variantLabel,
}: {
  variantId: string;
  productName: string;
  productSlug: string;
  variantLabel: string;
}) {
  const fetchListings = useServerFn(getActiveListingsForVariant);
  const query = useQuery({
    queryKey: ["active-seller-listings", variantId],
    queryFn: () => fetchListings({ data: { variantId } }),
    enabled: Boolean(variantId),
  });
  return (
    <section className="mt-3">
      {query.data?.length ? (
        <p className="numeric mb-3 text-[11.5px] text-muted-foreground">
          {query.data.length} live listing{query.data.length === 1 ? "" : "s"}
        </p>
      ) : null}

      {query.isLoading ? (
        <p className="text-[12.5px] text-muted-foreground">Loading listings…</p>
      ) : (
        <SellerListingGrid
          listings={(query.data ?? []).map((listing) => ({
            ...listing,
            productName,
            productSlug,
            variantLabel,
          }))}
        />
      )}
    </section>
  );
}
