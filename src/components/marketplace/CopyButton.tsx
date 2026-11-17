import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";
import { toast } from "sonner";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const generation = useRef({ value: 0 });
  useEffect(() => {
    const tracker = generation.current;
    tracker.value++;
    setCopied(false);
    return () => {
      tracker.value++;
      clearTimeout(timer.current);
    };
  }, [value]);
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      className="relative inline-grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-primary/5 hover:text-primary before:absolute before:-inset-2 before:content-['']"
      onClick={async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const run = generation.current.value;
        try {
          await navigator.clipboard.writeText(value);
          if (run !== generation.current.value) return;
          setCopied(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1800);
        } catch {
          if (run === generation.current.value)
            toast.error("Could not copy. Please select and copy the text.");
        }
      }}
    >
      {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
      <span className="sr-only" role="status">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </button>
  );
}
