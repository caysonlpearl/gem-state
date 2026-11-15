import { readFileSync } from "node:fs";
import { applicationDatabase } from "./account-deletion-owned-listings-database.mjs";
export const listingCacheSchema = JSON.parse(
  readFileSync(
    new URL("../fixtures/account-deletion-listing-cache-schema-20261115.json", import.meta.url),
    "utf8",
  ),
);
export const listingRecordsMigration = () =>
  readFileSync(
    new URL(
      "../../supabase/migrations/20261115040000_account_deletion_listing_records.sql",
      import.meta.url,
    ),
    "utf8",
  );
const quote = (s) => '"' + s.replaceAll('"', '""') + '"';
/** Core listing/media schema and callbacks are captured in the parent fixture.
 * Vector payloads are opaque arrays here; no inference, vector search or ANN
 * performance is claimed. Real PK/FK deletion behavior is retained. */
export async function listingRecordsDatabase({ install = true, provided } = {}) {
  const db = await applicationDatabase({ provided });
  try {
    for (const row of listingCacheSchema.rows) {
      const table = "public." + quote(row.source),
        m = row.metadata;
      if (!(await db.query("select to_regclass($1)r", ["public." + row.source])).rows[0].r)
        await db.exec(`create table ${table}()`);
      for (const c of m.columns) {
        const type = c.type.replace(/^(?:extensions\.)?vector\(\d+\)$/, "double precision[]");
        if (
          !(
            await db.query(
              "select 1 from pg_attribute where attrelid=$1::regclass and attname=$2 and not attisdropped",
              ["public." + row.source, c.name],
            )
          ).rows.length
        )
          await db.exec(`alter table ${table} add column ${quote(c.name)} ${type}`);
        await db.exec(
          `alter table ${table} alter column ${quote(c.name)}${c.default ? " set default " + c.default : " drop default"},alter column ${quote(c.name)} ${c.notNull ? "set" : "drop"} not null`,
        );
      }
    }
    for (const row of listingCacheSchema.rows)
      for (const c of row.metadata.constraints.filter(
        (c) => c.table === row.source && /^(PRIMARY KEY|UNIQUE)/.test(c.definition),
      ))
        if (
          !(
            await db.query(
              "select 1 from pg_constraint where conrelid=$1::regclass and conname=$2",
              ["public." + row.source, c.name],
            )
          ).rows.length
        )
          await db.exec(
            `alter table public.${quote(row.source)} add constraint ${quote(c.name)} ${c.definition}`,
          );
    for (const row of listingCacheSchema.rows) {
      for (const c of row.metadata.constraints.filter((c) => c.table === row.source))
        if (
          !(
            await db.query(
              "select 1 from pg_constraint where conrelid=$1::regclass and conname=$2",
              ["public." + row.source, c.name],
            )
          ).rows.length
        )
          await db.exec(
            `alter table public.${quote(row.source)} add constraint ${quote(c.name)} ${c.definition}`,
          );
      for (const index of row.metadata.indexes ?? []) {
        if (index.includes("USING hnsw")) continue;
        const name = index.match(/CREATE (?:UNIQUE )?INDEX (\S+)/)[1];
        if (!(await db.query("select to_regclass($1)r", [name])).rows[0].r) await db.exec(index);
      }
      for (const t of row.metadata.triggers ?? []) {
        await db.exec(t.function);
        await db.exec(t.definition);
      }
      await db.exec(
        `alter table public.${quote(row.source)} enable row level security;revoke all on public.${quote(row.source)}from public,anon,authenticated;grant all on public.${quote(row.source)}to service_role`,
      );
    }
    await db.exec("select protect_account_access_boundaries()");
    if (install) await db.exec(listingRecordsMigration());
    return db;
  } catch (e) {
    if (!provided) await db.close();
    throw e;
  }
}
