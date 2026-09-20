import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight } from "@phosphor-icons/react";

import { SellerCenterNav } from "@/components/seller/SellerCenterNav";
import {
  ListingForm,
  ListingFormBackLink,
} from "@/components/classifieds/listing-form/ListingForm";
import { getClassifiedListingEditor } from "@/lib/classifieds.functions";
import { getSellerSetup } from "@/lib/seller.functions";

export const Route = createFileRoute("/_authenticated/create-listing")({
  validateSearch: (search: Record<string, unknown>): { duplicateFrom?: string } => ({
    ...(typeof search["duplicateFrom"] === "string"
      ? { duplicateFrom: search["duplicateFrom"] }
      : {}),
  }),
  component: CreateListingPage,
});

function CreateListingPage() {
  const { duplicateFrom } = Route.useSearch();
  const fetchSetup = useServerFn(getSellerSetup);
  const fetchDuplicateSource = useServerFn(getClassifiedListingEditor);
  const setup = useQuery({ queryKey: ["seller-setup"], queryFn: () => fetchSetup() });
  const duplicateSource = useQuery({
    queryKey: ["classified-listing-editor", duplicateFrom],
    queryFn: () => fetchDuplicateSource({ data: { listingId: duplicateFrom as string } }),
    enabled: Boolean(duplicateFrom),
  });

  // Classifieds are direct-contact: buyer and seller arrange shipping and
  // payment themselves, so posting one only requires accepting the seller
  // agreement -- not the shipping-method/handling-days setup that only
  // matters for Gem State's own checkout-marketplace listings.
  const profileReady = Boolean(setup.data?.exists && setup.data?.termsAccepted);

  if (!setup.isLoading && !profileReady) {
    return (
      <main className="mx-auto max-w-[1180px] px-4 py-10 sm:px-8">
        <SellerCenterNav storefrontSlug={setup.data?.slug} />
        <section className="mt-8 border border-brand-warm/40 bg-brand-warm/10 p-6">
          <p className="text-[15px] font-semibold">Complete your seller profile first</p>
          <p className="mt-2 max-w-[640px] text-[12px] leading-relaxed text-muted-foreground">
            Add your seller profile and accept the seller agreement before creating a listing.
          </p>
          <Link
            to="/seller-setup"
            className="mt-4 inline-flex h-11 items-center gap-2 bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground"
          >
            Start seller setup <ArrowRight size={15} />
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1040px] px-4 py-10 sm:px-8">
      <ListingFormBackLink />
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
            Gem State seller center
          </p>
          <h1 className="mt-1 font-editorial text-[40px] font-normal tracking-[-0.04em]">
            Create a listing
          </h1>
          <p className="mt-1 max-w-[680px] text-[12.5px] leading-relaxed text-muted-foreground">
            Every listing is free. List one exact item, vehicle, home, job, or service with your own
            photos, price, location, and details. Optional Boosted and Featured placement is
            available after approval.
          </p>
        </div>
      </div>
      <SellerCenterNav storefrontSlug={setup.data?.slug} />
      {duplicateFrom && duplicateSource.isLoading ? (
        <p className="mt-6 text-[12.5px] text-muted-foreground">
          Loading the listing to duplicate…
        </p>
      ) : (
        <ListingForm mode="create" duplicateFrom={duplicateSource.data ?? undefined} />
      )}
    </main>
  );
}
