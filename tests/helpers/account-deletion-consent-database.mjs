import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { installDeletionPhotoWriterSchema } from "./account-deletion-photo-database.mjs";
import { installShoppingErasureSources } from "./account-deletion-shopping-database.mjs";
import { installPrivateRecordSources } from "./account-deletion-private-database.mjs";
import { activityDatabase } from "./account-deletion-activity-database.mjs";

export const consentSchema = JSON.parse(
  readFileSync(
    new URL("../fixtures/account-deletion-consent-schema-20261115.json", import.meta.url),
    "utf8",
  ),
);
const quote = (s) => '"' + s.replaceAll('"', '""') + '"';
/** Compose the real shopping and activity boundaries in installation order, then
 * reconstruct captured consent relations/callbacks. Content is synthetic and
 * the Auth signup hook is a fixture binding, not a production installation. */
export async function consentDeletionDatabase({ provided } = {}) {
  const db = provided ?? new PGlite();
  try {
    await installDeletionPhotoWriterSchema(db);
    await installShoppingErasureSources(db);
    await installPrivateRecordSources(db);
    await activityDatabase({ provided: db });
    for (const row of consentSchema.rows) {
      const table = "public." + quote(row.source);
      await db.exec(`drop table ${table};create table ${table}()`);
      for (const c of row.metadata.columns)
        await db.exec(
          `alter table ${table}add column ${quote(c.name)} ${c.type}${c.default ? " default " + c.default : ""}${c.notNull ? " not null" : ""}`,
        );
      for (const c of row.metadata.constraints)
        await db.exec(`alter table ${table}add constraint ${quote(c.name)} ${c.definition}`);
      for (const index of row.metadata.indexes ?? [])
        if (!index.includes("UNIQUE INDEX")) await db.exec(index);
      await db.exec(
        `alter table ${table}enable row level security;revoke all on ${table}from public,anon,authenticated;grant all on ${table}to service_role;alter table ${table}owner to postgres`,
      );
    }
    await db.exec(
      "alter table auth.users add column if not exists raw_user_meta_data jsonb not null default '{}'",
    );
    for (const f of consentSchema.functions) {
      await db.exec(f.definition + ";");
      await db.exec(
        `revoke all on function public.${f.signature}from public,anon,authenticated,service_role`,
      );
      await db.exec(`grant execute on function public.${f.signature}to service_role`);
      await db.exec(`alter function public.${f.signature}owner to postgres`);
    }
    await db.exec(
      "create trigger fixture_register_shopping_signup after insert on auth.users for each row execute function public.register_shopping_signup()",
    );
    await db.exec("select public.protect_account_access_boundaries()");
    return db;
  } catch (error) {
    if (!provided) await db.close();
    throw error;
  }
}
