import { readFileSync } from "node:fs";
import { deletionPhotoWriterDatabase } from "./account-deletion-photo-database.mjs";

export const storageWriterMigration = () =>
  readFileSync(
    new URL(
      "../../supabase/migrations/20261114070000_account_deletion_storage_writes.sql",
      import.meta.url,
    ),
    "utf8",
  );

// Synthetic permissive ownership policy underneath the actual restrictive
// account boundary. This never grants new production bucket permissions.
export async function installStorageAccessFixture(db, { applyMigration = true } = {}) {
  await db.exec(`
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select,insert,update,delete on storage.objects to authenticated;
    create policy fixture_member_files on storage.objects for all to authenticated
      using(split_part(name,'/',1)=auth.uid()::text)
      with check(split_part(name,'/',1)=auth.uid()::text);
    select public.protect_account_access_boundaries();
  `);
  if (applyMigration) await db.exec(storageWriterMigration());
  return db;
}

export async function storageAccessDatabase(options) {
  return installStorageAccessFixture(await deletionPhotoWriterDatabase(), options);
}
