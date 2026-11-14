import { readFileSync } from "node:fs";
import { deletionPhotoWriterDatabase } from "./account-deletion-photo-database.mjs";
export const shoppingErasureMigration = () =>
  readFileSync(
    new URL(
      "../../supabase/migrations/20261114100000_account_deletion_shopping_erasure.sql",
      import.meta.url,
    ),
    "utf8",
  );
export async function installShoppingErasureSources(db) {
  const schema = readFileSync(
    new URL(
      "../../supabase/migrations/20261113010000_shopper_personalization.sql",
      import.meta.url,
    ),
    "utf8",
  );
  // Use the actual shopping definitions; the earlier queue fixture only needed
  // small privacy/export stubs. No real shopper rows or provider is used here.
  await db.exec("drop table shopping_privacy,shopping_ad_outbox");
  for (const table of [
    "shopping_events",
    "shopping_favorites",
    "shopping_experiments",
    "shopping_ad_outbox",
    "shopping_privacy",
  ]) {
    const match = schema.match(new RegExp(`create table public[.]${table} \\([\\s\\S]*?\\n\\);`));
    if (!match) throw Error("Missing real shopping table: " + table);
    await db.exec(match[0]);
  }
  await db.exec(
    readFileSync(
      new URL(
        "../../supabase/migrations/20261113023000_shopping_durable_choices.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const table of [
    "shopping_events",
    "shopping_choices",
    "shopping_favorites",
    "shopping_experiments",
    "shopping_ad_outbox",
    "shopping_privacy",
  ]) {
    await db.exec(
      `alter table public.${table} enable row level security; revoke all on public.${table} from public,anon,authenticated; grant all on public.${table} to service_role`,
    );
  }
  await db.exec("select public.protect_account_access_boundaries()");
  await db.exec(shoppingErasureMigration());
  return db;
}
export async function shoppingErasureDatabase() {
  return installShoppingErasureSources(await deletionPhotoWriterDatabase());
}
