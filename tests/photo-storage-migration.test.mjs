import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20261102100000_private_photo_storage_receipts.sql",
    import.meta.url,
  ),
  "utf8",
);
const owner = "11111111-1111-4111-8111-111111111111";
async function fixture(
  guard = "IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id=m->>'bucket' AND name=m->>'new') THEN",
) {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,banned_until timestamptz);
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
    CREATE SCHEMA storage; CREATE TABLE storage.objects(bucket_id text,name text);
    CREATE FUNCTION public.finish_seller_claim(_transfer uuid,_claimant uuid,_accept_terms boolean,_sync boolean)
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
    DECLARE m jsonb := '{"bucket":"listing-media","new":"seller/photo.jpg"}'; BEGIN
      IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Server access required'; END IF;
      IF _claimant <> '${owner}'::uuid OR NOT _accept_terms THEN RAISE EXCEPTION 'Claimant and terms still required'; END IF;
      ${guard} RAISE EXCEPTION 'Photo transfer incomplete; retry claiming'; END IF;
    END $$;
    REVOKE ALL ON FUNCTION public.finish_seller_claim(uuid,uuid,boolean,boolean) FROM PUBLIC,anon,authenticated;
    GRANT EXECUTE ON FUNCTION public.finish_seller_claim(uuid,uuid,boolean,boolean) TO service_role;
    SELECT set_config('request.jwt.claim.role','service_role',false);
  `);
  return db;
}
function receipt(changes = {}) {
  return {
    bucket: "listing-media",
    path: "seller/photo.jpg",
    r2_key: `original/v1/${"a".repeat(64)}/${"b".repeat(64)}`,
    sha256: "b".repeat(64),
    byte_size: 100,
    content_type: "image/jpeg",
    thumbnail_key: `thumbnail/v1/${"a".repeat(64)}/${"c".repeat(64)}`,
    thumbnail_sha256: "c".repeat(64),
    thumbnail_bytes: 50,
    thumbnail_content_type: "image/webp",
    ...changes,
  };
}

test("actual SQL keeps private receipts inaccessible and preserves claim authorization", async () => {
  const db = await fixture();
  try {
    await db.exec(migration);
    await db.exec(migration); // repeat preparation is safe
    await assert.rejects(
      () => db.query("select public.finish_seller_claim($1,$2,true,true)", [owner, owner]),
      /Photo transfer incomplete/,
    );
    await db.query("select public.record_private_photo($1::jsonb)", [JSON.stringify(receipt())]);
    await db.query("select public.finish_seller_claim($1,$2,true,true)", [owner, owner]);
    await assert.rejects(
      () => db.query("select public.finish_seller_claim($1,$2,false,true)", [owner, owner]),
      /Claimant and terms/,
    );
    await assert.rejects(
      () =>
        db.query("select public.finish_seller_claim($1,$2,true,true)", [
          owner,
          "22222222-2222-4222-8222-222222222222",
        ]),
      /Claimant and terms/,
    );
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(
        () => db.query("select * from public.photo_object_receipts"),
        /permission denied/,
      );
      await assert.rejects(
        () =>
          db.query("select public.record_private_photo($1::jsonb)", [JSON.stringify(receipt())]),
        /permission denied/,
      );
      await assert.rejects(
        () => db.query("select public.private_photo_exists('listing-media','seller/photo.jpg')"),
        /permission denied/,
      );
      await db.exec("RESET ROLE");
    }
  } finally {
    await db.close();
  }
});

test("actual SQL rejects conflicting and incomplete verification records", async () => {
  const db = await fixture();
  try {
    await db.exec(migration);
    const value = receipt();
    await db.query("select public.record_private_photo($1::jsonb)", [JSON.stringify(value)]);
    await db.query("select public.record_private_photo($1::jsonb)", [JSON.stringify(value)]);
    assert.equal(
      (await db.query("select count(*)::int as n from public.photo_object_receipts")).rows[0].n,
      1,
    );
    await assert.rejects(
      () =>
        db.query("select public.record_private_photo($1::jsonb)", [
          JSON.stringify(receipt({ sha256: "d".repeat(64) })),
        ]),
      /different photo/,
    );
    await assert.rejects(
      () =>
        db.query("select public.record_private_photo($1::jsonb)", [
          JSON.stringify(receipt({ path: "seller/partial.jpg", thumbnail_content_type: null })),
        ]),
      /check constraint/,
    );
    assert.equal(
      (await db.query("select sha256 from public.photo_object_receipts")).rows[0].sha256,
      value.sha256,
    );
    // Old Supabase-only assets still pass the original claim-completion gate.
    await db.exec(
      "delete from public.photo_object_receipts; insert into storage.objects values ('listing-media','seller/photo.jpg')",
    );
    await db.query("select public.finish_seller_claim($1,$2,true,true)", [owner, owner]);
  } finally {
    await db.close();
  }
});

test("actual SQL reservations are idempotent and stop at the application byte ceiling", async () => {
  const db = await fixture();
  try {
    await db.exec(migration);
    await db.exec(
      "insert into public.photo_storage_reservations(id,byte_size) select lpad(to_hex(n),64,'0'),50000000 from generate_series(1,160) n",
    );
    const id = "1".padStart(64, "0");
    await db.query("select public.reserve_private_photo_bytes($1,$2)", [id, 50000000]);
    await assert.rejects(
      () => db.query("select public.reserve_private_photo_bytes($1,$2)", [id, 40000000]),
      /reservation changed/,
    );
    await assert.rejects(
      () => db.query("select public.reserve_private_photo_bytes($1,$2)", ["f".repeat(64), 1]),
      /budget reached/,
    );
    assert.equal(
      (await db.query("select count(*)::int as n from public.photo_storage_reservations")).rows[0]
        .n,
      160,
    );
  } finally {
    await db.close();
  }
});

test("unrecognized production claim guards abort rather than replacing unrelated live logic", async () => {
  const db = await fixture("IF false THEN");
  try {
    await assert.rejects(() => db.exec(migration), /Review current seller-claim/);
    await db.exec("ROLLBACK");
    assert.equal(
      (await db.query("select to_regclass('public.photo_object_receipts') as relation")).rows[0]
        .relation,
      null,
    );
  } finally {
    await db.close();
  }
});

test("native upload tickets reserve both private stores and enforce the daily byte allowance atomically", async () => {
  const db = await fixture();
  try {
    await db.exec(migration);
    await db.query("insert into auth.users(id) values($1)", [owner]);
    const ticket = {
      id: "33333333-3333-4333-8333-333333333333",
      user_id: owner,
      path: `${owner}/new.jpg`,
      mode: "r2",
      payload: {
        bytes: 100,
        contentType: "image/jpeg",
        sha256: "b".repeat(64),
        evidence: true,
        key: "original",
        thumbnailKey: "thumbnail",
        thumbnail: { bytes: 50, contentType: "image/webp", sha256: "c".repeat(64) },
      },
      reservations: [
        { id: "d".repeat(64), bytes: 100 },
        { id: "e".repeat(64), bytes: 150 },
      ],
    };
    await db.query("select public.begin_private_photo_upload($1::jsonb)", [JSON.stringify(ticket)]);
    const lease = () =>
      db.query("select public.lease_private_photo_upload($1,$2) as ticket", [ticket.id, owner]);
    assert.equal((await lease()).rows[0].ticket.verification_attempts, 1);
    await assert.rejects(lease, /busy|retry allowance/);
    await assert.rejects(
      () =>
        db.query("select public.lease_private_photo_upload($1,$2)", [
          ticket.id,
          "22222222-2222-4222-8222-222222222222",
        ]),
      /expired/,
    );
    for (let i = 2; i <= 6; i++) {
      await db.exec(
        "update public.photo_upload_tickets set verification_lease_until=now()-interval '1 second'",
      );
      assert.equal((await lease()).rows[0].ticket.verification_attempts, i);
    }
    await db.exec(
      "update public.photo_upload_tickets set verification_lease_until=now()-interval '1 second'",
    );
    await assert.rejects(lease, /retry allowance/);
    await db.exec("update public.photo_upload_tickets set verified_at=now()");
    assert.ok((await lease()).rows[0].ticket.verified_at);
    assert.equal(
      (await db.query("select count(*)::int as n from public.photo_upload_tickets")).rows[0].n,
      1,
    );
    assert.equal(
      (await db.query("select sum(byte_size)::int as n from public.photo_storage_reservations"))
        .rows[0].n,
      250,
    );
    await db.query(
      "insert into public.photo_storage_reservations(id,byte_size,user_id) select lpad(to_hex(n),64,'0'),50000000,$1 from generate_series(1,10) n",
      [owner],
    );
    const second = {
      ...ticket,
      id: "44444444-4444-4444-8444-444444444444",
      payload: { ...ticket.payload, bytes: 25000000 },
      reservations: [
        { id: "f".repeat(64), bytes: 25000000 },
        { id: "a".repeat(64), bytes: 25000050 },
      ],
    };
    await assert.rejects(
      () =>
        db.query("select public.begin_private_photo_upload($1::jsonb)", [JSON.stringify(second)]),
      /Daily photo upload allowance/,
    );
    assert.equal(
      (await db.query("select count(*)::int as n from public.photo_upload_tickets")).rows[0].n,
      1,
    );
    assert.equal(
      (await db.query("select count(*)::int as n from public.photo_storage_reservations")).rows[0]
        .n,
      12,
    );
    await db.exec("SET ROLE authenticated");
    await assert.rejects(
      () => db.query("select * from public.photo_upload_tickets"),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        db.query("select public.begin_private_photo_upload($1::jsonb)", [JSON.stringify(ticket)]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
