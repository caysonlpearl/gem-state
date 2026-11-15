import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  listingRecordsDatabase,
  listingRecordsMigration,
} from "./account-deletion-listing-records-database.mjs";
export const catalogSchema = JSON.parse(
  readFileSync(
    new URL("../fixtures/account-deletion-catalog-schema-20261115.json", import.meta.url),
    "utf8",
  ),
);
export const catalogMigration = () =>
  readFileSync(
    new URL(
      "../../supabase/migrations/20261115060000_account_deletion_catalog.sql",
      import.meta.url,
    ),
    "utf8",
  );
const quote = (s) => '"' + s.replaceAll('"', '""') + '"';
/** Captured core catalog columns/checks/FKs/hooks/policies. Supporting incoming
 * financial/business/member payloads are synthetic; no member or provider is read. */
export async function catalogDatabase({ install = true, provided } = {}) {
  const db = await listingRecordsDatabase({ install: false, provided });
  try {
    const names = catalogSchema.rows.map((r) => r.source);
    for (const [name, values] of Object.entries(catalogSchema.enumTypes))
      if (!(await db.query("select to_regtype($1)r", ["public." + name])).rows[0].r)
        await db.exec(
          `create type public.${quote(name)} as enum(${values.map((v) => "'" + v.replaceAll("'", "''") + "'").join(",")})`,
        );
    // Rebuild only disposable empty fixture relations. Remove old synthetic
    // incoming keys before replacing their referenced synthetic unique indexes.
    for (const k of (
      await db.query(
        "select conrelid::regclass::text t,conname from pg_constraint where contype='f' and confrelid in(select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'and c.relname=any($1::text[]))",
        [names],
      )
    ).rows)
      await db.exec(`alter table ${k.t} drop constraint ${quote(k.conname)}`);
    for (const row of catalogSchema.rows) {
      const table = "public." + quote(row.source);
      if (!(await db.query("select to_regclass($1)r", ["public." + row.source])).rows[0].r)
        await db.exec(`create table ${table}()`);
      for (const k of (
        await db.query(
          "select conname from pg_constraint where conrelid=$1::regclass and contype<>'n'",
          ["public." + row.source],
        )
      ).rows)
        await db.exec(`alter table ${table} drop constraint ${quote(k.conname)}`);
      for (const k of (
        await db.query(
          "select indexrelid::regclass::text n from pg_index where indrelid=$1::regclass",
          ["public." + row.source],
        )
      ).rows)
        await db.exec(`drop index ${k.n}`);
      for (const k of (
        await db.query(
          "select tgname from pg_trigger where tgrelid=$1::regclass and not tgisinternal",
          ["public." + row.source],
        )
      ).rows)
        await db.exec(`drop trigger ${quote(k.tgname)} on ${table}`);
      const present = (
        await db.query(
          "select attname from pg_attribute where attrelid=$1::regclass and attnum>0 and not attisdropped",
          ["public." + row.source],
        )
      ).rows.map((r) => r.attname);
      for (const old of present)
        if (!row.metadata.columns.some((c) => c.name === old))
          await db.exec(`alter table ${table} drop column ${quote(old)}`);
      for (const c of row.metadata.columns) {
        if (!present.includes(c.name))
          await db.exec(
            `alter table ${table} add column ${quote(c.name)} ${c.type}${c.generated ? " generated always as (" + c.default + ") stored" : ""}`,
          );
        await db.exec(
          `alter table ${table} ${c.generated ? "" : "alter column " + quote(c.name) + " " + (c.default ? "set default " + c.default : "drop default") + ","}alter column ${quote(c.name)} ${c.notNull ? "set" : "drop"} not null`,
        );
      }
    }
    const constraints = [
      ...new Map(
        catalogSchema.rows
          .flatMap((r) => r.metadata.constraints)
          .map((c) => [c.table + "." + c.name, c]),
      ).values(),
    ];
    for (const c of constraints.filter(
      (c) => names.includes(c.table) && !c.definition.startsWith("FOREIGN KEY"),
    ))
      await db.exec(
        `alter table public.${quote(c.table)} add constraint ${quote(c.name)} ${c.definition}`,
      );
    for (const c of constraints.filter((c) => c.definition.startsWith("FOREIGN KEY"))) {
      const parent = c.definition.match(/REFERENCES ([\w.]+)\(/)?.[1];
      if (!parent) throw Error("Unsupported fixture parent");
      if (!(await db.query("select to_regclass($1)r", [parent])).rows[0].r)
        await db.exec(
          `create table ${parent.includes(".") ? parent : "public." + quote(parent)}(id uuid primary key)`,
        );
      if (!(await db.query("select to_regclass($1)r", ["public." + c.table])).rows[0].r)
        await db.exec(`create table public.${quote(c.table)}(id uuid primary key)`);
      const col = c.definition.match(/^FOREIGN KEY \((\w+)\)/)?.[1];
      if (!col) throw Error("Unsupported fixture foreign key");
      if (
        !(
          await db.query(
            "select 1 from pg_attribute where attrelid=$1::regclass and attname=$2 and not attisdropped",
            ["public." + c.table, col],
          )
        ).rows.length
      )
        await db.exec(`alter table public.${quote(c.table)} add column ${quote(col)} uuid`);
      if (
        !(
          await db.query("select 1 from pg_constraint where conrelid=$1::regclass and conname=$2", [
            "public." + c.table,
            c.name,
          ])
        ).rows.length
      )
        await db.exec(
          `alter table public.${quote(c.table)} add constraint ${quote(c.name)} ${c.definition}`,
        );
    }
    for (const f of catalogSchema.functions) await db.exec(f.definition);
    for (const row of catalogSchema.rows) {
      const table = "public." + quote(row.source);
      for (const index of row.metadata.indexes ?? []) {
        const name = index.match(/CREATE (?:UNIQUE )?INDEX (\S+)/)[1];
        if (!(await db.query("select to_regclass($1)r", [name])).rows[0].r) await db.exec(index);
      }
      for (const hook of row.metadata.triggers ?? []) {
        await db.exec(hook.function);
        await db.exec(hook.definition);
      }
      await db.exec(
        `alter table ${table} enable row level security;revoke all on ${table}from public,anon,authenticated;grant all on ${table}to service_role`,
      );
      for (const p of row.metadata.policies ?? []) {
        if (p.name === "bluebird_account_session_boundary") continue;
        const commands = { r: "select", a: "insert", w: "update", d: "delete", "*": "all" };
        await db.exec(
          `create policy ${quote(p.name)} on ${table} as ${p.permissive ? "permissive" : "restrictive"} for ${commands[p.command]} to ${p.roles.map((r) => (r === "PUBLIC" ? "PUBLIC" : quote(r))).join(",")}${p.using ? " using(" + p.using + ")" : ""}${p.check ? " with check(" + p.check + ")" : ""}`,
        );
      }
    }
    await db.exec("select protect_account_access_boundaries()");
    await db.exec(listingRecordsMigration());
    const notice = JSON.parse(
      readFileSync(
        new URL(
          "../fixtures/account-deletion-settlement-notices-schema-20261115.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const prefix =
      "AS $function$BEGIN\n PERFORM public.assert_current_account_access(); -- bluebird-account-boundary-v1\n";
    await db.exec(
      notice.function.definition
        .replace(prefix, "AS $function$")
        .replace(/\nEND;\$function\$\n?$/, "\n$function$\n"),
    );
    await db.exec("select protect_account_access_boundaries()");
    await db.exec(
      readFileSync(
        new URL(
          "../../supabase/migrations/20261115050000_account_deletion_settlement_notices.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    if (install) await db.exec(catalogMigration());
    return db;
  } catch (e) {
    if (!provided) await db.close();
    throw e;
  }
}
export async function seedCatalog(db) {
  const seller = randomUUID(),
    buyer = randomUUID(),
    product = randomUUID(),
    variant = randomUUID();
  await db.query("insert into auth.users(id)values($1),($2)", [seller, buyer]);
  await db.query("insert into profiles(id,display_name)values($1,$2)", [
    seller,
    "catalog-" + seller.slice(0, 12),
  ]);
  await db.query(
    "insert into seller_profiles(user_id,slug,status,default_shipping_method,default_handling_days)values($1,$2,'active','usps_ground_advantage',3)",
    [seller, "catalog-" + seller.slice(0, 16)],
  );
  const category = (
    await db.query(
      "insert into categories(id,slug)values(gen_random_uuid(),'jobs')on conflict(slug)do update set slug=excluded.slug returning id",
    )
  ).rows[0].id;
  await db.query(
    "insert into products(id,slug,name,description,created_by,category_id,status)values($1,$2,'Synthetic public title','Synthetic public description',$3,$4,'published')",
    [product, "catalog-" + product, seller, category],
  );
  await db.query("insert into product_variants(id,product_id)values($1,$2)", [variant, product]);
  return { seller, buyer, product, variant, category };
}
