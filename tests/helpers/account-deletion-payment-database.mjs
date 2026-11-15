import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const paymentFixture = JSON.parse(
  readFileSync(
    new URL(
      "../fixtures/account-deletion-settlement-payment-schema-20261115.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
export async function installPaymentCallback(db) {
  const quote = (s) => '"' + s.replaceAll('"', '""') + '"';
  for (const [name, values] of Object.entries(paymentFixture.enumTypes))
    if (!(await db.query("select to_regtype($1) r", ["public." + name])).rows[0].r)
      await db.exec(
        `create type public.${quote(name)} as enum(${values.map((v) => "'" + v.replaceAll("'", "''") + "'").join(",")})`,
      );
  for (const row of paymentFixture.rows) {
    if (!(await db.query("select to_regclass($1) r", ["public." + row.source])).rows[0].r)
      await db.exec(`create table public.${quote(row.source)}()`);
    for (const c of row.metadata.columns) {
      if (c.default?.includes("nextval(")) {
        const seq = c.default.match(/nextval\('([^']+)'::regclass\)/)?.[1];
        assert(seq);
        await db.exec(
          `create sequence if not exists public.${quote(seq.replace(/^public\./, ""))}`,
        );
      }
      if (
        !(
          await db.query(
            "select 1 from pg_attribute where attrelid=$1::regclass and attname=$2 and not attisdropped",
            ["public." + row.source, c.name],
          )
        ).rows.length
      )
        await db.exec(
          `alter table public.${quote(row.source)} add column ${quote(c.name)} ${c.type}${c.generated ? " generated always as (" + c.default + ") stored" : ""}`,
        );
      await db.exec(
        `alter table public.${quote(row.source)} ${c.generated ? "" : "alter column " + quote(c.name) + " " + (c.default ? "set default " + c.default : "drop default") + ","}alter column ${quote(c.name)} ${c.notNull ? "set" : "drop"} not null`,
      );
    }
    for (const c of row.metadata.constraints.filter(
      (c) => c.table === row.source && /^(PRIMARY KEY|UNIQUE|CHECK)/.test(c.definition),
    )) {
      if (
        !(
          await db.query("select 1 from pg_constraint where conrelid=$1::regclass and conname=$2", [
            "public." + row.source,
            c.name,
          ])
        ).rows.length
      )
        await db.exec(
          `alter table public.${quote(row.source)} add constraint ${quote(c.name)} ${c.definition}`,
        );
    }
    for (const hook of row.metadata.triggers ?? []) {
      await db.exec(hook.function);
      await db.exec(hook.definition);
    }
  }
  // No offer is created in this exact-purchase test. Retain the captured types
  // for columns parsed by the finalizer's competing-offer update statements.
  for (const c of paymentFixture.offerSupport.columns)
    if (
      !(
        await db.query(
          "select 1 from pg_attribute where attrelid='public.listing_offers'::regclass and attname=$1 and not attisdropped",
          [c.name],
        )
      ).rows.length
    )
      await db.exec(
        `alter table listing_offers add column ${quote(c.name)} ${c.type}${c.default ? " default " + c.default : ""}${c.notNull ? " not null" : ""}`,
      );
  const prefix =
    "AS $function$BEGIN\n PERFORM public.assert_current_account_access(); -- bluebird-account-boundary-v1\n";
  await db.exec(
    paymentFixture.function.definition
      .replace(prefix, "AS $function$")
      .replace(/\nEND;\$function\$\n?$/, "\n$function$\n"),
  );
  await db.exec("select protect_account_access_boundaries()");
  assert.equal(
    (
      await db.query(
        "select md5(prosrc) hash from pg_proc where oid='public.finalize_stripe_order_payment(uuid,text,text,text,integer,integer,text,uuid)'::regprocedure",
      )
    ).rows[0].hash,
    paymentFixture.function.bodyMd5,
  );
}
