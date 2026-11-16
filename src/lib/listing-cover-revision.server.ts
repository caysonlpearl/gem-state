/** Opaque identity for a selected public cover. Never publish its storage path.
 * Normal uploads receive a new object key, so replacement/reordering changes
 * the revision without resolving/signing/downloading private storage bytes. */
export async function listingCoverRevision(storagePath: string): Promise<string> {
  return [
    ...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(storagePath))),
  ]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
