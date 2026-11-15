import { readFileSync } from "node:fs";
import { catalogDatabase, seedCatalog } from "./account-deletion-catalog-database.mjs";
import { fixtureMemberSession } from "./account-deletion-owned-listings-database.mjs";
export const variationSchema = JSON.parse(
  readFileSync(
    new URL("../fixtures/catalog-admin-variation-schema-20261115.json", import.meta.url),
    "utf8",
  ),
);
export const variationMigration = () =>
  readFileSync(
    new URL(
      "../../supabase/migrations/20261115070000_catalog_admin_named_variations.sql",
      import.meta.url,
    ),
    "utf8",
  );
const quote = (s) => '"' + s.replaceAll('"', '""') + '"';
export async function variationDatabase({ install = true, provided } = {}) {
  const db = await catalogDatabase({ provided });
  try {
    for (const row of variationSchema.rows) {
      const table = "public." + quote(row.source);
      for (const c of row.metadata.columns) {
        if (
          !(
            await db.query(
              "select 1 from pg_attribute where attrelid=$1::regclass and attname=$2 and not attisdropped",
              ["public." + row.source, c.name],
            )
          ).rows.length
        )
          await db.exec(`alter table ${table}add column ${quote(c.name)} ${c.type}`);
        await db.exec(
          `alter table ${table}alter column ${quote(c.name)} ${c.default ? "set default " + c.default : "drop default"},alter column ${quote(c.name)} ${c.notNull ? "set" : "drop"} not null`,
        );
      }
    }
    for (const row of variationSchema.rows) {
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
        const name = index.match(/CREATE (?:UNIQUE )?INDEX (\S+)/)[1];
        if (!(await db.query("select to_regclass($1)r", [name])).rows[0].r) await db.exec(index);
      }
      for (const hook of row.metadata.triggers ?? []) {
        await db.exec(hook.function);
        await db.exec(hook.definition);
      }
      await db.exec(
        `alter table public.${quote(row.source)}enable row level security;revoke all on public.${quote(row.source)}from public,anon,authenticated;grant all on public.${quote(row.source)}to service_role`,
      );
      for (const p of row.metadata.policies ?? []) {
        if (p.name === "bluebird_account_session_boundary") continue;
        if (
          (
            await db.query("select 1 from pg_policy where polrelid=$1::regclass and polname=$2", [
              "public." + row.source,
              p.name,
            ])
          ).rows.length
        )
          continue;
        const commands = { r: "select", a: "insert", w: "update", d: "delete", "*": "all" };
        await db.exec(
          `create policy ${quote(p.name)}on public.${quote(row.source)}as ${p.permissive ? "permissive" : "restrictive"} for ${commands[p.command]} to ${p.roles.map((r) => (r === "PUBLIC" ? "PUBLIC" : quote(r))).join(",")}${p.using ? " using(" + p.using + ")" : ""}${p.check ? " with check(" + p.check + ")" : ""}`,
        );
      }
    }
    // Supporting resort/brand/audit payloads and roles are synthetic; the
    // captured product, variant, submission, notice and approval code is real.
    await db.exec(`alter table resorts add column code text,add column active boolean default true;
   alter table fb_marketplace_import_items add column seller_edited boolean default false;
   alter table brands alter column id set default gen_random_uuid(),add column slug text unique,add column name text;
   alter table collections alter column id set default gen_random_uuid(),add column slug text unique,add column name text;
   create table admin_audit_log(id uuid primary key default gen_random_uuid(),actor_id uuid,action text,entity text,entity_id uuid,"before" jsonb,"after" jsonb,note text);`);
    const notice = JSON.parse(
      readFileSync(
        new URL(
          "../fixtures/account-deletion-settlement-notices-schema-20261115.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    for (const c of notice.notifications.columns) {
      if (
        !(
          await db.query(
            "select 1 from pg_attribute where attrelid='public.notifications'::regclass and attname=$1 and not attisdropped",
            [c.name],
          )
        ).rows.length
      )
        await db.exec(`alter table notifications add column ${quote(c.name)} ${c.type}`);
      await db.exec(
        `alter table notifications alter column ${quote(c.name)} ${c.default ? "set default " + c.default : "drop default"},alter column ${quote(c.name)} ${c.notNull ? "set" : "drop"} not null`,
      );
    }
    const prefix =
      "AS $function$BEGIN\n PERFORM public.assert_current_account_access(); -- bluebird-account-boundary-v1\n";
    for (const f of variationSchema.functions) {
      await db.exec(
        f.definition
          .replace(prefix, "AS $function$")
          .replace(/\nEND;\$function\$\n?$/, "\n$function$\n"),
      );
    }
    await db.exec("select protect_account_access_boundaries()");
    if (install) await db.exec(variationMigration());
    return db;
  } catch (e) {
    if (!provided) await db.close();
    throw e;
  }
}
export async function variationActors(db) {
  const admin = await seedCatalog(db),
    author = await seedCatalog(db);
  await db.query("insert into conversation_fixture_operators(user_id)values($1)", [admin.seller]);
  const resort = (
    await db.query(
      "insert into resorts(id,code,active)values(gen_random_uuid(),'TEST',true)returning id",
    )
  ).rows[0].id;
  await fixtureMemberSession(db, admin.seller);
  return { admin, author, resort };
}
