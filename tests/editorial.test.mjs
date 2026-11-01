import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  articleHref,
  articleIsIndexable,
  articleIsPublic,
  canonicalSourceUrl,
  editorialDestinations,
  newsCard,
  newsFilters,
  NEWS_MAX_FEED_BYTES,
  NEWS_SOURCE_DEFINITIONS,
  relatedEditorialListings,
  sourceAllowsUrl,
} from "../src/lib/editorial-contract.ts";
import {
  editorialBodySections,
  editorialPlainText,
  fetchEditorialFeed,
  originalDraftHtml,
  parseEditorialFeed,
  sanitizeEditorialHtml,
} from "../src/lib/editorial-feed.server.ts";
import {
  editorialSourceUpdate,
  ingestEditorialStories,
  storyFingerprint,
} from "../src/lib/editorial-store.server.ts";
import { canonicalPagePath } from "../src/lib/seo-policy.ts";

const now = Date.parse("2026-10-30T22:00:00Z");
const source = (changes = {}) => ({
  ...NEWS_SOURCE_DEFINITIONS[0],
  id: "00000000-0000-4000-8000-000000000001",
  enabled: true,
  autoPublish: true,
  usage: "link",
  permissionNote: "",
  imagesPermitted: false,
  lastSuccessAt: null,
  lastError: null,
  nextRefreshAt: null,
  ...changes,
});
const body =
  "<p>Idaho families can visit the community job fair in Twin Falls this weekend. Employers will answer questions about local opportunities.</p>";
const item = ({
  title = "Idaho community job fair returns to Twin Falls",
  link = "https://idahocapitalsun.com/2026/10/30/job-fair/",
  date = "Fri, 30 Oct 2026 18:00:00 GMT",
  content = body,
} = {}) =>
  `<item><title>${title}</title><link>${link.replaceAll("&", "&amp;")}</link><pubDate>${date}</pubDate><dc:creator>Test Author</dc:creator><content:encoded><![CDATA[${content}]]></content:encoded></item>`;
const feed = (...items) =>
  `<rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>${items.join("")}</channel></rss>`;

test("news filters ignore marketplace location and constrain paging", () => {
  assert.deepEqual(newsFilters({ city: "Twin Falls", radiusMiles: 25, page: -1 }), {
    topic: undefined,
    state: undefined,
    page: 1,
  });
  assert.deepEqual(newsFilters({ topic: "business-jobs", state: "UT", page: "2" }), {
    topic: "business-jobs",
    state: "UT",
    page: 2,
  });
  assert.equal(newsFilters({ topic: "invented", page: Infinity }).page, 1);
  assert.equal(canonicalPagePath("/news/", { page: 2, city: "Twin Falls" }), "/news?page=2");
});
test("CTA destinations use real categories, home aliases, cities, and state", () => {
  assert.equal(
    editorialDestinations(["other-real-estate"], "Twin Falls")[0].href,
    "/idaho/twin-falls/homes",
  );
  assert.equal(editorialDestinations(["cars-trucks"])[0].href, "/idaho/cars-trucks");
  assert.match(editorialDestinations(["furniture"], "Logan", "UT")[0].href, /state=UT&city=Logan/);
  assert.equal(editorialDestinations(["javascript:alert(1)"])[0].href, "/browse?state=ID");
});
test("local guide CTAs use validated collection routes without broadening their category", () => {
  const destinations = editorialDestinations(
    ["other-real-estate", "furniture"],
    "Twin Falls",
    "ID",
    "houses-for-rent",
  );
  assert.equal(destinations[0].href, "/idaho/twin-falls/houses-for-rent");
  assert.match(destinations[0].label, /houses for rent near Twin Falls/);
  assert.equal(destinations[1].href, "/idaho/twin-falls/furniture");
  assert.equal(
    editorialDestinations(["services"], "Boise", "ID", "plumbers")[0].href,
    "/idaho/boise/plumbers",
  );
  assert.equal(
    editorialDestinations(["services"], "Twin Falls", "ID", "plumbers")[0].href,
    "/idaho/twin-falls/services",
  );
  assert.equal(
    editorialDestinations(["services"], "Logan", "UT", "plumbers")[0].href,
    "/browse?category=services&state=UT&city=Logan",
  );
  assert.equal(
    editorialDestinations(["jobs"], "Boise", "ID", "plumbers")[0].href,
    "/idaho/boise/jobs",
  );
});
test("collection related cards exclude for-sale, other property types, distant cities and states", () => {
  const card = {
    categorySlug: "other-real-estate",
    state: "ID",
    city: "Twin Falls",
    createdAt: "2026-10-30",
    home: { mode: "rent", propertyType: "Single-family home" },
  };
  const cards = [
    { ...card, id: "rental" },
    { ...card, id: "rental" },
    { ...card, id: "nearby", city: "Kimberly" },
    { ...card, id: "sale", home: { ...card.home, mode: "buy" } },
    { ...card, id: "apartment", home: { ...card.home, propertyType: "Apartment" } },
    { ...card, id: "distant", city: "Boise" },
    { ...card, id: "other-state", state: "UT" },
  ];
  assert.deepEqual(
    relatedEditorialListings(
      cards,
      ["other-real-estate"],
      "Twin Falls",
      "ID",
      "houses-for-rent",
    ).map((c) => c.id),
    ["rental", "nearby"],
  );
  assert.deepEqual(
    relatedEditorialListings(cards, ["other-real-estate"], "Unknown", "ID", "houses-for-rent"),
    [],
  );
});
test("public originals alone are indexable and external headlines have no local stub", () => {
  const article = {
    slug: "test-story",
    kind: "original",
    status: "published",
    publishedAt: "2026-10-30T20:00:00Z",
    sourceUrl: null,
  };
  assert.equal(articleIsPublic(article, now), true);
  assert.equal(articleIsIndexable(article, now), true);
  for (const status of ["draft", "review", "scheduled", "archived"])
    assert.equal(articleIsPublic({ ...article, status }, now), false);
  assert.equal(articleIsPublic({ ...article, publishedAt: "2026-11-01T20:00:00Z" }, now), false);
  assert.equal(articleIsIndexable({ ...article, kind: "licensed" }, now), false);
  assert.equal(
    articleHref({ ...article, kind: "external", sourceUrl: "https://idahocapitalsun.com/story/" }),
    "https://idahocapitalsun.com/story/",
  );
  assert.equal(
    articleHref({ ...article, guidePath: "/guides/how-to-buy-a-used-car-in-idaho" }),
    "/guides/how-to-buy-a-used-car-in-idaho",
  );
});
test("public card projection drops article bodies and permission notes", () => {
  const card = newsCard({
    title: "Public",
    bodyHtml: "private draft",
    bodySections: ["private"],
    imageRights: "private agreement",
  });
  assert.equal(card.title, "Public");
  for (const key of ["bodyHtml", "bodySections", "imageRights"])
    assert.equal(Object.hasOwn(card, key), false);
});
test("source URLs reject credentials, private hosts, and unapproved publishers", () => {
  assert.equal(
    canonicalSourceUrl("https://idahocapitalsun.com/story/?utm_source=test&x=1#section"),
    "https://idahocapitalsun.com/story/?x=1",
  );
  for (const url of [
    "http://idahocapitalsun.com/feed/",
    "https://idahocapitalsun.com.attacker.test/feed/",
    "https://user:pass@idahocapitalsun.com/feed/",
    "https://127.0.0.1/feed/",
    "https://[::1]/",
  ])
    assert.equal(sourceAllowsUrl("idaho-capital-sun", url), false);
});
test("headlines mode preserves dates and bylines while discarding unlicensed text/photos", async () => {
  const [story] = await parseEditorialFeed(
    feed(
      item({
        content:
          body +
          '<figure><img src="https://example.com/photo.jpg"><figcaption>Idaho Capital Sun</figcaption></figure>',
      }),
    ),
    source(),
    now,
  );
  assert.equal(story.kind, "external");
  assert.equal(story.bodyHtml, "");
  assert.equal(story.imageUrl, null);
  assert.equal(story.authorName, "Test Author");
  assert.equal(story.publishedAt, "2026-10-30T18:00:00.000Z");
  assert.equal(story.status, "published");
  assert.equal(story.city, "Twin Falls");
  assert.equal(story.topic, "business-jobs");
  assert.doesNotMatch(story.excerpt, /families can visit/);
});
test("approved full text is sanitized and keeps only specifically credited publisher photos", async () => {
  const [story] = await parseEditorialFeed(
    feed(
      item({
        content:
          body +
          '<figure><img src="https://example.com/allowed.jpg" onerror="alert(1)"><figcaption>Photo: Idaho Capital Sun</figcaption></figure><figure><img src="https://example.com/other.jpg"><figcaption>AP photo</figcaption></figure><script>alert(1)</script>',
      }),
    ),
    source({
      usage: "full",
      permissionNote: "Written permission for this test source",
      imagesPermitted: true,
    }),
    now,
  );
  assert.equal(story.kind, "licensed");
  assert.equal(story.imageUrl, "https://example.com/allowed.jpg");
  assert.match(story.bodyHtml, /Idaho families/);
  assert.doesNotMatch(story.bodyHtml, /onerror|<script|other\.jpg/);
});
test("uncertain geography and missing complete bodies go to review", async () => {
  const [uncertain] = await parseEditorialFeed(
    feed(
      item({
        title: "National event begins",
        content: "<p>A national event with no state or city references.</p>",
      }),
    ),
    source(),
    now,
  );
  assert.equal(uncertain.status, "review");
  const [incomplete] = await parseEditorialFeed(
    feed(item({ content: "<p>Idaho update.</p>" })),
    source({ usage: "full", permissionNote: "Explicit written permission" }),
    now,
  );
  assert.equal(incomplete.status, "review");
  assert.match(incomplete.reviewReason, /complete article/);
});
test("duplicate links, future dates, old dates, and missing dates do not create fresh stories", async () => {
  const stories = await parseEditorialFeed(
    feed(
      item(),
      item({ link: "https://idahocapitalsun.com/2026/10/30/job-fair/?utm_source=feed" }),
      item({ date: "Fri, 01 Jan 2027 00:00:00 GMT", link: "https://idahocapitalsun.com/future/" }),
      item({ date: "", link: "https://idahocapitalsun.com/missing/" }),
      item({ date: "Fri, 01 Jan 2021 00:00:00 GMT", link: "https://idahocapitalsun.com/old/" }),
    ),
    source(),
    now,
  );
  assert.equal(stories.length, 1);
});
test("XML entity declarations, malformed and oversized feeds fail safely", async () => {
  for (const xml of [
    '<!DOCTYPE rss [<!ENTITY attack SYSTEM "file:///etc/passwd">]><rss/>',
    "<rss><broken></rss>",
    "x".repeat(NEWS_MAX_FEED_BYTES + 1),
  ])
    await assert.rejects(parseEditorialFeed(xml, source(), now));
});
test("original drafts support useful formatting and remove executable content", () => {
  const html = originalDraftHtml(
    "## Idaho moving checklist\n\nCompare local options at [Bluebird](/idaho/furniture).\n\n- Inspect the furniture\n- Confirm dimensions\n\n<script>bad()</script><img src=x onerror=bad()>",
  );
  assert.match(html, /<h2>Idaho moving checklist<\/h2>/);
  assert.match(html, /href="\/idaho\/furniture"/);
  assert.match(html, /<li>Inspect/);
  assert.doesNotMatch(html, /script|onerror|<img/);
});
test("body breaks occur between complete blocks, never inside licensed copy", () => {
  const html = Array.from(
    { length: 8 },
    (_, i) => `<blockquote><p>${i}: ${"Useful local information. ".repeat(60)}</p></blockquote>`,
  ).join("");
  const parts = editorialBodySections(html, "original");
  assert.equal(parts.length, 2);
  assert.equal(parts.join(""), html);
  assert.equal(editorialBodySections(html, "licensed").length, 1);
  assert.equal(parts[0].match(/<blockquote>/g).length, parts[0].match(/<\/blockquote>/g).length);
});
test("related listings are deduplicated, category-scoped, state-scoped, and prefer the article city", () => {
  const cards = [
    { id: "a", categorySlug: "furniture", state: "ID", city: "Boise", createdAt: "2026-10-30" },
    {
      id: "b",
      categorySlug: "furniture",
      state: "ID",
      city: "Twin Falls",
      createdAt: "2026-10-20",
    },
    {
      id: "b",
      categorySlug: "furniture",
      state: "ID",
      city: "Twin Falls",
      createdAt: "2026-10-20",
    },
    { id: "c", categorySlug: "jobs", state: "ID", city: "Twin Falls", createdAt: "2026-10-30" },
    { id: "d", categorySlug: "furniture", state: "UT", city: "Logan", createdAt: "2026-10-30" },
  ];
  assert.deepEqual(
    relatedEditorialListings(cards, ["furniture"], "Twin Falls", "ID").map((c) => c.id),
    ["b", "a"],
  );
});
test("source cache honors 304 and rejects cross-host redirects before following", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response(null, { status: 304 });
  });
  const result = await fetchEditorialFeed(source(), '"saved-etag"');
  assert.equal(result.unchanged, true);
  assert.equal(calls, 1);
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response(null, {
      status: 302,
      headers: { location: "https://attacker.test/feed/" },
    });
  });
  await assert.rejects(fetchEditorialFeed(source()), /outside its approved publisher/);
  assert.equal(calls, 2);
});
test("failed or oversized responses never become stories", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("maintenance", { status: 503 }));
  await assert.rejects(fetchEditorialFeed(source()), /retained/);
  t.mock.restoreAll();
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response("x", { headers: { "content-length": String(NEWS_MAX_FEED_BYTES + 1) } }),
  );
  await assert.rejects(fetchEditorialFeed(source()), /size limit/);
});

function memoryDb(initial = []) {
  const rows = structuredClone(initial),
    writes = [];
  return {
    rows,
    writes,
    from() {
      let action = "select",
        values,
        filters = [],
        single = false;
      const query = {
        select() {
          return query;
        },
        in(key, values) {
          filters.push((r) => values.includes(r[key]));
          return query;
        },
        eq(key, value) {
          filters.push((r) => r[key] === value);
          return query;
        },
        maybeSingle() {
          single = true;
          return query;
        },
        update(value) {
          action = "update";
          values = value;
          return query;
        },
        upsert(value) {
          action = "insert";
          values = value;
          return query;
        },
        insert(value) {
          action = "insert";
          values = value;
          return query;
        },
        then(resolve) {
          let result;
          if (action === "insert") {
            result = [values]
              .flat()
              .map((row) => ({ id: `saved-${rows.length}`, manual_revision: 0, ...row }));
            rows.push(...result);
            writes.push(action);
          } else {
            result = rows.filter((row) => filters.every((f) => f(row)));
            if (action === "update") {
              for (const row of result) Object.assign(row, values);
              writes.push(action);
            }
          }
          return Promise.resolve({
            data: single ? result[0] || null : structuredClone(result),
            error: null,
          }).then(resolve);
        },
      };
      return query;
    },
  };
}
test("ingestion batches first imports and repeated unchanged feeds perform no article writes", async () => {
  const stories = await parseEditorialFeed(feed(item()), source(), now);
  const db = memoryDb();
  assert.equal((await ingestEditorialStories(db, source(), stories)).created, 1);
  const firstWrites = db.writes.length;
  assert.deepEqual(await ingestEditorialStories(db, source(), stories), {
    created: 0,
    updated: 0,
    review: 0,
  });
  assert.equal(db.writes.length, firstWrites);
  assert.equal(db.rows.length, 1);
});
test("publisher changes preserve manual edits and archived articles", async () => {
  const [story] = await parseEditorialFeed(feed(item()), source(), now);
  for (const previous of [
    { manual_revision: 1, status: "published" },
    { manual_revision: 0, status: "archived" },
  ]) {
    const db = memoryDb([
      {
        id: "existing",
        source_url: story.sourceUrl,
        source_hash: "old",
        body_html: "My edited copy",
        ...previous,
      },
    ]);
    assert.equal(editorialSourceUpdate(db.rows[0], story), "review");
    assert.equal((await ingestEditorialStories(db, source(), [story])).review, 1);
    assert.equal(db.rows[0].body_html, "My edited copy");
    assert.equal(db.rows[0].status, previous.status);
    assert.equal(db.rows[0].pending_update.source_hash, story.contentHash);
  }
});
test("cross-publisher syndicated duplicates share a stable fingerprint", async () => {
  const [story] = await parseEditorialFeed(feed(item()), source(), now);
  const other = {
    ...story,
    sourceUrl: "https://utahnewsdispatch.com/copy/",
    contentHash: "different",
  };
  assert.equal(storyFingerprint(story), storyFingerprint(other));
  const db = memoryDb([
    { id: "saved", source_url: story.sourceUrl, source_fingerprint: storyFingerprint(story) },
  ]);
  await ingestEditorialStories(db, source(), [other]);
  assert.equal(db.rows.length, 1);
});
test("public reads have no upstream fetch or provider refresh path", () => {
  const code = readFileSync(new URL("../src/lib/editorial.functions.ts", import.meta.url), "utf8");
  const publicCode = code.slice(
    code.indexOf("export const getNewsIndex"),
    code.indexOf("export type NewsAdminArticle"),
  );
  assert.doesNotMatch(
    publicCode,
    /fetchEditorialFeed\(|refreshEditorialSources\(|fetch\(|getClassifiedsHome\(/,
  );
  assert.match(publicCode, /editorial_public_articles/);
  assert.match(publicCode, /readHomepageSnapshot\(\)/);
  const sourceCode = readFileSync(
    new URL("../src/lib/editorial-store.server.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(sourceCode, /marketcheck|adzuna|openwebninja|service-directory/);
});
test("migration protects drafts, publication rights, refresh leases, and private agreements", () => {
  const sql = readFileSync(
    new URL("../supabase/migrations/20261030230000_bluebird_local_editorial.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /status = 'published' and a\.published_at <= now\(\)/);
  assert.match(sql, /security_invoker = true/);
  assert.match(sql, /refresh_lease_until < now\(\)/);
  assert.match(
    sql,
    /grant execute on function public.reserve_editorial_refresh\(uuid,boolean\) to service_role/,
  );
  assert.match(sql, /alter table public\.editorial_articles enable row level security/);
  assert.doesNotMatch(sql, /grant .* to anon|grant .* to authenticated/);
});

test("publisher credits and photo captions cannot turn national stories into Idaho news", async () => {
  const national =
    '<p>A national event with no state connections.</p><figure><figcaption>Photo: Idaho Capital Sun</figcaption></figure><p>The post National event appeared first on <a href="https://idahocapitalsun.com">Idaho Capital Sun</a>.</p>';
  const [story] = await parseEditorialFeed(
    feed(item({ title: "National event begins", content: national })),
    source(),
    now,
  );
  assert.equal(story.status, "review");
});
test("general news does not inherit shopping categories from incidental body mentions", async () => {
  const [story] = await parseEditorialFeed(
    feed(
      item({
        title: "Idaho residents speak about a statewide health initiative",
        content:
          "<p>One Idaho resident left her job to attend the hearing. A business owner also spoke.</p>",
      }),
    ),
    source(),
    now,
  );
  assert.equal(story.topic, "local-news");
  assert.deepEqual(story.categorySlugs, []);
});
test("an explicit headline state overrides the publisher's home state", async () => {
  const [story] = await parseEditorialFeed(
    feed(
      item({
        title: "Utah files charges over operations in Salt Lake City",
        content: "<p>The report was also shared with Idaho readers.</p>",
      }),
    ),
    source(),
    now,
  );
  assert.equal(story.state, "UT");
  assert.equal(story.city, "Salt Lake City");
  assert.equal(story.status, "published");
});
test("the article city follows its first mention instead of the city's position in a dictionary", async () => {
  const [story] = await parseEditorialFeed(
    feed(item({ content: body + "<p>The state department in Boise shared the announcement.</p>" })),
    source(),
    now,
  );
  assert.equal(story.city, "Twin Falls");
});

test("Utah selections remain bounded across repeated refreshes", async () => {
  const { selectUtahStories } = await import("../src/lib/editorial-contract.ts");
  const candidates = Array.from({ length: 8 }, (_, i) => ({
    state: "UT",
    status: "published",
    publishedAt: "2026-10-30T10:00:00Z",
    sourceUrl: `https://utahnewsdispatch.com/story-${i}/`,
    categorySlugs: i < 2 ? ["jobs"] : [],
    reviewReason: null,
  }));
  const first = selectUtahStories(candidates);
  assert.equal(first.filter((story) => story.status === "published").length, 4);
  const published = first
    .filter((story) => story.status === "published")
    .map((story) => ({ source_url: story.sourceUrl, published_at: story.publishedAt }));
  const second = selectUtahStories(candidates, published);
  assert.equal(second.filter((story) => story.status === "published").length, 4);
  assert.ok(
    second
      .filter((story) => story.status === "review")
      .every((story) => /regional coverage/.test(story.reviewReason)),
  );
});
test("publisher links remain usable and unauthorized photo captions are removed", () => {
  const html = sanitizeEditorialHtml(
    '<p><a href="/about/">Source page</a> <a href="http://example.org/rules">Official rules</a> <a href="mailto:editor@example.org">Editor</a></p><figure><img src="https://example.org/photo.jpg"><figcaption>Not licensed</figcaption></figure>',
    false,
    undefined,
    "https://idahocapitalsun.com/story/",
  );
  assert.match(html, /href="https:\/\/idahocapitalsun.com\/about\/"/);
  assert.match(html, /href="http:\/\/example.org\/rules"/);
  assert.match(html, /href="mailto:editor@example.org"/);
  assert.doesNotMatch(html, /Not licensed|<img/);
});

test("unchanged pending publisher updates do not repeatedly change the editor revision", async () => {
  const [story] = await parseEditorialFeed(feed(item()), source(), now);
  assert.equal(
    editorialSourceUpdate(
      {
        source_hash: "previous",
        manual_revision: 1,
        status: "published",
        pending_hash: story.contentHash,
      },
      story,
    ),
    "unchanged",
  );
});
