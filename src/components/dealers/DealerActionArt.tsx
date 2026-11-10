import { useId } from "react";

/** Small dimensional objects, drawn as vectors so they stay crisp at any size. */
export function DealerActionArt({ kind }: { kind: "phone" | "map" | "web" | "car" }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 88 88"
      className="h-[68px] w-[68px] shrink-0 transition-transform duration-300 group-hover:-translate-y-1"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}navy`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#52798c" />
          <stop offset=".5" stopColor="#214d63" />
          <stop offset="1" stopColor="#102f42" />
        </linearGradient>
        <linearGradient id={`${id}cream`} x1="0" y1="0" x2=".8" y2="1">
          <stop stopColor="#fffef9" />
          <stop offset="1" stopColor="#d6d3c7" />
        </linearGradient>
        <linearGradient id={`${id}yellow`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#ffe77d" />
          <stop offset="1" stopColor="#e5ac12" />
        </linearGradient>
        <radialGradient id={`${id}blue`} cx=".32" cy=".25" r=".8">
          <stop stopColor="#a7d8e7" />
          <stop offset=".5" stopColor="#4389ab" />
          <stop offset="1" stopColor="#20485f" />
        </radialGradient>
        <filter id={`${id}shadow`} x="-40%" y="-40%" width="180%" height="190%">
          <feDropShadow dx="1" dy="4" stdDeviation="2.5" floodColor="#183747" floodOpacity=".2" />
        </filter>
      </defs>
      <ellipse cx="45" cy="75" rx="27" ry="4" fill="#153e52" opacity=".09" />
      <g filter={`url(#${id}shadow)`}>
        {kind === "phone" ? (
          <g transform="rotate(-15 44 44)">
            <rect x="25" y="11" width="39" height="62" rx="11" fill="#102e40" />
            <rect
              x="24"
              y="9"
              width="38"
              height="61"
              rx="10"
              fill={`url(#${id}navy)`}
              stroke="#638293"
              strokeWidth="1"
            />
            <rect x="28" y="15" width="30" height="46" rx="6" fill={`url(#${id}cream)`} />
            <rect x="36" y="13" width="14" height="4" rx="2" fill="#163b4e" />
            <circle cx="43" cy="38" r="12" fill={`url(#${id}yellow)`} />
            <path d="M38 32c-4 3 5 14 9 11l2-3-4-3-2 2-3-4 1-2z" fill="#193e50" />
            <rect x="38" y="65" width="10" height="2" rx="1" fill="#91a9b4" />
          </g>
        ) : null}
        {kind === "map" ? (
          <g>
            <path d="m12 31 20-8 23 8 20-8v43l-20 8-23-8-20 8z" fill="#b5beb8" />
            <path
              d="m12 27 20-8 23 8 20-8v43l-20 8-23-8-20 8z"
              fill={`url(#${id}cream)`}
              stroke="#d8d8cb"
            />
            <path d="m32 19 23 8v43l-23-8z" fill="#d7e5d6" />
            <path
              d="m14 47 17-8 24 9 18-8M22 24l3 17-3 24M61 25l-4 20 8 18"
              stroke="#fff"
              strokeWidth="4"
              fill="none"
            />
            <path d="m17 56 15-8 17 6 17-11" stroke="#b8c9bc" strokeWidth="2" fill="none" />
            <path
              d="M66 23c0 9-13 23-13 23S40 32 40 23a13 13 0 1 1 26 0"
              fill={`url(#${id}yellow)`}
              stroke="#c99a29"
            />
            <circle cx="53" cy="23" r="5" fill="#214c60" />
          </g>
        ) : null}
        {kind === "web" ? (
          <g>
            <path d="m35 65-3 9h28l-8-9" fill={`url(#${id}navy)`} />
            <ellipse cx="45" cy="75" rx="20" ry="3" fill="#23485c" />
            <circle cx="44" cy="36" r="27" fill={`url(#${id}blue)`} stroke="#7bb3c4" />
            <path
              d="m25 17 8 7 2 9-8 3-4 9-6-8M48 10l-6 9 4 8 11 4 3 9 9-8M37 43l11-4 8 9-5 14-10-2-2-8z"
              fill="#b9d0b7"
            />
            <ellipse
              cx="44"
              cy="36"
              rx="13"
              ry="27"
              fill="none"
              stroke="#fff"
              strokeOpacity=".25"
            />
            <path d="M18 30h52M20 46h48" stroke="#fff" strokeOpacity=".2" />
            <path
              d="M64 20c12 22-4 48-29 44"
              stroke="#d5b85c"
              strokeWidth="4"
              fill="none"
              strokeLinecap="round"
            />
          </g>
        ) : null}
        {kind === "car" ? (
          <g>
            <path d="m15 40 10-17q4-5 12-5h19q6 0 10 7l8 17v20H15z" fill={`url(#${id}navy)`} />
            <path d="m27 25-7 15h47l-8-15z" fill="#c0dce3" />
            <path d="m42 25 3 15h22l-8-15z" fill="#92b6c5" />
            <rect
              x="11"
              y="38"
              width="65"
              height="24"
              rx="9"
              fill={`url(#${id}navy)`}
              stroke="#6b8b9c"
            />
            <rect x="17" y="47" width="14" height="6" rx="3" fill={`url(#${id}cream)`} />
            <rect x="57" y="47" width="12" height="6" rx="3" fill={`url(#${id}cream)`} />
            <rect x="35" y="48" width="17" height="7" rx="2" fill="#123041" />
            <rect x="17" y="59" width="11" height="11" rx="4" fill="#20323b" />
            <rect x="60" y="59" width="11" height="11" rx="4" fill="#20323b" />
            <path d="m69 11 7 3-2 9-7 3-5-3 2-9z" fill={`url(#${id}yellow)`} stroke="#d4ac35" />
            <circle cx="69" cy="18" r="2" fill="#775c26" />
            <path
              d="m66 26-4 12 4 1-1 5"
              fill="none"
              stroke="#bdc4c3"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </g>
        ) : null}
      </g>
    </svg>
  );
}
