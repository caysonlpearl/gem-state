const key = "bluebird:auth-return";
const supported =
  /^(?:\/(?:saved|post)|\/post\/profile|\/account(?:\/(?:profile|settings|searches|notifications))?|\/messages(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?)$/i;
/** Essential login state only: no tokens, member details or tracking identifier. */
function normalize(path: string) {
  const listing = /^\/listings\/([a-z0-9][a-z0-9._:-]{0,199})$/i.exec(path);
  return listing && !listing[1].startsWith("avantlink-")
    ? `/listings/${listing[1]}`
    : supported.test(path)
      ? path.toLowerCase()
      : null;
}
export function rememberNativeAuthDestination(path: string) {
  const safe = normalize(path) ?? "/account/profile";
  try {
    localStorage.setItem(key, JSON.stringify({ path: safe, expiresAt: Date.now() + 15 * 60000 }));
  } catch {
    /* Essential storage is optional. */
  }
}
function destination(consume: boolean) {
  try {
    const raw = localStorage.getItem(key);
    if (consume) localStorage.removeItem(key);
    const entry = JSON.parse(raw ?? "null"),
      safe = typeof entry?.path === "string" ? normalize(entry.path) : null;
    if (
      safe &&
      Number.isFinite(entry.expiresAt) &&
      entry.expiresAt > Date.now() &&
      entry.expiresAt <= Date.now() + 15 * 60000
    )
      return safe;
    localStorage.removeItem(key);
  } catch {
    /* Invalid or expired intent falls back to the account. */
  }
  return "/account/profile";
}
export function peekNativeAuthDestination() {
  return destination(false);
}
export function consumeNativeAuthDestination() {
  return destination(true);
}
/** Remove the one-use login code from history before restoring the guarded page. */
export function completeNativeAuthNavigation() {
  const target = consumeNativeAuthDestination();
  history.replaceState(history.state, "", `${location.pathname}#${target}`);
  window.dispatchEvent(new Event("hashchange"));
  return target;
}
