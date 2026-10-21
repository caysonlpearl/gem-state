/* eslint-disable @typescript-eslint/no-explicit-any -- generic PostgREST query adapter */
import { readAllImportPages } from "./import-refresh";

export async function allImportRows(query: () => any): Promise<any[]> {
  return readAllImportPages(async (offset, size) => {
    const { data, count, error } = await query().range(offset, offset + size - 1);
    if (error) throw new Error(error.message);
    if (count == null) throw new Error("Exact import count unavailable. Retry.");
    return { rows: data ?? [], total: count };
  });
}
