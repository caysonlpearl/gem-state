import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
const { chromium } = await import(
  new URL("../apps/mobile/node_modules/playwright/index.mjs", import.meta.url)
);
const output = resolve(process.env.BLUEBIRD_MOBILE_EVIDENCE || "/tmp/bluebird-app-icon-ui");
await mkdir(output, { recursive: true });
const fixture = resolve("apps/mobile/icon-picker-fixture.html");
const origin = "http://127.0.0.1:5218";
await writeFile(
  fixture,
  `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react'; import { createRoot } from 'react-dom/client';
import { AppIconPicker } from '/src/AppIconPicker.tsx'; import '/src/style.css';
let current='original'; window.iconCalls=[];window.failIcon=false;
const adapter={status:async()=>({supported:true,current}),setIcon:async({id})=>{
window.iconCalls.push(id);await new Promise(r=>setTimeout(r,100));
if(window.failIcon){window.failIcon=false;throw Error('Fixture native failure')};current=id;return {supported:true,current};}};
createRoot(document.getElementById('root')).render(React.createElement('main',{className:'mx-auto max-w-xl px-4 py-6'},React.createElement(AppIconPicker,{adapter})));
</script></body></html>`,
);
const server = spawn(
  process.execPath,
  [
    resolve("node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    "5218",
    "--strictPort",
  ],
  { cwd: resolve("apps/mobile"), stdio: "ignore" },
);
let browser;
try {
  for (const end = Date.now() + 30000; ;) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    if (Date.now() > end) throw Error("Icon fixture did not start");
    await pause(100);
  }
  browser = await chromium.launch();
  const results = [];
  for (const width of [320, 390, 768, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin + "/icon-picker-fixture.html");
    const group = page.getByRole("group", { name: "Choose an app icon" });
    await group.waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await group.getByRole("button").count(), 8);
    for (const label of [
      "Yellow",
      "Blue gloss",
      "Sky blue shadow",
      "Midnight blue",
      "Sky blue",
      "Black",
      "Yellow gloss",
      "Blue",
    ]) {
      const choice = group.getByRole("button", { name: label, exact: true });
      await choice.click();
      await page
        .getByRole("status")
        .filter({ hasText: "Current: " + label })
        .waitFor();
      assert.equal(await choice.getAttribute("aria-pressed"), "true");
    }
    const before = await page.evaluate(() => window.iconCalls.length);
    await group.getByRole("button", { name: "Blue", exact: true }).click();
    assert.equal(
      await page.evaluate(() => window.iconCalls.length),
      before,
      "Selected icon is a no-op",
    );
    await page.evaluate(() => {
      window.failIcon = true;
    });
    await group.getByRole("button", { name: "Yellow", exact: true }).click();
    await page.getByRole("alert").waitFor();
    assert.equal(
      await group.getByRole("button", { name: "Blue", exact: true }).getAttribute("aria-pressed"),
      "true",
      "Native failure preserves current icon",
    );
    await group.getByRole("button", { name: "Yellow", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Current: Yellow" }).waitFor();
    await page.getByRole("button", { name: "Use original icon", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Current: Original blue" }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Use original icon", exact: true }).count(),
      0,
    );
    assert.equal(
      await page
        .locator("img")
        .evaluateAll((imgs) => imgs.every((i) => i.complete && i.naturalWidth === 192)),
      true,
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
    await page.screenshot({
      path: resolve(output, `icons-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
    assert.deepEqual(errors, []);
    results.push({
      width,
      eightChoices: true,
      nativeFailureRecovery: true,
      originalRestored: true,
      overflow: false,
    });
    await page.close();
  }
  await writeFile(
    resolve(output, "results.json"),
    JSON.stringify(
      { boundary: "Browser UI with a synthetic icon adapter; not OS icon-switch proof", results },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ results }));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await rm(fixture, { force: true });
}
