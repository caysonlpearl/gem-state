/**
 * Shared, slow, one-at-a-time listing reader for the sites that check for
 * bots (KSL, Vinted, Whatnot). It opens each listing in one small window,
 * reads it, pauses a few seconds, and moves on. If a site shows a "verify
 * you're human" page, the window comes forward and the import waits for you
 * to complete it; nothing here tries to get past a check on its own.
 *
 * Loaded into the service worker with importScripts() from background.js.
 * Functions passed to chrome.scripting.executeScript run inside the page and
 * must stay self-contained.
 */

const PACED_PAUSE_MS = [1500, 3500];
const BOT_CHECK_WAIT_MS = 5 * 60 * 1000;

// In-page: the common bot-check pages (PerimeterX, Cloudflare and similar).
function isBotCheckPage() {
  const title = document.title || "";
  const text = document.body ? document.body.innerText.slice(0, 1500) : "";
  return (
    /access to this page has been denied|just a moment/i.test(title) ||
    /press\s*&\s*hold|verify(ing)? (that )?you are (a )?human|are you a robot|checking your browser/i.test(
      text,
    )
  );
}

function waitForPage(tabId, sameListing, timeoutMs, settleMs) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(finish, timeoutMs || 25000);
    function check() {
      if (settled) return;
      chrome.tabs.get(tabId, (t) => {
        if (settled || !t) return;
        if (t.status === "complete" && (!sameListing || sameListing(t.url))) {
          // Give client-rendered parts of the page a moment.
          setTimeout(finish, settleMs || 1200);
        }
      });
    }
    function listener(id, info) {
      if (id === tabId && info.status === "complete") check();
    }
    function finish() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }
    chrome.tabs.onUpdated.addListener(listener);
    check();
  });
}

// Brings the window forward and waits for you to finish a site's check.
async function waitForHuman(win, tabId, siteName, notify) {
  await chrome.windows
    .update(win.id, { focused: true, width: 1000, height: 900 })
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
async function readListingsPaced(
  items,
  { siteName, extract, idOf, withPhotos, onItemDone, notify, settleMs },
) {
  const win = await chrome.windows.create({
    url: "about:blank",
    focused: false,
    type: "popup",
    width: 900,
    height: 1000,
  });
  const tabId = win.tabs[0].id;
  async function open(url) {
    const expected = idOf(url);
    await chrome.tabs.update(tabId, { url });
    await waitForPage(tabId, (current) => !expected || idOf(current) === expected, 25000, settleMs);
  }
  try {
    for (const item of items) {
      try {
        await open(item.sourceUrl);
        if (await exec(tabId, isBotCheckPage).catch(() => false)) {
          if (await waitForHuman(win, tabId, siteName, notify)) await open(item.sourceUrl);
        }
        const details = (await exec(tabId, isBotCheckPage).catch(() => false))
          ? null
          : await exec(tabId, extract, [withPhotos]);
        if (details && !details.challenge) {
          for (const [key, value] of Object.entries(details)) {
            // Keep the seller page's data where the listing page had none.
            if (value !== "" && value !== null && value !== undefined && !(Array.isArray(value) && !value.length)) {
              item[key] = value;
            }
          }
        } else {
          item.unreadable = true;
        }
      } catch {
        item.unreadable = true;
      }
      onItemDone && onItemDone();
      const [min, max] = PACED_PAUSE_MS;
      await sleep(min + Math.random() * (max - min));
    }
  } finally {
    await chrome.windows.remove(win.id).catch(() => {});
  }
}

/** Copies the batch, hands it to the open admin import page, and reports. */
async function deliverImport(tabId, say, sellerLine, payload, notes) {
  const json = JSON.stringify(payload);
  await exec(tabId, (text) => navigator.clipboard.writeText(text), [json]).catch(() => {});
  const handedOff = await handoffToAdmin(json).catch(() => false);
  await say(
    `${sellerLine}Done — ${payload.items.length} listing(s)${notes.length ? `, ${notes.join(", ")}` : ""}.` +
      `<div style="margin-top:6px;opacity:.85">${
        handedOff
          ? "Sent to the Bluebird admin import page."
          : "Copied to clipboard. Open the Bluebird admin import page and use Paste from clipboard."
      }</div>`,
  );
}

/**
 * In-page: scrolls an infinite-scroll grid until no more items load (or
 * `expected` are on the page), then returns how many it saw. Plain page
 * scrolling; used where the site loads more as you scroll normally.
 */
async function scrollUntilLoaded(selector, expected) {
  const count = () => new Set(Array.from(document.querySelectorAll(selector)).map((a) => a.href)).size;
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
