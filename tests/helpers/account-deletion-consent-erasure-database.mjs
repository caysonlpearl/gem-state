import { readFileSync } from "node:fs";
import { consentDeletionDatabase } from "./account-deletion-consent-database.mjs";

export const consentErasureMigration = () =>
  readFileSync(
    new URL(
      "../../supabase/migrations/20261115130000_account_deletion_consents.sql",
      import.meta.url,
    ),
    "utf8",
  );
export const retentionProjection = JSON.parse(
  readFileSync(
    new URL(
      "../fixtures/account-deletion-consent-retention-projection-20261115.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
export async function consentErasureDatabase({ provided, install = true } = {}) {
  const db = await consentDeletionDatabase({ provided });
  try {
    // Captured owner columns/Auth relationships only. Existing order/sourcing
    // fixtures retain their full captured definitions and guards; other retention
    // sources have synthetic supporting columns, never financial/private rows.
    for (const [table, columns] of Object.entries(retentionProjection.columns)) {
      await db.exec(
        `create table if not exists public.${table}(id uuid primary key default gen_random_uuid())`,
      );
      for (const [column, [type, notNull]] of Object.entries(columns)) {
        await db.exec(
          `alter table public.${table} add column if not exists ${column} ${type};alter table public.${table} alter column ${column} ${notNull ? "set" : "drop"} not null`,
        );
      }
    }
    for (const [name, definition] of Object.entries(retentionProjection.relationships)) {
      const [table, constraint] = name.split(".");
      await db.exec(
        `alter table public.${table} drop constraint if exists ${constraint};alter table public.${table} add constraint ${constraint} ${definition}`,
      );
    }
    for (const table of Object.keys(retentionProjection.columns))
      await db.exec(
        `alter table public.${table} enable row level security;revoke all on public.${table} from public,anon,authenticated;grant all on public.${table} to service_role`,
      );
    await db.exec("select public.protect_account_access_boundaries()");
    if (install) await db.exec(consentErasureMigration());
    return db;
  } catch (error) {
    if (!provided) await db.close();
    throw error;
  }
}
