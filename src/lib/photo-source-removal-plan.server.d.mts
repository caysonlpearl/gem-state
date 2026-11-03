import type { PhotoRemovalInput, PhotoRemovalPlan } from "./photo-source-removal";
export function photoRemovalPermitAllowed(
  raw: string,
  header: PhotoRemovalInput["header"],
  actorId: string,
  now?: number,
): boolean;
export function verifyPhotoRemovalProof(
  header: PhotoRemovalInput["header"],
  entry: PhotoRemovalInput["entries"][number],
): boolean;
export function buildPhotoRemovalPlan(
  review: unknown,
  options: { projectRef: string; runIds: string[] },
  preview?: boolean,
): PhotoRemovalPlan;
