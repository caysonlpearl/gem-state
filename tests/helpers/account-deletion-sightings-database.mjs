import { readFileSync } from "node:fs";
import { submissionRecordsDatabase } from "./account-deletion-submission-records-database.mjs";
export const sightingsSchema = JSON.parse(
  readFileSync(
    new URL("../fixtures/account-deletion-sightings-schema-20261115.json", import.meta.url),
    "utf8",
  ),
);
export const sightingsMigration = () =>
  readFileSync(
    new URL(
      "../../supabase/migrations/20261115090000_account_deletion_sightings.sql",
      import.meta.url,
    ),
    "utf8",
  );
const q = (s) => '"' + s.replaceAll('"', '""') + '"';
/** Actual captured source schema and report/respond functions; supporting
 * location/park/resort labels and all member payloads are synthetic. */
export async function sightingsDatabase({ install = true, provided } = {}) {
  const db = await submissionRecordsDatabase({ provided });
  try {
    for (const [name, values] of Object.entries(sightingsSchema.enumTypes))
      if (!(await db.query("select to_regtype($1)r", ["public." + name])).rows[0].r)
        await db.exec(
          `create type public.${q(name)}as enum(${values.map((v) => "'" + v + "'").join(",")})`,
        );
    for (const row of sightingsSchema.rows) {
      await db.exec(`create table if not exists public.${q(row.source)}()`);
      for (const c of (
        await db.query(
          "select conrelid::regclass::text t,conname from pg_constraint where contype<>'n'and(conrelid=$1::regclass or confrelid=$1::regclass)",
          ["public." + row.source],
        )
      ).rows)
        await db.exec(`alter table ${c.t} drop constraint ${q(c.conname)}`);
    }
    for (const row of sightingsSchema.rows) {
      const table = "public." + q(row.source);
      for (const hook of (
        await db.query(
          "select tgname from pg_trigger where tgrelid=$1::regclass and not tgisinternal",
          ["public." + row.source],
        )
      ).rows)
        await db.exec(`drop trigger ${q(hook.tgname)}on ${table}`);
      for (const c of row.metadata.columns) {
        await db.exec(`alter table ${table} add column if not exists ${q(c.name)} ${c.type}`);
        await db.exec(
          `alter table ${table} alter column ${q(c.name)} ${c.default ? "set default " + c.default : "drop default"},alter column ${q(c.name)} ${c.notNull ? "set" : "drop"} not null`,
        );
      }
    }
    await db.exec(
      "create table if not exists locations(id uuid primary key);alter table locations add column if not exists name text,add column if not exists active boolean default true,add column if not exists area text,add column if not exists granularity text,add column if not exists park_id uuid;create table if not exists parks(id uuid primary key,name text,resort_id uuid);alter table parks add column if not exists name text,add column if not exists resort_id uuid;alter table resorts add column if not exists name text",
    );
    const constraints = [
      ...new Map(
        sightingsSchema.rows
          .flatMap((r) => r.metadata.constraints)
          .map((c) => [c.table + c.name, c]),
      ).values(),
    ];
    for (const c of constraints.sort(
      (a, b) =>
        Number(a.definition.startsWith("FOREIGN KEY")) -
        Number(b.definition.startsWith("FOREIGN KEY")),
    ))
      await db.exec(`alter table public.${q(c.table)}add constraint ${q(c.name)} ${c.definition}`);
    for (const row of sightingsSchema.rows) {
      const table = "public." + q(row.source);
      for (const index of row.metadata.indexes) {
        const name = index.match(/CREATE (?:UNIQUE )?INDEX (\S+)/)[1];
        if (!(await db.query("select to_regclass($1)r", [name])).rows[0].r) await db.exec(index);
      }
      for (const hook of row.metadata.triggers ?? []) {
        await db.exec(hook.function);
        await db.exec(hook.definition);
      }
      await db.exec(
        `alter table ${table} enable row level security;revoke all on ${table} from public,anon,authenticated;grant all on ${table} to service_role`,
      );
      for (const p of row.metadata.policies) {
        if (p.name === "bluebird_account_session_boundary") continue;
        const cmd = { r: "select", a: "insert", w: "update", d: "delete", "*": "all" }[p.command];
        await db.exec(
          `create policy ${q(p.name)}on ${table} as ${p.permissive ? "permissive" : "restrictive"} for ${cmd} to ${p.roles.map((r) => (r === "PUBLIC" ? r : q(r))).join(",")}${p.using ? " using(" + p.using + ")" : ""}${p.check ? " with check(" + p.check + ")" : ""}`,
        );
      }
    }
    // The actual captured throttle body runs against synthetic event payloads.
    // This fixture does not model the rate-event table's deletion/retention contract.
    await db.exec(
      "create table rate_limit_events(user_id uuid,action text,created_at timestamptz default now());alter table rate_limit_events enable row level security;revoke all on rate_limit_events from public,anon,authenticated;grant all on rate_limit_events to service_role",
    );
    for (const f of [...sightingsSchema.functions, sightingsSchema.rateLimitFunction])
      await db.exec(
        f.definition
          .replace(
            "AS $function$BEGIN\n PERFORM public.assert_current_account_access(); -- bluebird-account-boundary-v1\n",
            "AS $function$",
          )
          .replace(/\nEND;\$function\$\n?$/, "\n$function$\n"),
      );
    await db.exec(
      "create view variant_sightings_public as " + sightingsSchema.views.variant_sightings_public,
    );
    await db.exec("select protect_account_access_boundaries()");
    if (install) await db.exec(sightingsMigration());
    return db;
  } catch (e) {
    if (!provided) await db.close();
    throw e;
  }
}
