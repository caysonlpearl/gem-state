import { readFileSync } from "node:fs";
import { sightingsDatabase } from "./account-deletion-sightings-database.mjs";
export const sourcingSchema = JSON.parse(
  readFileSync(
    new URL("../fixtures/account-deletion-sourcing-schema-20261115.json", import.meta.url),
    "utf8",
  ),
);
export const sourcingMigration = () =>
  readFileSync(
    new URL(
      "../../supabase/migrations/20261115100000_account_deletion_sourcing.sql",
      import.meta.url,
    ),
    "utf8",
  );
const q = (s) => '"' + s.replaceAll('"', '""') + '"';
/** Captured source definitions and member callbacks. Fee selection/settings,
 * members and supporting location/financial payloads remain synthetic. */
export async function sourcingDatabase({ install = true, provided } = {}) {
  const db = await sightingsDatabase({ provided });
  try {
    for (const [name, values] of Object.entries(sourcingSchema.enumTypes))
      if (!(await db.query("select to_regtype($1)r", ["public." + name])).rows[0].r)
        await db.exec(
          `create type public.${q(name)} as enum(${values.map((v) => "'" + v + "'").join(",")})`,
        );
    for (const row of sourcingSchema.rows)
      await db.exec(`create table if not exists public.${q(row.source)}()`);
    for (const row of sourcingSchema.rows)
      for (const c of (
        await db.query(
          "select conrelid::regclass::text t,conname from pg_constraint where contype<>'n'and(conrelid=$1::regclass or confrelid=$1::regclass)",
          ["public." + row.source],
        )
      ).rows)
        await db.exec(`alter table ${c.t} drop constraint ${q(c.conname)}`);
    for (const row of sourcingSchema.rows) {
      const table = "public." + q(row.source);
      for (const h of (
        await db.query(
          "select tgname from pg_trigger where tgrelid=$1::regclass and not tgisinternal",
          ["public." + row.source],
        )
      ).rows)
        if (h.tgname !== "guard_member_photo_reference")
          await db.exec(`drop trigger ${q(h.tgname)} on ${table}`);
      for (const c of (
        await db.query(
          "select attname from pg_attribute where attrelid=$1::regclass and attnum>0 and not attisdropped",
          ["public." + row.source],
        )
      ).rows)
        if (!row.metadata.columns.some((x) => x.name === c.attname))
          await db.exec(`alter table ${table} drop column ${q(c.attname)}`);
      for (const c of row.metadata.columns) {
        await db.exec(`alter table ${table} add column if not exists ${q(c.name)} ${c.type}`);
        await db.exec(
          `alter table ${table} alter column ${q(c.name)} ${c.default ? "set default " + c.default : "drop default"},alter column ${q(c.name)} ${c.notNull ? "set" : "drop"} not null`,
        );
      }
    }
    await db.exec(`create table sourcing_fixture_shoppers(user_id uuid primary key);
      create or replace function public.has_role(uuid,text)returns boolean language sql as $$select ($2='admin'and exists(select 1 from public.conversation_fixture_operators where user_id=$1))or($2='shopper'and exists(select 1 from public.sourcing_fixture_shoppers where user_id=$1))$$;`);
    const constraints = [
      ...new Map(
        sourcingSchema.rows
          .flatMap((r) => r.metadata.constraints)
          .map((c) => [c.table + c.name, c]),
      ).values(),
    ];
    for (const c of constraints.sort(
      (a, b) =>
        Number(a.definition.startsWith("FOREIGN KEY")) -
        Number(b.definition.startsWith("FOREIGN KEY")),
    ))
      await db.exec(`alter table public.${q(c.table)} add constraint ${q(c.name)} ${c.definition}`);
    await db.exec(`create table market_settings(id boolean primary key default true,custom_sourcing_requests_enabled boolean default false,shopper_quotes_enabled boolean default false,live_checkout_enabled boolean default false,checkout_reservation_minutes integer default 30,pilot_reservation_minutes integer default 30);
      insert into market_settings(id)values(true);
      create table fee_schedules(id uuid primary key default gen_random_uuid(),label text,currency char(3),buyer_fee_bps integer,seller_fee_bps integer,minimum_fee_cents integer);
      insert into fee_schedules(label,currency,buyer_fee_bps,seller_fee_bps,minimum_fee_cents)values('Synthetic fee selection','USD',500,0,0);
      create function effective_fee_schedule(character,uuid)returns setof fee_schedules language sql stable as $$select * from public.fee_schedules where currency=$1 limit 1$$;`);
    // Exercise the real acceptance callback against captured order columns/defaults,
    // retaining existing account guards. Payment/provider behavior is
    // outside this fixture; no Stripe request is made.
    const payment = JSON.parse(
      readFileSync(
        new URL(
          "../fixtures/account-deletion-settlement-payment-schema-20261115.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    for (const [name, values] of Object.entries(payment.enumTypes))
      if (!(await db.query("select to_regtype($1)r", ["public." + name])).rows[0].r)
        await db.exec(
          `create type public.${q(name)} as enum(${values.map((v) => "'" + v + "'").join(",")})`,
        );
    for (const row of payment.rows.filter((r) => ["orders", "order_events"].includes(r.source))) {
      await db.exec(`create table if not exists public.${q(row.source)}()`);
      for (const c of row.metadata.columns) {
        if (c.default?.includes("nextval(")) {
          const seq = c.default.match(/nextval\('([^']+)'::regclass\)/)[1].replace(/^public\./, "");
          await db.exec(`create sequence if not exists public.${q(seq)}`);
        }
        await db.exec(
          `alter table public.${q(row.source)} add column if not exists ${q(c.name)} ${c.type}${c.generated ? " generated always as (" + c.default + ") stored" : ""}`,
        );
        await db.exec(
          `alter table public.${q(row.source)} ${c.generated ? "" : "alter column " + q(c.name) + " " + (c.default ? "set default " + c.default : "drop default") + ","}alter column ${q(c.name)} ${c.notNull ? "set" : "drop"} not null`,
        );
      }
    }
    for (const f of [
      ...sourcingSchema.support.functions.filter((f) => f.signature !== "quotes_for_my_requests()"),
      ...sourcingSchema.functions,
    ]) {
      const definition = f.definition
        .replace(
          "AS $function$BEGIN\n PERFORM public.assert_current_account_access(); -- bluebird-account-boundary-v1\n",
          "AS $function$",
        )
        .replace(/\nEND;\$function\$\n?$/, "\n$function$\n")
        .replace(
          "AS $function$SELECT public.assert_current_account_access(); -- bluebird-account-boundary-v1\n",
          "AS $function$",
        );
      await db.exec(definition);
    }
    for (const row of sourcingSchema.rows) {
      const table = "public." + q(row.source);
      for (const index of row.metadata.indexes) {
        const name = index.match(/CREATE (?:UNIQUE )?INDEX (\S+)/)[1];
        if (!(await db.query("select to_regclass($1)r", [name])).rows[0].r) await db.exec(index);
      }
      for (const h of row.metadata.triggers ?? []) {
        await db.exec(h.function);
        await db.exec(h.definition);
      }
      await db.exec(
        `alter table ${table} enable row level security;revoke all on ${table} from public,anon,authenticated;grant all on ${table} to service_role`,
      );
      for (const p of row.metadata.policies ?? []) {
        if (p.name === "bluebird_account_session_boundary") continue;
        const cmd = { r: "select", a: "insert", w: "update", d: "delete", "*": "all" }[p.command];
        await db.exec(
          `create policy ${q(p.name)} on ${table} as ${p.permissive ? "permissive" : "restrictive"} for ${cmd} to ${p.roles.map((r) => (r === "PUBLIC" ? r : q(r))).join(",")}${p.using ? " using(" + p.using + ")" : ""}${p.check ? " with check(" + p.check + ")" : ""}`,
        );
      }
    }
    await db.exec("select protect_account_access_boundaries()");
    if (install) await db.exec(sourcingMigration());
    return db;
  } catch (e) {
    if (!provided) await db.close();
    throw e;
  }
}
