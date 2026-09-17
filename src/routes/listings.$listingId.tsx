import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
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
  Truck,
  Wrench,
} from "@phosphor-icons/react";

import { brand } from "@/config/brand";
import { formatUsd } from "@/config/fees";
import { ListingActions } from "@/components/classifieds/ListingActions";
import { ListingCard } from "@/components/classifieds/ListingCard";
import { WatchHeartButton } from "@/components/community/WatchHeartButton";
import {
  conditionLabels,
  formatJobPay,
  formatMileage,
  fulfillmentLabels,
  postedAge,
  vehicleHeadline,
} from "@/lib/classifieds-display";
import { getClassifiedListing, getRelatedClassifieds } from "@/lib/classifieds.functions";
import type { ClassifiedCard, ClassifiedDetail } from "@/lib/classifieds.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CategoryArtwork } from "@/components/classifieds/CategoryIcon";

const listingQuery = (id: string) =>
  queryOptions({
    queryKey: ["classified-listing", id],
    queryFn: () => getClassifiedListing({ data: { id } }),
  });

export const Route = createFileRoute("/listings/$listingId")({
  loader: async ({ context, params }) => {
    const listing = await context.queryClient.ensureQueryData(listingQuery(params.listingId));
    if (!listing) throw notFound();
    return {
      title: listing.title,
      priceLabel: listing.job ? formatJobPay(listing.job) : formatUsd(listing.priceCents),
      city: listing.city,
      state: listing.state,
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
    const title = `${loaderData.title} — ${loaderData.priceLabel} in ${loaderData.city}, ${loaderData.state}`;
    const description = `${loaderData.title} listed for ${loaderData.priceLabel} by a seller in ${loaderData.city}, ${loaderData.state} on ${brand.name}.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: ListingDetail,
  notFoundComponent: ListingMissing,
});

function ListingMissing() {
  return (
    <main className="mx-auto max-w-[720px] px-4 py-16 text-center sm:px-6">
      <h1 className="text-[21px] font-semibold tracking-tight">This listing is no longer live</h1>
      <p className="mx-auto mt-2 max-w-[46ch] text-[13px] leading-relaxed text-muted-foreground">
        It may have sold, expired, or been removed by the seller.
      </p>
      <Link
        to="/browse"
        search={{}}
        className="mt-5 inline-flex h-10 items-center rounded-md bg-primary px-4 text-[13px] font-semibold text-primary-foreground"
      >
        Browse all listings
      </Link>
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

function Gallery({ listing }: { listing: ClassifiedDetail }) {
  const [activeImage, setActiveImage] = useState(0);
  const images = listing.images;
  const subject = listing.vehicle ? "vehicle" : "listing";

  if (images.length === 0) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[28px] border border-border/70 bg-secondary/55 text-[12px] text-muted-foreground sm:min-h-[520px]">
        <span className="grid h-20 w-20 place-items-center rounded-3xl bg-card text-primary">
          <CategoryArtwork slug={listing.categorySlug ?? "general"} size={110} />
        </span>
        <span className="mt-4">This seller has not added photos yet.</span>
      </div>
    );
  }

  const goToImage = (next: number) => {
    setActiveImage((next + images.length) % images.length);
  };

  return (
    <Dialog>
      <div className="overflow-hidden rounded-[28px] border border-border/70 bg-foreground">
        <div
          className="group relative flex min-h-[360px] items-center justify-center overflow-hidden sm:min-h-[560px]"
          data-reference-layout="row-span-2"
        >
          <img
            src={images[activeImage]?.url}
            alt={images[activeImage]?.alt ?? ""}
            className="max-h-[560px] w-full object-contain"
            fetchPriority="high"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent" />
          <div className="absolute bottom-4 left-4 rounded-full bg-black/65 px-3 py-1 text-[11px] font-medium text-white">
            {activeImage + 1} / {images.length}
          </div>
          <DialogTrigger asChild>
            <button
              type="button"
              className="absolute right-4 top-4 rounded-full bg-card/95 px-3.5 py-2 text-[11px] font-semibold text-foreground opacity-100 transition hover:bg-card sm:opacity-0 sm:group-hover:opacity-100"
            >
              Show all photos
            </button>
          </DialogTrigger>
          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => goToImage(activeImage - 1)}
                aria-label={`Previous ${subject} photo`}
                className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-card/95 text-foreground transition hover:scale-105"
              >
                <ArrowLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => goToImage(activeImage + 1)}
                aria-label={`Next ${subject} photo`}
                className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-card/95 text-foreground transition hover:scale-105"
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
  const unavailableContactClass =
    "inline-flex h-9 cursor-not-allowed items-center justify-center gap-1.5 rounded-md border border-border/70 text-[12px] font-medium text-muted-foreground/50";
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
            {seller.payoutVerified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
                <CheckCircle size={12} weight="fill" /> Verified seller
              </span>
            )}
          </div>
          {seller.ratingAverage != null && (
            <p className="mt-1 text-[12px] text-muted-foreground">
              {seller.ratingAverage.toFixed(1)} / 5 · {seller.reviewCount} review
              {seller.reviewCount === 1 ? "" : "s"}
            </p>
          )}
          {(seller.memberSince || seller.sellerType) && (
            <div className="mt-3 space-y-1 text-[12px]">
              <p>
                <span className="font-semibold">City:</span> {listing.city}
              </p>
              {seller.memberSince && (
                <p>
                  <span className="font-semibold">Member since:</span> {seller.memberSince}
                  <span className="ml-1 rounded-full bg-brand-warm/20 px-1.5 py-0.5 text-[10px] font-bold text-brand-warm">
                    {new Date().getFullYear() - seller.memberSince} yrs
                  </span>
                </p>
              )}
              {seller.sellerType && (
                <p>
                  <span className="font-semibold">Seller type:</span> {seller.sellerType}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 border-t border-border/70 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Contact seller
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {seller.contactPhone ? (
            <a href={`sms:${seller.contactPhone}`} className={contactLinkClass}>
              <DeviceMobile size={15} aria-hidden="true" /> Text
            </a>
          ) : (
            <button type="button" disabled className={unavailableContactClass}>
              <DeviceMobile size={15} aria-hidden="true" /> Text
            </button>
          )}
          {seller.contactPhone ? (
            <a href={`tel:${seller.contactPhone}`} className={contactLinkClass}>
              <Phone size={15} aria-hidden="true" /> Call
            </a>
          ) : (
            <button type="button" disabled className={unavailableContactClass}>
              <Phone size={15} aria-hidden="true" /> Call
            </button>
          )}
          {seller.contactEmail ? (
            <a
              href={`mailto:${seller.contactEmail}?subject=${encodeURIComponent(listing.title)}`}
              className={contactLinkClass}
            >
              <EnvelopeSimple size={15} aria-hidden="true" /> Email
            </a>
          ) : (
            <button type="button" disabled className={unavailableContactClass}>
              <EnvelopeSimple size={15} aria-hidden="true" /> Email
            </button>
          )}
        </div>
        <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
          Texts, calls, and emails go directly to the seller. Use Gem State messaging below if you
          prefer to keep the conversation in the marketplace.
        </p>
      </div>
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

function VehicleHistoryCard({ vehicle }: { vehicle: ClassifiedDetail["vehicle"] }) {
  if (!vehicle) return null;
  return (
    <section className="soft-card px-5 py-5">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <span className="grid h-9 w-8 shrink-0 place-items-end overflow-hidden rounded-lg bg-[#f6b544] shadow-sm">
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
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#f6b544]">
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

function PageStatsCard({ listing }: { listing: ClassifiedDetail }) {
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
  const daysLeft = listing.expiresAt ? daysBetween(listing.createdAt, new Date(listing.expiresAt).getTime()) - daysOnline : null;
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
          <dd className="text-right font-medium text-muted-foreground">Not tracked yet</dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-2">
          <dt className="text-muted-foreground">Favorited</dt>
          <dd className="text-right font-medium text-muted-foreground">Not tracked yet</dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-2 last:pb-0">
          <dt className="text-muted-foreground">Status</dt>
          <dd className="inline-flex items-center gap-1.5 text-right font-medium text-primary">
            <CheckCircle size={13} weight="fill" /> Active
          </dd>
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
          <ShieldCheck size={13} weight="fill" /> GemList Safety
        </span>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
        GemList reviews listings for marketplace policy. Always inspect the item, confirm the
        details, and agree on the final price before exchanging money.
      </p>
      <Link
        to="/contact"
        className="mt-4 flex h-10 items-center justify-center gap-1.5 rounded-full border border-primary/40 text-[12px] font-semibold text-primary hover:bg-primary/5"
      >
        <Flag size={14} /> Flag this listing
      </Link>
      {listing.seller?.payoutVerified && (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <CheckCircle size={13} weight="fill" className="text-primary" /> Seller account
          verification is complete.
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

function ListingDetail() {
  const { listingId } = Route.useParams();
  const { data: listing } = useSuspenseQuery(listingQuery(listingId));
  const [activeTab, setActiveTab] = useState<"description" | "specifications" | "location">(
    "description",
  );
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  const relatedQuery = useSuspenseQuery(
    queryOptions({
      queryKey: ["classified-related", listingId, listing?.categorySlug],
      queryFn: () =>
        getRelatedClassifieds({
          data: {
            ...(listing?.categorySlug ? { category: listing.categorySlug } : {}),
            ...(listing?.vehicle && listing?.seller?.slug
              ? { sellerSlug: listing.seller.slug }
              : {}),
            excludeId: listingId,
          },
        }),
    }),
  );

  if (!listing) return <ListingMissing />;

  const vehicle = listing.vehicle;
  const isVehicle = Boolean(vehicle);
  const condition = conditionLabels[listing.condition] ?? listing.condition;
  const specRows: [string, string][] = vehicle
    ? ([
        ["Body style", vehicle.bodyStyle],
        ["Transmission", vehicle.transmission],
        ["Drivetrain", vehicle.drivetrain],
        ["Fuel", vehicle.fuelType],
        ["Exterior", vehicle.exteriorColor],
        ["Title", vehicle.titleStatus],
        ["VIN", vehicle.vin],
        ["Condition", condition],
        ["Fulfillment", fulfillmentLabels[listing.fulfillmentMode]],
      ].filter(([, value]) => Boolean(value)) as [string, string][])
    : ([
        ["Condition", condition],
        ["Fulfillment", fulfillmentLabels[listing.fulfillmentMode]],
      ].filter(([, value]) => Boolean(value)) as [string, string][]);

  const title = vehicle ? vehicleHeadline(vehicle) || listing.title : listing.title;
  const description = listing.description?.trim() ?? "";
  const locationQuery = encodeURIComponent(`${listing.city}, ${listing.state}`);
  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title, url: window.location.href });
        return;
      }
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
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
          relatedListings={relatedQuery.data.listings}
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
          relatedListings={relatedQuery.data.listings}
          handleShare={handleShare}
        />
      );
    }
    return (
      <GeneralListingDetail
        listing={listing}
        title={title}
        condition={condition}
        description={description}
        locationQuery={locationQuery}
        relatedListings={relatedQuery.data.listings}
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
        <span className="text-foreground">
          {listing.city}, {listing.state}
        </span>
      </nav>

      <header className="mt-5 border-b border-border/70 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-bold leading-tight tracking-tight sm:text-[38px]">
              {title}
            </h1>
            {vehicle && vehicle.trim && vehicle.trim !== title && (
              <p className="mt-1 text-[14px] text-muted-foreground">{listing.title}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <WatchHeartButton
              productId={listing.productId}
              productSlug={listing.productSlug}
              productName={title}
              isDemo={listing.isMock === true}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            />
            <button
              type="button"
              aria-label="Share listing"
              onClick={() => void handleShare()}
              className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground"
            >
              <ShareNetwork size={18} />
            </button>
            <button
              type="button"
              aria-label="Print listing"
              onClick={() => window.print()}
              className="hidden h-10 w-10 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground sm:grid"
            >
              <Printer size={18} />
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-muted-foreground">
          <span className="flex items-center gap-1.5 text-primary">
            <MapPin size={15} weight="fill" /> {listing.city}, {listing.state}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock size={15} /> Posted {postedAge(listing.createdAt).toLowerCase()}
          </span>
          {vehicle?.mileage != null && (
            <span className="flex items-center gap-1.5">
              <Gauge size={15} /> {formatMileage(vehicle.mileage)}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Eye size={15} /> Local listing
          </span>
        </div>
      </header>

      <div className="mt-6 grid gap-7 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,370px)] lg:items-start">
        <div className="min-w-0 space-y-7">
          <Gallery listing={listing} />

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
            <QuickFact
              label="Condition"
              value={condition}
              icon={<ShieldCheck size={16} className="text-primary" />}
            />
          </section>

          <section className="soft-card overflow-hidden">
            <div
              className="flex flex-wrap gap-1 border-b border-border/70 bg-secondary/35 p-2"
              role="tablist"
              aria-label="Listing information"
            >
              {(["description", "specifications", "location"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-xl px-4 py-2.5 text-[12.5px] font-semibold capitalize transition ${activeTab === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
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
                        The seller has not added a description yet.
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
                </div>
              )}
              {activeTab === "location" && (
                <div>
                  <h2 className="text-[18px] font-bold">Listing location</h2>
                  <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-border/70 bg-secondary/45 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <MapTrifold
                        size={24}
                        weight="duotone"
                        className="mt-0.5 shrink-0 text-primary"
                      />
                      <div>
                        <p className="font-semibold">
                          {listing.city}, {listing.state}
                        </p>
                        <p className="mt-1 text-[12px] text-muted-foreground">
                          The seller's exact meeting location should be confirmed before pickup.
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

        <aside className="min-w-0 space-y-5 lg:sticky lg:top-24">
          <SellerCard listing={listing} />
          <ListingActions listing={listing} />
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
                misleading or unsafe through Gem State.
              </li>
            </ul>
          </section>
          <TrustSafetyCard listing={listing} />
        </aside>
      </div>

      {relatedQuery.data.listings.length > 0 && (
        <section className="mt-14 border-t border-border/70 pt-9">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-[23px] font-bold tracking-tight">
                {listing.seller
                  ? "More from this seller"
                  : `Similar ${isVehicle ? "vehicles" : "listings"}`}
              </h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {listing.seller
                  ? `Other listings from ${listing.seller.displayName}`
                  : `More options in ${listing.categoryName}`}
              </p>
            </div>
            <Link
              to="/browse"
              search={{ ...(listing.categorySlug ? { category: listing.categorySlug } : {}) }}
              className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline"
            >
              View all <CaretRight size={15} />
            </Link>
          </div>
          <div className="no-scrollbar mt-5 flex snap-x gap-4 overflow-x-auto pb-2">
            {relatedQuery.data.listings.map((related) => (
              <div key={related.id} className="w-[245px] shrink-0 snap-start sm:w-[280px]">
                <ListingCard listing={related} />
              </div>
            ))}
          </div>
        </section>
      )}
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
    /\b(month-to-month|\d+\s*(?:to|-|–)\s*\d+\s*months?|\d+\s*months?)\b/i,
  )?.[1];
  const isRental =
    home?.mode === "rent" ||
    (home?.mode !== "buy" &&
      home?.mode !== "build" &&
      (listing.priceCents < 1_000_000 || /rent|rental|lease|per month|\/\s*mo/i.test(source)));

  return {
    bedrooms:
      home?.bedrooms != null
        ? `${home.bedrooms} ${home.bedrooms === 1 ? "bed" : "beds"}`
        : bedrooms
          ? `${bedrooms} ${Number(bedrooms) === 1 ? "bed" : "beds"}`
          : "Ask seller",
    bathrooms:
      home?.bathrooms != null
        ? `${home.bathrooms} ${home.bathrooms === 1 ? "bath" : "baths"}`
        : bathrooms
          ? `${bathrooms} ${Number(bathrooms) === 1 ? "bath" : "baths"}`
          : "Ask seller",
    squareFeet:
      home?.squareFeet != null
        ? `${home.squareFeet.toLocaleString()} sq ft`
        : squareFeet
          ? `${squareFeet} sq ft`
          : "Ask seller",
    availability,
    pets,
    smoking,
    leaseLength: home?.leaseLength ?? parsedLeaseLength ?? "Confirm with seller",
    propertyType: home?.propertyType ?? "Ask seller",
    yearBuilt: home?.yearBuilt != null ? String(home.yearBuilt) : "Ask seller",
    sellerType: home?.sellerType ?? listing.seller?.sellerType ?? "Ask seller",
    utilities: home?.utilities ?? [],
    amenities: home?.amenities ?? [],
    openHouse: home?.openHouse ?? null,
    community: home?.community ?? null,
    schoolDistrict: home?.schoolDistrict ?? "Ask seller",
    acreage: home?.acreage ?? "Ask seller",
    heating: home?.heating ?? "Ask seller",
    cooling: home?.cooling ?? "Ask seller",
    garageParking: home?.garageParking ?? "Ask seller",
    yard: home?.yard ?? "Ask seller",
    appliancesIncluded: home?.appliancesIncluded ?? "Ask seller",
    basementType: home?.basementType ?? "Ask seller",
    floorCoverings: home?.floorCoverings ?? "Ask seller",
    exteriorMaterial: home?.exteriorMaterial ?? "Ask seller",
    specialFeatures: home?.specialFeatures ?? "Ask seller",
    hoaFees: home?.hoaFees ?? "N/A",
    isRental,
  };
}

function HomeFactCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card px-4 py-3.5">
      <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-[14px] font-semibold">{value}</p>
    </div>
  );
}

function HomeLocationPanel({
  listing,
  locationQuery,
}: {
  listing: ClassifiedDetail;
  locationQuery: string;
}) {
  return (
    <section className="soft-card overflow-hidden">
      <div className="relative h-[210px] overflow-hidden bg-[#e8edf2]">
        <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(35deg,transparent_46%,#fff_47%,#fff_49%,transparent_50%),linear-gradient(120deg,transparent_44%,#fff_45%,#fff_47%,transparent_48%),linear-gradient(#d8e0e7_1px,transparent_1px),linear-gradient(90deg,#d8e0e7_1px,transparent_1px)] [background-size:180px_140px,220px_180px,34px_34px,34px_34px]" />
        <div className="absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-brand-warm text-white shadow-lg ring-8 ring-brand-warm/20">
          <MapPin size={24} weight="fill" />
        </div>
      </div>
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[12px] font-semibold">
            {listing.city}, {listing.state}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Confirm the exact address and tour details with the seller.
          </p>
        </div>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${locationQuery}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-[12px] font-semibold text-primary-foreground hover:opacity-90"
        >
          <MapTrifold size={15} /> Open map
        </a>
      </div>
    </section>
  );
}

function HomeRentalInformation({
  listing,
  description,
}: {
  listing: ClassifiedDetail;
  description: string;
}) {
  const [activeTab, setActiveTab] = useState<"description" | "amenities">("description");
  const details = homeRentalDetails(listing, description);
  const utilityRows =
    details.utilities.length > 0
      ? details.utilities.map(({ label, paidBy }) => [label, paidBy])
      : [["Utilities", "Confirm with seller"]];
  const amenityRows =
    details.amenities.length > 0
      ? details.amenities
      : [
          `Bedrooms: ${details.bedrooms}`,
          `Bathrooms: ${details.bathrooms}`,
          `Square feet: ${details.squareFeet}`,
          ...(details.isRental ? [`Pets: ${details.pets}`, `Smoking: ${details.smoking}`] : []),
          "Additional amenities: Ask seller",
        ];

  return (
    <section className="soft-card overflow-hidden">
      <div
        className="flex gap-1 border-b border-border/70 bg-secondary/35 p-2"
        role="tablist"
        aria-label="Home information"
      >
        {(["description", "amenities"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-xl px-5 py-2.5 text-[12.5px] font-semibold capitalize transition ${activeTab === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {tab === "amenities" ? "Home amenities" : "Description"}
          </button>
        ))}
      </div>
      <div className="p-5 sm:p-7">
        {activeTab === "description" ? (
          <div>
            <h2 className="text-[21px] font-bold">Description</h2>
            <p className="mt-5 whitespace-pre-line text-[14px] leading-7 text-muted-foreground">
              {description || "The seller has not added a description yet."}
            </p>
            {details.isRental ? (
              <>
                <div className="mt-8 border-t border-border/70 pt-6">
                  <h3 className="text-[18px] font-bold">Who pays utilities</h3>
                  <dl className="mt-3 divide-y divide-border/70 text-[13px]">
                    {utilityRows.map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between gap-4 py-3">
                        <dt>{label}</dt>
                        <dd className="font-semibold text-muted-foreground">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="mt-8 border-t border-border/70 pt-6">
                  <h3 className="text-[18px] font-bold">Lease terms</h3>
                  <dl className="mt-3 divide-y divide-border/70 text-[13px]">
                    <div className="flex items-center justify-between gap-4 py-3">
                      <dt>Lease length</dt>
                      <dd className="font-semibold text-muted-foreground">{details.leaseLength}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <dt>Security deposit</dt>
                      <dd className="font-semibold text-muted-foreground">Confirm with seller</dd>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <dt>Available</dt>
                      <dd className="font-semibold text-muted-foreground">
                        {details.availability}
                      </dd>
                    </div>
                  </dl>
                </div>
              </>
            ) : (
              <div className="mt-8 border-t border-border/70 pt-6">
                <h3 className="text-[18px] font-bold">Property details</h3>
                <dl className="mt-3 divide-y divide-border/70 text-[13px]">
                  {[
                    ["Property type", details.propertyType],
                    ["Seller type", details.sellerType],
                    ["School district", details.schoolDistrict],
                    ["Year built", details.yearBuilt],
                    ["Acreage", details.acreage],
                    ["Heating", details.heating],
                    ["Cooling", details.cooling],
                    ["Garage/Parking", details.garageParking],
                    ["Yard", details.yard],
                    ["Appliances included", details.appliancesIncluded],
                    ["Basement type", details.basementType],
                    ["Floor coverings", details.floorCoverings],
                    ["Exterior material", details.exteriorMaterial],
                    ["Special features", details.specialFeatures],
                    ["HOA fees", details.hoaFees],
                    ...(details.openHouse ? [["Open house", details.openHouse]] : []),
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-4 py-3">
                      <dt>{label}</dt>
                      <dd className="text-right font-semibold text-muted-foreground">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        ) : (
          <div>
            <h2 className="text-[21px] font-bold">Home amenities</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              Amenities and inclusions should be confirmed with the seller before applying, signing
              a lease, or making an offer.
            </p>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {amenityRows.map((amenity) => (
                <li
                  key={amenity}
                  className="flex items-start gap-2 rounded-xl border border-border/70 bg-secondary/35 px-3.5 py-3 text-[13px]"
                >
                  <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-primary" />
                  {amenity}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function HomeSafetyPanel({ isRental }: { isRental: boolean }) {
  return (
    <section className="rounded-2xl border border-brand-warm/50 bg-brand-warm/10 px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[18px] font-bold">Important safety tip</h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
          <ShieldCheck size={13} weight="fill" /> GemList Safety
        </span>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
        {isRental
          ? "Never send a deposit before touring the home and verifying the owner or property manager. Review the lease, fees, utilities, and application process before paying."
          : "Never send money before touring the home and verifying ownership. Review disclosures, fees, inspection details, and the offer terms before making a payment."}
      </p>
      <Link
        to="/contact"
        className="mt-4 inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-primary/40 px-4 text-[12px] font-semibold text-primary hover:bg-primary/5"
      >
        <Flag size={14} /> Flag this listing
      </Link>
    </section>
  );
}

function HomeListingDetail({
  listing,
  title,
  description,
  locationQuery,
  relatedListings,
  handleShare,
}: {
  listing: ClassifiedDetail;
  title: string;
  description: string;
  locationQuery: string;
  relatedListings: ClassifiedCard[];
  handleShare: () => Promise<void>;
}) {
  const details = homeRentalDetails(listing, description);
  const price = formatUsd(listing.priceCents).replace(/\.00$/, "");
  const homeTab = details.isRental ? "rent" : "buy";

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
        <Link
          to="/browse"
          search={{ category: "other-real-estate", homeMode: "results", homeTab }}
          className="hover:text-foreground"
        >
          Homes
        </Link>
        <CaretRight size={13} />
        <span className="text-foreground">
          {listing.city}, {listing.state}
        </span>
      </nav>

      <header className="mt-5 border-b border-border/70 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            {details.community && (
              <a
                href="#community-homes"
                className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary hover:underline"
              >
                Part of the {details.community.name} community
              </a>
            )}
            <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight sm:text-[38px]">
              {title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-muted-foreground">
              <span className="flex items-center gap-1.5 text-primary">
                <MapPin size={15} weight="fill" /> {listing.city}, {listing.state}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock size={15} /> Posted {postedAge(listing.createdAt).toLowerCase()}
              </span>
              <span className="flex items-center gap-1.5">
                <Eye size={15} /> Local listing
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <WatchHeartButton
              productId={listing.productId}
              productSlug={listing.productSlug}
              productName={title}
              isDemo={listing.isMock === true}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            />
            <button
              type="button"
              aria-label="Share listing"
              onClick={() => void handleShare()}
              className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground"
            >
              <ShareNetwork size={18} />
            </button>
            <button
              type="button"
              aria-label="Print listing"
              onClick={() => window.print()}
              className="hidden h-10 w-10 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground sm:grid"
            >
              <Printer size={18} />
            </button>
          </div>
        </div>
        <p className="numeric mt-4 text-[30px] font-bold leading-none text-brand-warm sm:text-[34px]">
          {price}
          {details.isRental ? " / mo." : ""}
        </p>
      </header>

      <div className="mt-6 grid gap-7 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,370px)] lg:items-start">
        <div className="min-w-0 space-y-7">
          <Gallery listing={listing} />
          <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Key home facts">
            <HomeFactCard label="Bedrooms" value={details.bedrooms} />
            <HomeFactCard label="Bathrooms" value={details.bathrooms} />
            <HomeFactCard label="Square feet" value={details.squareFeet} />
            <HomeFactCard
              label={details.isRental ? "Availability" : "Status"}
              value={details.isRental ? details.availability : "For sale"}
            />
          </section>
          <HomeLocationPanel listing={listing} locationQuery={locationQuery} />
          <HomeRentalInformation listing={listing} description={description} />
          <HomeSafetyPanel isRental={details.isRental} />
        </div>

        <aside className="min-w-0 space-y-5 lg:sticky lg:top-24">
          <SellerCard listing={listing} />
          <ListingActions
            listing={listing}
            showPaymentCalculator={!details.isRental}
            calculatorVariant="mortgage"
            showPriceHeader={false}
          />
          <PageStatsCard listing={listing} />
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

      {relatedListings.length > 0 && (
        <section className="mt-14 border-t border-border/70 pt-9">
          <h2 className="text-[23px] font-bold tracking-tight">More listings like this</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Other homes and rentals in this category
          </p>
          <div className="no-scrollbar mt-5 flex snap-x gap-4 overflow-x-auto pb-2">
            {relatedListings.map((related) => (
              <div key={related.id} className="w-[245px] shrink-0 snap-start sm:w-[280px]">
                <ListingCard listing={related} />
              </div>
            ))}
          </div>
        </section>
      )}
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
  relatedListings,
  handleShare,
}: {
  listing: ClassifiedDetail;
  title: string;
  locationQuery: string;
  relatedListings: ClassifiedCard[];
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
        <span className="text-foreground">
          {listing.city}, {listing.state}
        </span>
      </nav>

      <header className="mt-5 border-b border-border/70 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-bold leading-tight tracking-tight sm:text-[38px]">
              {title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-muted-foreground">
              <span className="flex items-center gap-1.5 text-primary">
                <MapPin size={15} weight="fill" /> {listing.city}, {listing.state}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock size={15} /> Posted {postedAge(listing.createdAt).toLowerCase()}
              </span>
              <span className="flex items-center gap-1.5">
                <Eye size={15} /> Local listing
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {listing.isMock ? (
              <button
                type="button"
                aria-label="Save listing"
                onClick={() => toast.info("Saving is shown here in the mock listing preview.")}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Heart size={18} />
              </button>
            ) : (
              <WatchHeartButton
                productId={listing.productId}
                productSlug={listing.productSlug}
                productName={title}
                isDemo={false}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              />
            )}
            <button
              type="button"
              aria-label="Share listing"
              onClick={() => void handleShare()}
              className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground"
            >
              <ShareNetwork size={18} />
            </button>
            <button
              type="button"
              aria-label="Print listing"
              onClick={() => window.print()}
              className="hidden h-10 w-10 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground sm:grid"
            >
              <Printer size={18} />
            </button>
          </div>
        </div>
        <p className="numeric mt-4 text-[30px] font-bold leading-none text-brand-warm sm:text-[34px]">
          {details.payRange}
        </p>
      </header>

      <div className="mt-6 grid gap-7 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,370px)] lg:items-start">
        <div className="min-w-0 space-y-7">
          <Gallery listing={listing} />

          <section className="soft-card overflow-hidden">
            <div
              className="flex gap-1 border-b border-border/70 bg-secondary/35 p-2"
              role="tablist"
              aria-label="Job information"
            >
              {(["description", "specifications", "map"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-xl px-5 py-2.5 text-[12.5px] font-semibold capitalize transition ${activeTab === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
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
                    {[
                      ["Pay range", details.payRange],
                      ["Pay type", details.payType],
                      ["Employment type", details.employmentType],
                      ["Years of experience", details.experienceRequired],
                      ["Education level", details.educationLevel],
                    ].map(([label, value]) => (
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
                    {listing.city}, {listing.state}
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

        <aside className="min-w-0 space-y-5 lg:sticky lg:top-24">
          <SellerCard listing={listing} />
          <ListingActions
            listing={listing}
            showPaymentCalculator={false}
            showPriceHeader={false}
            ctaVerb="apply"
          />
          <PageStatsCard listing={listing} />
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

      {relatedListings.length > 0 && (
        <section className="mt-14 border-t border-border/70 pt-9">
          <h2 className="text-[23px] font-bold tracking-tight">More jobs like this</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">Other listings in this category</p>
          <div className="no-scrollbar mt-5 flex snap-x gap-4 overflow-x-auto pb-2">
            {relatedListings.map((related) => (
              <div key={related.id} className="w-[245px] shrink-0 snap-start sm:w-[280px]">
                <ListingCard listing={related} />
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function GeneralListingDetail({
  listing,
  title,
  condition,
  description,
  locationQuery,
  relatedListings,
  handleShare,
}: {
  listing: ClassifiedDetail;
  title: string;
  condition: string;
  description: string;
  locationQuery: string;
  relatedListings: ClassifiedCard[];
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
        <span className="text-foreground">
          {listing.city}, {listing.state}
        </span>
      </nav>

      <div className="mt-5 grid gap-7 lg:grid-cols-[minmax(255px,330px)_minmax(0,1fr)] lg:items-start">
        <aside className="order-2 min-w-0 space-y-5 lg:order-1 lg:sticky lg:top-24">
          <header>
            <h1 className="text-[28px] font-bold leading-tight tracking-tight sm:text-[36px]">
              {title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12.5px] text-muted-foreground">
              <span className="flex items-center gap-1.5 text-primary">
                <MapPin size={15} weight="fill" /> {listing.city}, {listing.state}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock size={15} /> Posted {postedAge(listing.createdAt).toLowerCase()}
              </span>
              <span className="flex items-center gap-1.5">
                <Eye size={15} /> Local listing
              </span>
            </div>
            <p className="numeric mt-4 text-[32px] font-bold leading-none text-primary">
              {listing.service?.pricing ?? formatUsd(listing.priceCents)}
            </p>
            <div className="mt-5 flex items-center gap-2">
              {listing.isMock ? (
                <button
                  type="button"
                  aria-label="Save listing"
                  onClick={() => toast.info("Saving is shown here in the mock listing preview.")}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Heart size={18} />
                </button>
              ) : (
                <WatchHeartButton
                  productId={listing.productId}
                  productSlug={listing.productSlug}
                  productName={title}
                  isDemo={false}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                />
              )}
              <button
                type="button"
                aria-label="Share listing"
                onClick={() => void handleShare()}
                className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground"
              >
                <ShareNetwork size={18} />
              </button>
              <button
                type="button"
                aria-label="Print listing"
                onClick={() => window.print()}
                className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground"
              >
                <Printer size={18} />
              </button>
            </div>
          </header>

          <SellerCard listing={listing} />
          <ListingActions listing={listing} showPaymentCalculator={false} showPriceHeader={false} />
          <PageStatsCard listing={listing} />
          <TrustSafetyCard listing={listing} />
        </aside>

        <div className="order-1 min-w-0 space-y-7 lg:order-2">
          <Gallery listing={listing} />

          <section className="soft-card overflow-hidden">
            <div
              className="flex gap-1 border-b border-border/70 bg-secondary/35 p-2"
              role="tablist"
              aria-label="Listing information"
            >
              {(["description", "location"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  className={
                    activeTab === tab
                      ? "rounded-xl bg-card px-5 py-2.5 text-[12.5px] font-semibold capitalize text-foreground shadow-sm transition"
                      : "rounded-xl px-5 py-2.5 text-[12.5px] font-semibold capitalize text-muted-foreground transition hover:text-foreground"
                  }
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
                    <div className="mt-5">
                      <p className="text-[13px] font-semibold">Condition</p>
                      <span className="mt-2 inline-flex rounded-xl bg-secondary px-4 py-2 text-[13px] font-semibold shadow-sm">
                        {condition}
                      </span>
                    </div>
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
                  <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-border/70 bg-secondary/45 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <MapTrifold
                        size={25}
                        weight="duotone"
                        className="mt-0.5 shrink-0 text-primary"
                      />
                      <div>
                        <p className="font-semibold">
                          {listing.city}, {listing.state}
                        </p>
                        <p className="mt-1 text-[12px] text-muted-foreground">
                          Confirm the exact pickup or meeting location with the seller before you
                          go.
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
              )}
            </div>
          </section>

          {relatedListings.length > 0 && (
            <section className="border-t border-border/70 pt-9">
              <div>
                <h2 className="text-[23px] font-bold tracking-tight">You Might Also Like</h2>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Similar items from other sellers
                </p>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
                {relatedListings.map((related) => (
                  <ListingCard key={related.id} listing={related} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
