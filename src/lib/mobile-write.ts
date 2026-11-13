import { z } from "zod";
/** Optional on shared web services; native clients preserve it across retries. */
export function mobileWriteId(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return z.string().uuid().parse(value);
}
