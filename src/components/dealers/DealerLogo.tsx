import { useState } from "react";

/** A missing or failed logo must not leave a broken-image icon in a dealer profile. */
export function DealerLogo({
  src,
  name,
  className = "",
}: {
  src?: string | null;
  name: string;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (src && failedSrc !== src)
    return (
      <img src={src} alt={`${name} logo`} onError={() => setFailedSrc(src)} className={className} />
    );
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return (
    <div
      role="img"
      aria-label={`${name} logo placeholder`}
      className={`flex items-center justify-center rounded-xl bg-primary/5 text-xl font-semibold text-primary ${className}`}
    >
      {initials}
    </div>
  );
}
