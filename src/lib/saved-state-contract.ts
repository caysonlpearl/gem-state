export const SAVED_STATE_BATCH_SIZE = 50;
export type SavedStateKind = "products" | "jobs" | "homes" | "vehicles";
export type SavedStateRequest = { kind: SavedStateKind; ids: string[]; viewerId: string };
export type SavedStateResult = Record<string, boolean>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idsFor: Record<SavedStateKind, RegExp> = {
  products: uuid,
  jobs: /^(adzuna-\d{1,20}|fsq-[0-9a-f]{24}|rescuegroups-\d{1,20}|avantlink-\d{1,20})$/,
  homes: /^(mashvisor-\d{1,15}|openwebninja-\d{1,20})$/,
  vehicles: /^marketcheck-(?:dealer|fsbo)-[A-Za-z0-9._:-]{1,160}$/,
};
export function savedStateRequest(input: SavedStateRequest): SavedStateRequest {
  if (!input || !Object.hasOwn(idsFor, input.kind) || !uuid.test(input.viewerId))
    throw new Error("Invalid saved-listing request.");
  if (!Array.isArray(input.ids) || !input.ids.length || input.ids.length > SAVED_STATE_BATCH_SIZE)
    throw new Error("Invalid saved-listing batch size.");
  if (input.ids.some((id) => typeof id !== "string" || !idsFor[input.kind].test(id)))
    throw new Error("Invalid saved-listing identifier.");
  return { kind: input.kind, ids: [...new Set(input.ids)], viewerId: input.viewerId };
}
