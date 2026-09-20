import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const adminRoute = await read("src/routes/_authenticated/admin.tsx");
const adminAccess = await read("src/lib/admin-access.functions.ts");
const adminMigration = await read(
  "supabase/migrations/20260919233000_bootstrap_gem_state_admin.sql",
);
const dealerInventory = await read("src/lib/dealer-inventory.functions.ts");
const pilotFunctions = await read("src/lib/pilot.functions.ts");

test("the admin route and privileged feed access require the admin role", () => {
  assert.match(adminRoute, /getAdminAccess/);
  assert.match(adminRoute, /redirect\(\{ to: "\/account" \}\)/);
  assert.match(adminAccess, /_role: "admin"/);
  assert.match(dealerInventory, /rpc\("has_role"/);
  assert.doesNotMatch(dealerInventory, /rpc\("is_staff"/);
  assert.match(pilotFunctions, /if \(!empty\.isAdmin\) return empty/);
});

test("the bootstrap migration grants admin to the project owner account", () => {
  assert.match(adminMigration, /cayson@xstayproperties\.com/);
  assert.match(adminMigration, /'admin'::public\.app_role/);
  assert.match(adminMigration, /NOT EXISTS/);
});
