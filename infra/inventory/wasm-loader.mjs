import { readFile } from "node:fs/promises";

export async function load(url, context, nextLoad) {
  if (!url.startsWith("file:") || !url.includes("/.output/server/wasm/") || !url.endsWith(".wasm"))
    return nextLoad(url, context);
  const bytes = await readFile(new URL(url));
  return {
    format: "module",
    shortCircuit: true,
    source: `export default new WebAssembly.Module(Uint8Array.from(atob(${JSON.stringify(bytes.toString("base64"))}), c => c.charCodeAt(0)));`,
  };
}
