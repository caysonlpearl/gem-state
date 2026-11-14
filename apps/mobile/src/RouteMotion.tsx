import { useLayoutEffect, useRef } from "react";
type Transition = { skipTransition: () => void; finished: Promise<void>; ready?: Promise<void> };
const documentWithTransitions = () =>
  document as Document & { startViewTransition?: (update: () => void) => Transition };
let current: Transition | undefined;
export function commitNativeView(update: () => void, back: boolean) {
  current?.skipTransition();
  const doc = documentWithTransitions();
  if (typeof doc.startViewTransition !== "function") {
    update();
    return;
  }
  document.documentElement.dataset.routeDirection = back ? "back" : "forward";
  const transition = doc.startViewTransition(update);
  current = transition;
  void transition.ready?.catch(() => {});
  void transition.finished
    .catch(() => {})
    .finally(() => {
      if (current === transition) current = undefined;
    });
}

/** Keep the header/footer stationary. Returning Home and history-back reverse
 * the listing push; do not remount persistent feeds just to animate them. */
export function RouteMotion({ path }: { path: string }) {
  const prior = useRef({ path, index: history.state?.bluebirdNavigationIndex ?? 0 });
  useLayoutEffect(() => {
    const before = prior.current;
    const index = history.state?.bluebirdNavigationIndex ?? 0;
    prior.current = { path, index };
    if (path === before.path) return;
    if (typeof documentWithTransitions().startViewTransition === "function") return;
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
