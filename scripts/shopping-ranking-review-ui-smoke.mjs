import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { realpathSync } from "node:fs";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { candidate } from "../tests/helpers/shopping-ranking-database.mjs";
const { chromium } = await import(
  new URL("../apps/mobile/node_modules/playwright/index.mjs", import.meta.url)
);
const output = resolve(process.env.BLUEBIRD_RANKING_EVIDENCE || "/tmp/bluebird-ranking-review-ui");
const directory = resolve(`.ranking-review-fixture-${process.pid}`);
let server, browser;
try {
  await mkdir(directory);
  await mkdir(output, { recursive: true });
  await writeFile(
    resolve(directory, "index.html"),
    '<html><head><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>',
  );
  await writeFile(
    resolve(directory, "entry.tsx"),
    `import React, {useState} from 'react'; import {createRoot} from 'react-dom/client'; import '@/styles.css'; import {ShoppingRankingReview} from '@/components/admin/ShoppingRankingReview';
    const mode=new URLSearchParams(location.search).get('mode');
    const evaluation={week:'2026-11-09',promoted:mode==='applied',...${JSON.stringify(candidate())}};
    if(mode==='insufficient')evaluation.challenger.eligible=false;
    function Fixture(){const [applied,setApplied]=useState(false);return <main className="mx-auto max-w-4xl p-4"><h1 className="mb-4 text-2xl font-semibold">Weekly ranking evaluations</h1><ShoppingRankingReview evaluation={evaluation} activeVersion={mode==='stale'?'changed-model':'rules-v1'} ready={mode!=='missing'} learning={mode!=='paused'} pending={mode==='pending'} onApply={()=>setApplied(true)}/>{applied&&<p role="status">Reviewed change requested</p>}</main>}; createRoot(document.getElementById('root')).render(<Fixture/>);`,
  );
  server = await createServer({
    configFile: false,
    optimizeDeps: { entries: [resolve(directory, "entry.tsx")] },
    cacheDir: resolve(directory, "vite-cache"),
    root: process.cwd(),
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": resolve("src") }, dedupe: ["react", "react-dom"] },
    server: {
      host: "127.0.0.1",
      port: 0,
      fs: { allow: [process.cwd(), realpathSync(resolve("node_modules"))] },
    },
  });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}/${basename(directory)}/`;
  browser = await chromium.launch();
  const results = [];
  for (const viewport of [
    { width: 320, height: 740 },
    { width: 1280, height: 900 },
  ]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    const failedResponses = [];
    page.on("response", (response) => {
      if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin);
    await page.getByText("Review ranking evidence").click();
    await page.getByRole("button", { name: "Apply reviewed challenger" }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Apply reviewed challenger" }).isDisabled(),
      true,
    );
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Apply reviewed challenger" }).click();
    await page.getByRole("status").waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.screenshot({
      path: resolve(output, `review-${viewport.width}.png`),
      fullPage: true,
    });
    for (const [mode, text] of [
      ["missing", "database update is installed"],
      ["stale", "active model has changed"],
      ["paused", "evaluation is paused"],
      ["insufficient", "Evidence is not sufficient"],
      ["applied", "Prior challenger applied"],
    ]) {
      await page.goto(origin + "?mode=" + mode);
      await page.getByText("Review ranking evidence").click();
      await page.getByText(text, { exact: false }).waitFor();
      assert.equal(
        await page.getByRole("button", { name: "Apply reviewed challenger" }).count(),
        0,
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
    }
    await page.goto(origin + "?mode=pending");
    await page.getByText("Review ranking evidence").click();
    assert.equal(
      await page.getByRole("button", { name: "Applying reviewed challenger…" }).isDisabled(),
      true,
    );
    assert.equal(await page.getByRole("checkbox").isDisabled(), true);
    assert.deepEqual(errors, []);
    assert.deepEqual(failedResponses, []);
    results.push({ viewport, states: 7, errors });
    await page.close();
  }
  await writeFile(
    resolve(output, "proof.json"),
    JSON.stringify({ fixture: true, actualComponent: true, results }, null, 2),
  );
  console.log(JSON.stringify({ output, results }));
} finally {
  await browser?.close();
  await server?.close();
  await rm(directory, { recursive: true, force: true });
}
