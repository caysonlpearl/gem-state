/** Existing scheduler entry point; all inventory sources share the durable shopping queue. */
export async function processSavedSearchAlerts(_listingId?: string) {
  return (await import("./shopping-worker.server")).processShoppingWorker();
}
