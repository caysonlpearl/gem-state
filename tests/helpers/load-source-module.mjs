import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import ts from "typescript";
const root = fileURLToPath(new URL("../../src/", import.meta.url));
const external = createRequire(import.meta.url);
/** Execute actual pure TypeScript contracts with their local/alias dependencies. */
export function loadSourceModule(path, overrides = {}) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const code = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
    new Function("require", "module", "exports", code)(
      (id) => {
        if (id in overrides) return overrides[id];
        if (!id.startsWith(".") && !id.startsWith("@/")) return external(id);
        let target = id.startsWith("@/") ? resolve(root, id.slice(2)) : resolve(dirname(file), id);
        if (!existsSync(target)) target += existsSync(target + ".ts") ? ".ts" : ".tsx";
        return load(target);
      },
      module,
      module.exports,
    );
    return module.exports;
  }
  return load(resolve(root, path));
}
