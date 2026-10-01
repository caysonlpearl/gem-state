#!/usr/bin/env node

const baseUrl = (
  process.env.BLUEBIRD_BASE_URL || "https://gemstateclassifieds.lovable.app"
).replace(/\/$/, "");
const requiredRoutes = ["/", "/browse", "/policies", "/safety", "/contact"];
const protectedRoutes = ["/account", "/create-listing", "/selling", "/buying", "/watchlist"];

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    ...init,
    headers: { "user-agent": "bluebird-phase5-release-gate/1.0", ...(init.headers || {}) },
  });
  return { path, status: response.status, location: response.headers.get("location") };
}

const results = [];
for (const path of requiredRoutes) results.push(await request(path));
for (const path of protectedRoutes) results.push(await request(path));

const cron = await request("/api/internal/dealer-inventory", { method: "POST", body: "{}" });
results.push({ ...cron, check: "unauthenticated cron request must be rejected" });

const failures = results.filter(({ path, status }) => {
  if (path.startsWith("/api/internal/")) return status !== 401;
  if (protectedRoutes.includes(path)) return ![200, 302, 303, 307, 308].includes(status);
  return ![200, 301, 302, 303, 307, 308].includes(status);
});

for (const result of results) {
  console.log(`${result.status}\t${result.path}${result.location ? `\t${result.location}` : ""}`);
}

if (failures.length) {
  console.error(`Phase 5 release gate failed: ${failures.length} route checks failed.`);
  process.exitCode = 1;
} else {
  console.log(
    `Phase 5 release gate passed for ${baseUrl}. Authenticated cross-role browser runs remain evidence-driven checks.`,
  );
}
