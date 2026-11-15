import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { seedCatalog } from "./account-deletion-catalog-database.mjs";
import { businessClaimsDatabase } from "./account-deletion-business-claims-database.mjs";
export const paymentSchema = JSON.parse(
  readFileSync(
    new URL(
      "../fixtures/account-deletion-settlement-payment-schema-20261115.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
export const ledgerActorMigration = () =>
  readFileSync(
    new URL(
      "../../supabase/migrations/20261115160000_account_deletion_ledger_actors.sql",
      import.meta.url,
    ),
    "utf8",
  );
const q = (s) => '"' + s.replaceAll('"', '""') + '"';
/** Install only the captured callback and missing offer support. Re-running the
 * older payment fixture would restore recorded_by NOT NULL over this migration.
 * No provider call or production data is involved. */
export async function installLedgerSettlementFinalizer(db) {
  for (const c of paymentSchema.offerSupport.columns)
    if (
      !(
        await db.query(
          "select 1 from pg_attribute where attrelid='public.listing_offers'::regclass and attname=$1 and not attisdropped",
          [c.name],
        )
      ).rows.length
    )
      await db.exec(
        `alter table public.listing_offers add column ${q(c.name)} ${c.type}${c.default ? " default " + c.default : ""}${c.notNull ? " not null" : ""}`,
      );
  // Let the real installer register and add the captured account boundary. A
  // pre-wrapped but unregistered fixture function correctly fails coverage.
  const prefix =
    "AS $function$BEGIN\n PERFORM public.assert_current_account_access(); -- bluebird-account-boundary-v1\n";
  assert(paymentSchema.function.definition.includes(prefix));
  await db.exec(
    paymentSchema.function.definition
      .replace(prefix, "AS $function$")
      .replace(/\nEND;\$function\$\n?$/, "\n$function$\n"),
  );
  await db.exec("select public.protect_account_access_boundaries()");
  assert.equal(
    (
      await db.query(
        "select md5(prosrc) hash from pg_proc where oid='public.finalize_stripe_order_payment(uuid,text,text,text,integer,integer,text,uuid)'::regprocedure",
      )
    ).rows[0].hash,
    paymentSchema.function.bodyMd5,
  );
}
export async function ledgerActorDatabase({ provided, install = true } = {}) {
  const db = await businessClaimsDatabase({ provided });
  try {
    for (const [name, values] of Object.entries(paymentSchema.enumTypes))
      if (!(await db.query("select to_regtype($1)r", ["public." + name])).rows[0].r)
        await db.exec(
          `create type public.${q(name)} as enum(${values.map((v) => "'" + v + "'").join(",")})`,
        );
    for (const row of paymentSchema.rows.filter((r) =>
      ["order_payments", "order_payouts"].includes(r.source),
    )) {
      const table = "public." + q(row.source);
      await db.exec(
        `create table ${table}(${row.metadata.columns.map((c) => q(c.name) + " " + c.type + (c.default ? " default " + c.default : "") + (c.notNull ? " not null" : "")).join(",")})`,
      );
      for (const c of row.metadata.constraints)
        await db.exec(`alter table ${table} add constraint ${q(c.name)} ${c.definition}`);
      for (const h of row.metadata.triggers ?? []) {
        await db.exec(h.function);
        await db.exec(h.definition);
      }
      await db.exec(
        `alter table ${table} owner to postgres;alter table ${table} enable row level security;revoke all on ${table} from public,anon,authenticated,service_role;grant all on ${table} to service_role;grant select on ${table} to authenticated`,
      );
      for (const p of row.metadata.policies) {
        if (p.name === "bluebird_account_session_boundary") continue;
        await db.exec(
          `create policy ${q(p.name)} on ${table} for select to public using(${p.using})`,
        );
      }
    }
    // Captured policies and writer function are real. Fixture ACLs are explicit:
    // the older capture did not contain relacl; production preflight checks closed
    // policy semantics and subsequently pins its actual ACLs, without altering them.
    await db.exec("select public.protect_account_access_boundaries()");
    if (install) await db.exec(ledgerActorMigration());
    return db;
  } catch (error) {
    if (!provided) await db.close();
    throw error;
  }
}

export async function seedLedgerActors(db, { many = 1 } = {}) {
  const f = await seedCatalog(db),
    user = randomUUID();
  await db.query("insert into auth.users(id)values($1)", [user]);
  f.listing = randomUUID();
  await db.exec("select set_config('parkvault.trusted_operation','on',false)");
  await db.query(
    "insert into asks(id,product_id,variant_id,seller_id,price_cents)values($1,$2,$3,$4,10000)",
    [f.listing, f.product, f.variant, f.seller],
  );
  const fee = (await db.query("select id from fee_schedules limit 1")).rows[0].id;
  const order = async () => {
    const id = randomUUID();
    await db.query(
      "insert into orders(id,buyer_id,seller_id,product_id,variant_id,origin,status,merchandise_cents,buyer_fee_cents,seller_fee_cents,total_cents,payout_cents,fee_schedule_id,fee_snapshot,ask_id)values($1,$2,$3,$4,$5,'buy_now','awaiting_payment',10000,1000,500,11000,9500,$6,'{}',$7)",
      [id, f.buyer, f.seller, f.product, f.variant, fee, f.listing],
    );
    return id;
  };
  const orders = [await order(), await order()];
  await db.exec("select set_config('parkvault.trusted_operation','on',false)");
  await db.query(
    "insert into order_payments(order_id,kind,provider,external_reference,amount_cents,provider_status,recorded_by,note)select $1,'payment','stripe','pi_synthetic_'||n,10000,'succeeded',$2,'Preserved transaction memo'from generate_series(1,$3::int)n",
    [orders[0], user, many],
  );
  for (const id of orders)
    await db.query(
      "insert into order_payouts(order_id,payee_id,provider,external_reference,amount_cents,status,recorded_by,note)values($1,$2,'stripe_connect',$3,9500,'pending',$4,'Preserved payout memo')",
      [id, f.seller, "tr_synthetic_" + randomUUID().slice(0, 8), user],
    );
  await db.query(
    "insert into order_payments(order_id,kind,provider,external_reference,amount_cents,provider_status,recorded_by,note)values($1,'refund','stripe','re_other',100,'succeeded',$2,'Other member memo')",
    [orders[0], f.buyer],
  );
  await db.exec("select set_config('parkvault.trusted_operation','off',false)");
  const start = async () => {
    await db.query("select mobile_request_deletion($1)", [user]);
    await db.exec("update account_deletion_controls set worker_enabled=true");
    return (
      await db.query(
        "update account_deletion_jobs set status='processing',phase='records',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where user_id=$1 returning *",
        [user],
      )
    ).rows[0];
  };
  const step = async (job, limit = 100) =>
    (
      await db.query("select retire_account_deletion_ledger_actors($1,$2,$3,$4)r", [
        job.id,
        user,
        job.lease_token,
        limit,
      ])
    ).rows[0].r;
  return { db, f, user, orders, order, start, step };
}
