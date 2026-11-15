import { readFileSync } from "node:fs";
import { consentErasureDatabase } from "./account-deletion-consent-erasure-database.mjs";
export const businessClaimsSchema = JSON.parse(
  readFileSync(
    new URL("../fixtures/account-deletion-business-claims-schema-20261115.json", import.meta.url),
    "utf8",
  ),
);
export const businessClaimsMigration = () =>
  readFileSync(
    new URL(
      "../../supabase/migrations/20261115140000_account_deletion_business_claims.sql",
      import.meta.url,
    ),
    "utf8",
  );
const q = (s) => '"' + s.replaceAll('"', '""') + '"';
export async function businessClaimsDatabase({ provided, install = true } = {}) {
  const db = await consentErasureDatabase({ provided });
  try {
    // Only empty disposable sources are reconstructed. Restore the predecessor's
    // two reviewed hooks after replacing its minimal retention-only projections.
    const hooks = (
      await db.query(
        "select pg_get_triggerdef(oid,true)d from pg_trigger where tgname='account_deletion_consent_retention_writer'and tgrelid in('public.employer_claims'::regclass,'public.service_directory_claims'::regclass)",
      )
    ).rows;
    for (const row of businessClaimsSchema.rows)
      await db.exec(`drop table if exists public.${q(row.source)} cascade`);
    for (const row of businessClaimsSchema.rows) {
      const table = "public." + q(row.source);
      await db.exec(`create table ${table}()`);
      for (const c of row.metadata.columns)
        await db.exec(
          `alter table ${table} add column ${q(c.name)} ${c.type}${c.generated ? " generated always as (" + c.default + ") stored" : c.default ? " default " + c.default : ""}${c.notNull ? " not null" : ""}`,
        );
    }
    const constraints = [
      ...new Map(
        businessClaimsSchema.rows
          .flatMap((r) => r.metadata.constraints)
          .map((c) => [c.table + "." + c.name, c]),
      ).values(),
    ].sort(
      (a, b) =>
        Number(a.definition.startsWith("FOREIGN KEY")) -
        Number(b.definition.startsWith("FOREIGN KEY")),
    );
    for (const c of constraints)
      await db.exec(`alter table public.${q(c.table)} add constraint ${q(c.name)} ${c.definition}`);
    for (const row of businessClaimsSchema.rows) {
      const table = "public." + q(row.source);
      for (const index of row.metadata.indexes ?? [])
        if (!index.includes("UNIQUE INDEX")) await db.exec(index);
      await db.exec(
        `alter table ${table} owner to postgres;alter table ${table} enable row level security;revoke all on ${table} from public,anon,authenticated,service_role;grant all on ${table} to service_role`,
      );
      if (row.source !== "service_directory")
        await db.exec(`grant select,insert,update on ${table} to authenticated`);
      for (const p of row.metadata.policies) {
        // The predecessor's registered policy refers to the dropped table OID.
        // Recreate the same boundary through its real installer, as other full
        // captured-schema fixtures do, instead of retaining a stale registry hash.
        if (p.name === "bluebird_account_session_boundary") continue;
        const command = { r: "select", a: "insert", w: "update", d: "delete", "*": "all" }[
          p.command
        ];
        await db.exec(
          `create policy ${q(p.name)} on ${table} as ${p.permissive ? "permissive" : "restrictive"} for ${command} to ${p.roles.map(q).join(",")}${p.using ? " using(" + p.using + ")" : ""}${p.check ? " with check(" + p.check + ")" : ""}`,
        );
      }
    }
    for (const h of hooks) await db.exec(h.d);
    await db.exec("select public.protect_account_access_boundaries()");
    if (install) await db.exec(businessClaimsMigration());
    return db;
  } catch (error) {
    if (!provided) await db.close();
    throw error;
  }
}
