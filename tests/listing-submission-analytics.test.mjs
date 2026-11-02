import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { isNewListingAction } from "../src/lib/analytics-policy.ts";
import { searchOutcomeSummary } from "../src/lib/search-outcome-summary.ts";

// Execute the actual form's mutation callbacks, replacing its UI, file store
// and server boundary. No photograph, listing or message is sent by these tests.
const source = readFileSync(
  new URL("../src/components/classifieds/listing-form/ListingForm.tsx", import.meta.url),
  "utf8",
);
const parsed = ts.createSourceFile(
  "ListingForm.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let options;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === "mutation")
    options = node.initializer?.arguments?.[0];
  ts.forEachChild(node, visit);
}
visit(parsed);
assert.ok(options, "The form must keep its tested mutation boundary");
const callbacks = ts.transpileModule(`globalThis.callbacks = (${options.getText(parsed)});`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;

function formBoundary(overrides = {}) {
  const events = [];
  const context = {
    props: { mode: "create" },
    kind: "item",
    files: [{}],
    photoRights: true,
    form: {
      title: "Private offline fixture",
      description: "Offline fixture only",
      category: "general",
      state: "ID",
      city: "Boise",
      region: "Treasure Valley",
      itemDetails: {},
    },
    hidesCondition: false,
    hidesFulfillment: false,
    traceMutation: async (_telemetry, task) => task(),
    trackEvent: (name, props) => {
      events.push({ name, props });
    },
    supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: "fixture-owner" } } } }) },
    },
    uploadPhoto: async () => "fixture-owner/fixture.jpg",
    buildVehicle: () => null,
    buildHome: () => null,
    buildJob: () => null,
    buildService: () => null,
    buildPet: () => null,
    priceCentsFor: () => 100,
    optionalNumber: () => null,
    create: async () => ({ listingId: "accepted-listing" }),
    update: async () => ({ ok: true }),
    queryClient: { invalidateQueries: async () => {} },
    toast: { success() {}, error() {} },
    navigate: async () => {},
    ...overrides,
  };
  vm.runInNewContext(callbacks, context);
  return { callbacks: context.callbacks, events };
}

test("actual form records an attempt before work and a matching listing only after acknowledgement", async () => {
  let acknowledge;
  const boundary = formBoundary({
    create: () =>
      new Promise((resolve) => {
        acknowledge = resolve;
      }),
  });
  const pending = boundary.callbacks.mutationFn();
  await new Promise(setImmediate);
  assert.deepEqual(
    boundary.events.map((e) => e.name),
    ["classified_listing_submit_started"],
  );
  acknowledge({ listingId: "accepted-listing" });
  const result = await pending;
  assert.equal(boundary.events.length, 1);
  await boundary.callbacks.onSuccess(result);
  const accepted = boundary.events.at(-1);
  assert.equal(accepted.name, "classified_listing_submit_succeeded");
  assert.equal(accepted.props.listing_id, "accepted-listing");
  assert.equal(accepted.props.event_id, "create:accepted-listing");
  assert.equal(accepted.props.mode, "create");
});

test("failed photo validation records an attempt without inventing an accepted listing", async () => {
  const boundary = formBoundary({
    files: [],
    create: () => assert.fail("No server create after failed validation"),
  });
  let error;
  try {
    await boundary.callbacks.mutationFn();
  } catch (caught) {
    error = caught;
  }
  assert.match(error.message, /at least one listing photo/);
  boundary.callbacks.onError(error);
  assert.deepEqual(
    boundary.events.map((e) => e.name),
    ["classified_listing_submit_started", "classified_listing_submit_failed"],
  );
});

test("editing preserves the acknowledged existing ID and explicit edit mode", async () => {
  const boundary = formBoundary({
    props: { mode: "edit", listingId: "existing-listing" },
    files: [],
  });
  const result = await boundary.callbacks.mutationFn();
  await boundary.callbacks.onSuccess(result);
  assert.equal(boundary.events.at(-1).props.mode, "edit");
  assert.equal(boundary.events.at(-1).props.listing_id, "existing-listing");
  assert.equal(boundary.events.at(-1).props.event_id, undefined);
});

test("actual validation handler excludes edits and deduplicates within separate activity buckets", async () => {
  const source = readFileSync(new URL("../src/lib/pilot.functions.ts", import.meta.url), "utf8");
  const file = ts.createSourceFile("pilot.functions.ts", source, ts.ScriptTarget.Latest, true);
  const declarations = new Map();
  function visit(node) {
    if (ts.isVariableDeclaration(node)) declarations.set(node.name.getText(file), node.initializer);
    ts.forEachChild(node, visit);
  }
  visit(file);
  const handler = declarations.get("getValidationSummary").arguments[0];
  const script = ts.transpileModule(
    `
    const VALIDATION_EVENT_ALIASES = ${declarations.get("VALIDATION_EVENT_ALIASES").getText(file)};
    const FUNNEL_EVENTS = ${declarations.get("FUNNEL_EVENTS").getText(file)};
    globalThis.handler = ${handler.getText(file)};
  `,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const runtime = { isNewListingAction, searchOutcomeSummary };
  vm.runInNewContext(script, runtime);
  let admin = false;
  const queries = [];
  const accepted = {
    name: "classified_listing_submit_succeeded",
    mode: "create",
    event_id: "create:one",
  };
  const supabase = {
    rpc: async () => ({ data: admin }),
    from(table) {
      const query = {
        select(columns) {
          queries.push({ table, columns });
          return table === "user_roles" ? Promise.resolve({ data: [{ user_id: "staff" }] }) : query;
        },
        gte: () => query,
        limit: async () => ({
          data: [
            accepted,
            accepted,
            { ...accepted, mode: "edit" },
            { ...accepted, is_demo: true },
            { ...accepted, user_id: "staff" },
          ],
        }),
      };
      return query;
    },
  };
  const input = { data: { windowDays: 30 }, context: { supabase, userId: "viewer" } };
  assert.equal((await runtime.handler(input)).isAdmin, false);
  assert.equal(queries.length, 0);
  admin = true;
  const report = await runtime.handler(input);
  assert.equal(report.real.ask_submitted, 1);
  assert.equal(report.demo.ask_submitted, 1);
  assert.equal(report.internal.ask_submitted, 1);
  assert.match(queries[0].columns, /mode:props->>mode/);
  assert.equal(
    queries[0].columns.split(",").some((column) => column.trim() === "props"),
    false,
  );
});

test("actual editorial SQL excludes edits, deduplicates accepted records and retains private access", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.analytics_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text, props jsonb, occurred_at timestamptz DEFAULT now(), is_demo boolean DEFAULT false);`);
    const migration = readFileSync(
      new URL(
        "../supabase/migrations/20261102120000_correct_editorial_submission_counts.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.exec(migration);
    await db.exec(migration);
    const insert = (name, props = {}, isDemo = false) =>
      db.query("INSERT INTO public.analytics_events(name,props,is_demo) VALUES ($1,$2::jsonb,$3)", [
        name,
        JSON.stringify({ site_host: "onbluebird.com", media_article: "guide:rental", ...props }),
        isDemo,
      ]);
    await insert("classified_listing_submit_started", { mode: "create" });
    await insert("classified_listing_submit_started", { mode: "edit" });
    await insert("classified_listing_submit_succeeded", { mode: "create", event_id: "create:one" });
    await insert("classified_listing_submit_succeeded", { mode: "create", event_id: "create:one" });
    await insert("classified_listing_submit_succeeded", { mode: "edit", event_id: "edit:one" });
    await insert("classified_listing_submit_succeeded", {}); // legacy acknowledgement
    await insert("inquiry_completed", { event_id: "message:one" });
    await insert("inquiry_completed", { event_id: "message:one" });
    for (const props of [{ is_internal: true }, { is_bot: true }, { site_host: "preview.example" }])
      await insert("classified_listing_submit_succeeded", props);
    await insert("classified_listing_submit_succeeded", {}, true);
    const result = await db.query("SELECT public.editorial_performance(30) AS metrics");
    assert.equal(result.rows[0].metrics.postingStarted, 1);
    assert.equal(result.rows[0].metrics.postingCompleted, 2);
    assert.equal(result.rows[0].metrics.sellerContacts, 1);
    for (const role of ["anon", "authenticated"])
      assert.equal(
        (
          await db.query(
            "SELECT has_function_privilege($1,'public.editorial_performance(integer)','EXECUTE') AS allowed",
            [role],
          )
        ).rows[0].allowed,
        false,
      );
    await db.exec("SET ROLE service_role");
    assert.equal(
      (await db.query("SELECT public.editorial_performance(30) AS metrics")).rows[0].metrics
        .postingCompleted,
      2,
    );
  } finally {
    await db.close();
  }
});
