import type { PhotoRemovalInput, PhotoRemovalResult } from "./photo-source-removal";
import type { CleanupControls } from "./photo-source-cleanup";
export function processPhotoSourceRemoval(
  input: PhotoRemovalInput,
  deps: {
    projectRef: string;
    actorId: string;
    permit: string;
    now?: () => Date;
    controls(): Promise<CleanupControls>;
    snapshot(
      targets: { bucket: "listing-media" | "ask-evidence"; path: string }[],
    ): Promise<unknown>;
    matches(
      bucket: "listing-media" | "ask-evidence",
      key: string,
      bytes: number,
      sha256: string,
    ): Promise<boolean>;
    remove(bucket: "listing-media" | "ask-evidence", paths: string[]): Promise<void>;
  },
): Promise<PhotoRemovalResult>;
