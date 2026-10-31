import test from "node:test";
import assert from "node:assert/strict";
import { createAppQueryClient } from "../src/lib/app-query-client.ts";

test("SSR does not repeat a failed bounded catalog read three times", async () => {
  const client = createAppQueryClient(true);
  let calls = 0;
  await assert.rejects(
    client.fetchQuery({
      queryKey: ["catalog"],
      queryFn: async () => {
        calls++;
        throw Error("catalog timeout");
      },
    }),
    /timeout/,
  );
  assert.equal(calls, 1);
  client.clear();
});
test("browser retains existing transient network retries", async () => {
  const client = createAppQueryClient(false);
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retryDelay: 0 } });
  let calls = 0;
  const result = await client.fetchQuery({
    queryKey: ["catalog"],
    queryFn: async () => {
      if (++calls < 3) throw TypeError("Failed to fetch");
      return ["real listing"];
    },
  });
  assert.deepEqual(result, ["real listing"]);
  assert.equal(calls, 3);
  client.clear();
});
