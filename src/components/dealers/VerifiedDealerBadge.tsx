import { SealCheck } from "@phosphor-icons/react";

export function VerifiedDealerBadge({ size = 17 }: { size?: number }) {
  return (
    <span
      role="img"
      aria-label="Verified dealership"
      title="Verified dealership"
      className="inline-flex shrink-0 align-middle text-[#1576b8]"
    >
      <SealCheck size={size} weight="fill" aria-hidden="true" />
    </span>
  );
}
