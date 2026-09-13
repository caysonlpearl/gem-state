import { formatDistanceToNowStrict } from "date-fns";

/** Live-reads as "3 hours ago" / "2 days ago". Falls back to nothing for an invalid timestamp. */
export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return (
    <time dateTime={iso} title={date.toLocaleString()} className={className}>
      {formatDistanceToNowStrict(date, { addSuffix: true })}
    </time>
  );
}
