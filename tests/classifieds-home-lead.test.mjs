import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { QueryClient, dehydrate, hydrate } from "@tanstack/react-query";

const queryKey = ["classifieds-home-lead"];
const loadedLead = { totalActive: 1, categoryCounts: { motors: 1 }, motors: [{ id: "idaho-car" }] };
const emptyLead = { totalActive: 0, categoryCounts: {}, motors: [] };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function makeClient(retry = 2) {
  return new QueryClient({
    defaultOptions: {
      queries: { retry, retryDelay: 0, staleTime: 60_000 },
    },
  });
}

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test("a slow homepage lead remains pending and a late success becomes the real data", async () => {
  const client = makeClient(0);
  const request = deferred();
  let calls = 0;
  const options = {
    queryKey,
    queryFn: () => {
      calls += 1;
      return request.promise;
    },
  };
  const result = client.fetchQuery(options);

  await pause(15);
  assert.equal(client.getQueryState(queryKey)?.status, "pending");
  assert.equal(client.getQueryData(queryKey), undefined);

  request.resolve(loadedLead);
  assert.deepEqual(await result, loadedLead);
  assert.equal(client.getQueryState(queryKey)?.status, "success");
  assert.equal(calls, 1);
  client.clear();
});

test("a late rejection follows QueryClient retries and does not become empty success", async () => {
  const client = makeClient(1);
  const firstAttempt = deferred();
  let calls = 0;
  const unhandled = [];
  const onUnhandled = (error) => unhandled.push(error);
  process.on("unhandledRejection", onUnhandled);
  const result = client.fetchQuery({
    queryKey,
    queryFn: () => {
      calls += 1;
      return calls === 1 ? firstAttempt.promise : Promise.reject(new Error("network unavailable"));
    },
  });
  result.catch(() => {});

  try {
    await pause(15);
    assert.equal(client.getQueryState(queryKey)?.status, "pending");
    firstAttempt.reject(new Error("late network failure"));

    await assert.rejects(result, /network unavailable/);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 2);
    assert.equal(client.getQueryState(queryKey)?.status, "error");
    assert.equal(client.getQueryData(queryKey), undefined);
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", onUnhandled);
    client.clear();
  }
});

test("homepage prefetch and observer share one request, then hydrate its successful result", async () => {
  const server = makeClient(0);
  const request = deferred();
  let calls = 0;
  const options = {
    queryKey,
    queryFn: () => {
      calls += 1;
      return request.promise;
    },
  };
  const prefetched = server.prefetchQuery(options);
  const observed = server.fetchQuery(options);
  assert.equal(calls, 1);

  request.resolve(loadedLead);
  await Promise.all([prefetched, observed]);
  assert.equal(calls, 1);

  const client = makeClient(0);
  hydrate(client, dehydrate(server));
  const hydrated = await client.fetchQuery({
    queryKey,
    queryFn: async () => {
      calls += 1;
      return emptyLead;
    },
  });

  assert.deepEqual(hydrated, loadedLead);
  assert.equal(calls, 1);
  server.clear();
  client.clear();
});

test("a slow server query hydrates once and its late resolution reaches the client", async () => {
  const server = makeClient(0);
  const request = deferred();
  let serverCalls = 0;
  let clientCalls = 0;
  const serverResult = server.fetchQuery({
    queryKey,
    queryFn: () => {
      serverCalls += 1;
      return request.promise;
    },
  });
  serverResult.catch(() => {});

  await pause(15);
  const client = makeClient(0);
  hydrate(client, dehydrate(server, { shouldDehydrateQuery: () => true }));
  assert.equal(client.getQueryState(queryKey)?.status, "pending");

  const clientResult = client.fetchQuery({
    queryKey,
    queryFn: () => {
      clientCalls += 1;
      return Promise.resolve(emptyLead);
    },
  });
  request.resolve(loadedLead);

  assert.deepEqual(await Promise.all([serverResult, clientResult]), [loadedLead, loadedLead]);
  assert.equal(serverCalls, 1);
  assert.equal(clientCalls, 0);
  assert.equal(client.getQueryState(queryKey)?.status, "success");
  server.clear();
  client.clear();
});

test("a pending query rejection hydrates as an error without fallback data or unhandled rejection", async () => {
  const server = makeClient(0);
  const request = deferred();
  const unhandled = [];
  const onUnhandled = (error) => unhandled.push(error);
  process.on("unhandledRejection", onUnhandled);
  const serverResult = server.fetchQuery({ queryKey, queryFn: () => request.promise });
  serverResult.catch(() => {});

  try {
    await pause(15);
    const client = makeClient(0);
    hydrate(client, dehydrate(server, { shouldDehydrateQuery: () => true }));
    const clientResult = client.fetchQuery({
      queryKey,
      queryFn: async () => emptyLead,
    });
    clientResult.catch(() => {});
    const failure = new Error("late server failure");
    request.reject(failure);

    await assert.rejects(serverResult, /late server failure/);
    await assert.rejects(clientResult, /redacted/);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(client.getQueryState(queryKey)?.status, "error");
    assert.equal(client.getQueryData(queryKey), undefined);
    assert.deepEqual(unhandled, []);
    client.clear();
  } finally {
    process.off("unhandledRejection", onUnhandled);
    server.clear();
  }
});

test("homepage lead loading, successful empty, and request-error states stay distinct", async () => {
  const source = await readFile(new URL("../src/routes/index.tsx", import.meta.url), "utf8");
  const errorBoundaryStart = source.indexOf("class HomepageLeadErrorBoundary");
  const errorBoundaryEnd = source.indexOf("function HomeSections", errorBoundaryStart);
  const errorBoundary = source.slice(errorBoundaryStart, errorBoundaryEnd);

  assert.match(source, /HOMEPAGE_LEAD_SLOW_NOTICE_MS = 8_000/);
  assert.match(
    source,
    /QueryErrorResetBoundary>[\s\S]*?HomepageLeadErrorBoundary onReset=\{reset\}/,
  );
  assert.match(source, /useSuspenseQuery\(homeLeadQuery\)/);
  assert.match(source, /function HomepageLeadLoading\([\s\S]*?HOMEPAGE_LEAD_SLOW_NOTICE_MS/);
  assert.notEqual(errorBoundaryStart, -1);
  assert.match(errorBoundary, /Vehicle listings couldn’t load/);
  assert.match(errorBoundary, /onClick=\{this\.retry\}/);
  assert.match(
    source,
    /leadMotors\.length > 0 \? \([\s\S]*?<EmptyState\s+title=\{EMPTY_ROW_TITLE\}/,
  );
  assert.doesNotMatch(source, /withTimeoutFallback|showing the empty state/);
  const client = makeClient(0);
  assert.deepEqual(
    await client.fetchQuery({ queryKey, queryFn: async () => emptyLead }),
    emptyLead,
  );
  assert.equal(client.getQueryState(queryKey)?.status, "success");
  client.clear();
});
