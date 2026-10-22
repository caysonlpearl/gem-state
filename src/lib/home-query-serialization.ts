type QueryState = {
  queryKey: readonly unknown[];
  state: { status: string };
};

/** A late/lost SSR stream must not leave the first row owning a forever-pending
 * server promise. Successful lead data still hydrates once; a pending lead
 * starts a normal, independently retryable browser request instead. Other
 * pages retain their existing streaming behavior.
 */
export function shouldDehydrateHomepageQuery(query: QueryState) {
  return query.queryKey[0] !== "classifieds-home-lead" || query.state.status !== "pending";
}
