import { useEffect, useRef, useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowRight, MapPin, Star } from "@phosphor-icons/react";

/** Public profile facts only; no inferred verification or account claims. */
export function IdentityPeek({
  name,
  image,
  location,
  bio,
  rating,
  reviews,
  action,
}: {
  name: string;
  image?: string | null;
  location?: string;
  bio?: string | null;
  rating?: number | null;
  reviews?: number | null;
  action: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const pointerOpen = useRef(false);
  const enter = () => clearTimeout(timer.current);
  const leave = () => {
    if (pointerOpen.current) timer.current = setTimeout(() => setOpen(false), 180);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-left font-semibold underline-offset-4 hover:underline focus-visible:underline"
          aria-label={`About ${name}`}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") {
              enter();
              pointerOpen.current = true;
              setOpen(true);
            }
          }}
          onKeyDown={() => {
            pointerOpen.current = false;
            enter();
          }}
          onClick={(event) => {
            if (pointerOpen.current) {
              event.preventDefault();
              enter();
              setOpen(true);
            }
          }}
          onPointerLeave={leave}
        >
          {name}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={10}
        className="w-[min(304px,calc(100vw-32px))] rounded-2xl border-border/80 p-4 shadow-lg motion-reduce:animate-none"
        onOpenAutoFocus={(event) => {
          if (pointerOpen.current) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          if (pointerOpen.current) event.preventDefault();
        }}
        onPointerEnter={enter}
        onPointerLeave={leave}
      >
        <div className="flex items-center gap-3">
          {image ? (
            <img
              src={image}
              alt=""
              className="h-12 w-12 rounded-xl bg-secondary object-contain"
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
            />
          ) : null}
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold">{name}</p>
            {location && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin size={12} />
                {location}
              </p>
            )}
          </div>
        </div>
        {bio && (
          <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{bio}</p>
        )}
        {!!reviews && rating != null && (
          <p className="mt-3 flex items-center gap-1 text-xs">
            <Star size={13} weight="fill" />
            {rating.toFixed(1)} · {reviews} {reviews === 1 ? "review" : "reviews"}
          </p>
        )}
        <div
          className="mt-3 flex items-center gap-1 border-t border-border/70 pt-3 text-xs font-semibold text-primary"
          onClick={() => setOpen(false)}
        >
          {action}
          <ArrowRight size={13} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
