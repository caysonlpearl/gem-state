/** Human-triggered discovery only. Stagnant scrolling is NOT proof of absence. */
function profileScanConfig(profile) {
  if (KSL_MEMBER_RE.test(profile))
    return { site: "KSL", collect: kslCollectFromMemberPage, map: kslToImportItem };
  if (VINTED_MEMBER_RE.test(profile))
    return { site: "Vinted", collect: vintedCollectFromProfile, map: vintedToImportItem };
  if (WHATNOT_USER_RE.test(profile))
    return { site: "Whatnot", collect: whatnotCollectFromShop, map: whatnotToImportItem };
  if (DEALER_INVENTORY_RE.test(profile))
    return { site: "Diesel Depot", collect: dealerCollectInventoryPage, map: dealerToImportItem };
  if (/^https:\/\/www\.facebook\.com\/marketplace\/profile\/[\w.-]+\/$/.test(profile))
    return {
      site: "Facebook",
      collect: collectListingsFromPage,
      map: (item) => ({
        ...item,
        categorySlug: inferCategory(item.title, item.description),
        subcategory: item.sourceSubcategory || "",
        condition: item.condition || "used_good",
      }),
    };
  throw new Error("Unsupported seller profile.");
}

function scanPageURL(profile, value, site) {
  try {
    const p = new URL(profile),
      u = new URL(value);
    if (u.origin !== p.origin || u.username || u.password || u.port) return false;
    if (site === "Diesel Depot")
      return u.pathname === "/inventory/" && u.search.startsWith("?/listings/");
    return u.pathname.replace(/\/$/, "") === p.pathname.replace(/\/$/, "");
  } catch {
    return false;
  }
}

async function collectSellerScan(profile, config, notify) {
  const win = await chrome.windows.create({
    url: "about:blank",
    focused: false,
    type: "popup",
    width: 1000,
    height: 1000,
  });
  const tabId = win.tabs[0].id;
  const items = new Map(),
    visited = new Set(),
    sectionCounts = new Map();
  let complete = true,
    challenged = false,
    termination = "incomplete",
    sellerName = "",
    expected = 0;
  const pages = [{ url: config.site === "Whatnot" ? profile + "/shop" : profile, kind: null }];
  try {
    while (pages.length && visited.size < 1000) {
      const { url, kind } = pages.shift();
      if (visited.has(url)) {
        complete = false;
        break;
      }
      visited.add(url);
      await chrome.tabs.update(tabId, { url });
      if (!(await waitForPage(tabId, (current) => current === url, 25000, 2000))) {
        complete = false;
        break;
      }
      if (await exec(tabId, isBotCheckPage)) {
        challenged = true;
        if (!(await waitForHuman(win, tabId, config.site, notify))) {
          complete = false;
          break;
        }
      }
      // Facebook virtualized cards must be accumulated while scrolling.
      let facebookPages = [];
      if (config.site === "Facebook") {
        await autoScroll(tabId, async () => {
          facebookPages.push(await exec(tabId, collectListingsFromPage));
        });
      }
      const page = await exec(tabId, config.collect);
      if (!page || (await exec(tabId, isBotCheckPage))) {
        complete = false;
        challenged = true;
        break;
      }
      if (
        page.sourceProfileUrl &&
        page.sourceProfileUrl.replace(/\/$/, "").toLowerCase() !==
          profile.replace(/\/$/, "").toLowerCase()
      ) {
        complete = false;
        break;
      }
      sellerName ||= page.sellerName || "";
      expected = Math.max(expected, page.expected || 0);
      for (const chunk of [...facebookPages, page]) {
        for (const item of chunk?.items || []) {
          const id = readerForSource(item.sourceUrl)?.idOf(item.sourceUrl);
          if (id)
            items.set(id, {
              ...item,
              city: item.city || page.city || "",
              state: item.state || page.state || "",
            });
        }
      }
      if (config.site === "Diesel Depot" && !kind) {
        if (!page.sections?.length) {
          complete = false;
          break;
        }
        for (const section of page.sections) {
          if (!scanPageURL(profile, section, config.site)) {
            complete = false;
            break;
          }
          pages.push({ url: section, kind: dealerCatalogKind(section) });
        }
      } else if (config.site === "Diesel Depot") {
        if (
          !page.recognized ||
          !dealerCatalogHeadingMatches(kind, page.heading) ||
          (page.pageCount !== null && page.items.length < page.pageCount)
        ) {
          complete = false;
          break;
        }
        const count = sectionCounts.get(kind) || new Set();
        for (const item of page.items) count.add(dealerListingId(item.sourceUrl));
        sectionCounts.set(kind, count);
        if (!page.nextUrl && count.size < page.expected) {
          complete = false;
          break;
        }
        termination = "end";
      } else if (config.site === "KSL") {
        if (!page.recognized) {
          complete = false;
          break;
        }
        // A missing next link alone is not proof that pagination completed.
        if (!page.nextUrl && !(expected > 0 && items.size >= expected) && !page.explicitEnd) {
          complete = false;
        }
        termination =
          expected > 0 && items.size >= expected
            ? "count"
            : page.explicitEnd
              ? "end"
              : "incomplete";
      } else {
        const countReached = page.expected > 0 && items.size >= page.expected;
        const ended = page.explicitEnd === true;
        if (!countReached && !ended) complete = false;
        termination = countReached ? "count" : ended ? "end" : "incomplete";
      }
      if (page.nextUrl) {
        if (!scanPageURL(profile, page.nextUrl, config.site) || visited.has(page.nextUrl)) {
          complete = false;
          break;
        }
        pages.push({ url: page.nextUrl, kind });
      }
      notify(
        `${config.site}: ${visited.size} profile page(s), ${items.size} source listing(s) discovered`,
      );
    }
    if (pages.length) complete = false;
  } catch {
    complete = false;
  } finally {
    await chrome.windows.remove(win.id).catch(() => {});
  }
  return {
    sourceProfileUrl: profile,
    sellerName,
    items: [...items.values()],
    expected,
    pages: visited.size,
    scan: {
      complete,
      challenged,
      termination: complete ? termination : "incomplete",
      unreadable: 0,
    },
  };
}

async function refreshSellerProfiles(adminTabId, requestId, profiles) {
  const send = (payload) =>
    chrome.tabs.sendMessage(adminTabId, { type: "gemlist-ext-event", payload }).catch(() => {});
  const reports = [];
  for (const profile of profiles) {
    const config = profileScanConfig(profile.sourceProfileUrl);
    const progress = (message) =>
      send({
        type: "gemlist-fb-refresh-progress",
        requestId,
        sourceProfileUrl: profile.sourceProfileUrl,
        message,
      });
    const report = await collectSellerScan(profile.sourceProfileUrl, config, progress);
    const known = new Map(
      (profile.targets || []).map((t) => [readerForSource(t.sourceUrl)?.idOf(t.sourceUrl), t]),
    );
    // Explicit detail retries for existing records even when the grid scan is incomplete.
    const byId = new Map(
      report.items.map((item) => [readerForSource(item.sourceUrl)?.idOf(item.sourceUrl), item]),
    );
    for (const [id, target] of known) if (id && !byId.has(id)) byId.set(id, { ...target });
    const jobs = [...byId.values()].flatMap((item) => {
      const reader = readerForSource(item.sourceUrl);
      const prior = reader ? known.get(reader.idOf(item.sourceUrl)) : null;
      // Sold detail pages may omit title/price; preserve the known identity
      // so their explicit unavailability can still be queued for review.
      if (prior) {
        item.title ||= prior.title;
        if (item.priceCents == null) item.priceCents = prior.priceCents;
      }
      return reader
        ? [
            {
              item,
              ...reader,
              withPhotos: !known.has(reader.idOf(item.sourceUrl)),
              notify: progress,
            },
          ]
        : [];
    });
    let done = 0;
    await readListingJobs(jobs, {
      onItemDone: () =>
        send({
          type: "gemlist-fb-refresh-progress",
          requestId,
          sourceProfileUrl: profile.sourceProfileUrl,
          done: ++done,
          total: jobs.length,
        }),
    }).catch(() => {
      report.scan.complete = false;
    });
    const unsupported = byId.size - jobs.length;
    const unreadable =
      unsupported +
      jobs.filter(
        ({ item }) =>
          item.unreadable ||
          item.priceUnknown ||
          (!item.unavailable && (!item.title || item.priceCents == null || !item.description)),
      ).length;
    report.scan.unreadable = unreadable;
    if (unreadable) report.scan.complete = false;
    for (const { item } of jobs) {
      if (
        !item.unavailable &&
        (!item.title || item.priceCents == null || !item.description) &&
        !item.unreadable
      ) {
        item.unreadable = true;
        item.unreadableReason = "price_or_details_missing";
      }
    }
    const results = jobs
      .filter(
        ({ item }) =>
          !item.unreadable &&
          !item.priceUnknown &&
          (item.unavailable || (item.title && item.priceCents != null && item.description)) &&
          !item.auction,
      )
      .map(({ item }) => ({
        ...config.map(item),
        unavailable: item.unavailable === true,
        sold: item.sold === true,
      }));
    reports.push({
      sourceProfileUrl: report.sourceProfileUrl,
      sellerName: report.sellerName,
      scan: report.scan,
      scanned: jobs.length,
      readable: results.length,
      skipped: jobs.filter(({ item }) => item.auction).length,
      discovered: report.items.length,
      seenUrls: [
        ...new Set([
          ...report.items.map((i) => i.sourceUrl),
          ...jobs
            .filter(({ item }) => !item.unreadable && !item.unavailable)
            .map(({ item }) => item.sourceUrl),
        ]),
      ],
      results,
      unreadableReasons: refreshUnreadableReasons(
        [...byId.values()].map((i) => i.sourceUrl),
        jobs,
      ),
    });
    // Deliver each seller separately, retaining completed seller scans if the next fails.
    await send({ type: "gemlist-fb-profile-result", requestId, report: reports.at(-1) });
  }
  await send({ type: "gemlist-fb-refresh-result", requestId, reports });
}
