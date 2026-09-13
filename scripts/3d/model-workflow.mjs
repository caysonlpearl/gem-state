import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, "../..");
const toolsDir = join(appDir, ".parkvault-tools");
const sf3dDir = join(toolsDir, "stable-fast-3d");
const python = join(toolsDir, "venv/bin/python");
const products = JSON.parse(readFileSync(join(scriptDir, "products.json"), "utf8"));

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function findGlb(directory) {
  if (!existsSync(directory)) return null;
  for (const name of readdirSync(directory)) {
    const candidate = join(directory, name);
    if (statSync(candidate).isDirectory()) {
      const nested = findGlb(candidate);
      if (nested) return nested;
    } else if (name.toLowerCase().endsWith(".glb")) {
      return candidate;
    }
  }
  return null;
}

function list() {
  console.log("ParkVault canonical 3D covers\n");
  for (const product of products) {
    const draft = join(appDir, `public/models/drafts/${product.slug}.glb`);
    const live = join(appDir, `public/models/products/${product.slug}.glb`);
    const state = existsSync(live)
      ? "approved file"
      : existsSync(draft)
        ? "draft ready for review"
        : product.sourceStatus === "ready"
          ? "ready to generate"
          : "source image needs a product-only crop";
    console.log(`- ${product.name}\n  ${product.slug}\n  ${state}`);
  }
}

function generate(slug) {
  if (!slug) fail("Choose a product slug. Run `npm run models:list` to see the choices.");
  const product = products.find((item) => item.slug === slug);
  if (!product) fail(`No launch product matches “${slug}”. Run \`npm run models:list\` first.`);
  if (product.sourceStatus !== "ready") {
    fail(`${product.name} needs a product-only source crop before 3D generation.`);
  }
  if (!existsSync(python) || !existsSync(join(sf3dDir, "run.py"))) {
    fail("The generator is not installed yet. Run `npm run models:setup` first.");
  }

  const source = join(appDir, product.source);
  if (!existsSync(source)) fail(`Source image is missing: ${product.source}`);

  const output = join(toolsDir, "output", slug);
  rmSync(output, { force: true, recursive: true });
  mkdirSync(output, { recursive: true });

  console.log(`Generating a private 3D draft for ${product.name}...`);
  const result = spawnSync(
    python,
    [
      join(sf3dDir, "run.py"),
      source,
      "--output-dir",
      output,
      "--device",
      "cpu",
      "--texture-resolution",
      "1024",
    ],
    {
      cwd: sf3dDir,
      env: { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: "1", SF3D_USE_CPU: "1" },
      stdio: "inherit",
    },
  );
  if (result.status !== 0) fail("3D generation did not finish successfully.");

  const glb = findGlb(output);
  if (!glb) fail("Generation finished but no GLB file was found.");
  const draft = join(appDir, `public/models/drafts/${slug}.glb`);
  mkdirSync(dirname(draft), { recursive: true });
  copyFileSync(glb, draft);

  console.log(`\nDraft created: ${draft}`);
  console.log("It is local-only and cannot appear publicly until it is reviewed and approved.");
}

const [command = "list", slug] = process.argv.slice(2);
if (command === "list") list();
else if (command === "generate") generate(slug);
else fail("Use `list` or `generate <product-slug>`. ");
