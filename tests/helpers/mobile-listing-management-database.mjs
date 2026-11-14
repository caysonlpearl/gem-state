import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { installDeletionWorkerSchema } from "./account-deletion-database.mjs";
export const managementMigration = new URL(
  "../../supabase/migrations/20261114150000_mobile_listing_management.sql",
  import.meta.url,
);
/** Real native transaction and access-boundary SQL. Domain stand-ins expose
 * transaction rollback/ordering, not proof of production domain definitions. */
export async function installListingManagementFixture(db) {
  await installDeletionWorkerSchema(db);
  await db.exec(`
 create type public.item_condition as enum('used_good','not_applicable');
 create table public.categories(id uuid primary key default gen_random_uuid(),slug text unique not null);
 insert into public.categories(slug) values('general'),('pets'),('firearms'),('unknown');
 create table public.products(id uuid primary key default gen_random_uuid(),name text,description text,status text default 'published',category_id uuid references public.categories(id));
 create table public.asks(id uuid primary key default gen_random_uuid(),seller_id uuid references auth.users(id),product_id uuid references public.products(id),variant_id uuid default gen_random_uuid(),status text default 'active',approved_at timestamptz default now(),expires_at timestamptz default now()+interval '30 days',sold_at timestamptz,currency text default 'USD',price_cents integer default 2500,item_condition item_condition default 'used_good',seller_note text,parcel_length_in numeric,parcel_width_in numeric,parcel_height_in numeric,parcel_weight_lb numeric,is_demo boolean default false,views integer default 0);
 create table public.classified_listing_details(listing_id uuid primary key references public.asks(id),city text,region text,state text,item_details jsonb default '{}',vehicle jsonb,home jsonb,job jsonb,service jsonb,pet jsonb,check(not (item_details ? 'fault')));
 create table public.listing_media(id uuid primary key default gen_random_uuid(),ask_id uuid references public.asks(id),storage_path text not null,position integer not null);
 create table public.fixture_listing_calls(action text,listing uuid);
 create function public.cancel_ask(_ask uuid) returns void language plpgsql security definer set search_path='' as $$ begin
   update public.asks set status='cancelled' where id=_ask and seller_id=auth.uid() and status='active';
   if not found then raise exception 'Only your active listing can be removed';end if;
   insert into public.fixture_listing_calls values('archive',_ask);
 end $$;
 create function public.relist_ask(_ask uuid) returns void language plpgsql security definer set search_path='' as $$ begin
   update public.asks set status='active',sold_at=null,expires_at=now()+interval '30 days' where id=_ask and seller_id=auth.uid() and status in('cancelled','expired');
   if not found then raise exception 'Only your removed listing can be relisted';end if;
   insert into public.fixture_listing_calls values('relist',_ask);
 end $$;
 create function public.replace_listing_media(_ask uuid,_paths text[]) returns void language plpgsql security definer set search_path='' as $$ begin
   if not exists(select 1 from public.asks where id=_ask and seller_id=auth.uid()) then raise exception 'Listing not owned';end if;
   delete from public.listing_media where ask_id=_ask;
   if exists(select 1 from unnest(_paths) p where p like '%fail-media%')then raise exception 'Photo replacement failed';end if;
   insert into public.listing_media(ask_id,storage_path,position) select _ask,p,n from unnest(_paths) with ordinality as m(p,n);
   insert into public.fixture_listing_calls values('media',_ask);
 end $$;
 `);
  const args =
    "_listing_id uuid,_title text,_description text,_category_id uuid,_price_cents integer,_condition public.item_condition,_note text,_region text,_city text,_state text,_zip text,_fulfillment text,_length numeric,_width numeric,_height numeric,_weight numeric,_vehicle jsonb,_home jsonb,_job jsonb,_service jsonb,_pet jsonb";
  for (const [name, free] of [
    ["update_classified_listing", false],
    ["update_free_pet_listing", true],
  ])
    await db.exec(`create function public.${name}(${args}) returns void language plpgsql security definer set search_path='' as $$ declare product uuid;begin
   select product_id into product from public.asks where id=_listing_id and seller_id=auth.uid() and status='active';
   if product is null then raise exception 'Only your open listing can be edited';end if;
   if _title='domain failure' or _price_cents<0 or (_price_cents=0 and not ${free})then raise exception 'Domain validation failed';end if;
   update public.products set name=_title,description=_description,category_id=_category_id where id=product;
   update public.asks set price_cents=_price_cents,approved_at=null where id=_listing_id;
   update public.classified_listing_details set region=_region,city=_city,state=_state,vehicle=_vehicle,home=_home,job=_job,service=_service,pet=_pet where listing_id=_listing_id;
   insert into public.fixture_listing_calls values('${free ? "free-pet" : "edit"}',_listing_id);
 end $$;`);
  await db.exec(
    readFileSync(
      new URL(
        "../../supabase/migrations/20261113050000_mobile_message_receipts.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec("select public.protect_account_access_boundaries()");
  await db.exec(readFileSync(managementMigration, "utf8"));
  return db;
}
export async function listingManagementDatabase() {
  const db = await installListingManagementFixture(new PGlite());
  const a = randomUUID(),
    b = randomUUID(),
    sessionA = randomUUID(),
    sessionB = randomUUID();
  await db.query("insert into auth.users(id) values($1),($2)", [a, b]);
  await db.query(
    "insert into auth.sessions(id,user_id,not_after) values($1,$2,now()+interval '1 day'),($3,$4,now()+interval '1 day')",
    [sessionA, a, sessionB, b],
  );
  await db.query(
    "insert into shopping_accounts(user_id,terms_version) values($1,'2026-11-12'),($2,'2026-11-12')",
    [a, b],
  );
  async function actor(user = a, session = user === a ? sessionA : sessionB) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ sub: user, session_id: session, role: "authenticated" }),
    ]);
    await db.exec("set role authenticated");
  }
  async function owner() {
    await db.exec("reset role");
  }
  async function seed(
    user = a,
    {
      category = "general",
      title = "Original bicycle",
      description = "Original local bicycle description.",
      status = "active",
      demo = false,
    } = {},
  ) {
    await owner();
    const product = (
      await db.query(
        "insert into products(name,description,category_id) select $1,$2,id from categories where slug=$3 returning id",
        [title, description, category],
      )
    ).rows[0].id;
    const id = (
      await db.query(
        "insert into asks(seller_id,product_id,status,is_demo) values($1,$2,$3,$4) returning id",
        [user, product, status, demo],
      )
    ).rows[0].id;
    await db.query(
      "insert into classified_listing_details(listing_id,city,region,state) values($1,'Boise','Treasure Valley','ID')",
      [id],
    );
    await db.query("insert into listing_media(ask_id,storage_path,position) values($1,$2,0)", [
      id,
      user + "/old.jpg",
    ]);
    await actor();
    return id;
  }
  const snapshot = async (id) =>
    (await db.query("select public.mobile_listing_editor_snapshot($1) result", [id])).rows[0]
      .result;
  const manage = async (id, action, version, input = {}, request = randomUUID()) =>
    (
      await db.query("select public.mobile_manage_listing($1,$2,$3,$4,$5) result", [
        request,
        id,
        action,
        version,
        input,
      ])
    ).rows[0].result;
  await actor();
  return { db, a, b, sessionA, sessionB, actor, owner, seed, snapshot, manage };
}
