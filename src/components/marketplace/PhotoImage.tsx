import { forwardRef, useCallback, useEffect, useState, type ImgHTMLAttributes } from "react";
import { ImageBroken } from "@phosphor-icons/react";

/** Retains the photo's footprint through loading, cached loads, and failures. */
export const PhotoImage = forwardRef<HTMLImageElement, ImgHTMLAttributes<HTMLImageElement>>(
  function PhotoImage({ className = "", onLoad, onError, src, ...props }, forwarded) {
    // SSR images remain visible without JavaScript; fade is a client enhancement.
    const [hydrated, setHydrated] = useState(false);
    useEffect(() => setHydrated(true), []);
    const [state, setState] = useState<{ src: typeof src; status: "loading" | "ready" | "error" }>({
      src,
      status: "loading",
    });
    const status = state.src === src ? state.status : "loading";
    const ref = useCallback(
      (image: HTMLImageElement | null) => {
        if (typeof forwarded === "function") forwarded(image);
        else if (forwarded) forwarded.current = image;
        if (image?.complete) setState({ src, status: image.naturalWidth ? "ready" : "error" });
      },
      [src, forwarded],
    );
    return (
      <span
        className="marketplace-photo relative block h-full w-full overflow-hidden"
        data-photo-state={status}
      >
        {status === "loading" && (
          <span
            aria-hidden="true"
            className="absolute inset-0 animate-pulse bg-secondary motion-reduce:animate-none"
          />
        )}
        {status === "error" && (
          <span
            role="img"
            aria-label="Photo unavailable"
            className="absolute inset-0 grid place-items-center bg-secondary text-muted-foreground"
          >
            <ImageBroken size={24} aria-hidden="true" />
          </span>
        )}
        <img
          {...props}
          src={src}
          ref={ref}
          className={`relative ${className} transition-opacity duration-200 motion-reduce:transition-none ${status === "ready" || (!hydrated && status !== "error") ? "opacity-100" : "opacity-0"}`}
          onLoad={(event) => {
            setState({ src, status: "ready" });
            onLoad?.(event);
          }}
          onError={(event) => {
            setState({ src, status: "error" });
            onError?.(event);
          }}
        />
      </span>
    );
  },
);
