import { useEffect, useRef } from "react";
import { ArrowClockwise } from "@phosphor-icons/react";

export function NativeAutoLoad({
  enabled,
  loading = false,
  onLoad,
}: {
  enabled: boolean;
  loading?: boolean;
  onLoad: () => Promise<void>;
}) {
  const sentinel = useRef<HTMLDivElement>(null),
    load = useRef(onLoad);
  const allowed = useRef(enabled),
    visible = useRef(enabled || loading),
    pending = useRef(false);
  load.current = onLoad;
  allowed.current = enabled;
  visible.current = enabled || loading;
  const trigger = useRef<() => Promise<void>>(async () => {});
  trigger.current = async () => {
    if (!allowed.current || pending.current) return;
    pending.current = true;
    try {
      await load.current();
    } finally {
      pending.current = false;
    }
  };
  useEffect(() => {
    if (!enabled || !sentinel.current) return;
    let active = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (active && entries.some((entry) => entry.isIntersecting)) {
          active = false;
          observer.disconnect();
          void trigger.current();
        }
      },
      { rootMargin: "0px 0px 450px 0px" },
    );
    observer.observe(sentinel.current);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [enabled, onLoad]);
  useEffect(() => {
    let start: { x: number; y: number } | null = null,
      distance = 0;
    const page = document.getElementById("native-page-surface");
    if (!page) return;
    const reset = () => {
      start = null;
      distance = 0;
      page.removeAttribute("data-native-bottom-dragging");
      page.style.removeProperty("--native-bottom-translate");
    };
    const begin = (event: TouchEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        !visible.current ||
        event.touches.length !== 1 ||
        window.scrollY + window.innerHeight < document.documentElement.scrollHeight - 8 ||
        target?.closest("input,textarea,select,[contenteditable=true],[role=dialog],nav")
      )
        return;
      const touch = event.touches[0];
      start = { x: touch.clientX, y: touch.clientY };
    };
    const move = (event: TouchEvent) => {
      if (!start) return;
      if (!visible.current || event.touches.length !== 1) {
        reset();
        return;
      }
      const touch = event.touches[0],
        dy = start.y - touch.clientY,
        dx = Math.abs(start.x - touch.clientX);
      if (dy < 0 || dx > dy) {
        reset();
        return;
      }
      if (dy < 10) return;
      if (event.cancelable) event.preventDefault();
      distance = Math.min(48, dy * 0.4);
      page.setAttribute("data-native-bottom-dragging", "");
      page.style.setProperty("--native-bottom-translate", `0 -${distance}px`);
    };
    const end = () => {
      const ready = distance >= 32;
      reset();
      if (ready) void trigger.current();
    };
    document.addEventListener("touchstart", begin, { passive: true });
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", end);
    document.addEventListener("touchcancel", reset);
    return () => {
      reset();
      document.removeEventListener("touchstart", begin);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", reset);
    };
  }, []);
  return (
    <div
      ref={sentinel}
      className="native-load-more"
      data-inactive={!enabled && !loading ? "" : undefined}
      role={loading ? "status" : undefined}
      aria-live="polite"
    >
      {loading && (
        <>
          <ArrowClockwise
            size={20}
            aria-hidden="true"
            className="animate-spin motion-reduce:animate-none"
          />
          <span>Loading more listings…</span>
        </>
      )}
    </div>
  );
}
