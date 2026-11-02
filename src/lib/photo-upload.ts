import type { PhotoBucket, PhotoStorageMode } from "./photo-storage";

export type PrivatePhotoUploadInput = {
  extension: string;
  bytes: number;
  contentType: string;
  sha256: string;
  evidence: boolean;
  thumbnail: { bytes: number; contentType: string; sha256: string };
};
export type PrivatePhotoUploadTicket = {
  id: string;
  path: string;
  mode: Exclude<PhotoStorageMode, "supabase">;
  uploads: {
    bucket: PhotoBucket;
    kind: "original" | "thumbnail";
    url: string;
    headers: Record<string, string>;
  }[];
};

/** Shared by all native photo forms; no service credential reaches this module. */
export function createPhotoUploader(deps: {
  mode(): Promise<PhotoStorageMode>;
  begin(input: PrivatePhotoUploadInput): Promise<PrivatePhotoUploadTicket>;
  finish(id: string): Promise<{ path: string }>;
  source(bucket: PhotoBucket, path: string, file: Blob): Promise<void>;
  thumbnail(file: Blob): Promise<Blob>;
  digest(file: Blob): Promise<string>;
  put(url: string, headers: Record<string, string>, body: Blob): Promise<void>;
  uuid?: () => string;
  warn?: (message: string) => void;
}) {
  const uuid = deps.uuid ?? (() => crypto.randomUUID());
  async function sourceUploads(path: string, file: Blob, evidence: boolean) {
    if (evidence) await deps.source("ask-evidence", path, file);
    await deps.source("listing-media", path, file);
  }
  return async (file: File, userId: string, evidence = true) => {
    const suffix = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : "";
    const extension = suffix && /^[a-z0-9]{1,12}$/.test(suffix) ? suffix : "jpg";
    const mode = await deps.mode();
    if (mode === "supabase") {
      const path = `${userId}/${uuid()}.${extension}`;
      await sourceUploads(path, file, evidence);
      return path;
    }
    let thumbnail: Blob;
    let ticket: PrivatePhotoUploadTicket;
    try {
      thumbnail = await deps.thumbnail(file);
      ticket = await deps.begin({
        extension,
        bytes: file.size,
        contentType: file.type || "image/jpeg",
        evidence,
        sha256: await deps.digest(file),
        thumbnail: {
          bytes: thumbnail.size,
          contentType: thumbnail.type,
          sha256: await deps.digest(thumbnail),
        },
      });
    } catch {
      if (mode !== "mirror") throw new Error("Could not prepare this photo upload. Try again.");
      const path = `${userId}/${uuid()}.${extension}`;
      await sourceUploads(path, file, evidence);
      deps.warn?.("Photo mirror is unavailable; the original store remains available.");
      return path;
    }
    if (!ticket.path.startsWith(`${userId}/`))
      throw new Error("Your account changed. Retry the upload.");
    if (ticket.mode === "mirror") await sourceUploads(ticket.path, file, evidence);
    try {
      for (const slot of ticket.uploads)
        await deps.put(slot.url, slot.headers, slot.kind === "thumbnail" ? thumbnail : file);
      const completed = await deps.finish(ticket.id);
      if (completed.path !== ticket.path)
        throw new Error("Photo verification returned a different path.");
      return completed.path;
    } catch {
      if (ticket.mode !== "mirror")
        throw new Error("The photo could not be verified. Retry uploading it.");
      deps.warn?.("Photo mirror is incomplete; the original store remains available.");
      return ticket.path;
    }
  };
}
