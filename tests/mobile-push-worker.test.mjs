import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { runMobilePushWorker } from "../infra/mobile/push-worker.mjs";
function fixture(change = () => {}, kind = "shopping_alert") {
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
    mobile_push_devices: { id: device, user_id: user, token: "private-token", platform: "ios" },
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
  const sent = [];
  const db = {
    rpc: async () => ({ data: claimed ? [] : ((claimed = true), [row]) }),
    from(table) {
      let update;
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
          update = null;
          return q;
        },
        maybeSingle: async () => ({ data: data[table] }),
        single: async () => ({ data: data[table] }),
        then(resolve) {
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
      now: () => now,
      lookupListing: async () => {
        change(data);
        return { id: "dealerfeed-test", categorySlug: "cars-trucks", title: "A car" };
      },
      send: async (...args) => {
        sent.push(args);
        return { sent: true };
      },
      max: 1,
    });
  return { data, sent, run };
}
test("push hands off a generic message once using the stable delivery id", async () => {
  const f = fixture();
  assert.equal((await f.run()).sent, 1);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0][1].body, "A shopping update is ready for you.");
  assert.equal(f.data.mobile_push_outbox.status, "sent");
});
for (const [name, change] of Object.entries({
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
