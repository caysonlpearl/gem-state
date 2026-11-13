const KEY = "bluebird-mobile-install-v1";
let memory: string | undefined;
export function installIdentifier() {
  if (memory) return memory;
  try {
    const stored = localStorage.getItem(KEY);
    if (
      stored &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)
    )
      return (memory = stored);
  } catch {
    /* essential storage may be unavailable */
  }
  memory = crypto.randomUUID();
  try {
    localStorage.setItem(KEY, memory);
  } catch {
    /* this process remains usable */
  }
  return memory;
}
export function resetInstallIdentifier() {
  memory = crypto.randomUUID();
  try {
    localStorage.setItem(KEY, memory);
  } catch {
    /* memory-only identity */
  }
  return memory;
}
