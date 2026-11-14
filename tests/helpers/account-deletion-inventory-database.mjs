import { readFileSync } from "node:fs";
import { deletionPhotoWriterDatabase } from "./account-deletion-photo-database.mjs";

// Only the real source columns used by inventory, from the November 13 schema
// metadata inspection. No member rows, private documents or provider access.
const columns = {
  profiles: "id uuid,avatar_url text",
  seller_storefronts: "user_id uuid,avatar_url text",
  shopper_service_profiles: "id uuid,shopper_id uuid,avatar_url text",
  dealer_profiles: "id uuid,owner_user_id uuid,logo_url text",
  dealer_members: "dealer_id uuid,user_id uuid",
  asks: "id uuid,seller_id uuid,dealer_id uuid",
  listing_media: "ask_id uuid",
  ask_media: "ask_id uuid",
  products: "id uuid,created_by uuid",
  product_images: "product_id uuid",
  product_models: "product_id uuid",
  orders: "id uuid,buyer_id uuid,seller_id uuid",
  conversation_messages:
    "id uuid,conversation_id uuid,sender_id uuid,attachment_path text,body text",
  job_applications: "id uuid,applicant_id uuid,resume_path text,cover_letter text",
  shopper_applications: "id uuid,user_id uuid,id_document_path text,applicant_note text",
  sightings: "id uuid,reporter_id uuid,evidence_path text",
  dealer_inventory_media: "id uuid,record_id uuid,media_url text",
  dealer_inventory_records: "id uuid,source_id uuid",
  dealer_inventory_sources: "id uuid,dealer_id uuid,owner_user_id uuid",
  seller_listing_requests: "id uuid,seller_id uuid,evidence_paths text[],public_media_paths text[]",
  seller_claim_transfers: "lease_until timestamptz",
};

export async function installInventorySources(db) {
  for (const [table, definition] of Object.entries(columns)) {
    await db.exec(`create table if not exists public.${table}(${definition})`);
    for (const column of definition.split(",")) {
      await db.exec(`alter table public.${table} add column if not exists ${column}`);
    }
  }
  await db.exec(`
    alter table storage.objects add column id uuid default gen_random_uuid(),
      add column owner uuid,add column owner_id text,add column metadata jsonb,
      add column version text,add column archived_at timestamptz,
      add column is_delete_marker boolean,add column is_versioned boolean;
    create table storage.buckets(id text primary key,versioning_status text,lifecycle_configuration_generation uuid);
    select public.protect_account_access_boundaries();
  `);
  await db.exec(
    readFileSync(
      new URL(
        "../../supabase/migrations/20261114060000_account_deletion_media_inventory.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  return db;
}

export async function inventoryDatabase() {
  return installInventorySources(await deletionPhotoWriterDatabase());
}
