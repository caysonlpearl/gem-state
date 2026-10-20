import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowSquareOut,
  ArrowRight,
  CaretDown,
  CaretRight,
  CheckCircle,
  Clock,
  DeviceMobile,
  EnvelopeSimple,
  Eye,
  Flag,
  FileText,
  GearSix,
  Heart,
  Gauge,
  Info,
  MapPin,
  MapTrifold,
  Palette,
  Phone,
  Printer,
  ShareNetwork,
  ShieldCheck,
  Star,
  Truck,
  ChatCircle,
  Globe,
  Wrench,
  Buildings,
  CalendarBlank,
  Car,
  House,
  Images,
  PawPrint,
  Ruler,
  Tag,
} from "@phosphor-icons/react";

import { brand } from "@/config/brand";
import { formatUsd } from "@/config/fees";
import { BluebirdEmptyState } from "@/components/layout/BluebirdEmptyState";
import { ListingActions } from "@/components/classifieds/ListingActions";
import { MobileContactBar } from "@/components/classifieds/MobileContactBar";
import { OPEN_CONTACT_EVENT } from "@/components/classifieds/ContactSignInSheet";
import { listingIdFromParam, listingParam, listingPath } from "@/lib/listing-url";
import { canonicalMarketCheckId } from "@/lib/marketcheck-contract";
import { trackEvent, trackSellerContact } from "@/lib/analytics";
import { PUBLIC_PAGE_STALE_MS } from "@/lib/query-freshness";
import { recordListingView } from "@/lib/listing-stats.functions";
import { claimServiceBusiness, getMyServiceClaim } from "@/lib/service-claims.functions";
import {
  EmployerTile,
  ListingCard,
  LogoDevCredit,
  PlaceholderMark,
} from "@/components/classifieds/ListingCard";
import { PartnerJobHeartButton } from "@/components/community/PartnerJobHeartButton";
import { PartnerHomeHeartButton } from "@/components/community/PartnerHomeHeartButton";
import { PartnerVehicleHeartButton } from "@/components/community/PartnerVehicleHeartButton";
import { WatchHeartButton } from "@/components/community/WatchHeartButton";
import {
  conditionLabels,
  formatClassifiedPrice,
  adoptionPriceLabel,
  formatFulfillmentLabel,
  formatJobPay,
  formatMileage,
  fulfillmentLabels,
  homeStatusLabel,
  homeTypeNoun,
  listingLogoUrl,
  withoutLogo,
  petPlacementLabels,
  postedAge,
  vehicleHeadline,
  placeLabel,
} from "@/lib/classifieds-display";
import {
  getClassifiedListing,
  getEndedClassifiedListing,
  getRelatedClassifieds,
} from "@/lib/classifieds.functions";
import { canonicalMake, canonicalModel, nearbyPagePath, vehiclePagePath } from "@/lib/place-pages";
import { jsonLdScript, listingStructuredData } from "@/lib/structured-data";
import { isSeoTestListing, socialImageMeta } from "@/lib/seo-policy";
import { getRemovedListingRedirect } from "@/lib/place-pages.functions";
import type { ClassifiedCard, ClassifiedDetail } from "@/lib/classifieds.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { reportClassifiedListing } from "@/lib/classifieds.functions";

const listingQuery = (id: string) =>
  queryOptions({
    queryKey: ["classified-listing", id],
    staleTime: PUBLIC_PAGE_STALE_MS,
    // A sold or expired listing keeps a read-only page for a while.
    queryFn: async () =>
      (await getClassifiedListing({ data: { id } })) ??
      (await getEndedClassifiedListing({ data: { id } })),
  });

const listingTabListClass =
  "flex flex-wrap gap-1 rounded-xl border border-border/80 bg-secondary/55 p-1.5 shadow-inner";
const listingTabClass = (selected: boolean) =>
  `rounded-lg border px-4 py-2.5 text-[12.5px] font-semibold capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
    selected
      ? "border-primary/25 bg-card text-foreground shadow-sm ring-1 ring-primary/15"
      : "border-transparent text-muted-foreground hover:border-border/80 hover:bg-card/75 hover:text-foreground hover:shadow-sm"
  }`;

async function copyListingUrl(url: string) {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch {
    // Fall through to the legacy clipboard path for embedded browsers and
    // contexts where the Clipboard API is present but permission is denied.
  }

  if (typeof document === "undefined") return false;

  const input = document.createElement("textarea");
  input.value = url;
  input.setAttribute("readonly", "true");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.focus();
  input.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    input.remove();
  }
}

function ListingMapEmbed({
  locationQuery,
  title,
  className = "h-[210px]",
}: {
  locationQuery: string;
  title: string;
  className?: string;
}) {
  return (
    <iframe
      title={title}
      src={`https://www.google.com/maps?q=${locationQuery}&output=embed`}
      className={`w-full border-0 ${className}`}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
}

export const Route = createFileRoute("/listings/$listingId")({
  loader: async ({ context, params }) => {
    // Historical warm-cache rows generated repeated dealer prefixes. Redirect
    // before querying the listing so the old URL cannot spend a provider call.
    const canonicalMarketCheckIdValue = canonicalMarketCheckId(params.listingId);
    if (canonicalMarketCheckIdValue && canonicalMarketCheckIdValue !== params.listingId) {
      throw redirect({
        to: "/listings/$listingId",
        params: { listingId: canonicalMarketCheckIdValue },
        statusCode: 301,
      });
    }
    const listingId = listingIdFromParam(params.listingId);
    const listing = await context.queryClient.ensureQueryData(listingQuery(listingId));
    if (!listing && (listingId.startsWith("mashvisor-") || listingId.startsWith("openwebninja-"))) {
      // Feed homes come and go with the weekly refresh.
      throw redirect({ href: "/browse?category=other-real-estate", statusCode: 302 });
    }
    if (!listing && listingId.startsWith("fsq-")) {
      // Hidden (closed or removed) directory businesses go to Services.
      throw redirect({ href: "/browse?category=services", statusCode: 302 });
    }
    if (!listing && listingId.startsWith("adzuna-")) {
      // Partner job postings come and go; an old link goes to today's jobs.
      throw redirect({ href: "/browse?category=jobs", statusCode: 302 });
    }
    if (!listing) {
      // A removed or expired listing sends its visitors (and whatever search
      // value it earned) to the closest live page instead of a dead end.
      const fallback = await getRemovedListingRedirect({ data: { id: listingId } });
      if (fallback) throw redirect({ href: fallback, statusCode: 301 });
      throw notFound();
    }
    // One URL per listing: bare-ID and outdated-title URLs redirect to it.
    const canonicalParam = listingParam(listing);
    if (params.listingId !== canonicalParam) {
      throw redirect({
        to: "/listings/$listingId",
        params: { listingId: canonicalParam },
        statusCode: 301,
      });
    }
    return {
      title: listing.title,
      // Directory businesses read "Knight Plumbing — Plumbers in Nampa".
      priceLabel: listing.directory
        ? (listing.service?.subcategory ?? "Local business")
        : listing.job
          ? formatJobPay(listing.job)
          : (listing.service?.pricing ??
            adoptionPriceLabel(listing) ??
            formatClassifiedPrice(listing.priceCents, {
              wholeDollars: Boolean(listing.vehicle || listing.home),
              monthly: listing.home?.mode === "rent",
            })),
      city: listing.city,
      state: listing.state,
      ended: listing.ended?.reason ?? null,
      shareImage: listing.images.length ? `/media/listings/${listing.id}/0` : undefined,
      leadImage: listing.images[0]?.url,
      // Partner jobs and unclaimed directory businesses aren't Bluebird
      // content: followed, never indexed, no listing markup.
      external: Boolean(listing.externalJob || listing.directory),
      structuredData:
        listing.externalJob || listing.directory ? [] : listingStructuredData(listing),
    };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: `Listing unavailable — ${brand.name}` },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const endedLabel =
      loaderData.ended === "sold" ? "Sold" : loaderData.ended === "expired" ? "Expired" : null;
    const title = endedLabel
      ? `${loaderData.title} (${endedLabel}) in ${loaderData.city}, ${loaderData.state}`
      : `${loaderData.title} — ${loaderData.priceLabel} in ${loaderData.city}, ${loaderData.state}`;
    const description = endedLabel
      ? `${loaderData.title} in ${loaderData.city}, ${loaderData.state} is no longer available. See similar listings from local sellers on ${brand.name}.`
      : `${loaderData.title} listed for ${loaderData.priceLabel} by a seller in ${loaderData.city}, ${loaderData.state} on ${brand.name}.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        ...(isSeoTestListing(loaderData.title)
          ? [{ name: "robots", content: "noindex, nofollow" }]
          : loaderData.external
            ? [{ name: "robots", content: "noindex, follow" }]
            : []),
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        ...socialImageMeta(brand.urls.siteUrl, loaderData.shareImage, loaderData.title),
      ],
      scripts: loaderData.structuredData.length ? [jsonLdScript(loaderData.structuredData)] : [],
      // Discover the exact gallery resource before hydration, without a second photo URL.
      links: loaderData.leadImage
        ? [{ rel: "preload", as: "image", href: loaderData.leadImage, fetchPriority: "high" }]
        : [],
    };
  },
  component: ListingDetail,
  notFoundComponent: ListingMissing,
});

function ListingMissing() {
  return (
    <main className="mx-auto max-w-[760px] px-4 py-14 sm:px-6">
      <BluebirdEmptyState
        title="This listing is no longer live"
        description="It may have sold, expired, or been removed by the seller."
      >
        <Link
          to="/browse"
          search={{}}
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-[13px] font-semibold text-primary-foreground"
        >
          Browse all listings
        </Link>
      </BluebirdEmptyState>
    </main>
  );
}

function SpecIcon({ label }: { label: string }) {
  const specIcons: Record<string, typeof Gauge> = {
    Mileage: Gauge,
    Transmission: GearSix,
    Drivetrain: GearSix,
    Fuel: Wrench,
    Exterior: Palette,
    Title: ShieldCheck,
    VIN: Info,
    Condition: Info,
    Fulfillment: Truck,
  };
  const Icon = specIcons[label] ?? Info;
  return <Icon size={16} weight="duotone" className="text-primary" aria-hidden="true" />;
}

function SpecGrid({ rows }: { rows: [string, string][] }) {
  if (rows.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="rounded-2xl border border-border/70 bg-secondary/45 px-3.5 py-3.5"
        >
          <dt className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            <SpecIcon label={label} />
            {label}
          </dt>
          <dd className="mt-1.5 text-[13px] font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function QuickFact({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-1.5 text-[14px] font-semibold">{value}</p>
    </div>
  );
}

/** A listing with no photos: category art (or a partner employer's logo tile). */
function GalleryPlaceholder({ listing }: { listing: ClassifiedDetail }) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[28px] border border-border/70 bg-secondary/55 text-[12px] text-muted-foreground sm:min-h-[520px]">
      <PlaceholderMark listing={listing} large />
      <span className="mt-4">
        {listing.externalJob
          ? "This job posting has no photos."
          : listing.directory
            ? "This business hasn't added photos yet."
            : "This seller has not added photos yet."}
      </span>
    </div>
  );
}

/** A partner job's employer logo filling the gallery, on white. */
function GalleryLogo({ listing, logoUrl }: { listing: ClassifiedDetail; logoUrl: string }) {
  const [missing, setMissing] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // A failure before hydration never reaches onError.
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) setMissing(true);
  }, []);
  if (missing) {
    return <GalleryPlaceholder listing={withoutLogo(listing)} />;
  }
  return (
    <div className="flex h-[300px] items-center justify-center overflow-hidden rounded-[28px] border border-border/70 bg-white p-8 sm:h-[460px] sm:p-14">
      <img
        ref={ref}
        // The gallery is several times a card's size; ask for a sharper copy.
        src={logoUrl.replace(/([?&])size=\d+/, "$1size=800")}
        alt={`${listing.job?.employerName ?? "Employer"} logo`}
        onError={() => setMissing(true)}
        className="h-full w-full object-contain"
        fetchPriority="high"
      />
    </div>
  );
}

function Gallery({ listing }: { listing: ClassifiedDetail }) {
  const [activeImage, setActiveImage] = useState(0);
  const images = listing.images;
  const subject = listing.vehicle ? "vehicle" : "listing";

  const logoUrl = listingLogoUrl(listing);
  if (images.length === 0 && logoUrl) {
    return <GalleryLogo listing={listing} logoUrl={logoUrl} />;
  }
  if (images.length === 0) {
    return <GalleryPlaceholder listing={listing} />;
  }
  const goToImage = (next: number) => {
    setActiveImage((next + images.length) % images.length);
  };

  return (
    <Dialog>
      <div className="overflow-hidden rounded-[28px] border border-border/70 bg-foreground">
        <div
          className="group relative flex h-[360px] items-center justify-center overflow-hidden sm:h-[560px]"
          data-reference-layout="row-span-2"
        >
          <img
            src={images[activeImage]?.url}
            alt={images[activeImage]?.alt ?? ""}
            width={1120}
            height={1120}
            className="h-full w-full object-contain"
            fetchPriority="high"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent" />
          {images.length > 1 && (
            <>
              <div className="absolute bottom-4 left-4 rounded-full bg-black/65 px-3 py-1 text-[11px] font-medium text-white">
                {activeImage + 1} / {images.length}
              </div>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="absolute right-4 top-4 min-h-11 rounded-full bg-card/95 px-4 text-[12px] font-semibold text-foreground opacity-100 transition hover:bg-card sm:opacity-0 sm:group-hover:opacity-100"
                >
                  Show all {images.length} photos
                </button>
              </DialogTrigger>
            </>
          )}
          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => goToImage(activeImage - 1)}
                aria-label={`Previous ${subject} photo`}
                className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-card/95 text-foreground transition hover:scale-105"
              >
                <ArrowLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => goToImage(activeImage + 1)}
                aria-label={`Next ${subject} photo`}
                className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-card/95 text-foreground transition hover:scale-105"
              >
                <ArrowRight size={18} />
              </button>
            </>
          )}
        </div>
      </div>
      {images.length > 1 && (
        <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
          {images.map((image, index) => (
            <button
              key={image.url}
              type="button"
              onClick={() => setActiveImage(index)}
              aria-label={`Show ${subject} photo ${index + 1}`}
              aria-current={index === activeImage}
              className={`h-16 w-24 shrink-0 overflow-hidden rounded-xl border-2 bg-secondary transition sm:h-[76px] sm:w-[112px] ${index === activeImage ? "border-primary" : "border-transparent opacity-75 hover:opacity-100"}`}
            >
              <img src={image.url} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto rounded-[28px] p-5 sm:p-7">
        <DialogHeader>
          <DialogTitle>{subject === "vehicle" ? "Vehicle photos" : "Listing photos"}</DialogTitle>
          <DialogDescription>{listing.title}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((image) => (
            <img
              key={image.url}
              src={image.url}
              alt={image.alt}
              className="w-full rounded-2xl object-cover"
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SellerCard({ listing }: { listing: ClassifiedDetail }) {
  const seller = listing.seller;
  if (!seller) return null;
  const contactLinkClass =
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border text-[12px] font-medium transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary";
  return (
    <section className="soft-card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-primary text-base font-semibold text-primary-foreground">
          {seller.avatarUrl ? (
            <img src={seller.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            seller.displayName.slice(0, 1).toUpperCase()
          )}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-bold">{seller.displayName}</h2>
            {seller.managedByBluebird && (
              <span className="rounded-full bg-secondary px-2 py-1 text-[10px] font-semibold">
                Managed by Bluebird
              </span>
            )}
            {seller.payoutVerified && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary"
                title="payout identity verified through Bluebird’s payment provider. This does not verify the listing, item condition, ownership, or transaction."
              >
                <CheckCircle size={12} weight="fill" /> Verified seller
              </span>
            )}
          </div>
          <div className="mt-3 space-y-1 text-[12px]">
            <p>
              <span className="font-semibold">City:</span> {listing.city}
              {listing.state ? `, ${listing.state}` : ""}
            </p>
            {seller.memberSince && (
              <p>
                <span className="font-semibold">Member since:</span> {seller.memberSince}
                {new Date().getFullYear() - seller.memberSince > 0 && (
                  <span className="ml-1 rounded-full bg-brand-warm/20 px-1.5 py-0.5 text-[10px] font-bold text-brand-warm">
                    {new Date().getFullYear() - seller.memberSince} yrs
                  </span>
                )}
              </p>
            )}
            {seller.sellerType && (
              <p>
                <span className="font-semibold">Seller type:</span> {seller.sellerType}
              </p>
            )}
          </div>
        </div>
      </div>
      <ProfileStrength seller={seller} />
      {listing.dealer ? (
        <div className="mt-4 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-[12px]">
          <p className="font-semibold text-primary">
            Dealer inventory · {listing.dealer.displayName}
          </p>
          <p className="mt-0.5 text-muted-foreground">
            Verified dealership attribution for this listing
            {listing.dealer.city
              ? ` · ${listing.dealer.city}${listing.dealer.state ? `, ${listing.dealer.state}` : ""}`
              : ""}
          </p>
        </div>
      ) : null}
      {listing.dealer?.address && (
        <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-relaxed text-primary">
          <MapPin size={14} weight="fill" className="mt-0.5 shrink-0" />
          {[
            listing.dealer.address,
            listing.dealer.city,
            listing.dealer.state,
            listing.dealer.postalCode,
          ]
            .filter(Boolean)
            .join(", ")}
        </p>
      )}
      {listing.service?.businessAddress && (
        <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-relaxed text-primary">
          <MapPin size={14} weight="fill" className="mt-0.5 shrink-0" />
          {listing.service.businessAddress}
        </p>
      )}
      {listing.service?.licenseNumber && (
        <p className="mt-2 text-[12px] leading-relaxed">
          License # {listing.service.licenseNumber}
          {listing.service.licenseLookupUrl && (
            <>
              {" · "}
              <a
                href={listing.service.licenseLookupUrl}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-primary hover:underline"
              >
                Look up business license
              </a>
            </>
          )}
        </p>
      )}
      {seller.ratingAverage != null && (
        <div className="mt-4 overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
          <div
            className="flex flex-wrap items-center justify-center gap-2 px-3 py-3"
            aria-label={`${seller.ratingAverage.toFixed(1)} out of 5 stars from ${seller.reviewCount} reviews`}
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              G
            </span>
            <span className="numeric text-[16px] font-bold">{seller.ratingAverage.toFixed(1)}</span>
            <span className="flex items-center gap-0.5 text-brand-warm" aria-hidden="true">
              {Array.from({ length: 5 }, (_, index) => (
                <Star
                  key={index}
                  size={16}
                  weight={index < Math.round(seller.ratingAverage ?? 0) ? "fill" : "regular"}
                />
              ))}
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">
              {seller.reviewCount} review{seller.reviewCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className="bg-primary px-3 py-1.5 text-center text-[11px] font-semibold text-primary-foreground">
            Bluebird Reviews
          </div>
        </div>
      )}
      {listing.ended ? null : (
        <div className="mt-4 border-t border-border/70 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Contact seller
          </p>
          {listing.originalListing ? (
            <a
              href={listing.originalListing.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              onClick={() => trackSellerContact("apply_external", listing)}
              className="mt-2 flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary text-[12.5px] font-semibold text-primary-foreground"
            >
              <ChatCircle size={15} aria-hidden="true" /> Message seller
            </a>
          ) : seller.allowInternalMessages !== false && !listing.job ? (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event(OPEN_CONTACT_EVENT))}
              className="mt-2 block w-full rounded-xl border border-border bg-secondary/40 p-3 text-left transition-colors hover:border-primary"
            >
              <span className="block text-[12.5px] italic text-muted-foreground">
                “Hi, is this still available? I would love to learn more.”
              </span>
              <span className="mt-2 flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary text-[12.5px] font-semibold text-primary-foreground">
                <ChatCircle size={15} aria-hidden="true" /> Message seller
              </span>
            </button>
          ) : null}
          <div className="mt-2 grid grid-cols-2 gap-2">
            {seller.contactTextPhone ? (
              <a
                href={`sms:${seller.contactTextPhone}`}
                onClick={() => trackSellerContact("text", listing)}
                className={contactLinkClass}
              >
                <DeviceMobile size={15} aria-hidden="true" /> Text
              </a>
            ) : null}
            {seller.contactPhone ? (
              <a
                href={`tel:${seller.contactPhone}`}
                onClick={() => trackSellerContact("call", listing)}
                className={contactLinkClass}
              >
                <Phone size={15} aria-hidden="true" /> Call
              </a>
            ) : null}
            {seller.contactEmail ? (
              <a
                href={`mailto:${seller.contactEmail}?subject=${encodeURIComponent(listing.title)}`}
                onClick={() => trackSellerContact("email", listing)}
                className={contactLinkClass}
              >
                <EnvelopeSimple size={15} aria-hidden="true" /> Email
              </a>
            ) : null}
            {listing.dealer?.website ? (
              <a
                href={
                  /^https?:\/\//i.test(listing.dealer.website)
                    ? listing.dealer.website
                    : `https://${listing.dealer.website}`
                }
                target="_blank"
                rel="noreferrer"
                className={contactLinkClass}
              >
                <Globe size={15} aria-hidden="true" /> Website
              </a>
            ) : null}
          </div>
          {seller.contactTextPhone || seller.contactPhone || seller.contactEmail ? (
            <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
              Enabled contact options go directly to the seller. Use Bluebird messaging below if you
              prefer to keep the conversation in the marketplace.
            </p>
          ) : (
            <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
              This seller has not enabled direct phone, text, or email contact for this listing.
            </p>
          )}
        </div>
      )}
      <Link
        to="/sellers/$slug"
        params={{ slug: seller.slug }}
        className="mt-4 flex items-center justify-between border-t border-border/70 pt-4 text-[12.5px] font-semibold text-primary hover:underline"
      >
        {listing.vehicle
          ? "View seller profile"
          : listing.job
            ? "All Jobs from This Employer"
            : "More From This Seller"}{" "}
        <CaretRight size={15} />
      </Link>
    </section>
  );
}

function ProfileStrength({ seller }: { seller: NonNullable<ClassifiedDetail["seller"]> }) {
  return (
    <StrengthMeter
      checks={[
        Boolean(seller.avatarUrl),
        Boolean(seller.bio),
        seller.payoutVerified,
        seller.reviewCount > 0,
        Boolean(seller.memberSince && new Date().getFullYear() - seller.memberSince >= 1),
      ]}
    />
  );
}

function StrengthMeter({ checks }: { checks: boolean[] }) {
  const score = checks.filter(Boolean).length;
  const label = score >= 4 ? "Strong" : score >= 2 ? "Good" : "New";
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-[12px]">
        <span className="font-semibold">Profile strength</span>
        <span className="font-semibold text-primary">{label}</span>
      </div>
      <div className="mt-1.5 grid grid-cols-5 gap-1" aria-hidden="true">
        {checks.map((_, index) => (
          <span
            key={index}
            className={`h-1.5 rounded-full ${index < score ? "bg-primary" : "bg-secondary"}`}
          />
        ))}
      </div>
    </div>
  );
}

function VehicleHistoryCard({ vehicle }: { vehicle: ClassifiedDetail["vehicle"] }) {
  if (!vehicle) return null;
  return (
    <section className="soft-card px-5 py-5">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <span className="grid h-9 w-8 shrink-0 place-items-end overflow-hidden rounded-lg bg-brand-warm shadow-sm">
          <img
            src="https://images.carfax.com/image/1000257/Car-Fox_Looking-Left-cropped-med.png?width=416"
            alt="CARFAX Car Fox"
            className="h-[40px] w-auto max-w-none translate-y-0.5 object-contain"
          />
        </span>
        <div>
          <p className="text-[23px] font-black leading-none tracking-[-0.04em] text-foreground">
            CARFAX
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-warm">
            Vehicle history
          </p>
        </div>
      </div>
      <div className="mt-5 flex items-center gap-2">
        <FileText size={18} weight="duotone" className="text-primary" />
        <h2 className="text-[14px] font-bold">Vehicle history report</h2>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
        Review title, accident, and ownership history before you buy. A CARFAX report may require a
        separate purchase.
      </p>
      <a
        href="https://www.carfax.com/vehicle-history-reports/"
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline"
      >
        Get a CARFAX report <CaretRight size={15} />
      </a>
    </section>
  );
}

function MarketCheckContactCard({ listing }: { listing: ClassifiedDetail }) {
  const source = listing.externalVehicle;
  if (!source) return null;
  const dealer = source.dealer;
  const name =
    source.sourceKind === "fsbo"
      ? "Private seller"
      : (dealer?.name ?? source.location.sellerName ?? "Vehicle seller");
  const phone = dealer?.phone;
  return (
    <section className="soft-card p-5 sm:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Listed by
      </p>
      <div className="mt-3 flex items-center gap-3">
        <EmployerTile name={name} />
        <div className="min-w-0 text-[12.5px]">
          <p className="text-[15px] font-bold">{name}</p>
          {dealer?.dealerType ? (
            <p className="mt-0.5 capitalize">{dealer.dealerType} dealer</p>
          ) : null}
          {dealer?.city || dealer?.state ? (
            <p className="mt-1 text-muted-foreground">
              {[dealer.city, dealer.state].filter(Boolean).join(", ")}
            </p>
          ) : source.sourceKind === "fsbo" && (source.location.city || source.location.state) ? (
            <p className="mt-1 text-[13px] text-muted-foreground">
              {[source.location.city, source.location.state].filter(Boolean).join(", ")}
            </p>
          ) : null}
        </div>
      </div>
      {dealer?.street || dealer?.zip ? (
        <p className="mt-4 flex items-start gap-1.5 text-[12px] leading-relaxed text-primary">
          <MapPin size={14} weight="fill" className="mt-0.5 shrink-0" />
          {[dealer.street, dealer.city, dealer.state, dealer.zip].filter(Boolean).join(", ")}
        </p>
      ) : null}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {phone ? (
          <a
            href={`tel:${phone.replace(/[^\d+]/g, "")}`}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border text-[12px] font-medium hover:border-primary hover:bg-primary/5 hover:text-primary"
          >
            <Phone size={15} aria-hidden="true" /> Call
          </a>
        ) : null}
        {dealer?.website ? (
          <a
            href={dealer.website}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border text-[12px] font-medium hover:border-primary hover:bg-primary/5 hover:text-primary"
          >
            <Globe size={15} aria-hidden="true" /> Website
          </a>
        ) : null}
      </div>
    </section>
  );
}

function MarketCheckDetailSections({ listing }: { listing: ClassifiedDetail }) {
  const source = listing.externalVehicle;
  if (!source) return null;
  const build = source.build;
  const rows: [string, string | null][] = [
    ["Version", build.version],
    ["Vehicle type", build.vehicleType],
    ["Engine", build.engine],
    ["Engine size", build.engineSize != null ? `${build.engineSize} L` : null],
    ["Engine block", build.engineBlock],
    ["Cylinders", build.cylinders != null ? String(build.cylinders) : null],
    ["Doors", build.doors != null ? String(build.doors) : null],
    ["Seating", build.seating],
    ["Powertrain", build.powertrainType],
    ["City MPG", build.cityMpg != null ? String(build.cityMpg) : null],
    ["Highway MPG", build.highwayMpg != null ? String(build.highwayMpg) : null],
    [
      "Interior color",
      String(source.raw.interior_color ?? source.raw.base_int_color ?? "") || null,
    ],
    ["Manufactured in", build.madeIn],
    ["Stock number", source.stockNumber],
    ["Seller type", source.sellerType],
    ["Inventory type", source.inventoryType],
    ["Certified", source.certified ? "Yes" : null],
    ["Vehicle status", source.vehicleStatus ?? source.availabilityStatus],
    ["In transit", source.inTransit === true ? "Yes" : source.inTransit === false ? "No" : null],
    ["Days on market", source.dom != null ? String(source.dom) : null],
    ["Active days", source.domActive != null ? String(source.domActive) : null],
    ["Days on site", source.dosActive != null ? String(source.dosActive) : null],
    ["MSRP", source.msrp != null ? wholeDollars(source.msrp) : null],
    ["Fees", source.fees != null ? wholeDollars(source.fees) : null],
    [
      "Price includes fees",
      source.priceIncludesFees == null ? null : source.priceIncludesFees ? "Yes" : "No",
    ],
    ["Previous price", source.referencePrice != null ? wholeDollars(source.referencePrice) : null],
    ["Price change", source.priceChangePercent != null ? `${source.priceChangePercent}%` : null],
  ].filter(([, value]) => Boolean(value)) as [string, string][];
  const groups = [
    ["Vehicle details", rows.slice(0, 13)],
    ["Listing details", rows.slice(13)],
  ] as const;
  const list = (title: string, values: string[]) =>
    values.length ? (
      <section className="mt-7 border-t border-border/70 pt-6">
        <h3 className="text-[15px] font-bold">{title}</h3>
        <ul className="mt-3 flex flex-wrap gap-2">
          {values.map((value) => (
            <li
              key={value}
              className="rounded-full border border-border/70 bg-secondary/40 px-3 py-1.5 text-[12.5px]"
            >
              {value}
            </li>
          ))}
        </ul>
      </section>
    ) : null;
  return (
    <div className="mt-7">
      {groups.map(([title, groupRows]) => (
        <section
          key={title}
          className="mt-7 border-t border-border/70 pt-6 first:mt-0 first:border-t-0 first:pt-0"
        >
          <h3 className="text-[15px] font-bold">{title}</h3>
          <SpecGrid
            rows={groupRows
              .filter((row) => Boolean(row[1]))
              .map(([label, value]) => [label, value!] as [string, string])}
          />
        </section>
      ))}
      {list("Options", source.extra.options)}
      {list("Features", source.extra.features)}
      {list("High-value features", source.extra.highValueFeatures)}
      {list("Option packages", source.extra.optionsPackages)}
      {source.finance || source.lease ? (
        <section className="mt-7 border-t border-border/70 pt-6">
          <h3 className="text-[15px] font-bold">Finance and lease offers</h3>
          <SpecGrid
            rows={
              [
                [
                  "Finance term",
                  source.finance?.loanTerm != null ? `${source.finance.loanTerm} months` : null,
                ],
                [
                  "Finance APR",
                  source.finance?.loanApr != null ? `${source.finance.loanApr}%` : null,
                ],
                [
                  "Finance down payment",
                  source.finance?.downPayment != null
                    ? wholeDollars(source.finance.downPayment)
                    : null,
                ],
                [
                  "Estimated finance payment",
                  source.finance?.estimatedMonthlyPayment != null
                    ? `${wholeDollars(source.finance.estimatedMonthlyPayment)}/mo`
                    : null,
                ],
                ["Lease term", source.lease?.term != null ? `${source.lease.term} months` : null],
                [
                  "Lease down payment",
                  source.lease?.downPayment != null ? wholeDollars(source.lease.downPayment) : null,
                ],
                [
                  "Estimated lease payment",
                  source.lease?.estimatedMonthlyPayment != null
                    ? `${wholeDollars(source.lease.estimatedMonthlyPayment)}/mo`
                    : null,
                ],
              ].filter(([, value]) => Boolean(value)) as [string, string][]
            }
          />
        </section>
      ) : null}
      {source.priceHistory.length ? (
        <section className="mt-7 border-t border-border/70 pt-6">
          <h3 className="text-[15px] font-bold">Price history</h3>
          <div className="mt-3 divide-y divide-border/70 text-[13px]">
            {source.priceHistory.map((item, index) => (
              <div
                key={`${item.label}-${index}`}
                className="flex items-center justify-between gap-4 py-2.5"
              >
                <span>{item.label}</span>
                <span className="numeric font-semibold">
                  {item.amount != null ? wholeDollars(item.amount) : "—"}
                  {item.date ? ` · ${new Date(item.date).toLocaleDateString()}` : ""}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function MarketCheckSourceCredit({ listing }: { listing: ClassifiedDetail }) {
  const source = listing.externalVehicle;
  if (!source) return null;
  return (
    <p className="border-t border-border/70 pt-4 text-[11px] text-muted-foreground">
      Vehicle listing data provided by MarketCheck.
      {source.sourceUrl ? (
        <a
          href={source.sourceUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="ml-1 font-semibold text-primary hover:underline"
        >
          View original listing <ArrowSquareOut size={13} className="inline" aria-hidden="true" />
        </a>
      ) : null}
    </p>
  );
}

const STATS_LISTING_ID =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|adzuna-\d{1,20}|mashvisor-\d{1,15}|openwebninja-\d{1,20}|marketcheck-(?:dealer|fsbo)-[A-Za-z0-9._:-]{1,160}|fsq-[0-9a-f]{24})$/;

/** Records this page view and returns views and saves; one request per page. */
function useListingStats(listing: ClassifiedDetail) {
  const record = useServerFn(recordListingView);
  return useQuery({
    queryKey: ["listing-stats", listing.id],
    queryFn: () => record({ data: { listingId: listing.id } }),
    enabled: !listing.isMock && STATS_LISTING_ID.test(listing.id),
    staleTime: 60_000,
  });
}

/** Views and saves beside the header buttons, like KSL's "44 👁 2 ♡". */
function ListingStatsInline({ listing }: { listing: ClassifiedDetail }) {
  const stats = useListingStats(listing).data;
  if (!stats) return null;
  return (
    <div className="mr-1 flex items-center gap-3 text-[12.5px] font-medium text-muted-foreground">
      <span
        className="inline-flex items-center gap-1"
        title={`${stats.views} page view${stats.views === 1 ? "" : "s"}`}
      >
        <span className="numeric">{stats.views}</span> <Eye size={16} aria-hidden="true" />
        <span className="sr-only">views</span>
      </span>
      <span
        className="inline-flex items-center gap-1"
        title={`Saved by ${stats.favorites} member${stats.favorites === 1 ? "" : "s"}`}
      >
        <span className="numeric">{stats.favorites}</span> <Heart size={16} aria-hidden="true" />
        <span className="sr-only">saves</span>
      </span>
    </div>
  );
}

function PageStatsCard({ listing }: { listing: ClassifiedDetail }) {
  const stats = useListingStats(listing).data;
  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  const daysBetween = (from: string, to: number) =>
    Math.max(0, Math.round((to - new Date(from).getTime()) / (1000 * 60 * 60 * 24)));
  const now = Date.now();
  const daysOnline = daysBetween(listing.createdAt, now);
  const daysLeft = listing.expiresAt
    ? daysBetween(listing.createdAt, new Date(listing.expiresAt).getTime()) - daysOnline
    : null;
  return (
    <section className="soft-card px-5 py-5">
      <h2 className="text-[14px] font-bold">Page stats</h2>
      <dl className="mt-3 divide-y divide-border/70 text-[12px]">
        <div className="flex items-center justify-between gap-4 py-2 first:pt-0">
          <dt className="text-muted-foreground">Listing number</dt>
          <dd className="numeric text-right font-medium">{listing.listingNumber ?? listing.id}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-2">
          <dt className="text-muted-foreground">Posted</dt>
          <dd className="text-right font-medium">{formatDate(listing.createdAt)}</dd>
        </div>
        {listing.expiresAt && (
          <div className="flex items-center justify-between gap-4 py-2">
            <dt className="text-muted-foreground">Expires</dt>
            <dd className="text-right font-medium">{formatDate(listing.expiresAt)}</dd>
          </div>
        )}
        <div className="flex items-center justify-between gap-4 py-2">
          <dt className="text-muted-foreground">Days online</dt>
          <dd className="numeric text-right font-medium">{daysOnline}</dd>
        </div>
        {daysLeft != null && (
          <div className="flex items-center justify-between gap-4 py-2">
            <dt className="text-muted-foreground">Days left</dt>
            <dd className="numeric text-right font-medium">{Math.max(0, daysLeft)}</dd>
          </div>
        )}
        <div className="flex items-center justify-between gap-4 py-2">
          <dt className="text-muted-foreground">Page views</dt>
          <dd className="numeric text-right font-medium">{stats ? stats.views : "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-2">
          <dt className="text-muted-foreground">Favorited</dt>
          <dd className="numeric text-right font-medium">{stats ? stats.favorites : "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-2 last:pb-0">
          <dt className="text-muted-foreground">Status</dt>
          {listing.ended ? (
            <dd className="text-right font-medium text-muted-foreground">
              {listing.ended.reason === "sold" ? "Sold" : "Expired"}
            </dd>
          ) : (
            <dd className="inline-flex items-center gap-1.5 text-right font-medium text-primary">
              <CheckCircle size={13} weight="fill" /> Active
            </dd>
          )}
        </div>
      </dl>
    </section>
  );
}

function TrustSafetyCard({ listing }: { listing: ClassifiedDetail }) {
  const isVehicle = Boolean(listing.vehicle);
  return (
    <section className="soft-card px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14px] font-bold">Safe. Simple. Trusted.</h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
          <ShieldCheck size={13} weight="fill" /> Bluebird Marketplace Safety
        </span>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
        Bluebird Marketplace reviews listings for marketplace policy. Always inspect the item,
        confirm the details, and agree on the final price before exchanging money.
      </p>
      <FlagListingDialog listingId={listing.id} isMock={listing.isMock === true} />
      {listing.seller?.payoutVerified && (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <CheckCircle size={13} weight="fill" className="text-primary" /> Payout identity verified
          through Bluebird’s payment provider. This does not verify the listing, item condition,
          ownership, or transaction.
        </p>
      )}
      {isVehicle && (
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Vehicle buyers should also verify title, mileage, condition, and ownership paperwork.
        </p>
      )}
    </section>
  );
}

const listingReportReasons = [
  "Scam or fraud",
  "Prohibited item",
  "Misleading information",
  "Unsafe or threatening",
  "Other",
] as const;

function FlagListingDialog({ listingId, isMock = false }: { listingId: string; isMock?: boolean }) {
  const { isSignedIn } = useAuth();
  const report = useServerFn(reportClassifiedListing);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [submitted, setSubmitted] = useState<"new" | "duplicate" | null>(null);
  const reportMutation = useMutation({
    mutationFn: () => report({ data: { listingId, reason, details } }),
    onSuccess: (result) => {
      setSubmitted(result.alreadyReported ? "duplicate" : "new");
      setReason("");
      setDetails("");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not submit the report."),
  });

  if (isMock) {
    return (
      <p className="mt-4 rounded-xl border border-primary/20 bg-primary/5 px-3 py-3 text-[11px] leading-relaxed text-muted-foreground">
        Reporting is available on published seller listings. This preview does not create a
        moderation record.
      </p>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSubmitted(null);
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="mt-4 flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-primary/40 text-[12px] font-semibold text-primary hover:bg-primary/5"
        >
          <Flag size={14} /> Flag this listing
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Flag this listing</DialogTitle>
          <DialogDescription>
            Tell us what looks wrong. Reports help Bluebird review unsafe, misleading, or prohibited
            listings.
          </DialogDescription>
        </DialogHeader>
        {submitted ? (
          <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-[12px] leading-relaxed">
            <p className="font-semibold text-primary">
              {submitted === "duplicate" ? "This listing is already reported." : "Report received."}
            </p>
            <p className="text-muted-foreground">
              {submitted === "duplicate"
                ? "Your existing report is already in the Bluebird moderation queue. We will not create a duplicate report."
                : "Your report is pending Bluebird moderation. We will review the listing and update the queue without changing your account state."}
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-9 rounded-xl bg-primary px-3 text-[12px] font-semibold text-primary-foreground"
            >
              Done
            </button>
          </div>
        ) : isSignedIn ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              reportMutation.mutate();
            }}
          >
            <label className="block text-[12px] font-medium">
              Reason
              <select
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-[12px]"
              >
                <option value="">Choose a reason</option>
                {listingReportReasons.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[12px] font-medium">
              Details <span className="font-normal text-muted-foreground">(optional)</span>
              <textarea
                value={details}
                onChange={(event) => setDetails(event.target.value.slice(0, 500))}
                rows={4}
                maxLength={500}
                className="mt-1 w-full resize-y rounded-xl border border-input bg-background px-3 py-2.5 text-[12px] leading-relaxed"
                placeholder="What should our moderation team know?"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-10 rounded-xl border border-input px-4 text-[12px] font-semibold hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={reportMutation.isPending}
                className="h-10 rounded-xl bg-primary px-4 text-[12px] font-semibold text-primary-foreground disabled:opacity-60"
              >
                {reportMutation.isPending ? "Sending…" : "Submit report"}
              </button>
            </div>
          </form>
        ) : (
          <div className="rounded-xl border border-border bg-secondary/40 p-4 text-[12px] leading-relaxed text-muted-foreground">
            Sign in to report a listing. This helps us prevent duplicate or anonymous abuse reports.
            <Link
              to={brand.urls.auth}
              className="mt-3 inline-flex h-9 items-center rounded-xl bg-primary px-3 font-semibold text-primary-foreground"
            >
              Sign in
            </Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ListingDetail() {
  const listingId = listingIdFromParam(Route.useParams().listingId);
  const { data: listing } = useSuspenseQuery(listingQuery(listingId));
  // One view per listing page load, tagged with where the visit came from.
  // The ref keeps React's development double-run of effects from counting twice.
  const trackedListing = useRef<string | null>(null);
  useEffect(() => {
    if (!listing || trackedListing.current === listing.id) return;
    trackedListing.current = listing.id;
    void trackEvent(
      "listing_viewed",
      {
        listing_id: listing.id,
        category: listing.categorySlug ?? null,
        ended: Boolean(listing.ended),
      },
      { isDemo: listing.isMock === true },
    );
  }, [listing?.id]);
  // Related suggestions must not suspend the primary listing during hydration.
  const relatedQuery = useQuery(
    queryOptions({
      staleTime: PUBLIC_PAGE_STALE_MS,
      queryKey: [
        "classified-related",
        listingId,
        listing?.categorySlug,
        listing?.seller?.slug,
        listing?.region,
      ],
      queryFn: () =>
        getRelatedClassifieds({
          data: {
            excludeId: listingId,
            ...(listing?.categorySlug ? { category: listing.categorySlug } : {}),
            ...(listing?.seller?.slug ? { sellerSlug: listing.seller.slug } : {}),
            ...(listing?.region ? { region: listing.region } : {}),
            ...(listing?.state ? { state: listing.state } : {}),
          },
        }),
    }),
  );
  return (
    <>
      {listing?.ended ? <EndedListingBanner listing={listing} /> : null}
      <ListingDetailContent />
      {listing ? (
        <RelatedRails
          listing={listing}
          fromSeller={relatedQuery.data?.fromSeller ?? []}
          similar={relatedQuery.data?.similar ?? []}
        />
      ) : null}
      {listing ? <MobileContactBar listing={listing} /> : null}
    </>
  );
}

function EndedListingBanner({ listing }: { listing: ClassifiedDetail }) {
  const sold = listing.ended?.reason === "sold";
  return (
    <div className="mx-auto max-w-[1360px] px-4 pt-6 sm:px-7 lg:px-10">
      <div
        role="status"
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-secondary px-5 py-4"
      >
        <div>
          <p className="text-[15px] font-bold">
            {sold ? "This listing has sold" : "This listing has expired"}
          </p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            It's no longer available, but there are similar {similarNoun(listing)} nearby.
          </p>
        </div>
        <a
          href={nearbyPagePath(listing.categorySlug, listing.city)}
          className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-[13px] font-semibold text-primary-foreground"
        >
          See similar {similarNoun(listing)}
        </a>
      </div>
    </div>
  );
}

function similarNoun(listing: ClassifiedDetail) {
  if (listing.vehicle) return "vehicles";
  if (listing.job) return "jobs";
  if (listing.home) return "homes";
  if (listing.service) return "services";
  return "items";
}

// Two rails under every listing type, so a shopper who isn't sold on this
// item has an obvious next step instead of a dead end.
function RelatedRails({
  listing,
  fromSeller,
  similar,
}: {
  listing: ClassifiedDetail;
  fromSeller: ClassifiedCard[];
  similar: ClassifiedCard[];
}) {
  if (!fromSeller.length && !similar.length) return null;
  const sellerName = listing.seller?.displayName;
  const rail = (title: string, subtitle: string, items: ClassifiedCard[], href: ReactNode) => (
    <section className="border-t border-border/70 pt-9">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[23px] font-bold tracking-tight">{title}</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>
        </div>
        {href}
      </div>
      <div className="no-scrollbar mt-5 flex snap-x gap-4 overflow-x-auto pb-2">
        {items.map((related) => (
          <div key={related.id} className="w-[220px] shrink-0 snap-start sm:w-[260px]">
            <ListingCard listing={related} />
          </div>
        ))}
      </div>
    </section>
  );
  const seeAll =
    "inline-flex min-h-11 items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline";
  return (
    <div className="mx-auto max-w-[1360px] space-y-10 px-4 pb-14 sm:px-7 lg:px-10">
      {fromSeller.length > 0 && listing.seller
        ? rail(
            `More from ${sellerName ?? "this seller"}`,
            "Other listings from the same seller",
            fromSeller,
            <Link to="/sellers/$slug" params={{ slug: listing.seller.slug }} className={seeAll}>
              View all <CaretRight size={15} />
            </Link>,
          )
        : null}
      {similar.length > 0
        ? rail(
            `Similar ${similarNoun(listing)} near you`,
            `More ${listing.categoryName ?? "listings"} around ${listing.region || listing.state}`,
            similar,
            <Link
              to="/browse"
              search={{
                ...(listing.categorySlug ? { category: listing.categorySlug } : {}),
                ...(listing.region ? { region: listing.region } : { state: listing.state }),
              }}
              className={seeAll}
            >
              View all <CaretRight size={15} />
            </Link>,
          )
        : null}
    </div>
  );
}

function ListingDetailContent() {
  const listingId = listingIdFromParam(Route.useParams().listingId);
  const { data: listing } = useSuspenseQuery(listingQuery(listingId));
  const [activeTab, setActiveTab] = useState<"description" | "specifications" | "location">(
    "description",
  );
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  if (!listing) return <ListingMissing />;

  const vehicle = listing.vehicle;
  const marketCheck = listing.externalVehicle;
  const isVehicle = Boolean(vehicle);
  // Cars and trucks link to their make and model page.
  const pageMake = listing.categorySlug === "cars-trucks" ? canonicalMake(vehicle?.make) : null;
  const pageModel = pageMake ? canonicalModel(pageMake, vehicle?.model) : null;
  const modelPage = pageMake
    ? {
        path: vehiclePagePath(pageMake, pageModel),
        label: pageModel ? `${pageMake} ${pageModel}` : pageMake,
      }
    : null;
  // "Not applicable" (animals, homes, jobs, services) isn't worth a line.
  const condition =
    listing.condition === "not_applicable"
      ? ""
      : (conditionLabels[listing.condition] ?? listing.condition);
  const specRows: [string, string][] = vehicle
    ? ([
        ["Body style", vehicle.bodyStyle],
        ["Transmission", vehicle.transmission],
        ["Drivetrain", vehicle.drivetrain],
        ["Fuel", vehicle.fuelType],
        ["Exterior", vehicle.exteriorColor],
        ["Title", vehicle.titleStatus],
        ["VIN", vehicle.vin],
        ...(marketCheck
          ? ([
              ["Seller type", marketCheck.sellerType],
              ["Inventory", marketCheck.inventoryType],
              ["Certified", marketCheck.certified ? "Yes" : null],
              ["Status", marketCheck.vehicleStatus ?? marketCheck.availabilityStatus],
            ] as [string, string | null][])
          : []),
        ["Condition", condition],
        ["Fulfillment", formatFulfillmentLabel(listing.fulfillmentMode, true)],
      ].filter(([, value]) => Boolean(value)) as [string, string][])
    : ([
        ["Condition", condition],
        ["Fulfillment", formatFulfillmentLabel(listing.fulfillmentMode)],
      ].filter(([, value]) => Boolean(value)) as [string, string][]);

  const title = vehicle ? vehicleHeadline(vehicle) || listing.title : listing.title;
  const description = listing.description?.trim() ?? "";
  const locationQuery = encodeURIComponent(`${listing.city}, ${listing.state}`);
  const handleShare = async () => {
    const shareUrl = `${window.location.origin}${listingPath(listing)}`;

    try {
      if (typeof navigator.share === "function") {
        toast.info("Opening share options…");
        const shareAttempt = navigator
          .share({
            title,
            text: `Check out ${title} on ${brand.name}`,
            url: shareUrl,
          })
          .then(() => "shared" as const)
          .catch((error: unknown) => {
            if (error instanceof DOMException && error.name === "AbortError")
              return "aborted" as const;
            return "fallback" as const;
          });
        const shareResult = await Promise.race([
          shareAttempt,
          new Promise<"fallback">((resolve) => window.setTimeout(() => resolve("fallback"), 1200)),
        ]);
        if (shareResult === "shared") {
          toast.success("Share sheet opened.");
          return;
        }
        if (shareResult === "aborted") {
          toast.info("Share canceled.");
          return;
        }
      }

      if (await copyListingUrl(shareUrl)) {
        toast.success("Listing link copied.");
        return;
      }
      toast.error("Sharing is not available in this browser.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("We could not share this listing.");
    }
  };

  if (!isVehicle) {
    if (listing.categorySlug === "other-real-estate") {
      return (
        <HomeListingDetail
          listing={listing}
          title={title}
          description={description}
          locationQuery={locationQuery}
          handleShare={handleShare}
        />
      );
    }
    if (listing.categorySlug === "jobs") {
      return (
        <JobListingDetail
          listing={listing}
          title={title}
          locationQuery={locationQuery}
          handleShare={handleShare}
        />
      );
    }
    if (listing.categorySlug === "services") {
      return (
        <ServiceListingDetail
          listing={listing}
          title={title}
          locationQuery={locationQuery}
          handleShare={handleShare}
        />
      );
    }
    return (
      <GeneralListingDetail
        listing={listing}
        title={title}
        condition={condition}
        itemDetails={listing.itemDetails ?? {}}
        description={description}
        locationQuery={locationQuery}
        handleShare={handleShare}
      />
    );
  }

  return (
    <main className="mx-auto max-w-[1360px] px-4 py-6 sm:px-7 sm:py-8 lg:px-10">
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-1 text-[11.5px] text-muted-foreground"
      >
        <Link to="/browse" search={{}} className="hover:text-foreground">
          All listings
        </Link>
        <CaretRight size={13} />
        {listing.categorySlug && (
          <>
            <Link
              to="/browse"
              search={{ category: listing.categorySlug }}
              className="hover:text-foreground"
            >
              {listing.categoryName}
            </Link>
            <CaretRight size={13} />
          </>
        )}
        {modelPage ? (
          <>
            <a href={modelPage.path} className="hover:text-foreground">
              {modelPage.label}
            </a>
            <CaretRight size={13} />
          </>
        ) : null}
        <span className="text-foreground">{placeLabel(listing.city, listing.state)}</span>
      </nav>

      {/* Photo first on phones; on desktop the grid places the header across
          the top and the photo beside the sidebar, exactly as before. */}
      <div className="mt-5 grid gap-6 lg:mt-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,370px)] lg:grid-rows-[auto_auto_1fr] lg:items-start lg:gap-7">
        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <Gallery listing={listing} />
        </div>

        <header className="border-b border-border/70 pb-5 lg:col-span-2 lg:row-start-1">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[28px] font-bold leading-tight tracking-tight sm:text-[38px]">
                {title}
              </h1>
              {vehicle &&
                !listing.externalVehicle &&
                !listing.title.toLowerCase().includes(title.toLowerCase()) &&
                !title.toLowerCase().includes(listing.title.toLowerCase()) && (
                  <p className="mt-1 text-[14px] text-muted-foreground">{listing.title}</p>
                )}
            </div>
            <div className="flex items-center gap-2">
              <ListingStatsInline listing={listing} />
              {listing.externalHome ? (
                <PartnerHomeHeartButton
                  listingId={listing.id}
                  title={title}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                />
              ) : listing.externalVehicle ? (
                <PartnerVehicleHeartButton
                  listingId={listing.id}
                  title={title}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                />
              ) : (
                <WatchHeartButton
                  productId={listing.productId}
                  productSlug={listing.productSlug}
                  productName={title}
                  isDemo={listing.isMock === true}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                />
              )}
              <button
                type="button"
                aria-label="Share listing"
                onClick={() => void handleShare()}
                className="grid h-11 w-11 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground"
              >
                <ShareNetwork size={18} />
              </button>
              <button
                type="button"
                aria-label="Print listing"
                onClick={() => window.print()}
                className="hidden h-11 w-11 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground sm:grid"
              >
                <Printer size={18} />
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-muted-foreground">
            <span className="flex items-center gap-1.5 text-primary">
              <MapPin size={15} weight="fill" /> {placeLabel(listing.city, listing.state)}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock size={15} /> Posted {postedAge(listing.createdAt).toLowerCase()}
            </span>
            {vehicle?.mileage != null && (
              <span className="flex items-center gap-1.5">
                <Gauge size={15} /> {formatMileage(vehicle.mileage)}
              </span>
            )}
          </div>
          <p className="numeric mt-4 text-[30px] font-bold leading-none text-primary sm:text-[34px]">
            {formatClassifiedPrice(listing.priceCents, { wholeDollars: true })}
          </p>
        </header>

        <div className="min-w-0 space-y-7 lg:col-start-1 lg:row-start-3">
          <section
            className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
            aria-label="Key vehicle facts"
          >
            {vehicle?.year != null && (
              <QuickFact
                label="Year"
                value={String(vehicle.year)}
                icon={<span className="text-primary">#</span>}
              />
            )}
            {vehicle?.mileage != null && (
              <QuickFact
                label="Mileage"
                value={formatMileage(vehicle.mileage) ?? "Not listed"}
                icon={<Gauge size={16} className="text-primary" />}
              />
            )}
            {vehicle?.transmission && (
              <QuickFact
                label="Transmission"
                value={vehicle.transmission}
                icon={<GearSix size={16} className="text-primary" />}
              />
            )}
            {condition && (
              <QuickFact
                label="Condition"
                value={condition}
                icon={<ShieldCheck size={16} className="text-primary" />}
              />
            )}
          </section>

          <section className="soft-card overflow-hidden">
            <div className={listingTabListClass} role="tablist" aria-label="Listing information">
              {(["description", "specifications", "location"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  className={listingTabClass(activeTab === tab)}
                >
                  {tab === "location" ? "Location" : tab}
                </button>
              ))}
            </div>
            <div className="p-5 sm:p-7">
              {activeTab === "description" && (
                <div>
                  <div
                    className={`relative overflow-hidden ${!descriptionExpanded && description.length > 720 ? "max-h-[300px]" : ""}`}
                  >
                    <h2 className="text-[18px] font-bold">Description</h2>
                    {description ? (
                      <p className="mt-3 whitespace-pre-line text-[14px] leading-7 text-muted-foreground">
                        {description}
                      </p>
                    ) : (
                      <p className="mt-3 text-[14px] text-muted-foreground">
                        {listing.externalVehicle
                          ? "No description was included with this listing."
                          : "The seller has not added a description yet."}
                      </p>
                    )}
                    {!descriptionExpanded && description.length > 720 && (
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-card to-transparent" />
                    )}
                  </div>
                  {description.length > 720 && (
                    <button
                      type="button"
                      onClick={() => setDescriptionExpanded((expanded) => !expanded)}
                      className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline"
                    >
                      {descriptionExpanded ? "Show less" : "See more"}{" "}
                      <CaretDown size={15} className={descriptionExpanded ? "rotate-180" : ""} />
                    </button>
                  )}
                </div>
              )}
              {activeTab === "specifications" && (
                <div>
                  <h2 className="text-[18px] font-bold">Specifications</h2>
                  <div className="mt-4">
                    <SpecGrid rows={specRows} />
                  </div>
                  <MarketCheckDetailSections listing={listing} />
                </div>
              )}
              {activeTab === "location" && (
                <div>
                  <h2 className="text-[18px] font-bold">Listing location</h2>
                  <div className="mt-4 overflow-hidden rounded-2xl border border-border/70 bg-secondary/45">
                    <ListingMapEmbed locationQuery={locationQuery} title="Listing location map" />
                    <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <MapTrifold
                          size={24}
                          weight="duotone"
                          className="mt-0.5 shrink-0 text-primary"
                        />
                        <div>
                          <p className="font-semibold">{placeLabel(listing.city, listing.state)}</p>
                          <p className="mt-1 text-[12px] text-muted-foreground">
                            Approximate public location. Confirm the exact meeting location before
                            pickup.
                          </p>
                        </div>
                      </div>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${locationQuery}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-primary px-4 text-[12px] font-semibold text-primary-foreground hover:opacity-90"
                      >
                        Open map
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {listing.sellerNote && (
            <section className="rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
                Note from the seller
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed">{listing.sellerNote}</p>
            </section>
          )}
        </div>

        <aside className="min-w-0 space-y-5 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-2 lg:row-span-2">
          {listing.externalVehicle ? (
            <MarketCheckContactCard listing={listing} />
          ) : (
            <SellerCard listing={listing} />
          )}
          <ListingActions listing={listing} showPriceHeader={false} />
          <VehicleHistoryCard vehicle={vehicle} />
          <PageStatsCard listing={listing} />
          <section className="soft-card px-5 py-5">
            <h2 className="text-[14px] font-bold">Before you meet</h2>
            <ul className="mt-3 space-y-3 text-[12px] leading-relaxed text-muted-foreground">
              <li className="flex items-start gap-2">
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary" /> Meet in a public
                place and verify the vehicle and paperwork before paying.
              </li>
              <li className="flex items-start gap-2">
                <Gauge size={16} className="mt-0.5 shrink-0 text-primary" /> Confirm mileage, title
                status, condition, and any fees with the seller.
              </li>
              <li className="flex items-start gap-2">
                <Flag size={16} className="mt-0.5 shrink-0 text-primary" /> Report anything
                misleading or unsafe through Bluebird.
              </li>
            </ul>
          </section>
          <TrustSafetyCard listing={listing} />
        </aside>
        {/* Last on phones (below the contact card); under the details on desktop. */}
        <div className="min-w-0 lg:col-start-1 lg:row-start-4">
          <MarketCheckSourceCredit listing={listing} />
        </div>
      </div>
    </main>
  );
}

function homeRentalDetails(listing: ClassifiedDetail, description: string) {
  const home = listing.home;
  const source = `${listing.title} ${description}`;
  const bedrooms = source.match(/\b(\d+(?:\.\d+)?)\s*[- ]?(?:bed|bedroom)s?\b/i)?.[1];
  const bathrooms = source.match(/\b(\d+(?:\.\d+)?)\s*[- ]?(?:bath|bathroom)s?\b/i)?.[1];
  const squareFeet = source.match(/\b([\d,]+)\s*(?:sq\.?\s*ft|square feet)\b/i)?.[1];
  const availability =
    home?.available ??
    (/available\s+(?:now|immediately)/i.test(source) ? "Available now" : "Confirm availability");
  const pets =
    home?.pets ??
    (/no pets|pets?\s+not allowed/i.test(source)
      ? "Not allowed"
      : /pets?\s+(?:allowed|welcome)|pet friendly/i.test(source)
        ? "Allowed"
        : "Ask seller");
  const smoking =
    home?.smoking ??
    (/no smoking|smoking\s+(?:not allowed|prohibited)/i.test(source)
      ? "Not allowed"
      : /smoking\s+allowed/i.test(source)
        ? "Allowed"
        : "Ask seller");
  const parsedLeaseLength = source.match(
    /\b(month-to-month|\d+\s*(?:\/|to|-|–)\s*\d+\s*-?\s*months?|\d+\s*-?\s*months?)\b/i,
  )?.[1];
  const utilitiesText = source.match(
    /(?:utilities included with rent|utilities included|utilities)\s*:\s*([^\n.]+)/i,
  )?.[1];
  const parsedUtilities = (() => {
    const value = utilitiesText?.trim();
    if (!value) return [];
    if (/tenant|resident\s+(?:is\s+)?responsible|pays?\s+all/i.test(value)) {
      return [{ label: "All utilities", paidBy: "Tenant" }];
    }
    if (/none|not included/i.test(value)) {
      return [{ label: "Utilities", paidBy: "Tenant" }];
    }
    return [{ label: "Utilities", paidBy: value }];
  })();
  const securityDeposit = source.match(/security deposit\s*:\s*([^\n.]+)/i)?.[1]?.trim();
  const petDeposit = source.match(/(\$[\d,]+)\s+(?:additional\s+)?security deposit per pet/i)?.[1];
  const monthlyPetFee = source.match(/(\$[\d,]+)\s+monthly pet (?:rent|fee)/i)?.[1];
  const isRental =
    home?.mode === "rent" ||
    (home?.mode !== "buy" &&
      home?.mode !== "build" &&
      (listing.priceCents < 1_000_000 || /rent|rental|lease|per month|\/\s*mo/i.test(source)));
  const missing = listing.externalHome ? "Not provided by listing source" : "Ask seller";

  return {
    bedrooms:
      home?.bedrooms != null
        ? `${home.bedrooms} ${home.bedrooms === 1 ? "bed" : "beds"}`
        : bedrooms
          ? `${bedrooms} ${Number(bedrooms) === 1 ? "bed" : "beds"}`
          : missing,
    bathrooms:
      home?.bathrooms != null
        ? `${home.bathrooms} ${home.bathrooms === 1 ? "bath" : "baths"}`
        : bathrooms
          ? `${bathrooms} ${Number(bathrooms) === 1 ? "bath" : "baths"}`
          : missing,
    squareFeet:
      home?.squareFeet != null
        ? `${home.squareFeet.toLocaleString()} sq ft`
        : squareFeet
          ? `${squareFeet} sq ft`
          : missing,
    availability:
      listing.externalHome && home?.mode === "rent"
        ? "For rent"
        : listing.externalHome
          ? "For sale"
          : availability,
    pets,
    smoking,
    leaseLength: home?.leaseLength ?? parsedLeaseLength ?? "Confirm with seller",
    securityDeposit: securityDeposit ?? "Confirm with seller",
    petDeposit: petDeposit ?? null,
    monthlyPetFee: monthlyPetFee ?? null,
    propertyType: home?.propertyType ?? missing,
    yearBuilt: home?.yearBuilt != null ? String(home.yearBuilt) : missing,
    sellerType: home?.sellerType ?? listing.seller?.sellerType ?? missing,
    utilities: home?.utilities ?? [],
    utilitiesText: utilitiesText ?? null,
    amenities: home?.amenities ?? [],
    openHouse: home?.openHouse ?? null,
    community: home?.community ?? null,
    schoolDistrict: home?.schoolDistrict ?? missing,
    acreage: home?.acreage ?? missing,
    heating: home?.heating ?? missing,
    cooling: home?.cooling ?? missing,
    garageParking: home?.garageParking ?? missing,
    yard: home?.yard ?? missing,
    appliancesIncluded: home?.appliancesIncluded ?? missing,
    basementType: home?.basementType ?? missing,
    floorCoverings: home?.floorCoverings ?? missing,
    exteriorMaterial: home?.exteriorMaterial ?? missing,
    specialFeatures: home?.specialFeatures ?? missing,
    hoaFees: home?.hoaFees ?? "N/A",
    priceHistory: home?.priceHistory ?? [],
    taxHistory: home?.taxHistory ?? [],
    zestimate: home?.zestimate ?? null,
    rentZestimate: home?.rentZestimate ?? null,
    isRental,
  };
}

function HomeSafetyPanel({
  isRental,
  listingId,
  isMock = false,
}: {
  isRental: boolean;
  listingId: string;
  isMock?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-brand-warm/50 bg-brand-warm/10 px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[18px] font-bold">Important safety tip</h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
          <ShieldCheck size={13} weight="fill" /> Bluebird Marketplace Safety
        </span>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
        {isRental
          ? "Never send a deposit before touring the home and verifying the owner or property manager. Review the lease, fees, utilities, and application process before paying."
          : "Never send money before touring the home and verifying ownership. Review disclosures, fees, inspection details, and the offer terms before making a payment."}
      </p>
      <FlagListingDialog listingId={listingId} isMock={isMock} />
    </section>
  );
}

const HOME_PLACEHOLDER =
  /^(ask seller|confirm with seller|confirm availability|not provided by listing source|n\/a|none)$/i;

/** A home fact worth showing: real data, not a stand-in like "Ask seller". */
function knownHomeFact(value: string | null | undefined): value is string {
  return Boolean(value && value.trim() && !HOME_PLACEHOLDER.test(value.trim()));
}

/** Principal and interest at 20% down, 6.75%, 30-year fixed. */
function estimatedMonthlyPayment(priceCents: number) {
  const principal = (priceCents / 100) * 0.8;
  const rate = 0.0675 / 12;
  return principal <= 0 ? 0 : (principal * rate) / (1 - Math.pow(1 + rate, -360));
}

const wholeDollars = (dollars: number) =>
  formatClassifiedPrice(Math.round(dollars) * 100, { wholeDollars: true });

/**
 * Zillow-style photo collage: one large photo with up to four beside it and
 * a "See all photos" button. Phones keep the swipeable gallery.
 */
function HomePhotoCollage({ listing }: { listing: ClassifiedDetail }) {
  const images = listing.images;
  if (images.length === 0) return <Gallery listing={listing} />;
  const rest = images.slice(1);
  const side = rest.length >= 4 ? rest.slice(0, 4) : rest.length >= 2 ? rest.slice(0, 2) : rest;
  const grid =
    side.length === 4
      ? "grid-cols-4 grid-rows-2"
      : side.length === 2
        ? "grid-cols-3 grid-rows-2"
        : side.length === 1
          ? "grid-cols-3 grid-rows-1"
          : "grid-cols-1";
  return (
    <>
      <div className="lg:hidden">
        <Gallery listing={listing} />
      </div>
      <Dialog>
        <div
          className={`relative hidden h-[460px] gap-2 overflow-hidden rounded-[28px] lg:grid ${grid}`}
        >
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label="Show all photos"
              className={`group overflow-hidden bg-secondary ${side.length ? "col-span-2 row-span-2" : ""}`}
            >
              <img
                src={images[0]!.url}
                alt={images[0]!.alt}
                fetchPriority="high"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              />
            </button>
          </DialogTrigger>
          {side.map((image) => (
            <DialogTrigger asChild key={image.url}>
              <button
                type="button"
                aria-label="Show all photos"
                className="group overflow-hidden bg-secondary"
              >
                <img
                  src={image.url}
                  alt={image.alt}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
              </button>
            </DialogTrigger>
          ))}
          {images.length > 1 ? (
            <DialogTrigger asChild>
              <button
                type="button"
                className="absolute bottom-4 right-4 inline-flex h-10 items-center gap-2 rounded-full bg-card/95 px-4 text-[12.5px] font-semibold text-foreground shadow-md transition hover:bg-card"
              >
                <Images size={16} aria-hidden="true" /> See all {images.length} photos
              </button>
            </DialogTrigger>
          ) : null}
        </div>
        <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto rounded-[28px] p-5 sm:p-7">
          <DialogHeader>
            <DialogTitle>Home photos</DialogTitle>
            <DialogDescription>{listing.title}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {images.map((image, index) => (
              <img
                key={image.url}
                src={image.url}
                alt={image.alt}
                loading={index < 4 ? "eager" : "lazy"}
                className={`w-full rounded-2xl object-cover ${index % 3 === 0 ? "sm:col-span-2" : ""}`}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function HomeFactRows({ rows }: { rows: [string, string | null | undefined][] }) {
  const shown = rows.filter((row): row is [string, string] => knownHomeFact(row[1]));
  if (!shown.length) return null;
  return (
    <dl className="mt-3 divide-y divide-border/70 text-[13px]">
      {shown.map(([label, value]) => (
        <div key={label} className="flex items-start justify-between gap-4 py-2.5">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="max-w-[65%] text-right font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Zillow-style "Facts & features", grouped, showing only what's known. */
function HomeFactsAndFeatures({
  listing,
  details,
}: {
  listing: ClassifiedDetail;
  details: ReturnType<typeof homeRentalDetails>;
}) {
  const groups: [string, [string, string | null | undefined][]][] = [
    [
      "Interior",
      [
        ["Bedrooms", details.bedrooms],
        ["Bathrooms", details.bathrooms],
        ["Living area", details.squareFeet],
        ["Heating", details.heating],
        ["Cooling", details.cooling],
        ["Appliances", details.appliancesIncluded],
        ["Flooring", details.floorCoverings],
        ["Basement", details.basementType],
      ],
    ],
    [
      "Property",
      [
        ["Lot size", details.acreage],
        ["Parking", details.garageParking],
        ["Yard", details.yard],
        ["Exterior", details.exteriorMaterial],
        ["Special features", details.specialFeatures],
      ],
    ],
    [
      "Construction",
      [
        ["Home type", details.propertyType],
        ["Year built", details.yearBuilt],
      ],
    ],
    [
      "Community & HOA",
      [
        ["Community", details.community?.name],
        ["HOA fees", details.hoaFees],
        ["School district", details.schoolDistrict],
        ...(!listing.externalHome
          ? ([["Listed by", details.sellerType]] as [string, string][])
          : []),
      ],
    ],
  ];
  const shown = groups.filter(([, rows]) => rows.some(([, value]) => knownHomeFact(value)));
  return (
    <div>
      <h2 className="text-[21px] font-bold">Facts &amp; features</h2>
      {shown.length ? (
        <div className="mt-2 grid gap-x-10 gap-y-6 md:grid-cols-2">
          {shown.map(([title, rows]) => (
            <section key={title}>
              <h3 className="mt-4 text-[15px] font-bold">{title}</h3>
              <HomeFactRows rows={rows} />
            </section>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-[13px] text-muted-foreground">
          No additional facts were included with this listing.
        </p>
      )}
      {details.amenities.length > 0 ? (
        <section className="mt-8 border-t border-border/70 pt-6">
          <h3 className="text-[15px] font-bold">Features &amp; amenities</h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {details.amenities.map((amenity) => (
              <li
                key={amenity}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-secondary/40 px-3 py-1.5 text-[12.5px]"
              >
                <CheckCircle size={14} weight="fill" className="text-primary" /> {amenity}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {!listing.externalHome ? (
        <p className="mt-6 text-[12px] text-muted-foreground">
          Don&apos;t see something? Ask the seller before you tour or make an offer.
        </p>
      ) : null}
    </div>
  );
}

function HomeHistory({ details }: { details: ReturnType<typeof homeRentalDetails> }) {
  return (
    <div className="space-y-9">
      {details.priceHistory.length > 0 ? (
        <section>
          <h2 className="text-[21px] font-bold">Price history</h2>
          <table className="mt-4 w-full text-left text-[13px]">
            <thead className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
              <tr className="border-b border-border/70">
                <th className="py-2 font-semibold">Date</th>
                <th className="py-2 font-semibold">Event</th>
                <th className="py-2 text-right font-semibold">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {details.priceHistory.map((item, index) => (
                <tr key={`${item.label}-${index}`}>
                  <td className="py-2.5 text-muted-foreground">{item.date ?? "—"}</td>
                  <td className="py-2.5">{item.label}</td>
                  <td className="numeric py-2.5 text-right font-semibold">
                    {wholeDollars(item.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      {details.taxHistory.length > 0 ? (
        <section>
          <h2 className="text-[21px] font-bold">Public tax history</h2>
          <table className="mt-4 w-full text-left text-[13px]">
            <thead className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
              <tr className="border-b border-border/70">
                <th className="py-2 font-semibold">Year</th>
                <th className="py-2 text-right font-semibold">Property taxes</th>
                <th className="py-2 text-right font-semibold">Tax assessment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {details.taxHistory.map((item, index) => (
                <tr key={`${item.date ?? "tax"}-${index}`}>
                  <td className="py-2.5 text-muted-foreground">{item.date ?? "—"}</td>
                  <td className="numeric py-2.5 text-right font-semibold">
                    {item.amount != null ? wholeDollars(item.amount) : "—"}
                  </td>
                  <td className="numeric py-2.5 text-right">
                    {item.value != null ? wholeDollars(item.value) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      {details.zestimate != null || details.rentZestimate != null ? (
        <section>
          <h2 className="text-[21px] font-bold">Market estimates</h2>
          <HomeFactRows
            rows={[
              [
                "Estimated value",
                details.zestimate != null ? wholeDollars(details.zestimate) : null,
              ],
              [
                "Estimated rent",
                details.rentZestimate != null ? `${wholeDollars(details.rentZestimate)}/mo` : null,
              ],
            ]}
          />
        </section>
      ) : null}
    </div>
  );
}

/**
 * KSL-style tabs holding Zillow's sections: the overview (description and
 * rental terms), facts & features, price and tax history, and the map.
 */
function HomeDetailTabs({
  listing,
  description,
  locationQuery,
  details,
}: {
  listing: ClassifiedDetail;
  description: string;
  locationQuery: string;
  details: ReturnType<typeof homeRentalDetails>;
}) {
  const hasHistory =
    details.priceHistory.length > 0 ||
    details.taxHistory.length > 0 ||
    details.zestimate != null ||
    details.rentZestimate != null;
  const tabs = [
    ["overview", "Overview"],
    ["facts", "Facts & features"],
    ...(hasHistory ? [["history", "Price & tax history"]] : []),
    ["map", "Map"],
  ] as const;
  const [activeTab, setActiveTab] = useState<string>("overview");
  const utilities =
    details.utilities.length > 0
      ? details.utilities.map(({ label, paidBy }) => `${label}: ${paidBy}`).join(" · ")
      : details.utilitiesText;
  const rentalTerms: [string, string | null | undefined][] = [
    ["Available", details.availability],
    ["Lease length", details.leaseLength],
    ["Security deposit", details.securityDeposit],
    ["Pet deposit", details.petDeposit],
    ["Monthly pet fee", details.monthlyPetFee],
    ["Pets", details.pets],
    ["Smoking", details.smoking],
    ["Utilities", utilities],
  ];

  return (
    <section className="soft-card overflow-hidden">
      <div className={listingTabListClass} role="tablist" aria-label="Home information">
        {tabs.map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={listingTabClass(activeTab === tab)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="p-5 sm:p-7">
        {activeTab === "overview" ? (
          <div>
            <h2 className="text-[21px] font-bold">
              {details.isRental ? "About this rental" : "About this home"}
            </h2>
            <p className="mt-4 whitespace-pre-line text-[14px] leading-7 text-muted-foreground">
              {description ||
                (listing.externalHome
                  ? "No description was included with this listing."
                  : "The seller hasn't added a description yet.")}
            </p>
            {knownHomeFact(details.openHouse) ? (
              <p className="mt-5 rounded-xl bg-primary/5 px-4 py-3 text-[13px]">
                <span className="font-semibold">Open house:</span> {details.openHouse}
              </p>
            ) : null}
            {details.isRental ? (
              <section className="mt-8 border-t border-border/70 pt-6">
                <h3 className="text-[16px] font-bold">Rental terms</h3>
                {rentalTerms.some(([, value]) => knownHomeFact(value)) ? (
                  <HomeFactRows rows={rentalTerms} />
                ) : (
                  <p className="mt-2 text-[13px] text-muted-foreground">
                    Ask about the lease length, deposits, pets and utilities before you apply.
                  </p>
                )}
              </section>
            ) : null}
          </div>
        ) : activeTab === "facts" ? (
          <HomeFactsAndFeatures listing={listing} details={details} />
        ) : activeTab === "history" ? (
          <HomeHistory details={details} />
        ) : (
          <div>
            <h2 className="text-[21px] font-bold">Location</h2>
            <p className="mt-2 text-[13px] text-muted-foreground">
              {listing.title}, {placeLabel(listing.city, listing.state)}
              {listing.postalCode ? ` ${listing.postalCode}` : ""}
            </p>
            <div className="mt-4 overflow-hidden rounded-2xl border border-border/70">
              <ListingMapEmbed
                locationQuery={locationQuery}
                title="Home location map"
                className="h-[360px]"
              />
            </div>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${locationQuery}`}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline"
            >
              Get directions <CaretRight size={15} />
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * The contact card for a partner (feed) home: who listed it, a way to reach
 * them through the original listing, and a payment estimate for sales.
 */
function PartnerHomeContactCard({
  listing,
  isRental,
}: {
  listing: ClassifiedDetail;
  isRental: boolean;
}) {
  const listedBy = listing.externalHome?.listedBy;
  const sourceUrl = listing.externalHome?.sourceUrl;
  const payment = isRental ? 0 : estimatedMonthlyPayment(listing.priceCents);
  return (
    <section className="soft-card p-5 sm:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Listed by
      </p>
      <div className="mt-3 flex items-start gap-3">
        <EmployerTile name={listedBy?.brokerName || listedBy?.agentName || "Listing agent"} />
        <div className="min-w-0 text-[12.5px]">
          <p className="text-[15px] font-bold">{listedBy?.agentName || "Listing agent"}</p>
          {listedBy?.brokerName ? <p className="mt-0.5">{listedBy.brokerName}</p> : null}
          {listedBy?.agentPhone || listedBy?.brokerPhone ? (
            <a
              href={`tel:${(listedBy.agentPhone || listedBy.brokerPhone)!.replace(/[^\d+]/g, "")}`}
              className="mt-1 inline-flex items-center gap-1 font-semibold text-primary hover:underline"
            >
              <Phone size={13} aria-hidden="true" /> {listedBy.agentPhone || listedBy.brokerPhone}
            </a>
          ) : (
            <p className="mt-0.5 text-muted-foreground">
              Contact details are on the original listing.
            </p>
          )}
        </div>
      </div>
      {sourceUrl ? (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-nav-accent text-[14.5px] font-semibold text-primary transition-opacity hover:opacity-90"
        >
          {isRental ? "Request a tour" : "Contact agent"}{" "}
          <ArrowSquareOut size={16} aria-hidden="true" />
        </a>
      ) : null}
      {sourceUrl ? (
        <p className="mt-2 text-center text-[11.5px] text-muted-foreground">
          Opens the original listing in a new tab.
        </p>
      ) : null}
      {payment > 0 ? (
        <div className="mt-5 rounded-2xl bg-secondary/50 px-4 py-3.5">
          <p className="text-[12px] text-muted-foreground">Estimated payment</p>
          <p className="numeric mt-0.5 text-[22px] font-bold">{wholeDollars(payment)}/mo</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Principal &amp; interest at 20% down, 6.75%, 30-year fixed. Taxes, insurance and HOA are
            extra.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function HomeListingDetail({
  listing,
  title,
  description,
  locationQuery,
  handleShare,
}: {
  listing: ClassifiedDetail;
  title: string;
  description: string;
  locationQuery: string;
  handleShare: () => Promise<void>;
}) {
  const details = homeRentalDetails(listing, description);
  const price = formatClassifiedPrice(listing.priceCents, { wholeDollars: true });
  const homeTab = details.isRental ? "rent" : "buy";
  const home = listing.home;
  const stats = [
    home?.bedrooms != null
      ? [home.bedrooms === 0 ? "Studio" : String(home.bedrooms), home.bedrooms === 0 ? "" : "beds"]
      : null,
    home?.bathrooms != null ? [String(home.bathrooms), "baths"] : null,
    home?.squareFeet != null ? [home.squareFeet.toLocaleString(), "sqft"] : null,
  ].filter((stat): stat is string[] => stat != null);
  const payment = details.isRental ? 0 : estimatedMonthlyPayment(listing.priceCents);
  const pricePerSqft =
    !details.isRental && home?.squareFeet && listing.priceCents > 0
      ? Math.round(listing.priceCents / 100 / home.squareFeet)
      : null;
  const chips: [ReactNode, string | null][] = [
    [<House key="t" size={18} />, home ? homeTypeNoun(home.propertyType) : null],
    [
      <CalendarBlank key="y" size={18} />,
      knownHomeFact(details.yearBuilt) ? `Built in ${details.yearBuilt}` : null,
    ],
    [<Ruler key="l" size={18} />, knownHomeFact(details.acreage) ? `${details.acreage} lot` : null],
    [<Tag key="p" size={18} />, pricePerSqft ? `$${pricePerSqft.toLocaleString()}/sqft` : null],
    [
      <Buildings key="h" size={18} />,
      knownHomeFact(details.hoaFees) ? `HOA ${details.hoaFees}` : null,
    ],
    [
      <Car key="g" size={18} />,
      knownHomeFact(details.garageParking) ? details.garageParking : null,
    ],
    [
      <PawPrint key="pet" size={18} />,
      details.isRental && knownHomeFact(details.pets) ? `Pets: ${details.pets}` : null,
    ],
    [
      <CalendarBlank key="a" size={18} />,
      details.isRental && knownHomeFact(details.availability) ? details.availability : null,
    ],
  ];
  const heartClass =
    "inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

  return (
    <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-7 sm:py-8 lg:px-10">
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-1 text-[11.5px] text-muted-foreground"
      >
        <Link to="/browse" search={{}} className="hover:text-foreground">
          All listings
        </Link>
        <CaretRight size={13} />
        <Link
          to="/browse"
          search={{ category: "other-real-estate", homeMode: "results", homeTab }}
          className="hover:text-foreground"
        >
          Homes
        </Link>
        <CaretRight size={13} />
        <span className="text-foreground">{placeLabel(listing.city, listing.state)}</span>
      </nav>

      <div className="mt-5">
        <HomePhotoCollage listing={listing} />
      </div>

      <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="min-w-0 space-y-7">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border/70 pb-6">
            <div className="min-w-0">
              {details.community && (
                <a
                  href="#community-homes"
                  className="mb-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary hover:underline"
                >
                  Part of the {details.community.name} community
                </a>
              )}
              <div className="flex flex-wrap items-end gap-x-7 gap-y-3">
                <p className="numeric text-[32px] font-bold leading-none sm:text-[38px]">
                  {price}
                  {details.isRental ? (
                    <span className="text-[18px] font-semibold text-muted-foreground">/mo</span>
                  ) : null}
                </p>
                {stats.length ? (
                  <dl className="flex items-end gap-5">
                    {stats.map(([value, label]) => (
                      <div key={label || value} className="flex flex-col-reverse">
                        <dt className="mt-1 text-[12px] text-muted-foreground">{label}</dt>
                        <dd className="numeric text-[22px] font-bold leading-none">{value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
              <h1 className="mt-4 text-[19px] font-semibold leading-snug sm:text-[21px]">
                {title}
              </h1>
              <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <MapPin size={15} weight="fill" className="text-primary" /> {listing.city},{" "}
                {listing.state}
                {listing.postalCode ? ` ${listing.postalCode}` : ""}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px]">
                {home ? (
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${details.isRental ? "bg-primary" : "bg-emerald-500"}`}
                    />
                    {homeStatusLabel(home)}
                  </span>
                ) : null}
                {payment > 0 ? (
                  <span className="text-muted-foreground">
                    Est.{" "}
                    <span className="font-semibold text-foreground">
                      {wholeDollars(payment)}/mo
                    </span>
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Clock size={14} /> Listed {postedAge(listing.createdAt).toLowerCase()}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ListingStatsInline listing={listing} />
              {listing.externalHome ? (
                <PartnerHomeHeartButton
                  listingId={listing.id}
                  title={title}
                  className={heartClass}
                />
              ) : (
                <WatchHeartButton
                  productId={listing.productId}
                  productSlug={listing.productSlug}
                  productName={title}
                  isDemo={listing.isMock === true}
                  className={heartClass}
                />
              )}
              <button
                type="button"
                aria-label="Share listing"
                onClick={() => void handleShare()}
                className="grid h-11 w-11 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground"
              >
                <ShareNetwork size={18} />
              </button>
              <button
                type="button"
                aria-label="Print listing"
                onClick={() => window.print()}
                className="hidden h-11 w-11 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground sm:grid"
              >
                <Printer size={18} />
              </button>
            </div>
          </header>

          {chips.some(([, label]) => label) ? (
            <ul
              className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-3"
              aria-label="Home highlights"
            >
              {chips
                .filter((chip): chip is [ReactNode, string] => Boolean(chip[1]))
                .map(([icon, label]) => (
                  <li
                    key={label}
                    className="flex min-w-0 items-center gap-2.5 rounded-xl bg-secondary/55 px-3 py-2.5 text-[12.5px] font-medium sm:gap-3 sm:px-4 sm:py-3 sm:text-[13px]"
                  >
                    <span className="text-primary">{icon}</span>
                    <span className="min-w-0 truncate">{label}</span>
                  </li>
                ))}
            </ul>
          ) : null}

          <HomeDetailTabs
            listing={listing}
            description={description}
            locationQuery={locationQuery}
            details={details}
          />
        </div>

        <aside className="min-w-0 space-y-5 lg:sticky lg:top-24">
          {listing.externalHome ? (
            <PartnerHomeContactCard listing={listing} isRental={details.isRental} />
          ) : (
            <>
              <SellerCard listing={listing} />
              <ListingActions
                listing={listing}
                showPaymentCalculator={!details.isRental}
                calculatorVariant="mortgage"
                showPriceHeader={false}
              />
            </>
          )}
          <PageStatsCard listing={listing} />
          <HomeSafetyPanel
            isRental={details.isRental}
            listingId={listing.id}
            isMock={listing.isMock === true}
          />
        </aside>
      </div>

      {!!listing.communityListings?.length && (
        <section id="community-homes" className="mt-14 scroll-mt-24 border-t border-border/70 pt-9">
          <h2 className="text-[23px] font-bold tracking-tight">More Homes in This Community</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Other listings in the {details.community?.name} community
          </p>
          <div className="no-scrollbar mt-5 flex snap-x gap-4 overflow-x-auto pb-2">
            {listing.communityListings.map((related) => (
              <div key={related.id} className="w-[245px] shrink-0 snap-start sm:w-[280px]">
                <ListingCard listing={related} />
              </div>
            ))}
          </div>
        </section>
      )}

      {!!listing.communityFloorplans?.length && (
        <section className="mt-14 border-t border-border/70 pt-9">
          <h2 className="text-[23px] font-bold tracking-tight">Floorplans in This Community</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Available plans from the builder in {details.community?.name}
          </p>
          <div className="no-scrollbar mt-5 flex snap-x gap-4 overflow-x-auto pb-2">
            {listing.communityFloorplans.map((plan) => (
              <div
                key={plan.name}
                className="w-[220px] shrink-0 snap-start overflow-hidden rounded-2xl border border-border/70 bg-card sm:w-[250px]"
              >
                <img src={plan.image} alt={plan.name} className="h-36 w-full object-cover" />
                <div className="p-3.5">
                  <p className="text-[14px] font-bold">{plan.name}</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {plan.bedrooms} beds · {plan.bathrooms} bath
                    {plan.squareFeet ? ` · ${plan.squareFeet.toLocaleString()} sq ft` : ""}
                  </p>
                  {plan.builderUrl && (
                    <a
                      href={plan.builderUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline"
                    >
                      HomeBuilder website <CaretRight size={13} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {listing.externalHome ? <ExternalHomeCredit listing={listing} /> : null}
    </main>
  );
}

function jobDetails(listing: ClassifiedDetail) {
  const job = listing.job;
  return {
    employerName: job?.employerName ?? listing.seller?.displayName ?? "the employer",
    payRange: job ? formatJobPay(job) : formatUsd(listing.priceCents),
    payType: job?.payType ?? "Ask employer",
    employmentType: job?.employmentType ?? "Ask employer",
    experienceRequired: job?.experienceRequired ?? "Ask employer",
    educationLevel: job?.educationLevel ?? "Ask employer",
    jobSummary: job?.jobSummary ?? listing.description ?? "",
    responsibilities: job?.responsibilities ?? [],
    qualifications: job?.qualifications ?? [],
  };
}

function JobListingDetail({
  listing,
  title,
  locationQuery,
  handleShare,
}: {
  listing: ClassifiedDetail;
  title: string;
  locationQuery: string;
  handleShare: () => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<"description" | "specifications" | "map">(
    "description",
  );
  const details = jobDetails(listing);

  return (
    <main className="mx-auto max-w-[1360px] px-4 py-6 sm:px-7 sm:py-8 lg:px-10">
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-1 text-[11.5px] text-muted-foreground"
      >
        <Link to="/browse" search={{}} className="hover:text-foreground">
          All listings
        </Link>
        <CaretRight size={13} />
        <Link to="/browse" search={{ category: "jobs" }} className="hover:text-foreground">
          Jobs
        </Link>
        <CaretRight size={13} />
        <span className="text-foreground">{placeLabel(listing.city, listing.state)}</span>
      </nav>

      {/* Photo first on phones; on desktop the grid places the header across
          the top and the photo beside the sidebar, exactly as before. */}
      <div className="mt-5 grid gap-6 lg:mt-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,370px)] lg:grid-rows-[auto_auto_1fr] lg:items-start lg:gap-7">
        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <Gallery listing={listing} />
        </div>

        <header className="border-b border-border/70 pb-5 lg:col-span-2 lg:row-start-1">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[28px] font-bold leading-tight tracking-tight sm:text-[38px]">
                {title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-muted-foreground">
                <span className="flex items-center gap-1.5 text-primary">
                  <MapPin size={15} weight="fill" /> {placeLabel(listing.city, listing.state)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock size={15} /> Posted {postedAge(listing.createdAt).toLowerCase()}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ListingStatsInline listing={listing} />
              {listing.externalJob ? (
                <PartnerJobHeartButton
                  listingId={listing.id}
                  title={title}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                />
              ) : listing.isMock ? (
                <button
                  type="button"
                  aria-label="Save listing"
                  onClick={() => toast.info("Saving is shown here in the mock listing preview.")}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Heart size={18} />
                </button>
              ) : (
                <WatchHeartButton
                  productId={listing.productId}
                  productSlug={listing.productSlug}
                  productName={title}
                  isDemo={false}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                />
              )}
              <button
                type="button"
                aria-label="Share listing"
                onClick={() => void handleShare()}
                className="grid h-11 w-11 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground"
              >
                <ShareNetwork size={18} />
              </button>
              <button
                type="button"
                aria-label="Print listing"
                onClick={() => window.print()}
                className="hidden h-11 w-11 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground sm:grid"
              >
                <Printer size={18} />
              </button>
            </div>
          </div>
          <p className="numeric mt-4 text-[30px] font-bold leading-none text-primary sm:text-[34px]">
            {details.payRange}
          </p>
        </header>

        <div className="min-w-0 space-y-7 lg:col-start-1 lg:row-start-3">
          <section className="soft-card overflow-hidden">
            <div className={listingTabListClass} role="tablist" aria-label="Job information">
              {(["description", "specifications", "map"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  className={listingTabClass(activeTab === tab)}
                >
                  {tab === "specifications"
                    ? "Job specifications"
                    : tab === "map"
                      ? "Map"
                      : "Description"}
                </button>
              ))}
            </div>
            <div className="p-5 sm:p-7">
              {activeTab === "description" && (
                <div>
                  <h2 className="text-[21px] font-bold">Job description</h2>
                  <p className="mt-5 whitespace-pre-line text-[14px] leading-7 text-muted-foreground">
                    {details.jobSummary || "The employer has not added a description yet."}
                  </p>
                  {listing.externalJob ? (
                    // Adzuna only shares the first few hundred characters.
                    <a
                      href={listing.externalJob.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow sponsored"
                      className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline"
                    >
                      Read full description
                      <ArrowSquareOut size={14} aria-hidden="true" />
                    </a>
                  ) : null}
                  {details.responsibilities.length > 0 && (
                    <div className="mt-8 border-t border-border/70 pt-6">
                      <h3 className="text-[18px] font-bold">Key responsibilities</h3>
                      <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-muted-foreground">
                        {details.responsibilities.map((item) => (
                          <li key={item} className="flex items-start gap-2">
                            <CheckCircle
                              size={15}
                              weight="fill"
                              className="mt-0.5 shrink-0 text-primary"
                            />{" "}
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {details.qualifications.length > 0 && (
                    <div className="mt-8 border-t border-border/70 pt-6">
                      <h3 className="text-[18px] font-bold">Qualifications</h3>
                      <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-muted-foreground">
                        {details.qualifications.map((item) => (
                          <li key={item} className="flex items-start gap-2">
                            <CheckCircle
                              size={15}
                              weight="fill"
                              className="mt-0.5 shrink-0 text-primary"
                            />{" "}
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              {activeTab === "specifications" && (
                <div>
                  <h2 className="text-[21px] font-bold">Job specifications</h2>
                  <dl className="mt-5 divide-y divide-border/70 text-[13px]">
                    {(listing.externalJob
                      ? // Partner jobs: only what Adzuna actually provides.
                        [
                          ["Pay range", details.payRange],
                          [
                            "Pay type",
                            listing.job?.payMin
                              ? listing.job.payEstimated
                                ? "Annual salary (Adzuna estimate)"
                                : "Annual salary"
                              : "Not listed",
                          ],
                          [
                            "Employment type",
                            details.employmentType === "Not specified"
                              ? "Not listed"
                              : details.employmentType,
                          ],
                          ["Category", listing.job?.category || "Not listed"],
                          ["Employer", details.employerName || "Not listed"],
                          ["Location", `${listing.city}, ${listing.state}`],
                          ["Posted", postedAge(listing.createdAt)],
                        ]
                      : [
                          ["Pay range", details.payRange],
                          ["Pay type", details.payType],
                          ["Employment type", details.employmentType],
                          ["Years of experience", details.experienceRequired],
                          ["Education level", details.educationLevel],
                        ]
                    ).map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between gap-4 py-3">
                        <dt>{label}</dt>
                        <dd className="text-right font-semibold text-muted-foreground">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
              {activeTab === "map" && (
                <div>
                  <h2 className="text-[21px] font-bold">Location</h2>
                  <p className="mt-2 text-[13px] text-muted-foreground">
                    {placeLabel(listing.city, listing.state)}
                  </p>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${locationQuery}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline"
                  >
                    Get directions <CaretRight size={15} />
                  </a>
                  <div className="mt-4 overflow-hidden rounded-2xl border border-border/70">
                    <iframe
                      title="Job location map"
                      src={`https://www.google.com/maps?q=${locationQuery}&output=embed`}
                      className="h-[320px] w-full"
                      loading="lazy"
                    />
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="min-w-0 space-y-5 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-2 lg:row-span-2">
          {listing.externalJob ? (
            <>
              <PartnerEmployerCard listing={listing} employerName={details.employerName} />
              <ListingActions
                listing={listing}
                showPaymentCalculator={false}
                showPriceHeader={false}
                ctaVerb="apply"
              />
              <PageStatsCard listing={listing} />
            </>
          ) : (
            <>
              <SellerCard listing={listing} />
              <ListingActions
                listing={listing}
                showPaymentCalculator={false}
                showPriceHeader={false}
                ctaVerb="apply"
              />
              <PageStatsCard listing={listing} />
            </>
          )}
          <TrustSafetyCard listing={listing} />
        </aside>
      </div>

      {!!listing.employerListings?.length && (
        <section className="mt-14 border-t border-border/70 pt-9">
          <h2 className="text-[23px] font-bold tracking-tight">
            More Jobs from {details.employerName}
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Other open positions from this employer
          </p>
          <div className="no-scrollbar mt-5 flex snap-x gap-4 overflow-x-auto pb-2">
            {listing.employerListings.map((related) => (
              <div key={related.id} className="w-[245px] shrink-0 snap-start sm:w-[280px]">
                <ListingCard listing={related} />
              </div>
            ))}
          </div>
        </section>
      )}
      {listing.externalJob ? <PartnerJobSourceCredit listing={listing} /> : null}
    </main>
  );
}

/**
 * The profile card for a partner (Adzuna) job, in the seller card's place:
 * the employer (logo, city, where the posting came from) and a link to their
 * other jobs. Applying happens through ListingActions like any external-apply
 * job; Adzuna's terms require the "Jobs by Adzuna" credit linking to them.
 */
function PartnerEmployerCard({
  listing,
  employerName,
}: {
  listing: ClassifiedDetail;
  employerName: string;
}) {
  const name = employerName || listing.title;
  const since = listing.externalJob?.employerSince;
  const sinceYear = since ? new Date(since).getFullYear() : null;
  return (
    <section className="soft-card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <EmployerTile name={name} imageUrl={listing.externalJob?.logoUrl} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-bold">{name}</h2>
          </div>
          <div className="mt-3 space-y-1 text-[12px]">
            <p>
              <span className="font-semibold">City:</span> {listing.city}
              {listing.state ? `, ${listing.state}` : ""}
            </p>
            <p>
              <span className="font-semibold">Posted:</span>{" "}
              {new Date(listing.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
            {sinceYear ? (
              <p>
                <span className="font-semibold">On Bluebird since:</span> {sinceYear}
                {new Date().getFullYear() - sinceYear > 0 && (
                  <span className="ml-1 rounded-full bg-brand-warm/20 px-1.5 py-0.5 text-[10px] font-bold text-brand-warm">
                    {new Date().getFullYear() - sinceYear} yrs
                  </span>
                )}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      {/* How complete this employer's posting is: what Adzuna gave us. */}
      <StrengthMeter
        checks={[
          Boolean(listing.externalJob?.logoUrl),
          Boolean(listing.job?.payMin),
          Boolean(listing.job?.employmentType && listing.job.employmentType !== "Not specified"),
          Boolean(listing.job?.category),
          Boolean(listing.employerListings?.length),
        ]}
      />
      <div className="mt-4 border-t border-border/70 pt-4">
        <p className="text-[13px] font-semibold">{name}</p>
        <p className="mt-1 flex items-start gap-1.5 text-[12px] text-primary">
          <MapPin size={14} weight="fill" className="mt-0.5 shrink-0" />
          {placeLabel(listing.city, listing.state)}
        </p>
      </div>
      {employerName ? (
        <Link
          to="/browse"
          search={{ category: "jobs", jobMode: "results", jobEmployer: employerName }}
          className="mt-4 flex items-center justify-center gap-1 border-t border-border/70 pt-4 text-[12.5px] font-semibold text-primary hover:underline"
        >
          All jobs from {employerName} <CaretRight size={13} />
        </Link>
      ) : null}
    </section>
  );
}

/** Required partner attribution, kept at the bottom of the job detail page. */
function PartnerJobSourceCredit({ listing }: { listing: ClassifiedDetail }) {
  if (!listing.externalJob) return null;
  return (
    <footer className="mt-12 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-border/70 py-5 text-center text-[11px] text-muted-foreground">
      <span>
        Jobs by{" "}
        <a
          href="https://www.adzuna.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-primary hover:underline"
        >
          Adzuna
        </a>
        .
      </span>
      {listing.externalJob.logoUrl ? <LogoDevCredit /> : null}
    </footer>
  );
}

function serviceDetails(listing: ClassifiedDetail) {
  const service = listing.service;
  return {
    subcategory: service?.subcategory ?? "Ask seller",
    pricing: service?.pricing ?? formatUsd(listing.priceCents),
    serviceArea: service?.serviceArea ?? "Ask seller",
    availability: service?.availability ?? "Ask seller",
    serviceSummary: service?.serviceSummary ?? listing.description ?? "",
    offerings: service?.offerings ?? [],
    reviews: service?.reviews ?? [],
  };
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((position) => (
        <Star
          key={position}
          size={14}
          weight={position <= Math.round(rating) ? "fill" : "regular"}
          className={
            position <= Math.round(rating) ? "text-brand-warm" : "text-muted-foreground/40"
          }
        />
      ))}
    </span>
  );
}

/**
 * The seller card's place on a directory business's page: the business, how
 * to reach it, its Google rating and hours when we've looked them up, and a
 * way for the owner to claim it.
 */
function DirectoryBusinessCard({ listing }: { listing: ClassifiedDetail }) {
  const business = listing.directory!;
  const phone = business.phone;
  const contactLinkClass =
    "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border text-[12.5px] font-semibold transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary";
  return (
    <section className="soft-card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <EmployerTile name={listing.title} imageUrl={business.logoUrl} />
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold leading-snug">{listing.title}</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {business.trades.slice(0, 3).join(" · ")}
          </p>
          <span
            className={`mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${business.claimed ? "bg-primary/10 text-primary" : "bg-secondary"}`}
          >
            {business.claimed ? "Owner verified" : "Unclaimed business"}
          </span>
        </div>
      </div>
      {business.rating != null ? (
        <a
          href={business.googleUrl ?? undefined}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-4 flex items-center gap-2 rounded-xl bg-secondary/50 px-3 py-2.5 text-[12.5px] hover:bg-secondary"
        >
          <StarRating rating={business.rating} />
          <span className="font-semibold">{business.rating.toFixed(1)}</span>
          <span className="text-muted-foreground">
            {business.reviewCount != null ? `${business.reviewCount} reviews ` : ""}on Google
          </span>
        </a>
      ) : null}
      {listing.service?.businessAddress ? (
        <p className="mt-4 flex items-start gap-1.5 text-[12px] leading-relaxed text-primary">
          <MapPin size={14} weight="fill" className="mt-0.5 shrink-0" />
          {listing.service.businessAddress}
        </p>
      ) : null}
      <div className="mt-4 grid gap-2">
        {phone ? (
          <a
            href={`tel:${phone.replace(/[^\d+]/g, "")}`}
            onClick={() => trackSellerContact("call", listing)}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-nav-accent text-[14.5px] font-semibold text-primary transition-opacity hover:opacity-90"
          >
            <Phone size={17} aria-hidden="true" /> Call {phone}
          </a>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          {business.website ? (
            <a
              href={business.website}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={contactLinkClass}
            >
              <Globe size={15} aria-hidden="true" /> Website
            </a>
          ) : null}
          {business.email ? (
            <a
              href={`mailto:${business.email}?subject=${encodeURIComponent("Found you on Bluebird")}`}
              onClick={() => trackSellerContact("email", listing)}
              className={contactLinkClass}
            >
              <EnvelopeSimple size={15} aria-hidden="true" /> Email
            </a>
          ) : null}
        </div>
      </div>
      {business.hours.length ? (
        <div className="mt-5 border-t border-border/70 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Hours
          </p>
          <dl className="mt-2 space-y-1 text-[12px]">
            {business.hours.map(({ day, hours }) => (
              <div key={day} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{day}</dt>
                <dd className="text-right font-medium">{hours}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      <ClaimBusinessPanel listing={listing} />
    </section>
  );
}

const claimRoles = ["Owner", "Manager", "Employee authorized to manage listings"] as const;

function ClaimBusinessPanel({ listing }: { listing: ClassifiedDetail }) {
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const fetchClaim = useServerFn(getMyServiceClaim);
  const submitClaim = useServerFn(claimServiceBusiness);
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<string>(claimRoles[0]);
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const claim = useQuery({
    queryKey: ["service-claim", listing.id],
    queryFn: () => fetchClaim({ data: { directoryId: listing.id } }),
    enabled: isSignedIn,
  });
  const mutation = useMutation({
    mutationFn: () => submitClaim({ data: { directoryId: listing.id, role, contact, note } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["service-claim", listing.id] });
      toast.success("Claim sent. We'll verify it with the business and email you.");
      setOpen(false);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not send your claim."),
  });
  const mine = claim.data;

  if (mine?.status === "approved") {
    return (
      <div className="mt-5 rounded-xl border border-primary/25 bg-primary/5 p-3.5 text-[12px] leading-relaxed">
        <p className="font-semibold text-primary">You manage this business on Bluebird.</p>
        <p className="mt-1 text-muted-foreground">
          Post your full listing with photos, services and prices. It will show above this entry.
        </p>
        <Link
          to="/create-listing"
          className="mt-3 inline-flex h-9 items-center rounded-xl bg-primary px-3 font-semibold text-primary-foreground"
        >
          Post your listing
        </Link>
      </div>
    );
  }
  if (listing.directory?.claimed) return null;
  if (mine?.status === "pending") {
    return (
      <p className="mt-5 rounded-xl bg-secondary/50 p-3.5 text-[12px] leading-relaxed text-muted-foreground">
        Your claim is being reviewed. We'll verify it with the business and email you.
      </p>
    );
  }
  return (
    <div className="mt-5 border-t border-border/70 pt-4">
      <p className="text-[13px] font-semibold">Is this your business?</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
        Claim it free to add photos, services, prices and take quote requests on Bluebird.
      </p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            className="mt-3 flex h-10 w-full items-center justify-center rounded-full border border-primary/40 text-[12.5px] font-semibold text-primary hover:bg-primary/5"
          >
            Claim this business
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Claim {listing.title}</DialogTitle>
            <DialogDescription>
              We verify every claim with the business before handing it over, usually within one or
              two business days.
            </DialogDescription>
          </DialogHeader>
          {isSignedIn ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate();
              }}
            >
              <label className="block text-[12px] font-medium">
                Your role
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-[12px]"
                >
                  {claimRoles.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[12px] font-medium">
                Business phone or email we can verify you at
                <input
                  required
                  value={contact}
                  onChange={(event) => setContact(event.target.value.slice(0, 200))}
                  placeholder={listing.directory?.phone ?? "owner@yourbusiness.com"}
                  className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-[12px]"
                />
              </label>
              <label className="block text-[12px] font-medium">
                Anything we should know?{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value.slice(0, 1000))}
                  rows={3}
                  className="mt-1 w-full resize-y rounded-xl border border-input bg-background px-3 py-2.5 text-[12px]"
                  placeholder="For example, a new phone number or that you moved."
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-10 rounded-xl border border-input px-4 text-[12px] font-semibold hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={mutation.isPending}
                  className="h-10 rounded-xl bg-primary px-4 text-[12px] font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {mutation.isPending ? "Sending…" : "Send claim"}
                </button>
              </div>
            </form>
          ) : (
            <div className="rounded-xl border border-border bg-secondary/40 p-4 text-[12px] leading-relaxed text-muted-foreground">
              Sign in or create a free account to claim your business.
              <Link
                to={brand.urls.auth}
                className="mt-3 inline-flex h-9 items-center rounded-xl bg-primary px-3 font-semibold text-primary-foreground"
              >
                Sign in
              </Link>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Attribution for directory data (Foursquare OS Places, Apache 2.0). */
function DirectoryCredit() {
  return (
    <footer className="mt-12 border-t border-border/70 py-5 text-center text-[11px] text-muted-foreground">
      Business details from{" "}
      <a
        href="https://docs.foursquare.com/data-products/docs/access-fsq-os-places"
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-primary hover:underline"
      >
        Foursquare Open Source Places
      </a>{" "}
      (Apache 2.0). Confirm hours, prices and licensing directly with the business.
    </footer>
  );
}

function ServiceListingDetail({
  listing,
  title,
  locationQuery,
  handleShare,
}: {
  listing: ClassifiedDetail;
  title: string;
  locationQuery: string;
  handleShare: () => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<"description" | "reviews" | "map">("description");
  const details = serviceDetails(listing);
  const seller = listing.seller;

  return (
    <main className="mx-auto max-w-[1360px] px-4 py-6 sm:px-7 sm:py-8 lg:px-10">
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-1 text-[11.5px] text-muted-foreground"
      >
        <Link to="/browse" search={{}} className="hover:text-foreground">
          All listings
        </Link>
        <CaretRight size={13} />
        <Link to="/browse" search={{ category: "services" }} className="hover:text-foreground">
          Services
        </Link>
        <CaretRight size={13} />
        <span className="text-foreground">{placeLabel(listing.city, listing.state)}</span>
      </nav>

      {/* Photo first on phones; on desktop the grid places the header across
          the top and the photo beside the sidebar, exactly as before. */}
      <div className="mt-5 grid gap-6 lg:mt-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,370px)] lg:grid-rows-[auto_auto_1fr] lg:items-start lg:gap-7">
        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <Gallery listing={listing} />
        </div>

        <header className="border-b border-border/70 pb-5 lg:col-span-2 lg:row-start-1">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[28px] font-bold leading-tight tracking-tight sm:text-[38px]">
                {title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-muted-foreground">
                <span className="flex items-center gap-1.5 text-primary">
                  <MapPin size={15} weight="fill" /> {placeLabel(listing.city, listing.state)}
                </span>
                {listing.directory ? (
                  <span className="flex items-center gap-1.5">
                    <Wrench size={15} /> {listing.service?.subcategory}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Clock size={15} /> Posted {postedAge(listing.createdAt).toLowerCase()}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ListingStatsInline listing={listing} />
              {listing.directory ? (
                <PartnerJobHeartButton
                  listingId={listing.id}
                  title={title}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                />
              ) : listing.isMock ? (
                <button
                  type="button"
                  aria-label="Save listing"
                  onClick={() => toast.info("Saving is shown here in the mock listing preview.")}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Heart size={18} />
                </button>
              ) : (
                <WatchHeartButton
                  productId={listing.productId}
                  productSlug={listing.productSlug}
                  productName={title}
                  isDemo={false}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                />
              )}
              <button
                type="button"
                aria-label="Share listing"
                onClick={() => void handleShare()}
                className="grid h-11 w-11 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground"
              >
                <ShareNetwork size={18} />
              </button>
              <button
                type="button"
                aria-label="Print listing"
                onClick={() => window.print()}
                className="hidden h-11 w-11 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground sm:grid"
              >
                <Printer size={18} />
              </button>
            </div>
          </div>
          <p className="numeric mt-4 text-[30px] font-bold leading-none text-primary sm:text-[34px]">
            {details.pricing}
          </p>
        </header>

        <div className="min-w-0 space-y-7 lg:col-start-1 lg:row-start-3">
          <section className="soft-card overflow-hidden">
            <div className={listingTabListClass} role="tablist" aria-label="Service information">
              {(["description", "reviews", "map"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  className={listingTabClass(activeTab === tab)}
                >
                  {tab === "reviews" ? "Reviews" : tab === "map" ? "Map" : "Description"}
                </button>
              ))}
            </div>
            <div className="p-5 sm:p-7">
              {activeTab === "description" && (
                <div>
                  <h2 className="text-[21px] font-bold">Description</h2>
                  <p className="mt-5 whitespace-pre-line text-[14px] leading-7 text-muted-foreground">
                    {details.serviceSummary ||
                      (listing.directory
                        ? "This business hasn't added a description on Bluebird yet. If it's yours, claim it to add your services, photos and prices."
                        : "The seller has not added a description yet.")}
                  </p>
                  {details.offerings.length > 0 && (
                    <div className="mt-8 border-t border-border/70 pt-6">
                      <h3 className="text-[18px] font-bold">What's included</h3>
                      <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-muted-foreground">
                        {details.offerings.map((item) => (
                          <li key={item} className="flex items-start gap-2">
                            <CheckCircle
                              size={15}
                              weight="fill"
                              className="mt-0.5 shrink-0 text-primary"
                            />{" "}
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="mt-8 border-t border-border/70 pt-6">
                    <h3 className="text-[18px] font-bold">Service details</h3>
                    <dl className="mt-3 divide-y divide-border/70 text-[13px]">
                      {(listing.directory
                        ? [
                            ["Services", listing.directory.trades.join(", ")],
                            ["Address", listing.service?.businessAddress ?? listing.city],
                            ...(listing.directory.phone
                              ? [["Phone", listing.directory.phone]]
                              : []),
                            ...(listing.directory.website
                              ? [
                                  [
                                    "Website",
                                    listing.directory.website
                                      .replace(/^https?:\/\/(www\.)?/, "")
                                      .replace(/\/$/, ""),
                                  ],
                                ]
                              : []),
                          ]
                        : [
                            ["Subcategory", details.subcategory],
                            ["Service area", details.serviceArea],
                            ["Availability", details.availability],
                          ]
                      ).map(([label, value]) => (
                        <div key={label} className="flex items-center justify-between gap-4 py-3">
                          <dt>{label}</dt>
                          <dd className="text-right font-semibold text-muted-foreground">
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>
              )}
              {activeTab === "reviews" && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-[21px] font-bold">Customer reviews</h2>
                      {seller?.ratingAverage != null && (
                        <p className="mt-1 flex items-center gap-2 text-[13px] text-muted-foreground">
                          <StarRating rating={seller.ratingAverage} />
                          {seller.ratingAverage.toFixed(1)} · {seller.reviewCount} review
                          {seller.reviewCount === 1 ? "" : "s"}
                        </p>
                      )}
                    </div>
                  </div>
                  {listing.directory ? (
                    <p className="mt-5 text-[13px] leading-relaxed text-muted-foreground">
                      {listing.directory.rating != null && listing.directory.googleUrl ? (
                        <>
                          Rated {listing.directory.rating.toFixed(1)} on Google
                          {listing.directory.reviewCount
                            ? ` from ${listing.directory.reviewCount} reviews`
                            : ""}
                          .{" "}
                          <a
                            href={listing.directory.googleUrl}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="font-semibold text-primary hover:underline"
                          >
                            Read the reviews on Google
                          </a>
                        </>
                      ) : (
                        "No Bluebird reviews yet for this business."
                      )}
                    </p>
                  ) : details.reviews.length === 0 ? (
                    <p className="mt-5 text-[13px] text-muted-foreground">
                      No reviews yet. Be the first to leave feedback after working with this seller.
                    </p>
                  ) : (
                    <ul className="mt-5 space-y-4">
                      {details.reviews.map((review) => (
                        <li
                          key={`${review.author}-${review.date}`}
                          className="rounded-2xl border border-border/70 bg-secondary/35 p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-[12px] font-semibold text-primary-foreground">
                                {review.author.slice(0, 1).toUpperCase()}
                              </span>
                              <span className="text-[13px] font-semibold">{review.author}</span>
                            </div>
                            <span className="text-[11.5px] text-muted-foreground">
                              {new Date(review.date).toLocaleDateString("en-US", {
                                month: "numeric",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </span>
                          </div>
                          <div className="mt-2">
                            <StarRating rating={review.rating} />
                          </div>
                          <p className="mt-2 text-[13.5px] font-semibold">{review.title}</p>
                          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                            {review.body}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {activeTab === "map" && (
                <div>
                  <h2 className="text-[21px] font-bold">Location</h2>
                  <p className="mt-2 text-[13px] text-muted-foreground">
                    {listing.service?.businessAddress ?? `${listing.city}, ${listing.state}`}
                  </p>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(listing.service?.businessAddress ?? `${listing.city}, ${listing.state}`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline"
                  >
                    Get directions <CaretRight size={15} />
                  </a>
                  <div className="mt-4 overflow-hidden rounded-2xl border border-border/70">
                    <iframe
                      title="Service location map"
                      src={`https://www.google.com/maps?q=${encodeURIComponent(listing.service?.businessAddress ?? `${listing.city}, ${listing.state}`)}&output=embed`}
                      className="h-[320px] w-full"
                      loading="lazy"
                    />
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="min-w-0 space-y-5 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-2 lg:row-span-2">
          {listing.directory ? (
            <DirectoryBusinessCard listing={listing} />
          ) : (
            <>
              <SellerCard listing={listing} />
              <ListingActions
                listing={listing}
                showPaymentCalculator={false}
                showPriceHeader={false}
              />
            </>
          )}
          <PageStatsCard listing={listing} />
          <TrustSafetyCard listing={listing} />
        </aside>
      </div>
      {listing.directory ? <DirectoryCredit /> : null}
    </main>
  );
}

function GeneralListingDetail({
  listing,
  title,
  condition,
  itemDetails,
  description,
  locationQuery,
  handleShare,
}: {
  listing: ClassifiedDetail;
  title: string;
  condition: string;
  itemDetails: Record<string, string>;
  description: string;
  locationQuery: string;
  handleShare: () => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<"description" | "location">("description");
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  return (
    <main className="mx-auto max-w-[1360px] px-4 py-6 sm:px-7 sm:py-8 lg:px-10">
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-1 text-[11.5px] text-muted-foreground"
      >
        <Link to="/browse" search={{}} className="hover:text-foreground">
          All listings
        </Link>
        <CaretRight size={13} />
        {listing.categorySlug && (
          <>
            <Link
              to="/browse"
              search={{ category: listing.categorySlug }}
              className="hover:text-foreground"
            >
              {listing.categoryName}
            </Link>
            <CaretRight size={13} />
          </>
        )}
        <span className="text-foreground">{placeLabel(listing.city, listing.state)}</span>
      </nav>

      {/* Photo first on phones; on desktop the grid places the header across
          the top and the photo beside the sidebar, exactly as before. */}
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(255px,330px)_minmax(0,1fr)] lg:grid-rows-[auto_auto_1fr] lg:items-start lg:gap-7">
        <div className="min-w-0 lg:col-start-2 lg:row-start-2">
          <Gallery listing={listing} />
        </div>

        <header className="border-b border-border/70 pb-5 lg:col-span-2 lg:row-start-1">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[28px] font-bold leading-tight tracking-tight sm:text-[36px]">
                {title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12.5px] text-muted-foreground">
                <span className="flex items-center gap-1.5 text-primary">
                  <MapPin size={15} weight="fill" /> {placeLabel(listing.city, listing.state)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock size={15} /> Posted {postedAge(listing.createdAt).toLowerCase()}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ListingStatsInline listing={listing} />
              {listing.externalPet ? (
                <PartnerJobHeartButton
                  listingId={listing.id}
                  title={title}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                />
              ) : listing.isMock ? (
                <button
                  type="button"
                  aria-label="Save listing"
                  onClick={() => toast.info("Saving is shown here in the mock listing preview.")}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Heart size={18} />
                </button>
              ) : (
                <WatchHeartButton
                  productId={listing.productId}
                  productSlug={listing.productSlug}
                  productName={title}
                  isDemo={false}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                />
              )}
              <button
                type="button"
                aria-label="Share listing"
                onClick={() => void handleShare()}
                className="grid h-11 w-11 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground"
              >
                <ShareNetwork size={18} />
              </button>
              <button
                type="button"
                aria-label="Print listing"
                onClick={() => window.print()}
                className="hidden h-11 w-11 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground sm:grid"
              >
                <Printer size={18} />
              </button>
            </div>
          </div>
          <p className="numeric mt-4 text-[30px] font-bold leading-none text-primary sm:text-[34px]">
            {adoptionPriceLabel(listing) ??
              formatClassifiedPrice(listing.priceCents, { wholeDollars: true })}
          </p>
        </header>

        <div className="min-w-0 space-y-7 lg:col-start-2 lg:row-start-3">
          <section className="soft-card overflow-hidden">
            <div className={listingTabListClass} role="tablist" aria-label="Listing information">
              {(["description", "location"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  className={listingTabClass(activeTab === tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="p-5 sm:p-7">
              {activeTab === "description" ? (
                <div>
                  <div
                    className={
                      !descriptionExpanded && description.length > 560
                        ? "relative max-h-[300px] overflow-hidden"
                        : "relative overflow-hidden"
                    }
                  >
                    <h2 className="text-[21px] font-bold">Description</h2>
                    {condition && (
                      <div className="mt-5">
                        <p className="text-[13px] font-semibold">Condition</p>
                        <span className="mt-2 inline-flex rounded-xl bg-secondary px-4 py-2 text-[13px] font-semibold shadow-sm">
                          {condition}
                        </span>
                      </div>
                    )}
                    {Object.keys(itemDetails).length > 0 && (
                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        {Object.entries(itemDetails).map(([key, value]) => (
                          <div key={key} className="rounded-xl bg-secondary/55 px-4 py-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                              {key
                                .replace(/[A-Z]/g, (letter) => ` ${letter}`)
                                .replace(/^./, (letter) => letter.toUpperCase())}
                            </p>
                            <p className="mt-1 text-[13px] font-semibold">{value}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {listing.pet ? <PetDetails pet={listing.pet} /> : null}
                    <p className="mt-6 whitespace-pre-line text-[14px] leading-7 text-muted-foreground">
                      {description || "The seller has not added a description yet."}
                    </p>
                    {!descriptionExpanded && description.length > 560 && (
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-card to-transparent" />
                    )}
                  </div>
                  {description.length > 560 && (
                    <button
                      type="button"
                      onClick={() => setDescriptionExpanded((expanded) => !expanded)}
                      className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline"
                    >
                      {descriptionExpanded ? "Show less" : "See more"}{" "}
                      <CaretDown size={15} className={descriptionExpanded ? "rotate-180" : ""} />
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <h2 className="text-[21px] font-bold">Map</h2>
                  <div className="mt-5 overflow-hidden rounded-2xl border border-border/70 bg-secondary/45">
                    <ListingMapEmbed locationQuery={locationQuery} title="Listing location map" />
                    <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <MapTrifold
                          size={25}
                          weight="duotone"
                          className="mt-0.5 shrink-0 text-primary"
                        />
                        <div>
                          <p className="font-semibold">{placeLabel(listing.city, listing.state)}</p>
                          <p className="mt-1 text-[12px] text-muted-foreground">
                            Approximate public location. Confirm the exact pickup or meeting
                            location with the seller before you go.
                          </p>
                        </div>
                      </div>
                      <a
                        href={"https://www.google.com/maps/search/?api=1&query=" + locationQuery}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-primary px-4 text-[12px] font-semibold text-primary-foreground hover:opacity-90"
                      >
                        Open map
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="min-w-0 space-y-5 lg:sticky lg:top-24 lg:col-start-1 lg:row-start-2 lg:row-span-2">
          <SellerCard listing={listing} />
          <RescueCard listing={listing} />
          {/* Vinted/Whatnot imports: the seller card's Message seller button
              already links to the original listing, so no second card. */}
          {listing.originalListing ? null : (
            <ListingActions
              listing={listing}
              showPaymentCalculator={false}
              showPriceHeader={false}
            />
          )}
          <PageStatsCard listing={listing} />
          <TrustSafetyCard listing={listing} />
        </aside>
      </div>
      {listing.externalPet ? (
        <p className="mt-12 border-t border-border/70 py-5 text-center text-[11px] text-muted-foreground">
          Pet data from RescueGroups.org.
        </p>
      ) : null}
    </main>
  );
}

/** The rescue caring for a RescueGroups pet: name, town and how to reach them. */
function RescueCard({ listing }: { listing: ClassifiedDetail }) {
  const rescue = listing.externalPet;
  if (!rescue) return null;
  const name = rescue.orgName ?? "Animal rescue";
  const linkClass =
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border text-[12px] font-medium hover:border-primary hover:bg-primary/5 hover:text-primary";
  return (
    <section className="soft-card p-5 sm:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Listed by
      </p>
      <div className="mt-3 flex items-center gap-3">
        <EmployerTile name={name} />
        <div className="min-w-0">
          <p className="text-[15px] font-bold">{name}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {placeLabel(listing.city, listing.state)}
          </p>
        </div>
      </div>
      {rescue.orgPhone || rescue.orgEmail ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {rescue.orgPhone ? (
            <a href={`tel:${rescue.orgPhone.replace(/[^\d+]/g, "")}`} className={linkClass}>
              <Phone size={15} aria-hidden="true" /> Call
            </a>
          ) : null}
          {rescue.orgEmail ? (
            <a href={`mailto:${rescue.orgEmail}`} className={linkClass}>
              <EnvelopeSimple size={15} aria-hidden="true" /> Email
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function PetDetails({ pet }: { pet: NonNullable<ClassifiedDetail["pet"]> }) {
  const details = [
    ["Listing type", petPlacementLabels[pet.placementType] ?? pet.placementType],
    ["Animal", pet.species],
    ["Breed", pet.breed],
    ["Name", pet.name],
    ["Age", pet.age],
    ["Sex", pet.sex],
    ["Offered by", pet.offeredBy],
    ["Living arrangement", pet.indoorOutdoor],
    ["Hypoallergenic", pet.hypoallergenic],
    ["Vaccinated", pet.vaccinated],
    ["Spayed / neutered", pet.spayedNeutered],
    ["Microchipped", pet.microchipped],
    ["Records available", pet.recordsAvailable],
    ["Good with kids", pet.goodWithKids],
    ["Good with dogs", pet.goodWithDogs],
    ["Good with cats", pet.goodWithCats],
  ].filter(([, value]) => Boolean(value));

  return (
    <section className="mt-7 rounded-2xl border border-border/70 bg-secondary/35 p-4 sm:p-5">
      <h3 className="text-[16px] font-bold">Pet details</h3>
      <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {details.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 text-[12.5px]">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-semibold text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      {pet.specialNeeds || pet.breedingTerms ? (
        <div className="mt-4 border-t border-border/70 pt-4 text-[12.5px] leading-6">
          {pet.specialNeeds ? (
            <p>
              <span className="font-semibold">Special needs: </span>
              {pet.specialNeeds}
            </p>
          ) : null}
          {pet.breedingTerms ? (
            <p className={pet.specialNeeds ? "mt-2" : ""}>
              <span className="font-semibold">Breeding terms: </span>
              {pet.breedingTerms}
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="mt-4 border-t border-border/70 pt-4 text-[12px] leading-5 text-muted-foreground">
        Meet in person, verify records, and avoid deposits, wire transfers, or gift cards before you
        have confirmed the pet and seller.
      </p>
    </section>
  );
}

/** Listing attribution at the end of a partner home page. */
function ExternalHomeCredit({ listing }: { listing: ClassifiedDetail }) {
  const listedBy = listing.externalHome?.listedBy;
  return (
    <footer className="mt-12 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-border/70 py-5 text-center text-[11px] text-muted-foreground">
      {listedBy?.brokerName ? (
        <span>
          Listing courtesy of {listedBy.brokerName}
          {listedBy.mlsName ? ` · ${listedBy.mlsName}` : ""}.
        </span>
      ) : null}
      <span>
        Information is deemed reliable but not guaranteed. Verify details with the listing agent.
      </span>
      {listing.externalHome?.sourceUrl ? (
        <a
          href={listing.externalHome.sourceUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="font-semibold text-primary hover:underline"
        >
          View original listing
        </a>
      ) : null}
    </footer>
  );
}
