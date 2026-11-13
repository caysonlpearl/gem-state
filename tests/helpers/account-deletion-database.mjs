import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
export async function installDeletionSchema(db, { beforeJobs } = {}) {
  await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create table auth.users(id uuid primary key);
 create table notifications(id uuid primary key,user_id uuid,kind text);
 create table shopping_accounts(user_id uuid primary key,terms_version text,terms_accepted_at timestamptz,shopping_alerts boolean,suppressed_at timestamptz,alerts_version text,alerts_updated_at timestamptz,updated_at timestamptz,delivery_blocked boolean default false);
 create table shopping_consents(id uuid default gen_random_uuid(),user_id uuid,subject text,purpose text,allowed boolean,version text,source text default 'web');
 create table shopping_queue(user_id uuid,status text,lease_until timestamptz,requested boolean default false);
 create table shopping_privacy(subject text primary key,personalization boolean,advertising boolean,history_after timestamptz,updated_at timestamptz);
 create table shopping_deliveries(user_id uuid,status text,lease_until timestamptz);
 create table shopping_ad_outbox(user_id uuid,subject text,status text);`);
  for (const name of [
    "20261113030000_mobile_foundation.sql",
    "20261113110000_account_deletion_jobs.sql",
  ]) {
    if (name === "20261113110000_account_deletion_jobs.sql" && beforeJobs) await beforeJobs(db);
    await db.exec(
      readFileSync(new URL("../../supabase/migrations/" + name, import.meta.url), "utf8"),
    );
  }
  return db;
}

export async function deletionDatabase(options = {}) {
  return installDeletionSchema(new PGlite(), options);
}
