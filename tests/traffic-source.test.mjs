import test from "node:test";
import assert from "node:assert/strict";

import { classifyTrafficSource } from "../src/lib/traffic-source.ts";

const own = "onbluebird.com";
const from = (referrer, search = "") => classifyTrafficSource(referrer, search, own);

test("search engines", () => {
  assert.deepEqual(from("https://www.google.com/"), { source: "google", channel: "search" });
  assert.deepEqual(from("https://www.google.co.uk/"), { source: "google", channel: "search" });
  assert.deepEqual(from("https://www.bing.com/search?q=x"), { source: "bing", channel: "search" });
  assert.deepEqual(from("https://duckduckgo.com/"), { source: "duckduckgo", channel: "search" });
});

test("AI assistants, including Google's and ChatGPT's link tags", () => {
  assert.deepEqual(from("https://gemini.google.com/app"), { source: "gemini", channel: "ai" });
  assert.deepEqual(from("https://www.perplexity.ai/"), { source: "perplexity", channel: "ai" });
  assert.deepEqual(from("https://chatgpt.com/"), { source: "chatgpt", channel: "ai" });
  assert.deepEqual(from("", "?utm_source=chatgpt.com"), { source: "chatgpt", channel: "ai" });
  assert.deepEqual(from("https://copilot.microsoft.com/"), { source: "copilot", channel: "ai" });
});

test("webmail is email, not Google search", () => {
  assert.equal(from("https://mail.google.com/").channel, "email");
});

test("social, referral, direct and our own site", () => {
  assert.deepEqual(from("https://l.facebook.com/"), { source: "facebook", channel: "social" });
  assert.deepEqual(from("https://www.reddit.com/r/Boise/"), {
    source: "reddit",
    channel: "social",
  });
  assert.deepEqual(from("https://www.ktvb.com/article/x"), {
    source: "ktvb.com",
    channel: "referral",
  });
  assert.deepEqual(from(""), { source: "direct", channel: "direct" });
  assert.deepEqual(from("https://onbluebird.com/browse"), { source: "direct", channel: "direct" });
  assert.deepEqual(from("not a url"), { source: "direct", channel: "direct" });
});

test("utm tags win over the referrer", () => {
  assert.deepEqual(from("https://www.google.com/", "?utm_source=google&utm_medium=cpc"), {
    source: "google",
    channel: "paid",
  });
  assert.deepEqual(from("", "?utm_source=Newsletter&utm_medium=email"), {
    source: "newsletter",
    channel: "email",
  });
  assert.deepEqual(from("", "?utm_source=facebook&utm_medium=post"), {
    source: "facebook",
    channel: "social",
  });
  assert.deepEqual(from("", "?utm_source=flyer"), { source: "flyer", channel: "campaign" });
  assert.deepEqual(
    classifyTrafficSource("https://l.facebook.com/", "?ref=share", own, "/sellers/delia-cook"),
    { source: "delia-cook", channel: "share" },
  );
  assert.deepEqual(
    classifyTrafficSource("https://example.com/", "?ref=badge", own, "/sellers/delia-cook"),
    { source: "delia-cook", channel: "share" },
  );
  // ref=share anywhere else is just an ordinary visit.
  assert.equal(classifyTrafficSource("", "?ref=share", own, "/browse").channel, "direct");
});
