import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { checkPrivatePhotoStorage } from "@/lib/photo-storage.functions";

export function PhotoStorageStatus() {
  const check = useServerFn(checkPrivatePhotoStorage);
  const status = useMutation({ mutationFn: () => check() });
  const result = status.data;
  return (
    <details className="rounded-xl border border-border bg-card px-4 py-3">
      <summary className="cursor-pointer text-[13px] font-semibold">Photo storage status</summary>
      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
        Check the active photo service, private storage connection and small-image processing. This
        check does not upload, move or delete photos.
      </p>
      <button
        type="button"
        className="btn-secondary mt-3"
        disabled={status.isPending}
        onClick={() => status.mutate()}
      >
        {status.isPending ? "Checking storage…" : "Check photo storage"}
      </button>
      {status.error && (
        <p role="alert" className="mt-3 text-[12px] text-destructive">
          Could not check photo storage. Try again.
        </p>
      )}
      {result && (
        <dl
          className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]"
          aria-label="Photo storage checks"
        >
          <dt>Photo reads</dt>
          <dd>{result.mode === "r2" ? "R2 with retained-source fallback" : "Supabase"}</dd>
          <dt>New uploads</dt>
          <dd>
            {result.uploadMode === "r2"
              ? "R2"
              : result.uploadMode === "mirror"
                ? "Both stores during verification"
                : "Supabase"}
          </dd>
          <dt>Private listing-photo bucket</dt>
          <dd>{result.listing ? "Connected" : "Unavailable"}</dd>
          <dt>Private evidence bucket</dt>
          <dd>{result.evidence ? "Connected" : "Unavailable"}</dd>
          <dt>Small-image processing</dt>
          <dd>{result.thumbnails ? "Ready" : "Needs configuration"}</dd>
          <dt>Verified photo records</dt>
          <dd>
            {result.receiptsReady
              ? result.verifiedCopies.toLocaleString()
              : "Migration not installed"}
          </dd>
        </dl>
      )}
    </details>
  );
}
