import { useEffect, useRef, type HTMLAttributes } from "react";

/** Fade only an edge that actually has more content beyond it. */
export function ScrollRail({
  as: Tag = "div",
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLElement> & { as?: "div" | "nav" }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      node.dataset.edges = `${node.scrollLeft > 2 ? "left" : ""}${node.scrollWidth - node.clientWidth - node.scrollLeft > 2 ? "right" : ""}`;
    };
    update();
    const resize = new ResizeObserver(update);
    resize.observe(node);
    Array.from(node.children).forEach((child) => resize.observe(child));
    node.addEventListener("scroll", update, { passive: true });
    return () => {
      resize.disconnect();
      node.removeEventListener("scroll", update);
    };
  }, [children]);
  return (
    <Tag {...props} ref={ref} className={`scroll-edge-fade ${className}`}>
      {children}
    </Tag>
  );
}
