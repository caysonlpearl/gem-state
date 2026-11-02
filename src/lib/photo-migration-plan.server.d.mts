import type { PhotoInventory, PhotoMigrationPlan } from "./photo-migration";
export function buildPhotoMigrationPlan(
  inventory: PhotoInventory,
  expectedProject: string,
  now?: Date,
): PhotoMigrationPlan;
