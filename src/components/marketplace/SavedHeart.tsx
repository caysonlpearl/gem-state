import { useEffect, useRef, useState } from "react";
import { Heart } from "@phosphor-icons/react";

export function SavedHeart({ saved, size = 14 }: { saved: boolean; size?: number }) {
  const previous = useRef(saved);
  const [popping, setPopping] = useState(false);
  useEffect(() => {
    const changed = previous.current !== saved;
    previous.current = saved;
    if (!saved || !changed) return;
    setPopping(true);
    const timer = setTimeout(() => setPopping(false), 260);
    return () => clearTimeout(timer);
  }, [saved]);
  return (
    <Heart
      key={saved ? "saved" : "unsaved"}
      size={size}
      weight={saved ? "fill" : "regular"}
      className={`${saved ? "text-brand-warm" : ""} ${popping ? "save-heart-pop" : ""}`}
      aria-hidden="true"
    />
  );
}
