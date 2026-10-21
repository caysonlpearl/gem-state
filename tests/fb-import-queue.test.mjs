import test from "node:test";
import assert from "node:assert/strict";
import {
  describeAction,
  groupQueueBySeller,
  groupUnreadable,
  publishBlocker,
  selectedProfiles,
} from "../src/lib/fb-import-queue.ts";

const vinted = "https://www.vinted.com/member/123-shop";
const ksl = "https://classifieds.ksl.com/search/member/55";
const items = [
  ...Array.from({ length: 66 }, (_, i) => ({ id: `v${i}`, sourceProfileUrl: vinted, status: "needs_update" })),
  ...Array.from({ length: 3 }, (_, i) => ({ id: `r${i}`, sourceProfileUrl: vinted, status: "possibly_removed" })),
  { id: "k1", sourceProfileUrl: ksl, status: "draft" },
  { id: "k2", sourceProfileUrl: `${ksl}/`, status: "needs_update" },
];
const base = { items, dirtyIds: new Set(), authorized: true };

test("queue groups by canonical seller profile with new/update/removed counts", () => {
  const groups = groupQueueBySeller(items, { [vinted.replace("-shop", "")]: "Vinted Shop" });
  assert.equal(groups.length, 2);
  const v = groups.find((g) => g.site === "Vinted");
  assert.equal(v.name, "Vinted Shop");
  assert.deepEqual([v.newCount, v.updateCount, v.removedCount], [0, 66, 3]);
  const k = groups.find((g) => g.site === "KSL");
  assert.deepEqual(k.itemIds, ["k1", "k2"]);
});

test("a selection across two sellers is blocked even when authorization is checked", () => {
  const selectedIds = new Set(items.map((i) => i.id));
  assert.equal(selectedProfiles(items, selectedIds).length, 2);
  assert.match(publishBlocker({ ...base, selectedIds }), /spans 2 sellers/);
});

test("nothing selected tells the admin to pick a seller", () => {
  assert.match(publishBlocker({ ...base, selectedIds: new Set() }), /Select one seller/);
});

test("one seller with unsaved edits must save or revert first", () => {
  const selectedIds = new Set(["v0", "v1"]);
  assert.match(publishBlocker({ ...base, selectedIds, dirtyIds: new Set(["v1"]) }), /Save or revert edits on 1/);
});

test("authorization must still be confirmed for a single seller", () => {
  assert.match(publishBlocker({ ...base, authorized: false, selectedIds: new Set(["k1"]) }), /authorized/);
  assert.equal(publishBlocker({ ...base, selectedIds: new Set(["k1", "k2"]) }), null);
});

test("action copy updates and takes offline, never republishes removed rows", () => {
  const selectedIds = new Set(items.filter((i) => i.sourceProfileUrl === vinted).map((i) => i.id));
  const text = describeAction(items, selectedIds);
  assert.equal(text, "Update 66 Bluebird listing(s), take 3 offline");
  assert.doesNotMatch(text, /republish/i);
});

test("unreadable reasons group by site/reason and unexplained rows stay 'not reported'", () => {
  const groups = groupUnreadable(
    [
      { site: "Vinted", reason: "page_timeout", count: 30 },
      { site: "Vinted", reason: "page_timeout", count: 5 },
      { site: "KSL", reason: "verification_incomplete", count: 10 },
      { site: "Evil", reason: "<script>", count: 2 },
    ],
    55,
  );
  assert.deepEqual(groups, [
    { site: "Vinted", reason: "page_timeout", count: 35 },
    { site: "KSL", reason: "verification_incomplete", count: 10 },
    { site: "All sites", reason: "not_reported", count: 8 },
    { site: "Unknown site", reason: "read_failed", count: 2 },
  ]);
});

test("a past run with only an aggregate count claims no cause", () => {
  assert.deepEqual(groupUnreadable(undefined, 55), [
    { site: "All sites", reason: "not_reported", count: 55 },
  ]);
});
