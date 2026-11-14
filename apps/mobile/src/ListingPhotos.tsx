import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, DotsThree, ShareNetwork } from "@phosphor-icons/react";
import { Popover, PopoverContent, PopoverTrigger } from "../../../src/components/ui/popover";
import { ListingGallery } from "../../../src/components/classifieds/ListingGallery";
import type { ClassifiedDetail } from "../../../src/lib/classifieds.functions";
import { backWithinApp } from "./native-navigation";
import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "../../../src/components/ui/dialog";

/** Scroll snap leaves vertical scrolling and the system's edge-back gesture
 * alone. Buttons give keyboard and assistive-technology users the same gallery. */
export function NativeListingPhotos({
  listing,
  save,
  more,
  onShare,
  onPhoto,
}: {
  listing: ClassifiedDetail;
  save: ReactNode;
  more: ReactNode;
  onShare: () => Promise<void>;
  onPhoto: (index: number) => void;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const images = listing.images;
  const show = (index: number) => {
    const node = rail.current;
    if (!node) return;
    node.scrollTo({
      left: index * node.clientWidth,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  };
  const control =
    "flex h-11 w-11 items-center justify-center rounded-full bg-card/95 text-foreground shadow-sm";
  return (
    <Dialog>
      <section
        className="native-listing-photos relative mx-auto max-w-[1360px] bg-secondary"
        aria-label="Listing photos"
      >
        {images.length ? (
          <div
            ref={rail}
            className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
            onScroll={() => {
              const node = rail.current;
              if (!node?.clientWidth) return;
              const next = Math.max(
                0,
                Math.min(images.length - 1, Math.round(node.scrollLeft / node.clientWidth)),
              );
              if (next !== active) {
                setActive(next);
                onPhoto(next);
              }
            }}
          >
            {images.map((image, index) => (
              <DialogTrigger asChild key={`${index}:${image.url}`}>
                <button
                  type="button"
                  aria-label={`Open listing photo ${index + 1}`}
                  className="native-photo-slide shrink-0 snap-center"
                >
                  <img
                    src={image.url}
                    alt={image.alt || `${listing.title}, photo ${index + 1}`}
                    fetchPriority={index === 0 ? "high" : "auto"}
                    loading={index < 2 ? "eager" : "lazy"}
                    draggable={false}
                    className="h-full w-full object-contain"
                  />
                </button>
              </DialogTrigger>
            ))}
          </div>
        ) : (
          <div className="native-photo-placeholder">
            <ListingGallery listing={listing} />
          </div>
        )}
        <div className="absolute inset-x-3 top-3 flex items-start justify-between">
          <button
            type="button"
            className={control}
            aria-label="Go back"
            onClick={() => {
              if (!backWithinApp()) location.hash = "/";
            }}
          >
            <ArrowLeft size={22} />
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              className={control}
              aria-label="Share listing"
              onClick={() => void onShare()}
            >
              <ShareNetwork size={21} />
            </button>
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className={control} aria-label="More listing options">
                  <DotsThree size={25} weight="bold" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-60">
                {more}
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <div className="absolute bottom-3 right-3">{save}</div>
        {images.length > 1 && (
          <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-card/95 px-1 text-foreground shadow-sm">
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center"
              aria-label="Previous listing photo"
              disabled={active === 0}
              onClick={() => show(active - 1)}
            >
              <ArrowLeft size={17} />
            </button>
            <span
              role="status"
              aria-live="polite"
              className="min-w-12 text-center text-xs tabular-nums"
            >
              {active + 1} / {images.length}
            </span>
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center"
              aria-label="Next listing photo"
              disabled={active === images.length - 1}
              onClick={() => show(active + 1)}
            >
              <ArrowRight size={17} />
            </button>
          </div>
        )}
      </section>
      <DialogContent className="max-h-[85dvh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Listing photos</DialogTitle>
          <DialogDescription>{listing.title}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {images.map((image, index) => (
            <img
              key={`${index}:${image.url}`}
              src={image.url}
              alt={image.alt || `${listing.title}, photo ${index + 1}`}
              loading="lazy"
              className="max-h-[75dvh] w-full object-contain"
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
