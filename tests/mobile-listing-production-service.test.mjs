import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  productionListingDatabase,
  validProductionEdit,
} from "./helpers/mobile-listing-production-database.mjs";
import { commitOwnedMobileListing } from "../src/lib/mobile-listing-management.server.ts";

async function fixture(t) {
  const f = await productionListingDatabase();
  t.after(() => f.db.close());
  const client = createClient("https://production-domain.fixture.invalid", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (_url, init) => {
        const b = JSON.parse(init.body);
        try {
          return Response.json(
            await f.manage(b._listing, b._action, b._expected, b._input, b._request),
          );
        } catch (e) {
          return Response.json({ code: e.code, message: e.message }, { status: 400 });
        }
      },
    },
  });
  return { ...f, client };
}

test("actual archived-import rejection becomes an actionable non-commit, including a repeated request", async (t) => {
  const f = await fixture(t),
    id = await f.seed({ imported: true, archivedSource: true });
  const before = await f.snapshot(id),
    attempt = {
      requestId: randomUUID(),
      listingId: id,
      action: "edit",
      version: before.version,
      input: validProductionEdit(),
    };
  for (let n = 0; n < 2; n++)
    await assert.rejects(
      commitOwnedMobileListing(f.client, attempt),
      (e) =>
        e.status === 409 &&
        e.code === "listing_source_removed" &&
        e.message.includes("Restore the source on the website"),
    );
  assert.equal((await f.snapshot(id)).version, before.version);
  await f.owner();
  assert.equal(
    (
      await f.db.query("select count(*)::int n from mobile_message_receipts where request_id=$1", [
        attempt.requestId,
      ])
    ).rows[0].n,
    0,
  );
});

test("actual relist photo rejection is actionable, while a committed replay survives later missing photos", async (t) => {
  const f = await fixture(t),
    id = await f.seed();
  await f.manage(id, "archive", (await f.snapshot(id)).version);
  await f.owner();
  await f.db.query("delete from ask_media where ask_id=$1", [id]);
  await f.actor();
  const attempt = {
    requestId: randomUUID(),
    listingId: id,
    action: "relist",
    version: (await f.snapshot(id)).version,
    input: {},
  };
  await assert.rejects(
    commitOwnedMobileListing(f.client, attempt),
    (e) => e.status === 409 && e.code === "listing_photos_required",
  );
  await f.owner();
  await f.db.query("insert into ask_media(ask_id,storage_path) values($1,$2)", [
    id,
    `${f.a}/${id}/evidence.jpg`,
  ]);
  await f.actor();
  const committed = await commitOwnedMobileListing(f.client, attempt);
  assert.equal(committed.replayed, false);
  await f.owner();
  await f.db.query("delete from ask_media where ask_id=$1", [id]);
  await f.db.query("delete from listing_media where ask_id=$1", [id]);
  await f.actor();
  assert.deepEqual(await commitOwnedMobileListing(f.client, attempt), {
    ...committed,
    replayed: true,
  });
});
