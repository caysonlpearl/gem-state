import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function harness() {
  const path = "../src/lib/adzuna-listings.server.ts";
  const file = ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const source = file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "adzunaCards").getText(file)
    .replace(/^export /, "")
    .replace('import("./adzuna.server")', "Promise.resolve({ searchJobs: mockSearchJobs, cachedJobs: mockCachedJobs })")
    .replace('import("./employer-logos.server")', "Promise.resolve({ withEmployerLogos: async (cards) => cards })");
  const jobs = [
    { id: "5963450403", company: "Mindrift", title: "AI tutor", description: "Remote writing", city: "Boise", state: "ID" },
    { id: "mindrift-second", company: "Mindrift", title: "Coding tutor", description: "Remote coding", city: "Twin Falls", state: "ID" },
    { id: "other", company: "Other employer", title: "AI tutor", description: "Writing", city: "Boise", state: "ID" },
    { id: "out-of-state", company: "Mindrift", title: "AI tutor", description: "Writing", city: "Seattle", state: "WA" },
  ];
  let providerCalls = 0;
  const adapter = vm.runInNewContext(ts.transpile(`(${source})`, { target: ts.ScriptTarget.ES2022 }), {
    usStates: [["ID", "Idaho"], ["WA", "Washington"]], categories: {},
    hasClassifiedRadiusCenter: () => false, isWithinClassifiedRadius: () => true,
    adzunaCard: (job) => job, notePartnerEmployers: async () => {},
    removedPartnerJobIds: async () => new Set(),
    mockCachedJobs: async () => ({ status: "ok", jobs, total: jobs.length }),
    mockSearchJobs: async () => { providerCalls++; return { status: "ok", jobs: [jobs[2]], total: 1 }; },
  });
  return { adapter, providerCalls: () => providerCalls };
}

test("All jobs from Mindrift reads existing employer inventory beyond a generic provider page", async () => {
  const h = harness();
  const cards = await h.adapter({ category: "jobs", jobEmployer: "Mindrift" });
  assert.deepEqual(Array.from(cards, (card) => card.id), ["5963450403", "mindrift-second", "out-of-state"]);
  assert.equal(h.providerCalls(), 0);
});

test("employer catalog searches still respect search terms and state filters", async () => {
  const h = harness();
  const cards = await h.adapter({ category: "jobs", jobEmployer: "mindrift", q: "coding", state: "ID" });
  assert.deepEqual(Array.from(cards, (card) => card.id), ["mindrift-second"]);
});

test("general jobs searches retain the budgeted provider search", async () => {
  const h = harness();
  const cards = await h.adapter({ category: "jobs" });
  assert.deepEqual(Array.from(cards, (card) => card.id), ["other"]);
  assert.equal(h.providerCalls(), 1);
});