import { createPhotoUploader } from "../../../src/lib/photo-upload";
import { browserPhotoThumbnail } from "../../../src/lib/photo-thumbnail.browser";
import { api, auth } from "./client";
import { installIdentifier } from "./identity";

/** Freeze the account for the complete upload, including mirror fallbacks. */
export async function uploadPhoto(file: File, userId: string, evidence = true) {
  const actor = { userId, installId: installIdentifier() };
  const guard = async () => {
    const session = (await auth.auth.getSession()).data.session;
    if (session?.user.id !== userId || installIdentifier() !== actor.installId)
      throw Error("Your account changed. Please try again.");
  };
  const upload = createPhotoUploader({
    mode: async () => {
      await guard();
      return (
        await api<{ mode: "supabase" | "mirror" | "r2" }>(
          "photos/mode",
          "POST",
          {},
          undefined,
          actor,
        )
      ).mode;
    },
    begin: (input) => api("photos/begin", "POST", input, undefined, actor),
    finish: (id) => api("photos/finish", "POST", { id }, undefined, actor),
    source: async (bucket, path, blob) => {
      await guard();
      const { error } = await auth.storage
        .from(bucket)
        .upload(path, blob, { upsert: false, contentType: blob.type });
      if (error) throw error;
    },
    thumbnail: browserPhotoThumbnail,
    digest: async (blob) =>
      [...new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join(""),
    put: async (url, headers, body) => {
      await guard();
      const response = await fetch(url, {
        method: "PUT",
        headers,
        body,
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok && response.status !== 412)
        throw Error("Photo upload failed. Please retry.");
    },
  });
  return upload(file, userId, evidence);
}
