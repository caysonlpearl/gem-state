import { api, auth } from "./client";
import { installIdentifier } from "./identity";

/** The avatar write and upload belong to the account that opened the form. */
export async function saveProfileAvatar(
  actor: { userId: string; installId: string },
  file: File | null,
) {
  let path: string | null = null;
  if (file) {
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      !file.size ||
      file.size > 5 * 1024 * 1024
    )
      throw Error("Use a JPG, PNG, or WebP up to 5 MB.");
    const current = (await auth.auth.getSession()).data.session;
    if (current?.user.id !== actor.userId || installIdentifier() !== actor.installId)
      throw Error("Your account changed. Please try again.");
    const extension =
      file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
    path = `${actor.userId}/avatar-${crypto.randomUUID()}.${extension}`;
    const uploaded = await auth.storage
      .from("profile-avatars")
      .upload(path, file, { contentType: file.type, cacheControl: "3600", upsert: false });
    if (uploaded.error) throw Error(uploaded.error.message);
  }
  return api<{ ok: true; avatarUrl: string | null }>(
    "account/avatar",
    "PUT",
    { path },
    undefined,
    actor,
  );
}
