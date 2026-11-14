import { useLayoutEffect, useRef } from "react";

/** Keep the header/footer stationary. Returning Home and history-back reverse
 * the listing push; do not remount persistent feeds just to animate them. */
export function RouteMotion({ path }: { path: string }) {
  const prior = useRef({ path, index: history.state?.bluebirdNavigationIndex ?? 0 });
  useLayoutEffect(() => {
    const before = prior.current;
    const index = history.state?.bluebirdNavigationIndex ?? 0;
    prior.current = { path, index };
    if (path === before.path) return;
    const content = document.getElementById("main-content");
    if (!content) return;
    const back = index < before.index || (path === "/" && before.path !== "/");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animation = content.animate(
      reduced
        ? [{ opacity: 0.7 }, { opacity: 1 }]
        : [{ transform: `translateX(${back ? "-" : ""}100%)` }, { transform: "translateX(0)" }],
      { duration: reduced ? 100 : 260, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
    return () => animation.cancel();
  }, [path]);
  return null;
}
