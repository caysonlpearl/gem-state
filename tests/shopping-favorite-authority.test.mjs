import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { shoppingActivityDatabase } from "./helpers/shopping-activity-database.mjs";
import { readFileSync } from "node:fs";
import { shoppingActivity, recordShoppingActivity } from "../src/lib/shopping.server.ts";
import { interests, reminderStep, shoppingPriceInterest } from "../src/lib/shopping-contract.ts";
test("removing an actual bookmark stops a delayed/cache save from acting like a current favorite", async () => {
  const f = await shoppingActivityDatabase();
  try {
    const listing = randomUUID(),
      variant = randomUUID(),
      time = new Date(Date.now() - 3 * 86400000).toISOString();
    await f.db.query("insert into asks(id,variant_id) values($1,$2)", [listing, variant]);
    await f.db.query("insert into watchlist(user_id,variant_id,created_at) values($1,$2,$3)", [
      f.user,
      variant,
      time,
    ]);
    await f.db.query(
      "insert into shopping_events(id,subject,user_id,session_id,kind,listing_id,occurred_at) values($1,$2,$3,$1,'save',$4,$5)",
      [randomUUID(), f.subject, f.user, listing, time],
    );
    await f.db.query(
      "insert into shopping_favorites(subject,listing_id,saved_at) values($1,$2,$3)",
      [f.subject, listing, time],
    );
    assert.equal(
      interests(await shoppingActivity(f.client, f.subject)).get(listing).favorite,
      true,
    );
    await f.db.query("delete from watchlist where user_id=$1", [f.user]);
    const interest = interests(await shoppingActivity(f.client, f.subject)).get(listing);
    assert.equal(interest?.favorite ?? false, false);
    assert.equal(interest ? reminderStep(interest) : null, null);
  } finally {
    await f.db.close();
  }
});

const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();
const insertEvent = (f, kind, listing, at = ago(2)) =>
  f.db.query(
    "insert into shopping_events(id,subject,user_id,session_id,kind,listing_id,occurred_at) values($1,$2,$3,$1,$4,$5,$6)",
    [randomUUID(), f.subject, f.user, kind, listing, at],
  );
test("real saves preserve their reminder anchor despite reordered unsaves, and a real resave supplies renewed interest", async () => {
  const f = await shoppingActivityDatabase();
  try {
    const listing = "dealerfeed-anchor",
      saved = ago(3.1),
      eventAt = new Date(Date.parse(saved) + 2000).toISOString();
    await f.db.query("insert into saved_partner_vehicles values($1,$2,$3)", [
      f.user,
      listing,
      saved,
    ]);
    await insertEvent(f, "save", listing, eventAt);
    await insertEvent(f, "unsave", listing, ago(1));
    let interest = interests(await shoppingActivity(f.client, f.subject)).get(listing);
    assert.equal(interest.favorite, true);
    assert.equal(interest.lastAt, Date.parse(eventAt));
    assert.equal(reminderStep(interest), 3);
    await f.db.query("delete from saved_partner_vehicles where user_id=$1", [f.user]);
    assert.equal(interests(await shoppingActivity(f.client, f.subject)).has(listing), false);
    const renewed = ago(0.01);
    await f.db.query("insert into saved_partner_vehicles values($1,$2,$3)", [
      f.user,
      listing,
      renewed,
    ]);
    interest = interests(await shoppingActivity(f.client, f.subject)).get(listing);
    assert.equal(interest.favorite, true);
    assert.equal(interest.lastAt, Date.parse(renewed));
    assert.equal(reminderStep(interest), null);
  } finally {
    await f.db.close();
  }
});
test("all bookmark systems and the other shopper remain isolated, including bookmarks on unavailable asks", async () => {
  const f = await shoppingActivityDatabase();
  try {
    const listing = randomUUID(),
      variant = randomUUID(),
      other = randomUUID(),
      otherSubject = "u:" + other;
    await f.db.query("insert into auth.users(id) values($1)", [other]);
    await f.db.query("select set_shopping_privacy($1,$2,true,false,'test')", [otherSubject, other]);
    await f.db.query("insert into asks(id,variant_id,status) values($1,$2,'cancelled')", [
      listing,
      variant,
    ]);
    await f.db.query("insert into watchlist values($1,$2,$3)", [f.user, variant, ago(2)]);
    for (const [table, id] of [
      ["saved_partner_vehicles", "dealerfeed-car"],
      ["saved_partner_homes", "mashvisor-1"],
      ["saved_partner_jobs", "adzuna-2"],
    ])
      await f.db.query(`insert into ${table} values($1,$2,$3),($4,$2,$3)`, [
        f.user,
        id,
        ago(2),
        other,
      ]);
    let events = await shoppingActivity(f.client, f.subject);
    assert.equal([...interests(events).values()].filter((r) => r.favorite).length, 4);
    for (const table of [
      "watchlist",
      "saved_partner_vehicles",
      "saved_partner_homes",
      "saved_partner_jobs",
    ])
      await f.db.query(`delete from ${table} where user_id=$1`, [f.user]);
    assert.equal(interests(await shoppingActivity(f.client, f.subject)).size, 0);
    assert.equal(
      [...interests(await shoppingActivity(f.client, otherSubject)).values()].filter(
        (r) => r.favorite,
      ).length,
      3,
    );
  } finally {
    await f.db.close();
  }
});
test("a removal during history loading is visible to the later bookmark check without erasing genuine browsing interest", async () => {
  let removed = false;
  const f = await shoppingActivityDatabase(async (c, f) => {
    if (c.name === "shopping_events" && !removed) {
      removed = true;
      await f.db.query("delete from saved_partner_jobs where user_id=$1", [f.user]);
    }
  });
  try {
    const listing = "adzuna-3";
    await f.db.query("insert into saved_partner_jobs values($1,$2,$3)", [f.user, listing, ago(3)]);
    await insertEvent(f, "save", listing, ago(3));
    await insertEvent(f, "view", listing, ago(2));
    const interest = interests(await shoppingActivity(f.client, f.subject)).get(listing);
    assert.equal(removed, true);
    assert.equal(interest.favorite, false);
    assert(interest.score > 0);
    assert.equal(shoppingPriceInterest(interest), true);
    assert.equal(reminderStep(interest), null);
  } finally {
    await f.db.close();
  }
});
test("clearing history or withdrawing permission during a read discards its earlier activity snapshot", async () => {
  for (const action of ["clear", "withdraw", "deletion"]) {
    let changed = false;
    const f = await shoppingActivityDatabase(async (c, f) => {
      if (c.rpc && c.name === "shopping_saved_interests" && !changed) {
        changed = true;
        if (action === "clear") await f.db.query("select clear_shopping_history($1)", [f.subject]);
        else if (action === "withdraw")
          await f.db.query("select set_shopping_privacy($1,$2,false,false,'test')", [
            f.subject,
            f.user,
          ]);
        else
          await f.db.query("insert into mobile_account_deletions values($1,'requested')", [f.user]);
      }
    });
    try {
      await insertEvent(f, "view", "dealerfeed-private");
      assert.deepEqual(await shoppingActivity(f.client, f.subject), []);
      assert.equal(changed, true);
    } finally {
      await f.db.close();
    }
  }
});
test("history clear leaves actual bookmarks intact but excludes older saved interests until renewed activity", async () => {
  const f = await shoppingActivityDatabase();
  try {
    await f.db.query("insert into saved_partner_homes values($1,$2,$3)", [
      f.user,
      "mashvisor-4",
      ago(30),
    ]);
    await f.db.query("select clear_shopping_history($1)", [f.subject]);
    assert.equal(interests(await shoppingActivity(f.client, f.subject)).size, 0);
    assert.equal(
      (await f.db.query("select count(*)::int n from saved_partner_homes")).rows[0].n,
      1,
    );
    await insertEvent(f, "save", "mashvisor-4", new Date().toISOString());
    assert.equal(
      interests(await shoppingActivity(f.client, f.subject)).get("mashvisor-4").favorite,
      true,
    );
  } finally {
    await f.db.close();
  }
});
test("current saves and durable choices paginate completely while the browsing sample remains its latest 1500 events", async () => {
  const f = await shoppingActivityDatabase();
  try {
    await f.db.query(
      "insert into saved_partner_vehicles select $1,'dealerfeed-current-'||n,now()-interval '2 days' from generate_series(1,501) n",
      [f.user],
    );
    await f.db.query(
      "insert into shopping_choices(subject,listing_id,user_id,dismissed,choice_at) select $1,'dealerfeed-dismissed-'||n,$2,true,now()-interval '1 day' from generate_series(1,1601) n",
      [f.subject, f.user],
    );
    await f.db.query(
      "insert into shopping_events(id,subject,user_id,session_id,kind,listing_id,occurred_at) select gen_random_uuid(),$1,$2,gen_random_uuid(),'view','dealerfeed-viewed',now()-n*interval '1 second' from generate_series(1,2000) n",
      [f.subject, f.user],
    );
    const events = await shoppingActivity(f.client, f.subject),
      profile = interests(events);
    assert.equal([...profile.values()].filter((r) => r.favorite).length, 501);
    assert.equal([...profile.values()].filter((r) => r.dismissed).length, 1601);
    assert.equal(events.filter((e) => e.kind === "view").length, 1500);
    assert.equal(f.calls.filter((c) => c.name === "shopping_saved_interests").length, 2);
    assert.equal(f.calls.filter((c) => c.name === "shopping_choices").length, 4);
    assert.equal(f.calls.filter((c) => c.name === "shopping_events").length, 3);
    assert(!f.calls.some((c) => c.name === "shopping_favorites"));
  } finally {
    await f.db.close();
  }
});
test("incomplete, excessive, duplicate and unavailable bookmark reads reject instead of falling back to stale favorites", async () => {
  for (const kind of ["error", "cap", "duplicate", "changed", "too-many"]) {
    const f = await shoppingActivityDatabase((c) => {
      if (c.name !== "shopping_saved_interests") return;
      if (kind === "error")
        return Response.json(
          { code: "PGRST202", message: "PRIVATE schema diagnostic" },
          { status: 404 },
        );
      if (kind === "cap")
        return Response.json([{ listing_id: "dealerfeed-one", saved_at: ago(1) }], {
          headers: { "content-range": "0-0/501" },
        });
      if (kind === "duplicate")
        return Response.json(Array(2).fill({ listing_id: "dealerfeed-same", saved_at: ago(1) }), {
          headers: { "content-range": "0-1/2" },
        });
      if (kind === "too-many") return Response.json([], { headers: { "content-range": "*/5001" } });
      if (kind === "changed" && c.q.get("offset") === "500")
        return Response.json([{ listing_id: "dealerfeed-last", saved_at: ago(1) }], {
          headers: { "content-range": "500-500/502" },
        });
    });
    try {
      await f.db.query(
        "insert into saved_partner_jobs select $1,'adzuna-'||n,now()-interval '2 days' from generate_series(1,501) n",
        [f.user],
      );
      await assert.rejects(
        shoppingActivity(f.client, f.subject),
        (e) => e.message === "Shopping history could not be read. Please retry." && !e.cause,
      );
      assert(!f.calls.some((c) => c.name === "shopping_favorites"));
    } finally {
      await f.db.close();
    }
  }
});
test("foreign-subject activity cannot enter a shopper profile even through a faulty service response", async () => {
  const f = await shoppingActivityDatabase((c) =>
    c.name === "shopping_events"
      ? Response.json(
          [
            {
              id: randomUUID(),
              subject: "u:" + randomUUID(),
              kind: "view",
              listing_id: "dealerfeed-foreign",
              occurred_at: ago(1),
            },
          ],
          { headers: { "content-range": "0-0/1" } },
        )
      : undefined,
  );
  try {
    await assert.rejects(
      shoppingActivity(f.client, f.subject),
      /Shopping history could not be read/,
    );
  } finally {
    await f.db.close();
  }
});
test("member activity stops writing redundant favorites while the existing guest save/unsave path remains independent", async () => {
  const f = await shoppingActivityDatabase();
  try {
    const input = (kind) => ({
      id: randomUUID(),
      session: randomUUID(),
      kind,
      listingId: "dealerfeed-event",
      at: ago(kind === "save" ? 2 : 1),
    });
    assert.deepEqual(
      await recordShoppingActivity(f.client, { user: { id: f.user }, subject: f.subject }, [
        input("save"),
      ]),
      { accepted: 1 },
    );
    assert.equal((await f.db.query("select count(*)::int n from shopping_favorites")).rows[0].n, 0);
    const guest = "g:" + randomUUID();
    await f.db.query("select set_shopping_privacy($1,null,true,false,'test')", [guest]);
    assert.deepEqual(
      await recordShoppingActivity(f.client, { user: null, subject: guest }, [input("save")]),
      { accepted: 1 },
    );
    assert.equal(
      interests(await shoppingActivity(f.client, guest)).get("dealerfeed-event").favorite,
      true,
    );
    await recordShoppingActivity(f.client, { user: null, subject: guest }, [input("unsave")]);
    assert.equal(
      interests(await shoppingActivity(f.client, guest)).get("dealerfeed-event").favorite,
      false,
    );
    assert.equal((await f.db.query("select count(*)::int n from shopping_favorites")).rows[0].n, 0);
  } finally {
    await f.db.close();
  }
});
test("a stalled bookmark response body is cancelled under the shared eight-second deadline without retries", async (t) => {
  const f = await shoppingActivityDatabase((c) =>
    c.name === "shopping_saved_interests"
      ? new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("["));
              c.init.signal.addEventListener(
                "abort",
                () => controller.error(c.init.signal.reason),
                { once: true },
              );
            },
          }),
          { headers: { "content-type": "application/json" } },
        )
      : undefined,
  );
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal, "timeout", (ms) => {
    assert.equal(ms, 8000);
    return timeout(30);
  });
  const keep = setTimeout(() => {}, 1500);
  t.after(() => clearTimeout(keep));
  try {
    await assert.rejects(
      shoppingActivity(f.client, f.subject),
      /Shopping history could not be read/,
    );
    assert.equal(f.calls.filter((c) => c.name === "shopping_saved_interests").length, 1);
    assert(f.calls.every((c) => c.init.signal === f.calls[0].init.signal));
  } finally {
    await f.db.close();
  }
});
test("legacy member-cache cleanup is service-only and bounded, preserving real bookmarks, guest favorites and unknown subjects", async () => {
  const f = await shoppingActivityDatabase();
  try {
    await f.db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/20261114140000_prune_member_favorite_cache.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await f.db.query(
      "insert into shopping_favorites select $1,'dealerfeed-old-'||n,now() from generate_series(1,203) n",
      [f.subject],
    );
    const guest = "g:" + randomUUID();
    await f.db.query("select set_shopping_privacy($1,null,true,false,'test')", [guest]);
    await f.db.query(
      "insert into shopping_privacy(subject,personalization) values('u:unrecognized',true)",
    );
    await f.db.query(
      "insert into shopping_favorites values($1,'dealerfeed-guest',now()),('u:unrecognized','dealerfeed-review',now())",
      [guest],
    );
    await f.db.query("insert into saved_partner_jobs values($1,'adzuna-9',now())", [f.user]);
    for (const role of ["anon", "authenticated"]) {
      await f.db.exec("set role " + role);
      await assert.rejects(
        f.db.query("select prune_member_favorite_cache(100)"),
        /permission denied/,
      );
      await f.db.exec("reset role");
    }
    await f.db.exec("set role service_role");
    for (const size of [0, 101, null])
      await assert.rejects(
        f.db.query("select prune_member_favorite_cache($1)", [size]),
        /Invalid favorite cleanup batch/,
      );
    for (const expected of [100, 100, 3, 0]) {
      const result = (await f.db.query("select prune_member_favorite_cache(100) result")).rows[0]
        .result;
      assert.equal(result.deleted, expected);
      assert.equal(result.remaining, expected === 100);
    }
    await f.db.exec("reset role");
    assert.equal((await f.db.query("select count(*)::int n from shopping_favorites")).rows[0].n, 2);
    assert.equal((await f.db.query("select count(*)::int n from saved_partner_jobs")).rows[0].n, 1);
  } finally {
    await f.db.close();
  }
});

test("cache retirement refuses an unreviewed cascading child instead of expanding its deletion scope", async () => {
  const f = await shoppingActivityDatabase();
  try {
    await f.db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/20261114140000_prune_member_favorite_cache.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await f.db.query("insert into shopping_favorites values($1,'dealerfeed-preserve',now())", [
      f.subject,
    ]);
    await f.db.exec(
      "create table synthetic_favorite_child(subject text,listing_id text,foreign key(subject,listing_id) references shopping_favorites(subject,listing_id) on delete cascade)",
    );
    await f.db.query("insert into synthetic_favorite_child values($1,'dealerfeed-preserve')", [
      f.subject,
    ]);
    await assert.rejects(
      f.db.query("select prune_member_favorite_cache(100)"),
      /Favorite cleanup schema requires review/,
    );
    assert.equal((await f.db.query("select count(*)::int n from shopping_favorites")).rows[0].n, 1);
    assert.equal(
      (await f.db.query("select count(*)::int n from synthetic_favorite_child")).rows[0].n,
      1,
    );
  } finally {
    await f.db.close();
  }
});
