import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
export async function shoppingDatabaseFixture() {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema extensions;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
 create table products(id uuid primary key,status text);
 create table analytics_events(id uuid,name text,user_id uuid,session_id text,props jsonb,created_at timestamptz);
 create table notifications(id uuid,user_id uuid,kind text,entity_id uuid);
 create table saved_searches(id uuid,user_id uuid,paused boolean,created_at timestamptz);
 create table asks(id uuid primary key,variant_id uuid,product_id uuid,status text,is_demo boolean,approved_at timestamptz,expires_at timestamptz);
 create table listing_inquiries(id uuid,buyer_id uuid,listing_id uuid);
 create table conversations(id uuid,buyer_id uuid,listing_id uuid,dealer_inventory_record_id uuid);
 create table orders(id uuid,buyer_id uuid,ask_id uuid,is_demo boolean,stripe_payment_status text,stripe_captured_at timestamptz,merchandise_cents bigint default 100,currency text default 'USD');
 create table verified_sales(id uuid,is_live boolean,order_id uuid,sold_at timestamptz);
 create table watchlist(user_id uuid,variant_id uuid,created_at timestamptz);
 create table saved_partner_vehicles(user_id uuid,listing_id text,created_at timestamptz);
 create table saved_partner_homes(user_id uuid,listing_id text,created_at timestamptz);
 create table saved_partner_jobs(user_id uuid,listing_id text,created_at timestamptz);`);
  let sql = readFileSync(
    new URL(
      "../../supabase/migrations/20261113010000_shopper_personalization.sql",
      import.meta.url,
    ),
    "utf8",
  );
  // PGlite does not ship pgvector/HNSW. Exercise all transactional SQL against
  // Postgres with an array distance stub; production verifies real vector DDL.
  sql = sql
    .replace("create extension if not exists vector with schema extensions;", "")
    .replace("extensions.vector(768)", "double precision[]")
    .replace(/create index shopping_vectors_cosine[^;]+;/, "");
  await db.exec(`create function extensions.test_distance(double precision[],double precision[]) returns double precision language sql immutable as $$select 0.0::double precision$$;
 create operator extensions.<=> (leftarg=double precision[],rightarg=double precision[],function=extensions.test_distance);`);
  await db.exec(sql);
  await db.exec(
    readFileSync(
      new URL(
        "../../supabase/migrations/20261113023000_shopping_durable_choices.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const user = randomUUID();
  await db.query("insert into auth.users(id) values($1)", [user]);
  return { db, user, subject: "u:" + user };
}
