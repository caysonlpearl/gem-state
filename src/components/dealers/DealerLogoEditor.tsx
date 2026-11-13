import { useEffect, useRef, useState } from "react";
import { loadSupabase } from "@/integrations/supabase/lazy-client";
import { dealerLogoExtension, uploadDealerLogo } from "@/lib/dealer-logo-upload";
import { DealerLogo } from "./DealerLogo";

export function DealerLogoEditor({
  url,
  name,
  onChange,
  onBusyChange,
  disabled = false,
  preview = false,
}: {
  url: string;
  name: string;
  onChange: (url: string) => void;
  onBusyChange: (busy: boolean) => void;
  disabled?: boolean;
  preview?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    },
    [localPreview],
  );
  const shown = localPreview ?? url;
  async function choose(file: File) {
    setError("");
    try {
      dealerLogoExtension(file);
      if (preview) {
        setLocalPreview(URL.createObjectURL(file));
        return;
      }
      setBusy(true);
      onBusyChange(true);
      const uploaded = await uploadDealerLogo(file, await loadSupabase());
      onChange(uploaded);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Your logo could not be uploaded. Please try again.",
      );
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <section
      aria-label="Dealership logo"
      className="rounded-2xl border border-border bg-secondary/20 p-4 sm:p-5"
    >
      <h2 className="text-base font-semibold">Dealership logo</h2>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex h-24 w-56 shrink-0 items-center justify-center rounded-xl border border-border bg-white p-3">
          <DealerLogo src={shown} name={name} className="h-16 w-full object-contain" />
        </div>
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Shown on your dealership page and vehicle listings. JPG, PNG, or WebP, up to 5 MB.
          </p>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Choose dealership logo"
            className="sr-only"
            disabled={disabled || busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void choose(file);
            }}
          />
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => input.current?.click()}
              className="rounded-full border border-primary px-4 py-2 text-xs font-semibold text-primary disabled:opacity-50"
            >
              {busy ? "Uploading…" : shown ? "Replace logo" : "Upload logo"}
            </button>
            {shown && (
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => {
                  setLocalPreview(null);
                  onChange("");
                  setError("");
                }}
                className="text-xs text-muted-foreground underline disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {preview
              ? "Preview only. Files stay on this device."
              : "Save your profile to publish logo changes."}
          </p>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
