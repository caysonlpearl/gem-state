/** Durable phases are deliberate: an unavailable provider cannot become a completed deletion. */
export const deletionPhases = [
  "inventory",
  "authorization",
  "media",
  "records",
  "identity",
  "verification",
] as const;
export type DeletionPhase = (typeof deletionPhases)[number];
export type DeletionJob = Readonly<{
  id: string;
  user_id: string;
  phase: DeletionPhase;
  lease_token: string;
  lease_until: string;
}>;
export const deletionFailureCodes = [
  "inventory_unavailable",
  "authorization_unavailable",
  "media_unavailable",
  "records_unavailable",
  "identity_unavailable",
  "verification_failed",
  "worker_failed",
] as const;
export type DeletionFailureCode = (typeof deletionFailureCodes)[number];
export class DeletionStepError extends Error {
  readonly code: DeletionFailureCode;
  constructor(code: DeletionFailureCode) {
    super(code);
    this.code = code;
  }
}
export type DeletionWork = {
  /** Steps must bound work, settle every operation and persist their own replay-safe receipts. */
  [P in DeletionPhase]: (job: DeletionJob, signal: AbortSignal) => Promise<{ done: boolean }>;
};
export type DeletionQueue = {
  claim(): Promise<DeletionJob | null>;
  assertBoundaries(signal: AbortSignal): Promise<void>;
  advance(job: DeletionJob, done: boolean): Promise<boolean>;
  retry(job: DeletionJob, code: DeletionFailureCode): Promise<boolean>;
};
/** One leased phase per invocation keeps erasure separate from request-serving workloads. */
export async function runAccountDeletion(
  queue: DeletionQueue,
  work: DeletionWork,
  clock = Date.now,
): Promise<{
  status: "idle" | "advanced" | "continued" | "retry" | "lease_lost";
  phase?: DeletionPhase;
}> {
  const claimed = await queue.claim();
  if (!claimed) return { status: "idle" };
  const job = Object.freeze({ ...claimed });
  if (!deletionPhases.includes(job.phase)) throw new Error("Unsupported deletion phase");
  const remaining = Date.parse(job.lease_until) - clock() - 5000;
  if (!Number.isFinite(remaining) || remaining < 1000)
    return { status: "lease_lost", phase: job.phase };
  // The operation must honor cancellation; do not race an unresolved destructive operation.
  const signal = AbortSignal.timeout(Math.min(45000, remaining));
  try {
    if (!deletionPhases.every((phase) => typeof work?.[phase] === "function"))
      throw new DeletionStepError("worker_failed");
    await queue.assertBoundaries(signal);
    signal.throwIfAborted();
    const result = await work[job.phase](job, signal);
    if (signal.aborted) throw new DeletionStepError("worker_failed");
    if (!result || typeof result.done !== "boolean") throw new DeletionStepError("worker_failed");
    // Do not checkpoint an otherwise successful operation after an intervening
    // schema/permission change. The final verification phase uses the same gate.
    await queue.assertBoundaries(signal);
    signal.throwIfAborted();
    const saved = await queue.advance(job, result.done);
    return {
      status: saved ? (result.done ? "advanced" : "continued") : "lease_lost",
      phase: job.phase,
    };
  } catch (error) {
    // Never persist provider messages, media paths, email addresses or credentials as errors.
    const code =
      error instanceof DeletionStepError && deletionFailureCodes.includes(error.code)
        ? error.code
        : "worker_failed";
    const saved = await queue.retry(job, code);
    return { status: saved ? "retry" : "lease_lost", phase: job.phase };
  }
}
