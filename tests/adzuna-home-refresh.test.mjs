import test from "node:test";
import assert from "node:assert/strict";
import { refreshAdzunaHomeJobs } from "../src/lib/adzuna-home-refresh.server.ts";

test("scheduled jobs maintenance reuses the broad Idaho cache key and returns counts only", async () => {
  const calls = [];
  const result = await refreshAdzunaHomeJobs(async (input) => {
    calls.push(input);
    return {
      status: "ok",
      jobs: [{ id: "one", description: "PRIVATE PROVIDER CONTENT" }],
      total: 1,
    };
  });
  assert.deepEqual(calls, [{ what: "", where: "Idaho", page: 1 }]);
  assert.deepEqual(result, { status: "ok", jobs: 1 });
});

test("source outages and budget limits leave independent homepage maintenance available", async () => {
  for (const status of ["limited", "unavailable"])
    assert.deepEqual(await refreshAdzunaHomeJobs(async () => ({ status, jobs: [], total: 0 })), {
      status,
      jobs: 0,
    });
  assert.deepEqual(
    await refreshAdzunaHomeJobs(async () => {
      throw Error("private provider credential");
    }),
    { status: "unavailable", jobs: 0 },
  );
});
