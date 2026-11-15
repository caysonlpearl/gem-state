import { readFileSync } from "node:fs";
import { privateRecordsDatabase } from "./account-deletion-private-database.mjs";
import { installInventorySources } from "./account-deletion-inventory-database.mjs";
export const capturedProfileSchema = JSON.parse(
  readFileSync(
    new URL("../fixtures/account-deletion-profiles-schema-20261114.json", import.meta.url),
    "utf8",
  ),
);
export const profileMigration = () =>
  readFileSync(
    new URL(
      "../../supabase/migrations/20261114200000_account_deletion_profiles.sql",
      import.meta.url,
    ),
    "utf8",
  );
const quote = (v) => '"' + v.replaceAll('"', '""') + '"';
export async function profileDatabase({ install = true, provided } = {}) {
  const db = provided ?? (await privateRecordsDatabase());
  try {
    await db.exec(`create type public.member_intent as enum(${capturedProfileSchema.member_intent_values.map((v) => "'" + v + "'").join(",")});
    create type public.listing_status as enum('active','cancelled');
    create table public.locations(id uuid primary key);create table public.parks(id uuid primary key);create table public.resorts(id uuid primary key);`);
    for (const table of [
      "profiles",
      "seller_profiles",
      "shopper_service_profiles",
      "shopper_coverage",
    ]) {
      const s = capturedProfileSchema[table];
      await db.exec(
        `create table public.${table}(${s.columns.map((c) => `${quote(c.name)} ${c.type}${c.default ? " default " + c.default : ""}${c.notNull ? " not null" : ""}`).join(",")})`,
      );
      for (const c of s.constraints.filter((c) => c.table === table))
        await db.exec(
          `alter table public.${table} add constraint ${quote(c.name)} ${c.definition}`,
        );
      for (const index of s.indexes ?? []) {
        const name = index.match(/CREATE (?:UNIQUE )?INDEX (\S+)/)[1];
        if (!(await db.query("select to_regclass($1) r", [name])).rows[0].r) await db.exec(index);
      }
    }
    // Supporting assignment/financial payloads are synthetic. Its real incoming
    // FK is retained; the profile columns, checks and hooks above are captured.
    await db.exec(`create table public.sourcing_assignments(id uuid primary key,shopper_profile_id uuid references public.shopper_service_profiles(id),financial_payload jsonb);
    create table public.verified_sales(order_id uuid,is_live boolean);create table public.order_reviews(subject_id uuid,rating numeric);`);
    await db.exec(capturedProfileSchema.is_trusted_operation);
    const seen = new Set();
    for (const table of [
      "profiles",
      "seller_profiles",
      "shopper_service_profiles",
      "shopper_coverage",
    ]) {
      for (const t of capturedProfileSchema[table].triggers) {
        if (!seen.has(t.function)) {
          await db.exec(t.function);
          seen.add(t.function);
        }
        await db.exec(t.definition);
      }
      await db.exec(
        `alter table public.${table} enable row level security;revoke all on public.${table} from public,anon,authenticated;grant all on public.${table} to service_role`,
      );
    }
    await installInventorySources(db);
    await db.exec(`alter table public.asks add column status public.listing_status default 'active',add column approved_at timestamptz,add column expires_at timestamptz,add column is_demo boolean default false,add column evidence_count int default 0,add column public_media_count int default 0;
    drop table public.seller_storefronts;create view public.seller_storefronts as ${capturedProfileSchema.seller_storefronts};
    select public.protect_account_access_boundaries();`);
    // Inventory's completion hook was introduced after the private fixture's
    // migration. Refresh only this known composition before its own preflight.
    await db.exec(
      "update public.account_deletion_private_contract set hooks=public.account_deletion_private_hooks() where id",
    );
    if (install) await db.exec(profileMigration());
    return db;
  } catch (error) {
    if (!provided) await db.close();
    throw error;
  }
}
