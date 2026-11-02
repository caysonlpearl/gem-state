import type { PhotoBucket, PhotoSourceMetadata } from "./photo-storage";

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
