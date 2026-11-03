import type {
  PhotoRemovalInput,
  PhotoRemovalPlan,
  PhotoRemovalResult,
} from "./photo-source-removal";

export async function runApprovedSourceRemoval(input: {
  plan: PhotoRemovalPlan;
  step(data: PhotoRemovalInput): Promise<PhotoRemovalResult>;
  shouldStop(): boolean;
  progress(value: { removed: number; alreadyAbsent: number; reviewed: number }): void;
}) {
  const results: PhotoRemovalResult["results"] = [];
  let removed = 0,
    alreadyAbsent = 0;
  for (let offset = 0; offset < input.plan.entries.length; offset += 8) {
    if (input.shouldStop())
      return { status: "stopped", results, removed, alreadyAbsent, unconfirmed: [] as number[] };
    const entries = input.plan.entries.slice(offset, offset + 8);
    let result: PhotoRemovalResult;
    try {
      result = await input.step({ header: input.plan.header, entries, mode: "remove" });
      if (
        result.results.length !== entries.length ||
        result.results.some((row, index) => row.index !== entries[index].index)
      )
        throw new Error("Scope mismatch.");
    } catch {
      return {
        status: "unconfirmed",
        results,
        removed,
        alreadyAbsent,
        unconfirmed: entries.map((e) => e.index),
      };
    }
    results.push(...result.results);
    removed += result.results.filter((row) => row.status === "removed").length;
    alreadyAbsent += result.results.filter((row) => row.status === "already-absent").length;
    input.progress({ removed, alreadyAbsent, reviewed: results.length });
    if (
      result.status !== "complete" ||
      result.results.some((row) => !["removed", "already-absent"].includes(row.status))
    )
      return {
        status: result.status,
        results,
        removed,
        alreadyAbsent,
        unconfirmed: [] as number[],
      };
  }
  return { status: "complete", results, removed, alreadyAbsent, unconfirmed: [] as number[] };
}

export function photoRemovalSampleEntries(plan: PhotoRemovalPlan) {
  const selected = new Set<number>();
  for (const bucket of ["listing-media", "ask-evidence"]) {
    let count = 0;
    for (const entry of plan.entries) {
      if (entry.candidate.source.bucket === bucket) {
        selected.add(entry.index);
        if (++count === 4) break;
      }
    }
  }
  for (const entry of plan.entries) {
    if (selected.size === 8) break;
    selected.add(entry.index);
  }
  return plan.entries.filter((entry) => selected.has(entry.index));
}
