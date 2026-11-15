import { readFileSync } from "node:fs";
import { profileDatabase } from "./account-deletion-profiles-database.mjs";

export const conversationSchema = JSON.parse(
  readFileSync(
    new URL("../fixtures/account-deletion-conversations-schema-20261115.json", import.meta.url),
    "utf8",
  ),
);
export const conversationMigration = () =>
  readFileSync(
    new URL(
      "../../supabase/migrations/20261115010000_account_deletion_conversations.sql",
      import.meta.url,
    ),
    "utf8",
  );
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';

/** Actual conversation columns/constraints/hooks against synthetic parent
 * domain tables. No customer rows, provider requests or storage erasure. */
export async function conversationDatabase({ install = true, provided } = {}) {
  const db = await profileDatabase({ provided });
  try {
    await db.exec(`drop table public.conversation_messages;
   create table public.listing_inquiries(id uuid primary key,listing_id uuid,seller_id uuid);
   create table public.categories(id uuid primary key,slug text not null unique);
   alter table public.products add column category_id uuid,add column name text,add column description text,add column is_demo boolean default false;
   alter table public.asks add column product_id uuid;
   create unique index conversation_fixture_product_id on public.products(id);
   create unique index conversation_fixture_dealer_id on public.dealer_profiles(id);
   create unique index conversation_fixture_inventory_id on public.dealer_inventory_records(id);
   create table public.shopping_controls(tracking boolean);
  `);
    // Retain the production claim/reply implementation and its journal checks.
    // Parent payloads, role assignments and all identities remain synthetic.
    const claims = readFileSync(
      new URL(
        "../../supabase/migrations/20261013190000_managed_seller_claims.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.exec(`drop table public.seller_claim_transfers;
   alter table auth.users add column email_confirmed_at timestamptz;
   ${claims.slice(claims.indexOf("CREATE TABLE public.managed_import_sellers"), claims.indexOf("ALTER TABLE public.fb_marketplace_import_items"))}
   alter table public.fb_marketplace_import_items add column listing_id uuid,add column source_profile_url text;
   create table public.fb_marketplace_import_batches(id uuid primary key,source_profile_url text,seller_id uuid);
   create table public.conversation_fixture_operators(user_id uuid primary key);
   create or replace function public.has_role(uuid,text) returns boolean language sql as $$select $2='admin' and exists(select 1 from public.conversation_fixture_operators where user_id=$1)$$;
   alter table public.notifications alter column id set default gen_random_uuid(),add column title text,add column entity_type text,add column entity_id uuid,add column destination_url text,add column read_at timestamptz;
  `);
    const functionSql = (name) =>
      claims.match(new RegExp(`CREATE FUNCTION public\\.${name}\\([\\s\\S]*?END \\$\\$;`))[0];
    await db.exec(functionSql("assert_import_operator"));
    await db.exec(
      readFileSync(
        new URL(
          "../../supabase/migrations/20261013190500_preserve_existing_claim_read_state.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(
        new URL(
          "../../supabase/migrations/20261013190600_complete_claimed_seller_display.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    for (const name of [
      "conversations",
      "conversation_messages",
      "conversation_participants",
      "conversation_reports",
      "mobile_dealer_conversations",
    ]) {
      const schema = conversationSchema.rows.find((row) => row.source === name).metadata;
      await db.exec(
        `create table public.${name}(${schema.columns.map((column) => `${quote(column.name)} ${column.type}${column.default ? " default " + column.default : ""}${column.notNull ? " not null" : ""}`).join(",")})`,
      );
      for (const constraint of schema.constraints.filter((row) => row.table === name))
        await db.exec(
          `alter table public.${name} add constraint ${quote(constraint.name)} ${constraint.definition}`,
        );
      for (const index of schema.indexes) {
        const indexName = index.match(/CREATE (?:UNIQUE )?INDEX (\S+)/)[1];
        if (!(await db.query("select to_regclass($1) relation", [indexName])).rows[0].relation)
          await db.exec(index);
      }
      await db.exec(
        `alter table public.${name} enable row level security;revoke all on public.${name} from public,anon,authenticated;grant all on public.${name} to service_role`,
      );
    }
    await db.exec(conversationSchema.conversationHook.definition);
    await db.exec(functionSql("reply_managed_import_conversation"));
    for (const row of conversationSchema.rows)
      for (const trigger of row.metadata.triggers) await db.exec(trigger.definition);
    await db.exec("select public.protect_account_access_boundaries()");
    if (install) await db.exec(conversationMigration());
    return db;
  } catch (error) {
    if (!provided) await db.close();
    throw error;
  }
}
