import { useEffect, useRef } from "react";

export function NativeAutoLoad({
  enabled,
  onLoad,
}: {
  enabled: boolean;
  onLoad: () => Promise<void>;
}) {
  const sentinel = useRef<HTMLDivElement>(null),
    load = useRef(onLoad);
  load.current = onLoad;
  useEffect(() => {
    if (!enabled || !sentinel.current) return;
    let active = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (active && entries.some((entry) => entry.isIntersecting)) {
          active = false;
          observer.disconnect();
          void load.current();
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
  return <div ref={sentinel} className="h-px" aria-hidden="true" />;
}
