import { randomUUID } from "node:crypto";
export const notificationActors = {
  a: "11111111-1111-4111-8111-111111111111",
  b: "22222222-2222-4222-8222-222222222222",
};
export function notificationFixture() {
  const { a, b } = notificationActors;
  const ask = randomUUID(),
    restricted = randomUUID(),
    pending = randomUUID(),
    conversation = randomUUID(),
    blocked = randomUUID(),
    application = randomUUID(),
    dealer = randomUUID();
  const tables = {
    notifications: [],
    conversations: [],
    asks: [],
    shopping_inventory: [],
    partner_job_reports: [],
    partner_vehicle_reports: [],
    job_applications: [],
  };
  const now = new Date().toISOString();
  const add = (
    owner,
    kind,
    title,
    entityType = null,
    entityId = null,
    destination = null,
    body = "Fixture account activity.",
  ) => {
    const row = {
      id: randomUUID(),
      user_id: owner,
      kind,
      title,
      body,
      entity_type: entityType,
      entity_id: entityId,
      destination_url: destination,
      order_id: null,
      read_at: null,
      created_at: new Date().toISOString(),
    };
    tables.notifications.push(row);
    return row;
  };
  const native = (id, category, title, status = "active") => ({
    id,
    seller_id: a,
    status,
    is_demo: false,
    approved_at: status === "active" ? now : null,
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    products: {
      name: title,
      description: "Public fixture description",
      status: "published",
      categories: { slug: category },
    },
  });
  tables.asks.push(
    native(ask, "general", "Useful fixture desk"),
    native(restricted, "firearms", "Fixture rifle"),
    native(pending, "jobs", "Fixture job under review", "pending_review"),
  );
  const conv = (id, listing, block = false) => ({
    id,
    listing_id: listing,
    buyer_id: a,
    seller_id: b,
    last_message_at: now,
    conversation_participants: [
      { user_id: a, last_read_at: null, blocked_at: null },
      { user_id: b, last_read_at: null, blocked_at: block ? now : null },
    ],
  });
  tables.conversations.push(
    conv(conversation, ask),
    conv(blocked, ask, true),
    conv(randomUUID(), restricted),
  );
  const visibleMessage = add(
    a,
    "message",
    "Fixture marketplace message",
    "conversation",
    conversation,
    `/account?section=messages&conversation=${conversation}`,
  );
  const visibleShopping = add(
    a,
    "shopping_alert",
    "Fixture shopping update",
    "shopping_alert",
    randomUUID(),
    `/listings/${ask}`,
  );
  const visibleReview = add(
    a,
    "listing_reviewed",
    "Fixture listing review",
    "listing",
    pending,
    "/account?section=listings",
  );
  const visibleAccount = add(
    a,
    "security",
    "Fixture account security",
    null,
    null,
    "/account?section=settings",
  );
  const visibleJob = add(
    a,
    "job_application",
    "Fixture application received",
    "job_application",
    application,
    "/selling#applications",
  );
  tables.job_applications.push({ id: application, listing_id: pending, asks: { seller_id: a } });
  const restrictedNotice = add(
    a,
    "shopping_alert",
    "Restricted fixture notification",
    "shopping_alert",
    randomUUID(),
    `/listings/${restricted}`,
  );
  const blockedNotice = add(
    a,
    "message",
    "Blocked fixture message",
    "conversation",
    blocked,
    `/account?section=messages&conversation=${blocked}`,
  );
  const paid = add(
    a,
    "listing_upgrade",
    "Fixture paid upgrade",
    "listing",
    ask,
    "/account?section=billing",
  );
  const foreign = add(b, "security", "Second account notification");
  const dealerProfile = {
    slug: "fixture-dealer",
    display_name: "Fixture Dealer",
    website: "https://dealer.example",
    phone: null,
    address_line1: null,
    city: "Boise",
    state: "ID",
    postal_code: "83702",
    owner_user_id: b,
  };
  const feed = {
    dealers: [dealerProfile],
    vehicles: [
      {
        id: dealer,
        dealer_slug: dealerProfile.slug,
        title: "2026 Fixture Ford",
        price_cents: 3500000,
        vehicle_year: 2026,
        vehicle_make: "Ford",
        vehicle_model: "F-150",
        source_url: "https://dealer.example/car",
        photos: ["https://images.fixture.invalid/car.png"],
      },
    ],
  };
  const calls = [],
    writes = [];
  let failedTable = null,
    loseRead = false;
  const field = (row, key) => key.split(".").reduce((value, name) => value?.[name], row);
  function query(table) {
    const filters = [];
    let max = Infinity,
      sort;
    const q = {
      select() {
        return q;
      },
      eq(key, value) {
        filters.push((row) => field(row, key) === value);
        calls.push({ table, kind: "eq", key, value });
        return q;
      },
      in(key, values) {
        filters.push((row) => values.includes(field(row, key)));
        return q;
      },
      gt(key, value) {
        filters.push((row) => field(row, key) > value);
        return q;
      },
      or(expression) {
        const parts = expression.split(",").map((p) => p.split(".eq."));
        filters.push((row) => parts.some(([key, value]) => field(row, key) === value));
        calls.push({ table, kind: "or", expression });
        return q;
      },
      order(key, { ascending = true } = {}) {
        sort = { key, ascending };
        return q;
      },
      limit(value) {
        max = value;
        return q;
      },
      abortSignal() {
        return q;
      },
      retry() {
        return q;
      },
      then(resolve, reject) {
        calls.push({ table, kind: "read" });
        let data = (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
        if (sort)
          data = [...data].sort(
            (a, b) =>
              String(field(a, sort.key) ?? "").localeCompare(String(field(b, sort.key) ?? "")) *
              (sort.ascending ? 1 : -1),
          );
        return Promise.resolve({
          data: data.slice(0, max).map((row) => structuredClone(row)),
          error: failedTable === table ? { message: "Fixture database failure" } : null,
        }).then(resolve, reject);
      },
    };
    return q;
  }
  const client = (actor) => ({
    from(table) {
      if (table !== "notifications") throw Error("Unexpected authenticated source " + table);
      return query(table);
    },
    rpc: async (name, args) => {
      if (name !== "mark_notifications_read") throw Error("Unexpected mutation " + name);
      writes.push({ actor, name, args: structuredClone(args) });
      let count = 0;
      for (const n of tables.notifications)
        if (n.user_id === actor && args._ids.includes(n.id) && !n.read_at) {
          n.read_at = new Date().toISOString();
          count++;
        }
      if (loseRead) {
        loseRead = false;
        throw Error("Fixture response lost after commit");
      }
      return { data: count, error: null };
    },
  });
  const db = {
    from: query,
    rpc(name, args) {
      if (name !== "read_published_dealer_inventory")
        throw Error("Privileged client must never mark notifications");
      calls.push({ rpc: name, args });
      return {
        abortSignal() {
          return this;
        },
        retry() {
          return this;
        },
        then(resolve, reject) {
          return Promise.resolve({ data: structuredClone(feed), error: null }).then(
            resolve,
            reject,
          );
        },
      };
    },
  };
  return {
    tables,
    calls,
    writes,
    db,
    client,
    ids: { ask, restricted, pending, conversation, blocked, application, dealer },
    rows: {
      visibleMessage,
      visibleShopping,
      visibleReview,
      visibleAccount,
      visibleJob,
      restrictedNotice,
      blockedNotice,
      paid,
      foreign,
    },
    add,
    feed,
    fail(table) {
      failedTable = table;
    },
    loseNextRead() {
      loseRead = true;
    },
  };
}
