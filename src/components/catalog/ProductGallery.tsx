import { ArrowLeft, ArrowRight, ArrowsHorizontal, Cube } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { CatalogImage, CatalogModel } from "@/lib/catalog.functions";

type ProductGalleryProps = {
  images: CatalogImage[];
  model: CatalogModel | null;
  productName: string;
};

const ownedSpinFallbacks: Record<string, CatalogImage[]> = {
  "The Haunted Mansion Hatbox Ghost Popcorn Bucket": [
    {
      id: "hatbox-owned-000",
      src: "/images/products/launch-10/hatbox-ghost-spin/angle-000.jpg",
      alt: "Front view of The Haunted Mansion Hatbox Ghost popcorn bucket",
      isExample: false,
      viewRole: "spin",
      angleDegrees: 0,
    },
    {
      id: "hatbox-owned-045",
      src: "/images/products/launch-10/hatbox-ghost-spin/angle-045.jpg",
      alt: "Front-left view of The Haunted Mansion Hatbox Ghost popcorn bucket",
      isExample: false,
      viewRole: "spin",
      angleDegrees: 45,
    },
    {
      id: "hatbox-owned-090",
      src: "/images/products/launch-10/hatbox-ghost-spin/angle-090.jpg",
      alt: "Left-side view of The Haunted Mansion Hatbox Ghost popcorn bucket",
      isExample: false,
      viewRole: "spin",
      angleDegrees: 90,
    },
    {
      id: "hatbox-owned-135",
      src: "/images/products/launch-10/hatbox-ghost-spin/angle-135.jpg",
      alt: "Back-left view of The Haunted Mansion Hatbox Ghost popcorn bucket",
      isExample: false,
      viewRole: "spin",
      angleDegrees: 135,
    },
    {
      id: "hatbox-owned-180",
      src: "/images/products/launch-10/hatbox-ghost-spin/angle-180.jpg",
      alt: "Back view of The Haunted Mansion Hatbox Ghost popcorn bucket",
      isExample: false,
      viewRole: "spin",
      angleDegrees: 180,
    },
    {
      id: "hatbox-owned-225",
      src: "/images/products/launch-10/hatbox-ghost-spin/angle-225.jpg",
      alt: "Back-right view of The Haunted Mansion Hatbox Ghost popcorn bucket",
      isExample: false,
      viewRole: "spin",
      angleDegrees: 225,
    },
    {
      id: "hatbox-owned-315",
      src: "/images/products/launch-10/hatbox-ghost-spin/angle-315.jpg",
      alt: "Front-right view of The Haunted Mansion Hatbox Ghost popcorn bucket",
      isExample: false,
      viewRole: "spin",
      angleDegrees: 315,
    },
  ],
};

function wrapFrame(frame: number, total: number) {
  return ((frame % total) + total) % total;
}

export function ProductGallery({ images, model, productName }: ProductGalleryProps) {
  const spinFrames = useMemo(() => {
    const databaseFrames = images
      .filter(
        (image): image is CatalogImage & { angleDegrees: number } =>
          image.viewRole === "spin" && image.angleDegrees !== null,
      )
      .sort((a, b) => a.angleDegrees - b.angleDegrees);

    return databaseFrames.length >= 2
      ? databaseFrames
      : (ownedSpinFallbacks[productName] ?? databaseFrames);
  }, [images, productName]);
  const galleryImages = useMemo(
    () => images.filter((image) => image.viewRole === "gallery"),
    [images],
  );
  const hasSpin = spinFrames.length >= 2;
  const displayImages = hasSpin ? spinFrames : galleryImages.length > 0 ? galleryImages : images;
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewMode, setViewMode] = useState<"model" | "photo">(
    model && !hasSpin ? "model" : "photo",
  );
  const dragStart = useRef<{ x: number; frame: number } | null>(null);

  useEffect(() => {
    setActiveIndex(0);
    setViewMode(model && !hasSpin ? "model" : "photo");
  }, [hasSpin, images, model]);

  useEffect(() => {
    if (!model) return;
    void import("@google/model-viewer");
  }, [model]);

  useEffect(() => {
    if (!hasSpin) return;
    for (const frame of spinFrames) {
      const preload = new Image();
      preload.src = frame.src;
    }
  }, [hasSpin, spinFrames]);

  if (displayImages.length === 0 && !model) {
    return (
      <div className="product-placeholder relative flex aspect-[4/3] items-center justify-center">
        <div className="border border-border bg-card px-4 py-2 text-center">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-product-ink">
            Front shot - hero
          </p>
          <p className="mt-1.5 font-mono text-[9px] text-muted-foreground">Photography pending</p>
        </div>
      </div>
    );
  }

  const activeImage = displayImages[activeIndex] ?? displayImages[0];
  const activeAngle = hasSpin ? spinFrames[activeIndex]?.angleDegrees : null;
  const showModel = Boolean(model && viewMode === "model");

  function moveFrame(direction: number) {
    setActiveIndex((current) => wrapFrame(current + direction, displayImages.length));
  }

  return (
    <figure>
      <div className="relative">
        {model && !hasSpin && (
          <div
            className="absolute right-3 top-3 z-20 flex overflow-hidden border border-border bg-card/95 p-0.5 shadow-sm"
            aria-label="Choose product cover view"
          >
            <button
              type="button"
              aria-pressed={viewMode === "model"}
              onClick={() => setViewMode("model")}
              className={[
                "inline-flex h-7 items-center gap-1 px-2.5 font-mono text-[9px] uppercase tracking-[0.08em] transition-colors",
                viewMode === "model"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              <Cube aria-hidden="true" size={12} weight="duotone" />
              3D
            </button>
            <button
              type="button"
              aria-pressed={viewMode === "photo"}
              onClick={() => setViewMode("photo")}
              className={[
                "h-7 px-2.5 font-mono text-[9px] uppercase tracking-[0.08em] transition-colors",
                viewMode === "photo"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {hasSpin ? "360" : "Photo"}
            </button>
          </div>
        )}

        {showModel && model ? (
          <div className="relative aspect-[4/3] overflow-hidden bg-secondary">
            <model-viewer
              src={model.src}
              poster={model.posterSrc ?? activeImage?.src}
              alt={`Interactive 3D visualization of ${productName}`}
              camera-controls
              disable-pan
              interaction-prompt="auto"
              loading="eager"
              shadow-intensity="0.7"
              touch-action="pan-y"
              className="h-full w-full"
            />
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 border border-border bg-card/95 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.09em] text-product-ink">
              <ArrowsHorizontal aria-hidden="true" size={13} />
              Drag to rotate
            </span>
          </div>
        ) : activeImage ? (
          <div
            role={hasSpin ? "group" : undefined}
            aria-label={hasSpin ? `360 degree view of ${productName}` : undefined}
            tabIndex={hasSpin ? 0 : undefined}
            onKeyDown={(event) => {
              if (!hasSpin) return;
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                moveFrame(-1);
              }
              if (event.key === "ArrowRight") {
                event.preventDefault();
                moveFrame(1);
              }
            }}
            onPointerDown={(event) => {
              if (!hasSpin) return;
              dragStart.current = { x: event.clientX, frame: activeIndex };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!hasSpin || !dragStart.current) return;
              const pixelsPerFrame = Math.max(12, Math.min(32, 280 / spinFrames.length));
              const movedFrames = Math.round(
                (dragStart.current.x - event.clientX) / pixelsPerFrame,
              );
              setActiveIndex(wrapFrame(dragStart.current.frame + movedFrames, spinFrames.length));
            }}
            onPointerUp={(event) => {
              if (!hasSpin) return;
              dragStart.current = null;
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => {
              dragStart.current = null;
            }}
            className={[
              "relative flex aspect-[4/3] items-center justify-center overflow-hidden outline-none",
              "bg-white",
              hasSpin
                ? "cursor-ew-resize touch-pan-y select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                : "",
            ].join(" ")}
          >
            <img
              src={activeImage.src}
              alt={activeImage.alt}
              draggable={false}
              className={[
                "h-full w-full",
                hasSpin ? "pointer-events-none object-contain" : "object-contain p-4 sm:p-6",
              ].join(" ")}
            />

            {activeImage.isExample && (
              <span className="absolute left-3 top-3 border border-border bg-card/95 px-2 py-1 font-mono text-[8.5px] uppercase tracking-[0.1em] text-product-ink">
                Example photo
              </span>
            )}

            {hasSpin && (
              <>
                <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 border border-border bg-card/95 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.09em] text-product-ink">
                  <Cube aria-hidden="true" size={13} weight="duotone" />
                  360 view
                </span>
                <button
                  type="button"
                  aria-label="Show previous angle"
                  onClick={(event) => {
                    event.stopPropagation();
                    moveFrame(-1);
                  }}
                  className="absolute left-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center border border-border bg-card/95 text-foreground transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <ArrowLeft aria-hidden="true" size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Show next angle"
                  onClick={(event) => {
                    event.stopPropagation();
                    moveFrame(1);
                  }}
                  className="absolute right-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center border border-border bg-card/95 text-foreground transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <ArrowRight aria-hidden="true" size={16} />
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="product-placeholder flex aspect-[4/3] items-center justify-center">
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              Product photo pending
            </p>
          </div>
        )}
      </div>

      {showModel && model && (
        <figcaption className="border-t border-border bg-card px-3 py-2.5 text-[10.5px] leading-relaxed text-muted-foreground">
          {model.disclosure}. Shape and color may vary from the physical item; use the product photo
          for visual reference.
        </figcaption>
      )}

      {!showModel && hasSpin && (
        <figcaption className="flex items-center justify-between gap-3 border-t border-border bg-card px-3 py-2.5">
          <span className="inline-flex items-center gap-1.5 text-[10.5px] font-medium text-foreground">
            <ArrowsHorizontal aria-hidden="true" size={14} />
            Drag or swipe to rotate
          </span>
          <span className="numeric text-[10px] text-muted-foreground" aria-live="polite">
            {activeAngle}° · {activeIndex + 1}/{spinFrames.length}
          </span>
        </figcaption>
      )}

      {!showModel && !hasSpin && galleryImages.length > 1 && (
        <figcaption className="flex gap-2 overflow-x-auto border-t border-border bg-card p-2">
          {galleryImages.map((image, index) => (
            <button
              key={image.id}
              type="button"
              aria-label={`Show image ${index + 1} of ${galleryImages.length}`}
              aria-pressed={activeIndex === index}
              onClick={() => setActiveIndex(index)}
              className={[
                "size-14 shrink-0 overflow-hidden border bg-white transition-colors",
                activeIndex === index
                  ? "border-primary"
                  : "border-border hover:border-border-strong",
              ].join(" ")}
            >
              <img src={image.src} alt="" className="h-full w-full object-contain p-1" />
            </button>
          ))}
        </figcaption>
      )}

      {!showModel && activeImage?.isExample && (
        <figcaption className="border-t border-border px-3 py-2 text-[10.5px] leading-relaxed text-muted-foreground">
          Layout-preview image supplied for this demo record. It is not a photograph of the product
          described on this page.
        </figcaption>
      )}
    </figure>
  );
}
