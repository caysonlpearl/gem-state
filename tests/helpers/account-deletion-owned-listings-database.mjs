import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { inquiryDatabase } from "./account-deletion-inquiries-database.mjs";
export const ownedListingSchema = JSON.parse(
  readFileSync(
    new URL("../fixtures/account-deletion-owned-listings-schema-20261115.json", import.meta.url),
    "utf8",
  ),
);
const quote = (v) => '"' + v.replaceAll('"', '""') + '"';
const literal = (v) => "'" + v.replaceAll("'", "''") + "'";
/** Real listing/detail/media/application columns, constraints and hooks, with
 * synthetic financial/business/catalog parents. No customer rows or providers. */
export async function ownedListingDatabase({ provided } = {}) {
  const db = await inquiryDatabase({ provided });
  try {
    for (const [name, values] of Object.entries(ownedListingSchema.enums)) {
      if (
        !["product_status", "app_role"].includes(name) &&
        !ownedListingSchema.rows.some((r) => r.metadata.columns.some((c) => c.type === name))
      )
        continue;
      const existing = (
        await db.query(
          "select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace where n.nspname='public'and t.typname=$1 order by e.enumsortorder",
          [name],
        )
      ).rows.map((r) => r.enumlabel);
      if (!existing.length)
        await db.exec(`create type public.${quote(name)}as enum(${values.map(literal).join(",")})`);
      else
        for (let i = 0; i < values.length; i++)
          if (!existing.includes(values[i])) {
            const next = values.slice(i + 1).find((v) => existing.includes(v));
            await db.exec(
              `alter type public.${quote(name)}add value ${literal(values[i])}${next ? " before " + literal(next) : ""}`,
            );
            existing.push(values[i]);
          }
    }
    await db.exec(`create table public.product_variants(id uuid primary key,product_id uuid);
   create unique index owned_fixture_orders_id on public.orders(id);
   alter table public.products add column status public.product_status default 'published';
   create function public.has_role(uuid,public.app_role)returns boolean language sql as $$select public.has_role($1,$2::text)$$;
   create function public.is_staff(uuid)returns boolean language sql as $$select public.has_role($1,'admin'::text)$$;
   create table public.bids(id uuid primary key,buyer_id uuid,variant_id uuid,status public.listing_status,expires_at timestamptz);
  `);
    for (const row of ownedListingSchema.rows) {
      const name = row.source,
        table = `public.${quote(name)}`,
        schema = row.metadata;
      if (!(await db.query("select to_regclass($1)r", [`public.${name}`])).rows[0].r)
        await db.exec(`create table ${table}()`);
      const present = (
        await db.query(
          "select attname from pg_attribute where attrelid=$1::regclass and attnum>0 and not attisdropped",
          [`public.${name}`],
        )
      ).rows.map((r) => r.attname);
      const names = schema.columns.map((c) => c.name);
      for (const old of present)
        if (!names.includes(old)) await db.exec(`alter table ${table}drop column ${quote(old)}`);
      for (const c of schema.columns) {
        if (!present.includes(c.name))
          await db.exec(`alter table ${table}add column ${quote(c.name)} ${c.type}`);
        await db.exec(
          `alter table ${table}alter column ${quote(c.name)}${c.default ? " set default " + c.default : " drop default"},alter column ${quote(c.name)}${c.notNull ? " set " : " drop "}not null`,
        );
      }
    }
    // Actual outgoing constraints on core tables. FK targets outside this scope
    // have synthetic payloads; retain their identities and incoming Ask links.
    for (const row of ownedListingSchema.rows) {
      for (const c of row.metadata.constraints.filter((c) => c.table === row.source)) {
        if (
          !(
            await db.query(
              "select 1 from pg_constraint where conrelid=$1::regclass and conname=$2",
              [`public.${row.source}`, c.name],
            )
          ).rows.length
        )
          await db.exec(
            `alter table public.${quote(row.source)}add constraint ${quote(c.name)} ${c.definition}`,
          );
      }
    }
    const ask = ownedListingSchema.rows.find((r) => r.source === "asks");
    for (const c of ask.metadata.constraints.filter((c) => c.table !== "asks")) {
      if (
        (
          await db.query(
            "select 1 from pg_constraint where conrelid=to_regclass($1)and conname=$2",
            [`public.${c.table}`, c.name],
          )
        ).rows.length
      )
        continue;
      if (!(await db.query("select to_regclass($1)r", [`public.${c.table}`])).rows[0].r)
        await db.exec(`create table public.${quote(c.table)}(id uuid primary key)`);
      const column = c.definition.match(/^FOREIGN KEY \(([^)]+)\)/)?.[1];
      if (!column) throw Error("Unexpected incoming Ask relationship");
      if (
        !(
          await db.query(
            "select 1 from pg_attribute where attrelid=$1::regclass and attname=$2 and not attisdropped",
            [`public.${c.table}`, column],
          )
        ).rows.length
      )
        await db.exec(`alter table public.${quote(c.table)}add column ${quote(column)}uuid`);
      await db.exec(
        `alter table public.${quote(c.table)}add constraint ${quote(c.name)} ${c.definition}`,
      );
    }
    for (const row of ownedListingSchema.rows) {
      for (const index of row.metadata.indexes) {
        const name = index.match(/CREATE (?:UNIQUE )?INDEX (\S+)/)[1];
        if (!(await db.query("select to_regclass($1)r", [name])).rows[0].r) await db.exec(index);
      }
      for (const t of row.metadata.triggers ?? []) {
        await db.exec(t.function);
        await db.exec(t.definition);
      }
      await db.exec(
        `alter table public.${quote(row.source)}enable row level security;revoke all on public.${quote(row.source)}from public,anon,authenticated;grant all on public.${quote(row.source)}to service_role`,
      );
      for (const p of row.metadata.policies ?? []) {
        if (p.name === "bluebird_account_session_boundary") continue;
        const commands = { r: "select", a: "insert", w: "update", d: "delete", "*": "all" };
        await db.exec(
          `create policy ${quote(p.name)}on public.${quote(row.source)}as ${p.permissive ? "permissive" : "restrictive"} for ${commands[p.command]} to ${p.roles.map((r) => (r === "PUBLIC" ? "PUBLIC" : quote(r))).join(",")}${p.using ? " using(" + p.using + ")" : ""}${p.check ? " with check(" + p.check + ")" : ""}`,
        );
      }
    }
    for (const f of ownedListingSchema.jobFunctions) {
      // Install captured member functions before their outer account wrapper,
      // then let the real protection migration build its own proof registry.
      // Merely copying an already-wrapped body would leave that registry absent.
      const prefix =
        "AS $function$BEGIN\n PERFORM public.assert_current_account_access(); -- bluebird-account-boundary-v1\n";
      const definition = f.definition.includes(prefix)
        ? f.definition
            .replace(prefix, "AS $function$")
            .replace(/\nEND;\$function\$\n?$/, "\n$function$\n")
        : f.definition;
      await db.exec(definition);
      await db.exec(
        `revoke all on function public.${f.signature} from PUBLIC,anon,authenticated,service_role`,
      );
      for (const acl of f.acl ?? []) {
        const role = acl.split("=")[0];
        if (role === "postgres") continue;
        if (!acl.split("=")[1].split("/")[0].includes("X")) continue;
        await db.exec(
          `grant execute on function public.${f.signature} to ${role ? quote(role) : "PUBLIC"}`,
        );
      }
    }
    await db.exec("select public.protect_account_access_boundaries()");
    // Adding real FK edges to already-pinned source fixtures is legitimate only
    // in the disposable schema builder. A production migration must preflight
    // and explicitly compose any changed contracts; never silently refresh them.
    return db;
  } catch (error) {
    if (!provided) await db.close();
    throw error;
  }
}

export async function seedListing(db) {
  const seller = randomUUID(),
    buyer = randomUUID(),
    listing = randomUUID(),
    product = randomUUID(),
    variant = randomUUID(),
    categorySeed = randomUUID();
  await db.query("insert into auth.users(id)values($1),($2)", [seller, buyer]);
  await db.query(
    "insert into profiles(id,display_name)values($1,'Synthetic seller'),($2,'Synthetic buyer')",
    [seller, buyer],
  );
  await db.query(
    "insert into seller_profiles(user_id,slug,status,default_shipping_method,default_handling_days)values($1,$2,'active','usps_ground_advantage',3)",
    [seller, "fixture-" + seller.slice(0, 16)],
  );
  const category = (
    await db.query(
      "insert into categories(id,slug)values($1,'jobs')on conflict(slug)do update set slug=excluded.slug returning id",
      [categorySeed],
    )
  ).rows[0].id;
  await db.query(
    "insert into products(id,created_by,category_id,name,status)values($1,$2,$3,'Synthetic job','published')",
    [product, seller, category],
  );
  await db.query("insert into product_variants(id,product_id)values($1,$2)", [variant, product]);
  await db.exec("select set_config('parkvault.trusted_operation','on',false)");
  await db.query(
    "insert into asks(id,product_id,variant_id,seller_id,price_cents)values($1,$2,$3,$4,100)",
    [listing, product, variant, seller],
  );
  await db.query(
    "insert into classified_listing_details(listing_id,region,city,fulfillment_mode)values($1,'Idaho','Boise','local_pickup')",
    [listing],
  );
  await db.query("update asks set approved_at=now()where id=$1", [listing]);
  await db.exec("select set_config('parkvault.trusted_operation','on',false)");
  return { seller, buyer, listing, product, variant, category };
}

export async function fixtureMemberSession(db, user) {
  const session = randomUUID();
  await db.query("insert into auth.sessions(id,user_id)values($1,$2)", [session, user]);
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: user, role: "authenticated", session_id: session }),
  ]);
  return session;
}

export const applicationMigration = () =>
  readFileSync(
    new URL(
      "../../supabase/migrations/20261115030000_account_deletion_job_applications.sql",
      import.meta.url,
    ),
    "utf8",
  );
export async function applicationDatabase(options = {}) {
  const db = await ownedListingDatabase(options);
  try {
    await db.exec(applicationMigration());
    return db;
  } catch (e) {
    if (!options.provided) await db.close();
    throw e;
  }
}
