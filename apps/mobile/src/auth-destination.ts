const key = "bluebird:auth-return";
const supported =
  /^(?:\/(?:saved|post)|\/post\/profile|\/account(?:\/(?:profile|settings|searches|notifications))?|\/messages(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?)$/i;
/** Essential login state only: no tokens, member details or tracking identifier. */
export function rememberNativeAuthDestination(path: string) {
  path = path.toLowerCase();
  if (!supported.test(path)) path = "/account/profile";
  try {
    localStorage.setItem(key, JSON.stringify({ path, expiresAt: Date.now() + 15 * 60000 }));
  } catch {
    /* Authentication still works when essential storage is unavailable. */
  }
}
export function consumeNativeAuthDestination() {
  try {
    const raw = localStorage.getItem(key);
    localStorage.removeItem(key);
    const entry = JSON.parse(raw ?? "null");
    if (
      typeof entry?.path === "string" &&
      supported.test(entry.path.toLowerCase()) &&
      Number.isFinite(entry.expiresAt) &&
      entry.expiresAt > Date.now() &&
      entry.expiresAt <= Date.now() + 15 * 60000
    )
      return entry.path.toLowerCase();
  } catch {
    /* A fresh login falls back to the account. */
  }
  return "/account/profile";
}

/** Remove the one-use login code from history before restoring the guarded page. */
export function completeNativeAuthNavigation() {
  const target = consumeNativeAuthDestination();
  history.replaceState(history.state, "", `${location.pathname}#${target}`);
  window.dispatchEvent(new Event("hashchange"));
  return target;
}
