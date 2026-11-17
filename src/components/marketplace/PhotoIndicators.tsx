export function PhotoIndicators({
  count,
  active,
  onSelect,
  className = "",
}: {
  count: number;
  active: number;
  onSelect: (index: number) => void;
  className?: string;
}) {
  if (count < 2) return null;
  const start = Math.max(0, Math.min(active - 2, count - 5));
  return (
    <div className={`flex items-center justify-center ${className}`} aria-label="Photo navigation">
      {Array.from({ length: Math.min(count, 5) }, (_, offset) => start + offset).map((index) => (
        <button
          key={index}
          type="button"
          aria-label={`Go to photo ${index + 1}`}
          aria-current={index === active ? "true" : undefined}
          onClick={() => onSelect(index)}
          className="grid h-11 min-w-11 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-primary"
        >
          <span
            aria-hidden="true"
            className={`block h-1.5 rounded-full transition-[width,background-color] duration-200 motion-reduce:transition-none ${index === active ? "w-5 bg-primary" : "w-1.5 bg-primary/25"}`}
          />
        </button>
      ))}
    </div>
  );
}
