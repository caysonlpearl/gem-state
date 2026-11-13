import type { SupabaseClient } from "@supabase/supabase-js";

export function dealerLogoExtension(file: { type: string; size: number }) {
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
  if (!extension) throw new Error("Choose a JPG, PNG, or WebP image.");
  if (file.size <= 0 || file.size > 5 * 1024 * 1024) throw new Error("Choose an image up to 5 MB.");
  return extension;
}

/** Existing public-image storage restricts writes to the signed-in member's folder. */
export async function uploadDealerLogo(file: File, client: SupabaseClient) {
  const extension = dealerLogoExtension(file);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Sign in again to upload your dealership logo.");
  const path = `${data.user.id}/dealer-logo-${crypto.randomUUID()}.${extension}`;
  const storage = client.storage.from("profile-avatars");
  const { error: uploadError } = await storage.upload(path, file, {
    contentType: file.type,
    cacheControl: "3600",
    upsert: false,
  });
  if (uploadError) throw new Error("Your logo could not be uploaded. Please try again.");
  return storage.getPublicUrl(path).data.publicUrl;
}
