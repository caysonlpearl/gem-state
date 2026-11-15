import { readFileSync } from "node:fs";
import {
  conversationDatabase,
  conversationMigration,
} from "./account-deletion-conversations-database.mjs";
export const inquirySchema = JSON.parse(
  readFileSync(
    new URL("../fixtures/account-deletion-inquiries-schema-20261115.json", import.meta.url),
    "utf8",
  ),
).schema;
export const inquiryMigration = () =>
  readFileSync(
    new URL(
      "../../supabase/migrations/20261115020000_account_deletion_inquiries.sql",
      import.meta.url,
    ),
    "utf8",
  );
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
/** Captured inquiry columns, FKs, indexes and real shopping hook. Parent domain
 * payloads and all identities are synthetic, as in the conversation fixture. */
export async function inquiryDatabase({ install = true, provided } = {}) {
  const db = await conversationDatabase({ install: false, provided });
  try {
    await db.exec(
      "alter table public.conversation_messages drop constraint conversation_messages_source_inquiry_id_fkey;drop table public.listing_inquiries",
    );
    await db.exec(
      `create table public.listing_inquiries(${inquirySchema.columns.map((c) => `${quote(c.name)} ${c.type}${c.default ? " default " + c.default : ""}${c.notNull ? " not null" : ""}`).join(",")})`,
    );
    for (const c of inquirySchema.constraints)
      if (c.table === "listing_inquiries")
        await db.exec(
          `alter table public.listing_inquiries add constraint ${quote(c.name)} ${c.definition}`,
        );
    await db.exec(
      "alter table public.conversation_messages add constraint conversation_messages_source_inquiry_id_fkey foreign key(source_inquiry_id)references public.listing_inquiries(id)",
    );
    for (const index of inquirySchema.indexes)
      if (!index.includes("listing_inquiries_pkey")) await db.exec(index);
    for (const hook of inquirySchema.triggers) await db.exec(hook.definition);
    await db.exec(`alter table public.listing_inquiries enable row level security;grant all on public.listing_inquiries to service_role;
   create policy "Participants read listing inquiries" on public.listing_inquiries for select to authenticated using(buyer_id=auth.uid()or seller_id=auth.uid());grant select on public.listing_inquiries to authenticated;
   select public.protect_account_access_boundaries();`);
    await db.exec(conversationMigration());
    const reply = readFileSync(
      new URL(
        "../../supabase/migrations/20261013190300_managed_inquiry_replies.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.exec(
      reply.slice(reply.indexOf("CREATE FUNCTION public.reply_managed_import_inquiry")),
    );
    if (install) await db.exec(inquiryMigration());
    return db;
  } catch (error) {
    if (!provided) await db.close();
    throw error;
  }
}
