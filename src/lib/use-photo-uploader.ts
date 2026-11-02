import { useRef } from "react";
import { browserPhotoThumbnail } from "./photo-thumbnail.browser";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import { createPhotoUploader } from "./photo-upload";
import { type PhotoStorageMode } from "./photo-storage";
import {
  beginPrivatePhotoUpload,
  finishPrivatePhotoUpload,
  getPhotoUploadMode,
} from "./photo-storage.functions";

export function usePhotoUploader() {
  const modeFn = useServerFn(getPhotoUploadMode);
  const beginFn = useServerFn(beginPrivatePhotoUpload);
  const finishFn = useServerFn(finishPrivatePhotoUpload);
  const modeCache = useRef<{ until: number; promise: Promise<PhotoStorageMode> } | null>(null);
  return createPhotoUploader({
    mode: () => {
      if (!modeCache.current || modeCache.current.until < Date.now()) {
        const promise = modeFn().then((result) => result.mode);
        modeCache.current = { until: Date.now() + 30_000, promise };
        promise.catch(() => {
          modeCache.current = null;
        });
      }
      return modeCache.current.promise;
    },
    begin: (input) => beginFn({ data: input }),
    finish: (id) => finishFn({ data: { id } }),
    source: async (bucket, path, file) => {
      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, file, { contentType: file.type || "image/jpeg" });
      if (error) throw new Error("A listing photo could not be uploaded. Retry the upload.");
    },
    thumbnail: browserPhotoThumbnail,
    digest: async (file) =>
      Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join(""),
    put: async (url, headers, body) => {
      const response = await fetch(url, {
        method: "PUT",
        headers,
        body,
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok && response.status !== 412)
        throw new Error("Photo upload did not complete.");
    },
  });
}
