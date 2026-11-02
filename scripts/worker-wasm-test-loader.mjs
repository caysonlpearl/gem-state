import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function load(url, context, nextLoad) {
  if (!url.startsWith("file:") || !url.endsWith(".wasm")) return nextLoad(url, context);
  const path = fileURLToPath(url);
  if (!path.includes("/.output/server/wasm/")) return nextLoad(url, context);
  const bytes = await readFile(path);
  return {
    format: "module",
    shortCircuit: true,
    source: `export default new WebAssembly.Module(Uint8Array.from(atob(${JSON.stringify(bytes.toString("base64"))}), c => c.charCodeAt(0)));`,
  };
}
