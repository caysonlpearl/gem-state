const indexKey = "bluebirdNavigationIndex";
function storedIndex() {
  const value = history.state?.[indexKey];
  return Number.isSafeInteger(value) && value >= 0 ? (value as number) : undefined;
}
/** WebView.canGoBack can omit same-document hash entries. Count our own entries,
 * starting at the bundled launch document, rather than trusting native history. */
export function trackNativeNavigation() {
  let index = storedIndex() ?? 0;
  const mark = () => history.replaceState({ ...history.state, [indexKey]: index }, "");
  mark();
  const change = () => {
    index = storedIndex() ?? index + 1;
    mark();
  };
  window.addEventListener("hashchange", change);
  return () => window.removeEventListener("hashchange", change);
}
export function backWithinApp() {
  if ((storedIndex() ?? 0) <= 0) return false;
  history.back();
  return true;
}
