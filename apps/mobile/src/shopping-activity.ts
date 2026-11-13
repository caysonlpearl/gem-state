import { useEffect } from "react";
import { trackShopping } from "./shopping";
let foreground = true;
export const isShoppingForeground = () => foreground;
export function setShoppingForeground(value: boolean) {
  foreground = value;
  document.dispatchEvent(new Event("bluebird-visibility-change"));
}
export function useListingActivity(id: string | undefined, learning: boolean) {
  useEffect(() => {
    if (!id || !learning) return;
    let started = 0,
      viewed = false;
    const sample = () => {
      const now = Date.now(),
        visible =
          foreground &&
          document.visibilityState === "visible" &&
          !document.querySelector("dialog[open]");
      if (started) {
        const seconds = Math.min(60, Math.floor((now - started) / 1000));
        if (seconds > 0) trackShopping("active", id, { seconds });
      }
      if (visible && !viewed) {
        trackShopping("view", id);
        viewed = true;
      }
      started = visible ? now : 0;
    };
    const session = () => {
      viewed = false;
      sample();
    };
    sample();
    const timer = setInterval(sample, 10000);
    document.addEventListener("visibilitychange", sample);
    document.addEventListener("bluebird-visibility-change", sample);
    document.addEventListener("bluebird-shopping-session", session);
    return () => {
      sample();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", sample);
      document.removeEventListener("bluebird-visibility-change", sample);
      document.removeEventListener("bluebird-shopping-session", session);
    };
  }, [id, learning]);
}
