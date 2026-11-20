// Extension-owned storage survives worker termination and admin navigation.
// Only the most recent unsaved report for each seller is retained.
let refreshDatabase;

function refreshJournal(origin, change, summaryOnly = false) {
  refreshDatabase ??= new Promise((resolve, reject) => {
    const open = indexedDB.open("bluebird-import", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("refresh");
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  }).catch((error) => {
    refreshDatabase = undefined;
    throw error;
  });

  return refreshDatabase.then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("refresh", change ? "readwrite" : "readonly");
        const store = tx.objectStore("refresh");
        const summaryKey = origin + "/status";
        const read = store.get(summaryOnly ? summaryKey : origin);
        let value;
        tx.oncomplete = () => resolve(value);
        tx.onabort = () => reject(tx.error || new Error("Could not save scan results."));
        read.onsuccess = () => {
          value = read.result ?? { last: null, pending: [] };
          if (change) {
            change(value);
            store.put(value, origin);
            store.put(
              {
                last: value.last,
                pending: value.pending.map(({ requestId, report }) => ({
                  requestId,
                  sourceProfileUrl: report.sourceProfileUrl,
                })),
              },
              summaryKey,
            );
          }
        };
      }),
  );
}

async function refreshJournalStatus(origin) {
  const { last, pending } = await refreshJournal(origin, undefined, true);
  return {
    last:
      last?.phase === "running" && activeImportRun?.requestId !== last.requestId
        ? { ...last, phase: "interrupted", message: "Chrome interrupted the scan." }
        : last,
    pending,
  };
}
