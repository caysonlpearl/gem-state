import { readFileSync } from "node:fs";
import { r2InventoryDatabase } from "./account-deletion-r2-database.mjs";
export const photoWriteIntentMigration = () =>
  readFileSync(
    new URL(
      "../../supabase/migrations/20261114110000_private_photo_write_intents.sql",
      import.meta.url,
    ),
    "utf8",
  );
export async function photoWriteIntentDatabase() {
  const db = await r2InventoryDatabase();
  await db.exec(photoWriteIntentMigration());
  return db;
}
