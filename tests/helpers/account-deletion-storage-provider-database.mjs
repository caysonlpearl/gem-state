import { readFileSync } from "node:fs";
import { inventoryDatabase } from "./account-deletion-inventory-database.mjs";
import { installStorageAccessFixture } from "./account-deletion-storage-database.mjs";

export const storageProviderMigration = () =>
  readFileSync(
    new URL(
      "../../supabase/migrations/20261114080000_account_deletion_storage_inventory.sql",
      import.meta.url,
    ),
    "utf8",
  );

export async function storageProviderDatabase() {
  const db = await inventoryDatabase();
  await installStorageAccessFixture(db);
  await db.exec(storageProviderMigration());
  return db;
}

export function storageProviderBridge(db, after) {
  const calls = [];
  return {
    calls,
    rpc(name, args) {
      return {
        abortSignal: async (signal) => {
          signal.throwIfAborted();
          calls.push({ name, args });
          const result = await db.query(
            `select public.${name}(${Object.values(args)
              .map((_, i) => "$" + (i + 1))
              .join(",")}) as result`,
            Object.values(args),
          );
          await after?.(name, args, result.rows[0].result);
          return { data: result.rows[0].result, error: null };
        },
      };
    },
  };
}
