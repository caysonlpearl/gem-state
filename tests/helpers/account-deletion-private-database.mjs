import { readFileSync } from "node:fs";
import { deletionPhotoWriterDatabase } from "./account-deletion-photo-database.mjs";
export const privateRecordSources = [
  "saved_search_matches",
  "mobile_push_outbox",
  "notifications",
  "mobile_push_devices",
  "mobile_message_receipts",
  "watchlist",
  "saved_partner_homes",
  "saved_partner_jobs",
  "saved_partner_vehicles",
  "saved_searches",
  "account_contact_preferences",
  "account_notification_preferences",
];
export const privateRecordsMigration = () =>
  readFileSync(
    new URL(
      "../../supabase/migrations/20261114120000_account_deletion_private_records.sql",
      import.meta.url,
    ),
    "utf8",
  );
/** Actual owner/relationship columns only; remaining payload fields are outside this cleanup's predicates. */
export async function installPrivateRecordSources(db, { applyMigration = true } = {}) {
  await db.exec(`
    alter table public.notifications add column if not exists body text;
    create table public.mobile_message_receipts(user_id uuid not null references auth.users(id) on delete cascade,request_id uuid not null,input_hash bytea not null,result jsonb,created_at timestamptz not null default now(),primary key(user_id,request_id));
    create table public.saved_searches(id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,name text,search jsonb,email_alerts boolean,paused boolean);
    create table public.saved_search_matches(id uuid primary key,saved_search_id uuid not null references public.saved_searches(id) on delete cascade,listing_id uuid,matched_at timestamptz,emailed_at timestamptz);
    create table public.watchlist(id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,variant_id uuid,created_at timestamptz);
    create table public.saved_partner_homes(user_id uuid not null references auth.users(id) on delete cascade,listing_id text not null,snapshot jsonb,created_at timestamptz,primary key(user_id,listing_id));
    create table public.saved_partner_jobs(like public.saved_partner_homes including all);
    alter table public.saved_partner_jobs add foreign key(user_id) references auth.users(id) on delete cascade;
    create table public.saved_partner_vehicles(like public.saved_partner_homes including all);
    alter table public.saved_partner_vehicles add foreign key(user_id) references auth.users(id) on delete cascade;
    create table public.account_contact_preferences(user_id uuid primary key references auth.users(id) on delete cascade,allow_email boolean,allow_phone boolean);
    create table public.account_notification_preferences(user_id uuid primary key references auth.users(id) on delete cascade,message_alerts boolean,marketing_email boolean);
  `);
  for (const table of privateRecordSources)
    await db.exec(
      `alter table public.${table} enable row level security; revoke all on public.${table} from public,anon,authenticated; grant all on public.${table} to service_role`,
    );
  await db.exec("select public.protect_account_access_boundaries()");
  if (applyMigration) await db.exec(privateRecordsMigration());
  return db;
}
export async function privateRecordsDatabase() {
  return installPrivateRecordSources(await deletionPhotoWriterDatabase());
}
