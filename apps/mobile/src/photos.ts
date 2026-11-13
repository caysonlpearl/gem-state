import { createPhotoUploader } from "../../../src/lib/photo-upload";
import { browserPhotoThumbnail } from "../../../src/lib/photo-thumbnail.browser";
import { api, auth } from "./client";
export const uploadPhoto = createPhotoUploader({
  mode: async () =>
    (await api<{ mode: "supabase" | "mirror" | "r2" }>("photos/mode", "POST", {})).mode,
  begin: (input) => api("photos/begin", "POST", input),
  finish: (id) => api("photos/finish", "POST", { id }),
  source: async (bucket, path, file) => {
    const { error } = await auth.storage
      .from(bucket)
      .upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw error;
  },
  thumbnail: browserPhotoThumbnail,
  digest: async (file) =>
    [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""),
  put: async (url, headers, body) => {
    const response = await fetch(url, {
      method: "PUT",
      headers,
      body,
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) throw Error("Photo upload failed. Please retry.");
  },
});
