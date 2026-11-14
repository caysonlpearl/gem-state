import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowClockwise, ArrowDown } from "@phosphor-icons/react";
import type { MobileHome } from "../../../src/lib/mobile-contract";
import { readPublicHome } from "./home-startup";

const threshold = 68;
const atHome = () => ["", "#", "#/"].includes(location.hash);
/** A Home-only gesture; horizontal rails, forms, pinch zoom and other pages
 * keep their normal behavior. No provider refreshes or account writes. */
export function HomeRefresh({ onData }: { onData: (home: MobileHome) => void }) {
  const [pull, setPull] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const apply = useRef(onData),
    request = useRef<AbortController | null>(null);
  apply.current = onData;
  useEffect(() => {
    const page = document.getElementById("native-page-surface");
    if (!page) return;
    const distance = busy ? 72 : pull;
    if (!distance && !page.style.transform) return;
    page.style.transition = pull > 0 && !busy ? "none" : "transform 180ms ease-out";
    page.style.transform = `translateY(${distance}px)`;
    const timer =
      distance === 0
        ? setTimeout(() => {
            page.style.removeProperty("transform");
            page.style.removeProperty("transition");
          }, 200)
        : undefined;
    return () => clearTimeout(timer);
  }, [pull, busy]);
  useEffect(
    () => () => {
      const page = document.getElementById("native-page-surface");
      page?.style.removeProperty("transform");
      page?.style.removeProperty("transition");
    },
    [],
  );
  const refresh = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    let alive = true,
      start: { x: number; y: number } | null = null,
      distance = 0,
      dragged = false;
    refresh.current = async () => {
      if (request.current || !alive || !atHome()) return;
      const controller = new AbortController();
      request.current = controller;
      setBusy(true);
      setError("");
      setPull(0);
      try {
        const home = await readPublicHome(controller.signal);
        if (alive && !controller.signal.aborted) apply.current(home);
      } catch (e) {
        if (alive && !controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Listings could not refresh. Please retry.");
      } finally {
        if (request.current === controller) request.current = null;
        if (alive) setBusy(false);
      }
    };
    const reset = () => {
      start = null;
      distance = 0;
      dragged = false;
      setPull(0);
    };
    const begin = (event: TouchEvent) => {
      dragged = false;
      const target = event.target instanceof Element ? event.target : null;
      if (
        request.current ||
        !atHome() ||
        window.scrollY > 1 ||
        event.touches.length !== 1 ||
        target?.closest("input,textarea,select,[contenteditable=true],[role=dialog],nav")
      )
        return;
      const point = event.touches[0];
      start = { x: point.clientX, y: point.clientY };
    };
    const move = (event: TouchEvent) => {
      if (!start) return;
      if (event.touches.length !== 1) {
        reset();
        return;
      }
      const point = event.touches[0],
        dx = Math.abs(point.clientX - start.x),
        dy = point.clientY - start.y;
      if (dx > 12 && dx >= Math.abs(dy)) {
        reset();
        return;
      }
      if (dy < 0 || window.scrollY > 1) {
        reset();
        return;
      }
      if (dy <= 10) return;
      if (event.cancelable) event.preventDefault();
      dragged = true;
      distance = Math.min(96, dy * 0.5);
      setPull(distance);
    };
    const end = (event: TouchEvent) => {
      const ready = distance >= threshold;
      if (dragged && event.cancelable) event.preventDefault();
      reset();
      if (ready) void refresh.current();
    };
    const command = () => {
      void refresh.current();
    };
    document.addEventListener("touchstart", begin, { passive: true });
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", end, { passive: false });
    document.addEventListener("touchcancel", reset);
    window.addEventListener("bluebird-home-refresh", command);
    return () => {
      alive = false;
      request.current?.abort();
      request.current = null;
      document.removeEventListener("touchstart", begin);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", reset);
      window.removeEventListener("bluebird-home-refresh", command);
    };
  }, []);
  return (
    <>
      <button
        type="button"
        onClick={() => void refresh.current()}
        disabled={busy}
        className="sr-only focus:not-sr-only focus:fixed focus:left-1/2 focus:top-20 focus:z-50 focus:min-h-11 focus:-translate-x-1/2 focus:rounded-full focus:bg-card focus:px-5 focus:shadow-lg"
      >
        Refresh homepage listings
      </button>
      {(busy || pull > 0) &&
        createPortal(
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+16px)] z-0 flex h-11 w-11 -translate-x-1/2 items-center justify-center text-primary"
          >
            {busy ? (
              <ArrowClockwise size={24} className="animate-spin motion-reduce:animate-none" />
            ) : (
              <ArrowDown
                size={24}
                style={{ transform: `rotate(${Math.min(180, (pull / threshold) * 180)}deg)` }}
              />
            )}
            <span className="sr-only">
              {busy
                ? "Refreshing listings…"
                : pull >= threshold
                  ? "Release to refresh"
                  : "Pull to refresh"}
            </span>
          </div>,
          document.body,
        )}
      {error && (
        <p role="alert" className="mx-3 mt-3 text-sm text-destructive">
          {error}{" "}
          <button
            type="button"
            className="min-h-11 underline"
            onClick={() => void refresh.current()}
          >
            Retry refresh
          </button>
        </p>
      )}
    </>
  );
}
