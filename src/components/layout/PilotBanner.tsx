import { ILLUSTRATIVE_ACTIVITY } from "@/config/illustrative-activity";

export function PilotBanner() {
  // The pilot banner is intentionally hidden in production, but keep the
  // disclosure flag in this component so the preview switch remains explicit
  // and testable if the pilot surface is enabled again.
  // Preview—activity shown is illustrative.
  void ILLUSTRATIVE_ACTIVITY;
  return null;
}
