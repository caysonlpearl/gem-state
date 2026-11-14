import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { installDeletionWorkerSchema } from "./account-deletion-database.mjs";

/** Real photo/ticket/migration SQL with synthetic reference/claim relations. */
export async function installDeletionPhotoWriterSchema(db) {
  await installDeletionWorkerSchema(db);
  await db.exec(`
    alter role service_role bypassrls;
    create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
    create schema storage;
    create table storage.objects(bucket_id text,name text);
    create function public.finish_seller_claim(_transfer uuid,_claimant uuid,_accept_terms boolean,_sync boolean)
    returns void language plpgsql security definer set search_path=public,pg_temp as $$
    declare m jsonb; begin
      IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id=m->>'bucket' AND name=m->>'new') THEN
        raise exception 'Photo transfer incomplete';
      end if;
    end $$;
    revoke all on function public.finish_seller_claim(uuid,uuid,boolean,boolean) from public,anon,authenticated;
    grant execute on function public.finish_seller_claim(uuid,uuid,boolean,boolean) to service_role;
    create function public.has_role(uuid,text) returns boolean language sql as $$select true$$;
    create table seller_claim_transfers(id uuid primary key,claimant_id uuid not null,manifest jsonb not null default '[]',status text not null default 'preparing');
    create table fb_marketplace_import_items(id uuid primary key,seller_id uuid,public_paths text[],evidence_paths text[],label text);
    select set_config('request.jwt.claim.role','service_role',false);
  `);
  for (const table of [
    "listing_media",
    "ask_media",
    "product_images",
    "product_models",
    "product_suggestion_media",
    "request_media",
    "order_evidence",
  ]) {
    await db.exec(
      `create table ${table}(id uuid primary key,storage_path text not null,label text); grant all on ${table} to service_role;`,
    );
  }
  await db.exec("grant all on seller_claim_transfers,fb_marketplace_import_items to service_role");
  await db.exec(`
    create table sourcing_requests(id uuid primary key,buyer_id uuid not null references auth.users(id));
    create table product_suggestions(id uuid primary key,submitted_by uuid not null references auth.users(id));
    alter table request_media add column request_id uuid references sourcing_requests(id);
    alter table product_suggestion_media add column suggestion_id uuid references product_suggestions(id);
    alter table order_evidence add column order_id uuid,add column uploaded_by uuid references auth.users(id);
    alter table product_models add column poster_path text;
    grant select,insert,update,delete on sourcing_requests,product_suggestions to service_role;
  `);
  for (const name of [
    "20261102100000_private_photo_storage_receipts.sql",
    "20261102110000_bounded_photo_migration_runs.sql",
    "20261102220000_bounded_photo_preview_preparation.sql",
    "20261102230000_reuse_prepared_photo_source.sql",
    "20261114040000_account_deletion_photo_writes.sql",
    "20261114050000_account_deletion_photo_reference_scope.sql",
  ]) {
    await db.exec(
      readFileSync(new URL("../../supabase/migrations/" + name, import.meta.url), "utf8"),
    );
  }
  return db;
}
export async function deletionPhotoWriterDatabase() {
  return installDeletionPhotoWriterSchema(new PGlite());
}

export function memberPhotoReceipt(user, suffix = "photo.jpg") {
  return {
    bucket: "listing-media",
    path: `${user}/${suffix}`,
    r2_key: `original/v1/${"a".repeat(64)}/${"b".repeat(64)}`,
    sha256: "b".repeat(64),
    byte_size: 100,
    content_type: "image/jpeg",
    thumbnail_key: `thumbnail/v1/${"a".repeat(64)}/${"c".repeat(64)}`,
    thumbnail_sha256: "c".repeat(64),
    thumbnail_bytes: 50,
    thumbnail_content_type: "image/webp",
  };
}
