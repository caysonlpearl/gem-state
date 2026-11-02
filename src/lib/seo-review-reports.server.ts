import { dueSeoReviewPeriods, type SeoReviewPeriod } from "./seo-review-schedule";
import { loadTrafficReport } from "./traffic-report.server";

const BUCKET = "seo-growth-reports";
const activeLeases = new Map<string, string>();
let ready: Promise<void> | undefined;
async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
async function reportBucket() {
  const db = await admin();
  if (!ready)
    ready = (async () => {
      const existing = await db.storage.getBucket(BUCKET);
      if (existing.data?.public) throw new Error("SEO reports require private storage.");
      if (!existing.data) {
        const created = await db.storage.createBucket(BUCKET, {
          public: false,
          fileSizeLimit: 1_000_000,
          allowedMimeTypes: ["application/json"],
        });
        if (created.error && !/already exists/i.test(created.error.message))
          throw new Error("Private report storage unavailable.");
        const checked = await db.storage.getBucket(BUCKET);
        if (!checked.data || checked.data.public)
          throw new Error("Private report storage unavailable.");
      }
    })().catch((error) => {
      ready = undefined;
      throw error;
    });
  await ready;
  return db.storage.from(BUCKET);
}

export function createSeoReviewWriter(
  store: {
    exists(key: string): Promise<boolean>;
    acquire(key: string): Promise<boolean>;
    write(key: string, report: unknown): Promise<void>;
    release(key: string): Promise<void>;
  },
  build: (period: SeoReviewPeriod) => Promise<unknown>,
) {
  return async (period: SeoReviewPeriod) => {
    if (await store.exists(period.key)) return { saved: false, reason: "already_saved" };
    if (!(await store.acquire(period.key))) return { saved: false, reason: "in_progress" };
    try {
      const report = await build(period);
      await store.write(period.key, report);
      return { saved: true, reason: "saved" };
    } finally {
      await store.release(period.key).catch(() => undefined);
    }
  };
}

const writeReview = createSeoReviewWriter(
  {
    async exists(key) {
      const result = await (await reportBucket()).download(`reports/${key}.json`);
      if (result.error && !/not found|does not exist/i.test(result.error.message))
        throw new Error("Saved reports could not be checked.");
      return Boolean(result.data);
    },
    async acquire(key) {
      const path = `leases/${key}/${Math.floor(Date.now() / 900_000)}.json`;
      const result = await (
        await reportBucket()
      ).upload(path, "{}", { contentType: "application/json", upsert: false });
      if (result.error && !/already exists|duplicate/i.test(result.error.message))
        throw new Error("Report preparation unavailable.");
      if (!result.error) activeLeases.set(key, path);
      return !result.error;
    },
    async write(key, report) {
      const result = await (
        await reportBucket()
      ).upload(`reports/${key}.json`, JSON.stringify(report), {
        contentType: "application/json",
        upsert: false,
      });
      if (result.error) throw new Error("The review report could not be saved.");
    },
    async release(key) {
      const path = activeLeases.get(key);
      activeLeases.delete(key);
      if (path) await (await reportBucket()).remove([path]);
    },
  },
  async (period) => ({
    capturedAt: new Date().toISOString(),
    review: period.key,
    ...(await loadTrafficReport(await admin(), period.days, period.until)),
  }),
);

export async function refreshSeoReviewReports(now = Date.now()) {
  const periods = dueSeoReviewPeriods(now);
  const results = [];
  for (const period of periods) {
    try {
      results.push({ key: period.key, ...(await writeReview(period)) });
    } catch {
      results.push({ key: period.key, saved: false, reason: "unavailable" });
    }
  }
  return results;
}

export async function saveSeoReviewBaseline(now = Date.now()) {
  return writeReview({
    key: `baseline-${new Date(now).toISOString().slice(0, 10)}`,
    days: 7,
    until: now,
  });
}

/** Called only behind the administrator role check. No public download URLs. */
export async function savedSeoReviewReports() {
  const bucket = await reportBucket();
  const { data, error } = await bucket.list("reports", {
    limit: 50,
    sortBy: { column: "created_at", order: "desc" },
  });
  if (error) throw new Error("Saved reviews unavailable.");
  const reports = [];
  for (const object of (data || [])
    .filter((item) => /^(weekly|monthly|baseline)-\d{4}-\d{2}-\d{2}\.json$/.test(item.name))
    .slice(0, 12)) {
    const file = await bucket.download(`reports/${object.name}`);
    if (file.error || !file.data) continue;
    const body = await file.data.text();
    if (body.length > 1_000_000) continue;
    try {
      const report = JSON.parse(body);
      if (
        typeof report.review === "string" &&
        typeof report.period?.since === "string" &&
        typeof report.period?.until === "string" &&
        report.totals &&
        report.funnel?.organic
      )
        reports.push(report);
    } catch {
      /* Skip a corrupt report, never fabricate zeroes. */
    }
  }
  return reports;
}
