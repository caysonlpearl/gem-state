let runtimeBindings: Record<string, unknown> = {};

export function registerRuntimeBindings(env: unknown) {
  if (env && typeof env === "object") runtimeBindings = env as Record<string, unknown>;
}

export function serverEnv(name: string) {
  const runtimeValue = runtimeBindings[name];
  if (typeof runtimeValue === "string") return runtimeValue;
  return process.env[name] ?? "";
}
