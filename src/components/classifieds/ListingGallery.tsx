import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PlaceholderMark } from "./ListingCardView";
import { listingLogoUrl, withoutLogo } from "@/lib/classifieds-display";
import { retailSavings } from "@/lib/retail-savings";
import type { ListingCardSummary } from "@/lib/listing-card-summary";
export type ListingGalleryModel = ListingCardSummary & { images: { url: string; alt: string }[] };
function GalleryPlaceholder({ listing }: { listing: ListingGalleryModel }) {
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
function GalleryLogo({ listing, logoUrl }: { listing: ListingGalleryModel; logoUrl: string }) {
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

export function ListingGallery({
  listing,
  onPhoto,
}: {
  listing: ListingGalleryModel;
  onPhoto?: (index: number) => void;
}) {
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
    onPhoto?.((next + images.length) % images.length);
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
          {retailSavings(listing) ? (
            <span className="absolute left-4 top-4 z-10 rounded-full bg-destructive px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-destructive-foreground shadow">
              {retailSavings(listing)!.percent}% off
            </span>
          ) : null}
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
              onClick={() => goToImage(index)}
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
