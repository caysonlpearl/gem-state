import { readFileSync } from "node:fs";
import { sourcingDatabase } from "./account-deletion-sourcing-database.mjs";
export const activitySchema = JSON.parse(
  readFileSync(
    new URL("../fixtures/account-deletion-activity-schema-20261115.json", import.meta.url),
    "utf8",
  ),
);
export const activityMigration = () =>
  readFileSync(
    new URL(
      "../../supabase/migrations/20261115120000_account_deletion_activity.sql",
      import.meta.url,
    ),
    "utf8",
  );
const q = (s) => '"' + s.replaceAll('"', '""') + '"';
/** Captured activity relations and callbacks; all members/content and supporting
 * maintenance payloads are synthetic. No provider or production record is used. */
export async function activityDatabase({ install = true, provided } = {}) {
  const db = await sourcingDatabase({ provided });
  try {
    if (!(await db.query("select 1 from pg_roles where rolname='postgres'")).rows.length)
      await db.exec("create role postgres superuser nologin");
    for (const row of activitySchema.rows) {
      await db.exec(
        `drop table if exists public.${q(row.source)};create table public.${q(row.source)}()`,
      );
      for (const c of row.metadata.columns)
        await db.exec(
          `alter table public.${q(row.source)} add column ${q(c.name)} ${c.type}${c.default ? " default " + c.default : ""}${c.notNull ? " not null" : ""}`,
        );
      for (const c of row.metadata.constraints)
        await db.exec(
          `alter table public.${q(c.table)} add constraint ${q(c.name)} ${c.definition}`,
        );
      for (const index of row.metadata.indexes)
        if (!index.includes("UNIQUE INDEX")) await db.exec(index);
      await db.exec(
        `alter table public.${q(row.source)} enable row level security;grant all on public.${q(row.source)} to anon,authenticated,service_role`,
      );
      if (!(await db.query("select to_regtype('public.app_role')r")).rows[0].r)
        await db.exec("create type public.app_role as enum('admin')");
      if (
        !(await db.query("select to_regprocedure('public.has_role(uuid,public.app_role)')r"))
          .rows[0].r
      )
        await db.exec(
          "create function public.has_role(uuid,public.app_role)returns boolean language sql stable as $$select public.has_role($1,$2::text)$$",
        );
      for (const p of row.metadata.policies) {
        if (p.name === "bluebird_account_session_boundary") continue;
        const command = { r: "select", a: "insert", w: "update", d: "delete", "*": "all" }[
          p.command
        ];
        await db.exec(
          `create policy ${q(p.name)}on public.${q(row.source)} as ${p.permissive ? "permissive" : "restrictive"} for ${command} to ${p.roles.map((r) => (r === "PUBLIC" ? r : q(r))).join(",")}${p.using ? " using(" + p.using + ")" : ""}${p.check ? " with check(" + p.check + ")" : ""}`,
        );
      }
      await db.exec(`alter table public.${q(row.source)} owner to postgres`);
    }
    // The predecessor queue fixture uses minimal support tables. Install actual
    // event/favorite/inventory definitions and the actual timestamp columns used
    // by the captured maintenance/history functions. Other business payloads and
    // the full consent/financial retention policy remain outside this fixture.
    const shopping = readFileSync(
      new URL(
        "../../supabase/migrations/20261113010000_shopper_personalization.sql",
        import.meta.url,
      ),
      "utf8",
    );
    for (const table of ["shopping_events", "shopping_favorites", "shopping_inventory"]) {
      const match = shopping.match(
        new RegExp(`create table public[.]${table} \\([\\s\\S]*?\\n\\);`),
      );
      if (!match) throw Error("Missing captured maintenance support table");
      if (!(await db.query("select to_regclass($1)r", ["public." + table])).rows[0].r)
        await db.exec(match[0]);
      await db.exec(
        `alter table public.${table} enable row level security;revoke all on public.${table} from public,anon,authenticated;grant all on public.${table} to service_role`,
      );
    }
    await db.exec(
      "create table if not exists shopping_email_receipts(id text primary key,kind text not null,created_at timestamptz not null default now());alter table shopping_email_receipts enable row level security;revoke all on shopping_email_receipts from public,anon,authenticated;grant all on shopping_email_receipts to service_role;alter table shopping_consents add column if not exists recorded_at timestamptz not null default now();alter table shopping_queue add column if not exists created_at timestamptz not null default now();alter table shopping_deliveries add column if not exists created_at timestamptz not null default now();alter table shopping_ad_outbox add column if not exists created_at timestamptz not null default now();alter table shopping_accounts add column if not exists history_after timestamptz not null default '1970-01-01'",
    );
    // Native test clusters use listing_test as owner. Reconstruct the captured
    // callback owner/ACL in this disposable cluster; do not weaken the production
    // migration's exact permission check to accommodate a fixture-only username.
    for (const f of activitySchema.functions) {
      await db.exec(f.definition + ";");
      if (f.signature !== "enforce_rate_limit(text,integer,interval)")
        await db.exec(
          `revoke all on function public.${f.signature}from public,anon,authenticated;grant execute on function public.${f.signature}to service_role`,
        );
      else
        await db.exec(
          `grant execute on function public.${f.signature}to public,anon,authenticated,service_role`,
        );
      await db.exec(`alter function public.${f.signature} owner to postgres`);
    }
    await db.exec("select public.protect_account_access_boundaries()");
    if (install) await db.exec(activityMigration());
    return db;
  } catch (error) {
    if (!provided) await db.close();
    throw error;
  }
}
