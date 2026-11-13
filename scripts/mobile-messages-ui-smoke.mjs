import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { randomUUID } from "node:crypto";
const { chromium } = await import(
  new URL("../apps/mobile/node_modules/playwright/index.mjs", import.meta.url)
);
const output = resolve(process.env.BLUEBIRD_MOBILE_EVIDENCE || "/tmp/bluebird-mobile-messages-ui");
await mkdir(output, { recursive: true });
const port = 5191,
  origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  {
    cwd: resolve("apps/mobile"),
    env: { ...process.env, VITE_MOBILE_API_ORIGIN: "https://fixture.bluebird.invalid" },
    stdio: "ignore",
  },
);
const ownerA = "11111111-1111-4111-8111-111111111111",
  ownerB = "22222222-2222-4222-8222-222222222222";
const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  c = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
function session(userId) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token =
    [
      { alg: "HS256", typ: "JWT" },
      { sub: userId, aud: "authenticated", role: "authenticated", exp: expires },
    ]
      .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
      .join(".") + ".fixture-signature";
  return {
    access_token: token,
    refresh_token: "fixture-refresh",
    token_type: "bearer",
    expires_at: expires,
    expires_in: 3600,
    user: {
      id: userId,
      aud: "authenticated",
      email: "fixture@example.invalid",
      app_metadata: { provider: "email" },
      user_metadata: { display_name: "Fixture shopper" },
    },
  };
}
let browser;
const errors = [],
  results = [];
try {
  const deadline = Date.now() + 30000;
  for (;;) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    if (Date.now() > deadline) throw Error("Preview did not start");
    await pause(150);
  }
  browser = await chromium.launch(
    process.env.BLUEBIRD_BROWSER_CHANNEL ? { channel: process.env.BLUEBIRD_BROWSER_CHANNEL } : {},
  );
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 740 },
    { width: 768, height: 1024 },
  ]) {
    const page = await browser.newPage({ viewport });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(
      ({ sessions, first }) => {
        const actor = sessionStorage.getItem("fixture.actor") || first;
        localStorage.setItem("bluebird-mobile-auth", JSON.stringify(sessions[actor]));
      },
      { sessions: { [ownerA]: session(ownerA), [ownerB]: session(ownerB) }, first: ownerA },
    );
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    };
    const summary = (id, title, role = "buyer") => ({
      id,
      listingId: "listing-" + id,
      listingTitle: title,
      buyerId: role === "buyer" ? ownerA : ownerB,
      sellerId: role === "buyer" ? ownerB : ownerA,
      memberRole: role,
      otherMemberId: ownerB,
      otherMemberName: "Fixture member",
      unread: false,
      lastReadAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    const summaries = [summary(a, "Fixture bicycle"), summary(b, "Fixture desk", "seller")];
    const messages = new Map([
      [
        a,
        [
          {
            id: randomUUID(),
            conversationId: a,
            senderId: ownerB,
            body: "Fixture seller reply",
            createdAt: new Date().toISOString(),
            attachmentUrl: null,
          },
        ],
      ],
      [b, []],
      [c, []],
    ]);
    const receipts = new Map(),
      sends = [],
      uploads = [],
      prepared = [],
      reports = [],
      blocks = [],
      shoppingEvents = [];
    let loseText = true,
      loseAttachment = true,
      holdNext = false,
      release,
      reportFailure = true,
      blocked = false,
      attachmentsEnabled = true;
    await page.route("https://fixture.supabase.co/**", async (route) => {
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const path = decodeURIComponent(new URL(route.request().url()).pathname);
      if (path.startsWith("/storage/v1/object/upload/sign/conversation-attachments/")) {
        const object = path.split("conversation-attachments/")[1];
        uploads.push(object);
        return route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify({ Key: "conversation-attachments/" + object, Id: randomUUID() }),
        });
      }
      if (path === "/auth/v1/user")
        return route.fulfill({ status: 200, headers, body: JSON.stringify(session(ownerA).user) });
      throw Error("Unexpected Supabase fixture request " + path);
    });
    await page.route("https://fixture.bluebird.invalid/api/mobile/v1/**", async (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const path = new URL(req.url()).pathname.split("/v1/")[1],
        method = req.method();
      const payload = method === "GET" ? null : req.postDataJSON();
      const fail = (status, message, code = "unavailable") =>
        route.fulfill({ status, headers, body: JSON.stringify({ error: { message, code } }) });
      let actor = ownerA;
      const authorization = req.headers().authorization;
      if (authorization) {
        actor = JSON.parse(
          Buffer.from(authorization.split(" ")[1].split(".")[1], "base64url").toString(),
        ).sub;
      }
      let data;
      if (path === "bootstrap")
        data = {
          policyVersion: "2026-11-12",
          categories: [],
          supabaseUrl: "https://fixture.supabase.co",
          supabaseKey: "sb_publishable_fixture",
          features: {
            push: false,
            advertising: false,
            paidUpgrades: false,
            conversationAttachments: attachmentsEnabled,
          },
        };
      else if (path === "account")
        data = {
          account: { displayName: "Fixture shopper" },
          consent: { terms_version: "2026-11-12", shopping_alerts: false },
        };
      else if (path === "shopping")
        data = { personalization: false, trackingAvailable: true, recommendationsAvailable: true };
      else if (path === "home") data = { motors: [], recent: [] };
      else if (path === "saved") data = { items: [] };
      else if (path === "activity") {
        shoppingEvents.push(payload);
        data = {};
      } else if (path === "conversations" && method === "GET")
        data =
          actor === ownerA
            ? summaries
            : [{ ...summary(c, "Other account conversation"), buyerId: ownerB }];
      else {
        const match = /^conversations\/([^/]+)(?:\/(.*))?$/.exec(path);
        if (!match) throw Error("Unexpected API fixture " + path);
        const id = match[1],
          action = match[2];
        if (!(actor === ownerA ? [a, b].includes(id) : id === c))
          return fail(404, "Conversation not found.", "conversation_unavailable");
        if (!action && method === "GET")
          data = {
            ...(summaries.find((s) => s.id === id) || summary(c, "Other account conversation")),
            messages: messages.get(id),
          };
        else if (action === "read") data = { ok: true };
        else if (action === "report") {
          if (reportFailure) {
            reportFailure = false;
            return fail(503, "Fixture moderation outage");
          }
          reports.push({ id, reason: payload.reason });
          data = { ok: true };
        } else if (action === "block") {
          blocks.push(id);
          blocked = true;
          data = { ok: true };
        } else if (action === "attachments") {
          assert(attachmentsEnabled);
          const object = `${actor}/${id}/${randomUUID()}.pdf`;
          prepared.push(object);
          data = {
            path: object,
            token: "fixture-private-upload-token",
            contentType: payload.contentType,
            size: payload.size,
          };
        } else if (action === "messages" || action === "attachments/send") {
          if (blocked)
            return fail(
              403,
              "Messaging is unavailable for this conversation.",
              "conversation_unavailable",
            );
          const key = req.headers()["idempotency-key"];
          assert.match(key, /^[0-9a-f-]{36}$/);
          sends.push({ id, key, payload });
          if (!receipts.has(key)) {
            if (action === "attachments/send") assert(uploads.includes(payload.attachmentPath));
            const value = { messageId: randomUUID() };
            receipts.set(key, value);
            messages.get(id).push({
              id: value.messageId,
              conversationId: id,
              senderId: actor,
              body: payload.body,
              createdAt: new Date().toISOString(),
              attachmentUrl:
                action === "attachments/send"
                  ? "https://fixture.supabase.co/storage/v1/object/sign/conversation-attachments/" +
                    payload.attachmentPath
                  : null,
            });
          }
          if (holdNext) {
            holdNext = false;
            await new Promise((resolve) => {
              release = resolve;
            });
          }
          if (action === "messages" && loseText) {
            loseText = false;
            return fail(503, "Fixture lost response");
          }
          if (action === "attachments/send" && loseAttachment) {
            loseAttachment = false;
            return fail(503, "Fixture lost attachment response");
          }
          data = receipts.get(key);
        } else throw Error("Unexpected action " + action);
      }
      return route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({ data, requestId: "fixture" }),
      });
    });
    await page.goto(origin + "/#/messages/" + a);
    await page
      .getByRole("heading", { name: "Keep marketplace conversations together", exact: true })
      .waitFor();
    const waitSelected = (id) =>
      page.waitForFunction(
        (id) =>
          document
            .querySelector('[aria-label="Selected conversation"]')
            ?.getAttribute("data-conversation-id") === id,
        id,
      );
    const reply = page.getByRole("textbox", { name: "Reply", exact: true });
    await reply.waitFor();
    await page.getByRole("combobox", { name: "Filter conversations" }).selectOption("selling");
    await page.getByPlaceholder("Search messages").fill("desk");
    assert.equal(await page.getByRole("button", { name: /Fixture bicycle/ }).count(), 0);
    await page.getByPlaceholder("Search messages").fill("");
    await page.getByRole("combobox", { name: "Filter conversations" }).selectOption("all");
    await page.getByRole("button", { name: /Fixture bicycle/ }).click();
    await waitSelected(a);
    await reply.waitFor();
    await reply.fill("Fixture text after a lost response");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.getByText("Message not sent. Your text is still here.", { exact: true }).waitFor();
    assert.equal(await reply.inputValue(), "Fixture text after a lost response");
    await page.reload();
    await reply.waitFor();
    assert.equal(await reply.inputValue(), "Fixture text after a lost response");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector('textarea[aria-label="Reply"]')?.value === "",
    );
    assert.equal(sends[0].key, sends[1].key);
    assert.equal(
      messages.get(a).filter((m) => m.body === "Fixture text after a lost response").length,
      1,
    );
    holdNext = true;
    await reply.fill("Pending reply for bicycle");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    for (let n = 0; !release && n < 50; n++) await pause(50);
    assert(release);
    await page.getByRole("button", { name: /Fixture desk/ }).click();
    await waitSelected(b);
    await reply.waitFor();
    await reply.fill("Keep this other conversation draft");
    release();
    await page.getByRole("button", { name: "Send", exact: true }).waitFor();
    await page.waitForTimeout(200);
    await reply.waitFor();
    assert.equal(await reply.inputValue(), "Keep this other conversation draft");
    await page.getByRole("button", { name: /Fixture bicycle/ }).click();
    await waitSelected(a);
    await reply.waitFor();
    assert.equal(await reply.inputValue(), "");
    const attachment = page.getByLabel("Add attachment", { exact: true });
    await attachment.setInputFiles({
      name: "bad.exe",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("fixture"),
    });
    await page.getByRole("alert").filter({ hasText: "Use a JPG, PNG, WebP, or PDF" }).waitFor();
    assert.equal(prepared.length, 0);
    await attachment.setInputFiles({
      name: "fixture.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\nfixture-only\n"),
    });
    await page.getByRole("button", { name: "Remove attachment", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector('input[aria-label="Add attachment"]')?.files.length === 0,
    );
    await attachment.setInputFiles({
      name: "fixture.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\nfixture-only\n"),
    });
    await reply.fill("Fixture PDF reply");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page
      .getByText("Attachment not sent. Your file is still selected.", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Retry send", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector('textarea[aria-label="Reply"]')?.value === "",
    );
    await page.getByRole("link", { name: "Open attachment", exact: true }).waitFor();
    assert.equal(await attachment.evaluate((input) => input.files.length), 0);
    assert.equal(uploads.length, 1);
    assert.equal(prepared.length, 1);
    const fileSends = sends.filter((s) => s.payload.attachmentPath);
    assert.equal(fileSends.length, 2);
    assert.equal(fileSends[0].key, fileSends[1].key);
    assert.equal(messages.get(a).filter((m) => m.body === "Fixture PDF reply").length, 1);
    await page.getByRole("button", { name: "Report conversation", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("Reason for reporting").fill("ab");
    assert(await dialog.getByRole("button", { name: "Submit report", exact: true }).isDisabled());
    await dialog.getByPlaceholder("Reason for reporting").fill("Synthetic moderation report");
    await dialog.getByRole("button", { name: "Submit report", exact: true }).click();
    await page.waitForTimeout(200);
    assert.equal(
      await dialog.getByPlaceholder("Reason for reporting").inputValue(),
      "Synthetic moderation report",
    );
    await dialog.getByRole("button", { name: "Submit report", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByRole("status").filter({ hasText: "Report submitted." }).waitFor();
    assert.equal(reports.length, 1);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: resolve(output, `messages-${viewport.width}.png`),
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.getByRole("button", { name: "Block member", exact: true }).click();
    const blockDialog = page.getByRole("alertdialog");
    await blockDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(blocks.length, 0);
    await page.getByRole("button", { name: "Block member", exact: true }).click();
    await blockDialog.getByRole("button", { name: "Block member", exact: true }).click();
    await blockDialog.waitFor({ state: "hidden" });
    await reply.waitFor();
    await reply.fill("Blocked conversation draft");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Messaging is unavailable" }).waitFor();
    assert.equal(blocks.length, 1);
    assert.equal(await reply.inputValue(), "Blocked conversation draft");
    // A new account never renders/replays the previous account's drafts or receipts.
    await page.evaluate(
      ({ next, id }) => {
        sessionStorage.setItem("fixture.actor", next);
        location.hash = "/messages/" + id;
      },
      { next: ownerB, id: c },
    );
    await page.reload();
    await reply.waitFor();
    assert.equal(await reply.inputValue(), "");
    assert.equal(
      shoppingEvents.length,
      0,
      "Private conversation content cannot enter shopper activity",
    );
    attachmentsEnabled = false;
    await page.reload();
    await reply.waitFor();
    assert.equal(await page.getByLabel("Add attachment", { exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Send", exact: true }).count(), 1);
    results.push({
      viewport,
      sharedWebsiteConversation: true,
      filters: true,
      textRetrySurvivesReload: true,
      lateResponsePreservesOtherDraft: true,
      attachmentRetryExactlyOnce: true,
      removedAndSentFileSelectionClears: true,
      reportFailurePreservesReason: true,
      blockConfirmation: true,
      accountIsolation: true,
      missingMigrationKeepsTextMessages: true,
      privateShoppingExports: 0,
      horizontalOverflow: false,
    });
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(output, "messages-results.json"),
    JSON.stringify(
      {
        mode: "Synthetic accounts, messages, files and moderation only; no external writes or emails",
        results,
        javascriptErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ results, javascriptErrors: errors }));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
