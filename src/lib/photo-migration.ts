import type { PhotoBucket, PhotoSourceMetadata } from "./photo-storage";

// Only bounded originals already charged to preview preparation may be reused.
export const MAX_PREPARED_MIGRATION_SOURCE_BYTES = 5 * 1024 * 1024;

export type PreparedMigrationPreview = {
  ordinal: number;
  sourceEtag: string;
  contentType: "image/webp" | "image/jpeg" | "image/png";
  base64: string;
  sourceBase64?: string;
};

export type PhotoInventoryObject = Omit<PhotoSourceMetadata, "updatedAt"> & {
  bucket: PhotoBucket;
  path: string;
  updatedAt: string;
};
export type PhotoInventory = {
  schemaVersion: 1;
  projectRef: string;
  capturedAt: string;
  objects: PhotoInventoryObject[];
};
export type PhotoMigrationGroup = {
  source: PhotoInventoryObject;
  targets: { bucket: PhotoBucket; path: string }[];
  expectedSourceMetadata: PhotoInventoryObject[];
  pairedMetadataMatch: boolean;
  verification: "not-downloaded-or-verified";
};
export type PhotoMigrationPlan = {
  schemaVersion: 1;
  kind: "photo-migration-preflight-only";
  generatedAt: string;
  capturedAt: string;
  projectRef: string;
  inventorySha256: string;
  summary: {
    sourceObjects: number;
    sourceBytes: number;
    proposedDownloads: number;
    proposedDownloadBytes: number;
    pairedMetadataGroups: number;
    targetObjects: number;
    targetBytes: number;
  };
  groups: PhotoMigrationGroup[];
};
export type PhotoMigrationStatus = {
  id: string;
  projectRef: string;
  digest: string;
  createdAt: string;
  totalGroups: number;
  totalSourceBytes: number;
  sourceBytesReserved: number;
  confirmedDownloadBytes: number;
  completedGroups: number;
  failedGroups: number;
  runningGroups: number;
  lastFailure: string | null;
  permit: { maxGroups: number; maxSourceBytes: number; expiresAt: string } | null;
};
