/**
 * Shared two-window listing reader. Each window stays visible to Chrome
 * while it reads a listing, then is reused for the next queued URL. If a site shows a "verify
 * you're human" page, the window comes forward and the import waits for you
 * to complete it; nothing here tries to get past a check on its own.
 *
 * Loaded into the service worker with importScripts() from background.js.
 * Functions passed to chrome.scripting.executeScript run inside the page and
 * must stay self-contained.
 */

const LISTING_READER_CONCURRENCY = 2;
const PACED_PAUSE_MS = [250, 600];
const BOT_CHECK_WAIT_MS = 5 * 60 * 1000;

// In-page: the common bot-check pages (PerimeterX, Cloudflare and similar).
function isBotCheckPage() {
  const title = document.title || "";
  const text = document.body ? document.body.innerText.slice(0, 1500) : "";
  return (
    /access to this page has been denied|just a moment|security verification/i.test(title) ||
    /press\s*&\s*hold|verify(ing)? (that )?you are (a )?human|are you a robot|checking your browser|performing security verification/i.test(
      text,
    )
  );
}

function waitForPage(tabId, sameListing, timeoutMs = 25000, settleMs = 1200) {
  return new Promise((resolve) => {
    let settled = false;
    let settleTimer;
    const timer = setTimeout(() => finish(false), timeoutMs);
    const matches = (tab) =>
      tab && tab.status === "complete" && (!sameListing || sameListing(tab.url));
    function check() {
      if (settled) return;
      chrome.tabs.get(tabId, (tab) => {
        if (settled || !matches(tab) || settleTimer) return;
        settleTimer = setTimeout(() => {
          settleTimer = undefined;
          chrome.tabs.get(tabId, (current) => {
            if (matches(current)) finish(true);
          });
        }, settleMs);
      });
    }
    function listener(id, info) {
      if (id !== tabId) return;
      if (info.status === "loading") {
        clearTimeout(settleTimer);
        settleTimer = undefined;
      }
      if (info.status === "complete") check();
    }
    function finish(ready) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(settleTimer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(ready);
    }
    chrome.tabs.onUpdated.addListener(listener);
    check();
  });
}

// Brings the window forward and waits for you to finish a site's check.
async function waitForHuman(win, tabId, siteName, notify, resize = true) {
  await chrome.windows
    .update(win.id, { focused: true, ...(resize ? { width: 1000, height: 900 } : {}) })
    .catch(() => {});
  notify &&
    notify(
      `${siteName} asked to verify you're human. Complete the check in the window that just opened; the import continues on its own.`,
    );
  const deadline = Date.now() + BOT_CHECK_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(2000);
    const stillChecking = await exec(tabId, isBotCheckPage).catch(() => true);
    if (!stillChecking) return true;
  }
  return false;
}

/**
 * Reads each item's sourceUrl with `extract(withPhotos)` (an in-page
 * function) and merges what it returns into the item. `idOf(url)` tells the
 * reader when the tab has reached the right listing.
 */
async function readListingsPaced(items, options) {
  return readListingJobs(items.map((item) => ({ item, ...options })));
}

/** One bounded pool for a whole import or a mixed-source Refresh all. */
async function readListingJobs(jobs, { onItemDone } = {}) {
  const queue = jobs.slice();
  let humanGate = null;
  let interrupted = false;
  async function worker() {
    const win = await chrome.windows.create({
      url: "about:blank",
      focused: false,
      type: "popup",
      width: 900,
      height: 1000,
    });
    const tabId = win.tabs[0].id;
    try {
      while (queue.length) {
        if (humanGate) await humanGate;
        const job = queue.shift();
        if (!job) break;
        const { item, siteName, extract, idOf, withPhotos, notify, settleMs } = job;
        try {
          if (interrupted) throw new Error("Human verification was not completed.");
          const expected = idOf(item.sourceUrl);
          if (!expected) throw new Error("Unsupported listing URL.");
          const matches = (url) => idOf(url) === expected;
          const open = async () => {
            await chrome.tabs.update(tabId, { url: item.sourceUrl });
            return waitForPage(tabId, matches, 25000, settleMs);
          };
          if (!(await open())) throw new Error("Listing did not finish loading.");
          if (await exec(tabId, isBotCheckPage)) {
            // Serialize manual handoffs; a second challenged window must get
            // its own handoff after the first, rather than sharing its result.
            if (humanGate) await humanGate;
            if (interrupted) throw new Error("Verification incomplete.");
            const ownGate = waitForHuman(win, tabId, siteName, notify).then((passed) => {
              if (!passed) interrupted = true;
              return passed;
            });
            humanGate = ownGate;
            const passed = await ownGate;
            if (humanGate === ownGate) humanGate = null;
            if (!passed || !(await waitForPage(tabId, matches, 25000, settleMs)))
              throw new Error("Verification incomplete.");
          }
          const current = await chrome.tabs.get(tabId);
          if (
            !matches(current.url) ||
            current.status !== "complete" ||
            (await exec(tabId, isBotCheckPage))
          )
            throw new Error("Listing could not be verified.");
          const details = await exec(tabId, extract, [withPhotos]);
          if (!details || details.challenge) throw new Error("Listing could not be read.");
          for (const [key, value] of Object.entries(details)) {
            if (
              value !== "" &&
              value !== null &&
              value !== undefined &&
              !(Array.isArray(value) && !value.length)
            )
              item[key] = value;
          }
          delete item.unreadable;
        } catch {
          item.unreadable = true;
        } finally {
          job.onItemDone && job.onItemDone();
          onItemDone && onItemDone();
        }
        if (queue.length && !interrupted) {
          const [min, max] = PACED_PAUSE_MS;
          await sleep(min + Math.random() * (max - min));
        }
      }
    } finally {
      await chrome.windows.remove(win.id).catch(() => {});
    }
  }
  // Wait for every worker to close before releasing the run lock. A popup
  // creation failure must not leave another worker running behind a retry.
  const workers = await Promise.allSettled(
    Array.from({ length: Math.min(LISTING_READER_CONCURRENCY, queue.length) }, worker),
  );
  if (queue.length) {
    for (const job of queue) {
      job.item.unreadable = true;
      job.onItemDone && job.onItemDone();
      onItemDone && onItemDone();
    }
    throw new Error("Reader windows could not be opened. Allow them in Chrome, then retry.");
  }
  if (workers.length && workers.every((result) => result.status === "rejected"))
    throw new Error("Reader windows closed unexpectedly. Retry the import.");
}

/** Copies the batch, hands it to the open admin import page, and reports. */
async function deliverImport(tabId, say, sellerLine, payload, notes) {
  const json = JSON.stringify(payload);
  await exec(tabId, (text) => navigator.clipboard.writeText(text), [json]).catch(() => {});
  const handedOff = await handoffToAdmin(json).catch(() => false);
  const escapedJson = json.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  await say(
    `${sellerLine}Done — ${payload.items.length} listing(s)${notes.length ? `, ${notes.join(", ")}` : ""}.` +
      `<div style="margin-top:6px;opacity:.85">${
        handedOff
          ? "Batch received by the Bluebird admin form. Click Stage batch there."
          : "Batch is ready below. Copy the data into the Bluebird admin import form."
      }</div>` +
      `<details style="margin-top:10px"><summary>Recover completed import data</summary>` +
      `<p style="margin:6px 0">Keep this page open until your batch has been staged. Select and copy this data if the admin form was interrupted.</p>` +
      `<textarea aria-label="Completed import data" readonly style="width:100%;height:100px;color:#111;background:white">${escapedJson}</textarea></details>`,
  );
}

/**
 * In-page: scrolls an infinite-scroll grid until no more items load (or
 * `expected` are on the page), then returns how many it saw. Plain page
 * scrolling; used where the site loads more as you scroll normally.
 */
async function scrollUntilLoaded(selector, expected) {
  const count = () =>
    new Set(Array.from(document.querySelectorAll(selector)).map((a) => a.href)).size;
  let last = -1;
  let still = 0;
  for (let i = 0; i < 120 && still < 4; i++) {
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((resolve) => setTimeout(resolve, 900));
    const now = count();
    if (expected && now >= expected) break;
    still = now === last ? still + 1 : 0;
    last = now;
  }
  window.scrollTo(0, 0);
  return count();
}
