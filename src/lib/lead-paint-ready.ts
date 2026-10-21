type ImageReadiness = Pick<HTMLImageElement, "complete" | "addEventListener" | "removeEventListener">;
type PaintScheduler = {
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (id: number) => void;
  delay: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearDelay: (id: ReturnType<typeof setTimeout>) => void;
};

/** Give the committed lead image a paint opportunity before below-fold work. */
export function afterLeadPaint(
  image: ImageReadiness | null,
  ready: () => void,
  scheduler: PaintScheduler = {
    requestFrame: requestAnimationFrame,
    cancelFrame: cancelAnimationFrame,
    delay: setTimeout,
    clearDelay: clearTimeout,
  },
): () => void {
  let stopped = false;
  let queued = false;
  let firstFrame: number | undefined;
  let secondFrame: number | undefined;
  const detach = () => {
    image?.removeEventListener("load", queuePaint);
    image?.removeEventListener("error", queuePaint);
  };
  function queuePaint() {
    if (stopped || queued) return;
    queued = true;
    detach();
    if (timeout !== undefined) scheduler.clearDelay(timeout);
    firstFrame = scheduler.requestFrame(() => {
      secondFrame = scheduler.requestFrame(() => {
        if (!stopped) ready();
      });
    });
  }
  // A hung image must not leave the rest of the marketplace inaccessible.
  const timeout = scheduler.delay(queuePaint, 2000);
  if (!image || image.complete) queuePaint();
  else {
    image.addEventListener("load", queuePaint);
    image.addEventListener("error", queuePaint);
  }
  return () => {
    stopped = true;
    detach();
    if (timeout !== undefined) scheduler.clearDelay(timeout);
    if (firstFrame !== undefined) scheduler.cancelFrame(firstFrame);
    if (secondFrame !== undefined) scheduler.cancelFrame(secondFrame);
  };
}
