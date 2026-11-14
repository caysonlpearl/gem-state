import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { apnsDeliveryOutcome, runMobilePushWorker } from "../infra/mobile/push-worker.mjs";
function fixture(
  change = () => {},
  kind = "shopping_alert",
  provider = async () => ({ sent: true }),
) {
  const user = randomUUID(),
    other = randomUUID(),
    id = randomUUID(),
    device = randomUUID(),
    notification = randomUUID(),
    lease = randomUUID();
  const now = Date.now(),
    row = {
      id,
      user_id: user,
      notification_id: notification,
      device_id: device,
      lease_id: lease,
      attempts: 1,
    };
  const data = {
    notifications: {
      id: notification,
      user_id: user,
      kind,
      entity_id: randomUUID(),
      read_at: null,
      created_at: new Date(now).toISOString(),
      destination_url: "https://onbluebird.com/listings/dealerfeed-test",
    },
    mobile_push_devices: {
      id: device,
      user_id: user,
      token: "private-token",
      platform: "ios",
      updated_at: new Date(now - 10000).toISOString(),
    },
    shopping_accounts: { shopping_alerts: true },
    account_notification_preferences: { message_alerts: true },
    mobile_account_deletions: null,
    mobile_controls: { push_enabled: true },
    mobile_push_outbox: {
      status: "processing",
      lease_id: lease,
      lease_until: new Date(now + 120000).toISOString(),
    },
    conversations: {
      buyer_id: user,
      seller_id: other,
      dealer_inventory_record_id: "test",
      conversation_participants: [
        { user_id: user, blocked_at: null },
        { user_id: other, blocked_at: null },
      ],
    },
  };
  let claimed = false;
  const sent = [],
    deletions = [];
  const db = {
    rpc: async () => ({ data: claimed ? [] : ((claimed = true), [row]) }),
    from(table) {
      let update,
        deleting = false;
      const filters = [];
      const q = {
        select() {
          return q;
        },
        eq(k, v) {
          filters.push([k, v]);
          return q;
        },
        update(value) {
          update = value;
          return q;
        },
        delete() {
          deleting = true;
          return q;
        },
        maybeSingle: async () => ({ data: structuredClone(data[table]) }),
        single: async () => ({ data: structuredClone(data[table]) }),
        then(resolve) {
          if (deleting) {
            deletions.push({ table, filters });
            if (data.cleanupError)
              return Promise.resolve({ error: { code: "fixture" } }).then(resolve);
            const removed = filters.every(([k, v]) => data[table]?.[k] === v) ? data[table] : null;
            if (removed) {
              data[table] = null;
              if (table === "mobile_push_devices") data.mobile_push_outbox = null;
            }
            return Promise.resolve({ error: null, data: removed ? [{ id: removed.id }] : [] }).then(
              resolve,
            );
          }
          if (update && filters.every(([k, v]) => k === "id" || data[table]?.[k] === v))
            Object.assign(data[table], update);
          return Promise.resolve({ error: null }).then(resolve);
        },
      };
      return q;
    },
  };
  const run = () =>
    runMobilePushWorker({
      db,
      checkShopping: async () => data.shoppingEligible !== false,
      now: () => now,
      lookupListing: async () => {
        change(data);
        return { id: "dealerfeed-test", categorySlug: "cars-trucks", title: "A car" };
      },
      send: async (...args) => {
        sent.push(args);
        return provider(data, args, sent.length, now);
      },
      max: 1,
    });
  const reclaim = () => {
    claimed = false;
    row.attempts++;
    row.lease_id = randomUUID();
    Object.assign(data.mobile_push_outbox, { status: "processing", lease_id: row.lease_id });
  };
  return { data, sent, deletions, run, reclaim, now };
}
test("push hands off a generic message once using the stable delivery id", async () => {
  const f = fixture();
  assert.equal((await f.run()).sent, 1);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0][1].body, "A shopping update is ready for you.");
  assert.equal(f.data.mobile_push_outbox.status, "sent");
});
for (const [name, change] of Object.entries({
  dismissedOrPurchased: (d) => {
    d.shoppingEligible = false;
  },
  unsubscribe: (d) => {
    d.shopping_accounts.shopping_alerts = false;
  },
  paused: (d) => {
    d.mobile_controls.push_enabled = false;
  },
  read: (d) => {
    d.notifications.read_at = new Date().toISOString();
  },
  deletion: (d) => {
    d.mobile_account_deletions = { status: "requested" };
  },
  accountSwitch: (d) => {
    d.mobile_push_devices.user_id = randomUUID();
  },
  suppressedQueue: (d) => {
    d.mobile_push_outbox.status = "suppressed";
  },
  expiredLease: (d) => {
    d.mobile_push_outbox.lease_until = "2000-01-01";
  },
  newLease: (d) => {
    d.mobile_push_outbox.lease_id = randomUUID();
  },
}))
  test(`push rechecks ${name} after a slow listing lookup`, async () => {
    const f = fixture(change);
    assert.equal((await f.run()).suppressed, 1);
    assert.equal(f.sent.length, 0);
  });
test("conversation block made during lookup suppresses message push", async () => {
  const f = fixture((d) => {
    d.conversations.conversation_participants[1].blocked_at = new Date().toISOString();
  }, "message");
  assert.equal((await f.run()).suppressed, 1);
  assert.equal(f.sent.length, 0);
});
test("missing current-user conversation participant fails closed", async () => {
  const f = fixture((d) => {
    d.conversations.conversation_participants = [];
  }, "message");
  assert.equal((await f.run()).suppressed, 1);
  assert.equal(f.sent.length, 0);
});

test("APNs invalidation preserves its millisecond timestamp without trusting malformed failures", () => {
  const timestamp = Date.now();
  assert.deepEqual(apnsDeliveryOutcome(200, ""), { sent: true, invalidToken: false });
  assert.deepEqual(
    apnsDeliveryOutcome(410, JSON.stringify({ reason: "Unregistered", timestamp })),
    {
      sent: false,
      invalidToken: true,
      invalidatedAt: timestamp,
    },
  );
  assert.deepEqual(
    apnsDeliveryOutcome(410, JSON.stringify({ reason: "ExpiredToken", timestamp })),
    {
      sent: false,
      invalidToken: true,
      invalidatedAt: timestamp,
    },
  );
  for (const value of [undefined, null, "123", -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(
      apnsDeliveryOutcome(410, JSON.stringify({ reason: "Unregistered", timestamp: value }))
        .invalidatedAt,
      null,
    );
  assert.equal(apnsDeliveryOutcome(410, "not json").invalidToken, false);
  assert.equal(apnsDeliveryOutcome(400, '{"reason":"BadDeviceToken"}').invalidToken, false);
});

test("confirmed invalid registration is removed only with its exact owner, token and version", async () => {
  const f = fixture(undefined, "message", async (_data, _args, _count, now) => ({
    sent: false,
    invalidToken: true,
    invalidatedAt: now,
  }));
  const original = structuredClone(f.data.mobile_push_devices);
  assert.deepEqual(await f.run(), { sent: 0, suppressed: 1, retried: 0 });
  assert.equal(f.data.mobile_push_devices, null);
  assert.equal(
    f.data.mobile_push_outbox,
    null,
    "Existing FK removes the invalid device's delivery",
  );
  assert.deepEqual(f.deletions[0].filters, [
    ["id", original.id],
    ["user_id", original.user_id],
    ["token", original.token],
    ["updated_at", original.updated_at],
  ]);
});

test("registration renewed during a failed send survives and the logical delivery retries safely", async () => {
  const f = fixture(undefined, "message", async (data, _args, count, now) => {
    if (count > 1) return { sent: true };
    data.mobile_push_devices.updated_at = new Date(now + 1).toISOString();
    return { sent: false, invalidToken: true, invalidatedAt: now - 1000 };
  });
  assert.deepEqual(await f.run(), { sent: 0, suppressed: 0, retried: 1 });
  assert.equal(f.data.mobile_push_devices.updated_at, new Date(f.now + 1).toISOString());
  assert.equal(f.data.mobile_push_outbox.status, "pending");
  f.reclaim();
  assert.equal((await f.run()).sent, 1);
  assert.equal(
    f.sent[0][2],
    f.sent[1][2],
    "Retry keeps the same provider deduplication identifier",
  );
  assert.equal(f.data.mobile_push_outbox.status, "sent");
});

test("an old APNs invalidation cannot remove a later registration already read before sending", async () => {
  const f = fixture(undefined, "message", async (_data, _args, _count, now) => ({
    sent: false,
    invalidToken: true,
    invalidatedAt: now - 20000,
  }));
  assert.equal((await f.run()).retried, 1);
  assert.equal(f.deletions.length, 0);
  assert(f.data.mobile_push_devices);
});

test("missing invalidation metadata and failed cleanup retain the registration for retry", async () => {
  for (const cleanupFailure of [false, true]) {
    const f = fixture(undefined, "message", async (data, _args, _count, now) => {
      data.cleanupError = cleanupFailure;
      return { sent: false, invalidToken: true, ...(cleanupFailure ? { invalidatedAt: now } : {}) };
    });
    assert.equal((await f.run()).retried, 1);
    assert(f.data.mobile_push_devices);
    assert.equal(f.data.mobile_push_outbox.status, "pending");
  }
});

test("FCM invalidation removes only the Android registration that actually failed", async () => {
  const f = fixture(
    (data) => {
      data.mobile_push_devices.platform = "android";
    },
    "message",
    async () => ({ sent: false, invalidToken: true }),
  );
  assert.equal((await f.run()).suppressed, 1);
  assert.equal(f.data.mobile_push_devices, null);
});
