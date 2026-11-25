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

// Rate limiting is not a CAPTCHA. Stop requests for this source; never retry it
// as missing listing data or treat it as inventory unavailability.
function readerAccessRestriction() {
  const title = (document.title || "").trim();
  const heading = (document.querySelector("h1")?.innerText || "").trim();
  return /^(?:you are rate limited|too many requests)\b/i.test(title) ||
    /^(?:you are rate limited|too many requests)[.!]?$/i.test(heading)
    ? "rate_limited"
    : null;
}

function readerDocumentState() {
  return {
    url: location.href,
    ready: document.readyState,
    hasBody: !!document.body?.innerText?.trim(),
  };
}

function isFacebookMarketplaceLanding(url) {
  return /^https:\/\/www\.facebook\.com\/marketplace\/\d+\/?(?:[?#].*)?$/.test(url || "");
}

function facebookUnavailableLanding(expectedUrl) {
  if (location.href !== expectedUrl) return false;
  const headings = document.querySelectorAll(
    ':is(main, [role="main"]) :is(h2, [role="heading"][aria-level="2"])',
  );
  return Array.from(headings).some(
    (heading) =>
      heading.getClientRects().length > 0 &&
      getComputedStyle(heading).visibility === "visible" &&
      /^This listing isn['’]t available anymore[.!]?$/.test(heading.innerText.trim()),
  );
}

function waitForPage(
  tabId,
  sameListing,
  timeoutMs = 25000,
  settleMs = 1200,
  allowInteractive = false,
  redirectedPageReady,
) {
  return new Promise((resolve) => {
    let settled = false;
    let settleTimer;
    const timer = setTimeout(() => finish(false), timeoutMs);
    const matches = async (tab) => {
      if (!tab) return false;
      if (sameListing && !sameListing(tab.url))
        return redirectedPageReady ? redirectedPageReady(tab) : false;
      if (tab.status === "complete") return true;
      if (!allowInteractive) return false;
      const state = await exec(tabId, readerDocumentState).catch(() => null);
      return (
        state &&
        state.hasBody &&
        ["interactive", "complete"].includes(state.ready) &&
        (!sameListing || sameListing(state.url))
      );
    };
    const poll = allowInteractive ? setInterval(check, 500) : null;
    function check() {
      if (settled) return;
      chrome.tabs.get(tabId, async (tab) => {
        if (settled || settleTimer || !(await matches(tab)) || settled || settleTimer) return;
        settleTimer = setTimeout(() => {
          settleTimer = undefined;
          chrome.tabs.get(tabId, async (current) => {
            if (await matches(current)) finish(true);
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
    function removed(id) {
      if (id === tabId) finish(false);
    }
    function finish(ready) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(settleTimer);
      if (poll) clearInterval(poll);
      chrome.tabs.onUpdated.removeListener(listener);
      chrome.tabs.onRemoved?.removeListener(removed);
      resolve(ready);
    }
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.onRemoved?.addListener(removed);
    check();
  });
}

// Brings the window forward and waits for you to finish a site's check.
async function waitForHuman(win, tabId, siteName, notify, resize = true) {
  typeof setImportVerification === "function" && setImportVerification(tabId, siteName);
  try {
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
      const stillChecking = await exec(tabId, isBotCheckPage).catch(async () => {
        if (!(await chrome.tabs.get(tabId).catch(() => null)))
          throw readFailure("reader_window_failed");
        return true;
      });
      if (!stillChecking) return true;
    }
    return false;
  } finally {
    typeof setImportVerification === "function" && setImportVerification(tabId);
  }
}

/**
 * Reads each item's sourceUrl with `extract(withPhotos)` (an in-page
 * function) and merges what it returns into the item. `idOf(url)` tells the
 * reader when the tab has reached the right listing.
 */
async function readListingsPaced(items, options) {
  return readListingJobs(items.map((item) => ({ item, ...options })));
}

/** Reason-coded failure; codes only, never listing text or URLs. */
function readFailure(reason) {
  const error = new Error(reason);
  error.reason = reason;
  return error;
}

/** One bounded pool for a whole import or a mixed-source Refresh all. */
async function readListingJobs(jobs, { onItemDone, blockedSites = new Map() } = {}) {
  const queue = jobs.slice();
  let humanGate = null;
  async function worker() {
    const win = await chrome.windows.create({
      url: "about:blank",
      focused: false,
      type: "popup",
      width: 900,
      height: 1000,
    });
    const tabId = win.tabs[0].id;
    typeof trackImportReader === "function" && trackImportReader(tabId, true);
    try {
      while (queue.length) {
        if (humanGate) await humanGate.catch(() => {});
        const job = queue.shift();
        if (!job) break;
        const { item, siteName, extract, idOf, withPhotos, notify, settleMs } = job;
        let requeued = false;
        try {
          if (blockedSites.has(siteName)) throw readFailure(blockedSites.get(siteName));
          const expected = idOf(item.sourceUrl);
          if (!expected) throw readFailure("unsupported_url");
          const matches = (url) => idOf(url) === expected;
          const redirectedPageReady =
            siteName === "Facebook" && withPhotos === false
              ? async (tab) =>
                  !tab.pendingUrl &&
                  isFacebookMarketplaceLanding(tab.url) &&
                  (await exec(tabId, facebookUnavailableLanding, [tab.url]).catch(() => false))
              : undefined;
          const waitForListing = () =>
            waitForPage(tabId, matches, 25000, settleMs, true, redirectedPageReady);
          const open = async () => {
            if (blockedSites.has(siteName)) throw readFailure(blockedSites.get(siteName));
            // Every unavailable listing can land at the same URL. Clear the
            // last document so its heading can't be attributed to the next item.
            if (
              redirectedPageReady &&
              isFacebookMarketplaceLanding((await chrome.tabs.get(tabId))?.url)
            ) {
              await chrome.tabs.update(tabId, { url: "about:blank" });
              if (!(await waitForPage(tabId, (url) => url === "about:blank", 5000, 0)))
                return false;
            }
            await chrome.tabs.update(tabId, { url: item.sourceUrl });
            return waitForListing();
          };
          if (!(await open())) throw readFailure("page_timeout");
          const checkAccess = async () => {
            const reason = await exec(tabId, readerAccessRestriction).catch(() => null);
            if (reason !== "rate_limited") return;
            if (!blockedSites.has(siteName))
              notify?.(
                `${siteName} paused access because of too many requests. Stopping this source; wait before trying again. Unread listings stay unchanged.`,
              );
            blockedSites.set(siteName, reason);
            throw readFailure(reason);
          };
          await checkAccess();
          let askedForVerification = false;
          const verifyListing = async () => {
            if (askedForVerification) throw readFailure("challenge_detected");
            askedForVerification = true;
            // Only one reader can prompt the operator at a time.
            if (humanGate) await humanGate.catch(() => {});
            if (blockedSites.has(siteName)) throw readFailure(blockedSites.get(siteName));
            const ownGate = waitForHuman(win, tabId, siteName, notify)
              .catch(() => false)
              .then((passed) => {
                if (!passed) blockedSites.set(siteName, "verification_incomplete");
                return passed;
              });
            humanGate = ownGate;
            const passed = await ownGate.finally(() => {
              if (humanGate === ownGate) humanGate = null;
            });
            if (!passed) throw readFailure("verification_incomplete");
            await checkAccess();
            if (!(await waitForListing())) throw readFailure("page_not_verified");
          };
          if (await exec(tabId, isBotCheckPage)) await verifyListing();
          let details;
          // Hydrated detail content can arrive after navigation completes.
          // Retry extraction in the same two windows; never open extra tabs.
          // Distinct codes for injection errors, empty results and in-page
          // challenges. Codes only: no listing text, URLs or error messages.
          let failure = "";
          const attempts = siteName === "Facebook" ? 3 : 6;
          for (let attempt = 0; attempt < attempts; attempt++) {
            await checkAccess();
            const current = await chrome.tabs.get(tabId);
            if (!matches(current.url)) {
              if (!redirectedPageReady || !(await redirectedPageReady(current)))
                throw readFailure("page_not_verified");
              details = { unavailable: true };
              failure = "";
              break;
            }
            try {
              details = await exec(tabId, extract, [withPhotos]);
              failure = !details ? "empty_result" : details.challenge ? "challenge_detected" : "";
            } catch {
              details = undefined;
              failure = "injection_failed";
            }
            if (failure === "challenge_detected" || (await exec(tabId, isBotCheckPage))) {
              await verifyListing();
              // Verification is a manual pause and does not use an extraction attempt.
              attempt--;
              continue;
            }
            if (details?.unavailable || (details && !details.incomplete)) break;
            if (attempt < attempts - 1) await sleep(1500);
          }
          if (failure) throw readFailure(failure);
          for (const [key, value] of Object.entries(details)) {
            if (
              value !== "" &&
              value !== null &&
              value !== undefined &&
              !(Array.isArray(value) && !value.length)
            )
              item[key] = value;
          }
          if (details.incomplete) {
            item.unreadable = true;
            item.unreadableReason = details.unreadableReason || "price_or_details_missing";
          } else {
            delete item.unreadable;
            delete item.unreadableReason;
          }
        } catch (error) {
          if (!(await chrome.tabs.get(tabId).catch(() => null))) {
            requeued = true;
            queue.unshift(job);
            throw readFailure("reader_window_failed");
          }
          item.unreadable = true;
          item.unreadableReason = error?.reason || "read_failed";
          if (["verification_incomplete", "challenge_detected"].includes(item.unreadableReason)) {
            if (!blockedSites.has(siteName))
              notify?.(
                `${siteName} verification did not finish. Stopping this source for this run; unread listings stay unchanged.`,
              );
            blockedSites.set(siteName, item.unreadableReason);
          }
        } finally {
          if (!requeued) {
            job.onItemDone?.();
            onItemDone?.();
          }
        }
        if (queue.length && !blockedSites.has(siteName)) {
          const [min, max] = siteName === "Vinted" ? [3000, 5000] : PACED_PAUSE_MS;
          await sleep(min + Math.random() * (max - min));
        }
      }
    } finally {
      typeof trackImportReader === "function" && trackImportReader(tabId, false);
      await chrome.windows.remove(win.id).catch(() => {});
    }
  }
  // Wait for every worker to close before releasing the run lock. A popup
  // creation failure must not leave another worker running behind a retry.
  const workers = await Promise.allSettled(
    Array.from(
      {
        length: Math.min(
          jobs.every((job) => job.siteName === "Vinted" || job.siteName === "KSL")
            ? 1
            : LISTING_READER_CONCURRENCY,
          queue.length,
        ),
      },
      worker,
    ),
  );
  if (queue.length) {
    for (const job of queue) {
      job.item.unreadable = true;
      job.item.unreadableReason = "reader_window_failed";
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
