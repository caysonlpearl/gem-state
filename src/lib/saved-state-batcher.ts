import { SAVED_STATE_BATCH_SIZE, type SavedStateResult } from "./saved-state-contract.ts";

/** Coalesce card reads only. Actual save/remove mutations are never batched. */
export function createSavedStateBatcher(send: (ids: string[]) => Promise<SavedStateResult>) {
  const pending = new Map<
    string,
    { resolve: (value: boolean) => void; reject: (error: unknown) => void }[]
  >();
  let timer: ReturnType<typeof setTimeout> | undefined;
  function flush() {
    if (timer) clearTimeout(timer);
    timer = undefined;
    const entries = [...pending.entries()].slice(0, SAVED_STATE_BATCH_SIZE);
    for (const [id] of entries) pending.delete(id);
    if (pending.size) timer = setTimeout(flush, 12);
    if (!entries.length) return;
    void Promise.resolve()
      .then(() => send(entries.map(([id]) => id)))
      .then(
        (states) => {
          for (const [id, callbacks] of entries)
            for (const callback of callbacks) callback.resolve(states[id] === true);
        },
        (error) => {
          for (const [, callbacks] of entries)
            for (const callback of callbacks) callback.reject(error);
        },
      );
  }
  return (id: string) =>
    new Promise<boolean>((resolve, reject) => {
      const callbacks = pending.get(id) ?? [];
      callbacks.push({ resolve, reject });
      pending.set(id, callbacks);
      if (pending.size >= SAVED_STATE_BATCH_SIZE) flush();
      else if (!timer) timer = setTimeout(flush, 12);
    });
}
