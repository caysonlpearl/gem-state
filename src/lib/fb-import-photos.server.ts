import { createHash } from "node:crypto";

type ImportPhotoStorage = {
  storage: {
    from(bucket: string): {
      info(path: string): Promise<{ error: { message: string } | null }>;
      copy(source: string, destination: string): Promise<{ error: { message: string } | null }>;
    };
  };
};

/** Deterministic destinations prevent orphan copies on interrupted or repeated publishing. */
export async function prepareImportPhotos(
  admin: ImportPhotoStorage,
  sellerId: string,
  stagingPaths: string[],
) {
  const prepared: string[] = [];
  for (const path of stagingPaths) {
    const extension = path.split(".").pop() || "jpg";
    const destination = `${sellerId}/import-${createHash("sha256").update(path).digest("hex")}.${extension}`;
    for (const bucket of ["ask-evidence", "listing-media"]) {
      const existing = await admin.storage.from(bucket).info(destination);
      if (existing.error) {
        const copy = await admin.storage.from(bucket).copy(path, destination);
        if (copy.error && !/already exists|duplicate/i.test(copy.error.message))
          throw new Error("Could not prepare a listing photo. Retry publishing.");
      }
    }
    prepared.push(destination);
  }
  return prepared;
}
