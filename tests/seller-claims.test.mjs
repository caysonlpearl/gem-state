import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalFacebookProfile,
  validClaimToken,
  claimLinkStatus,
} from "../src/lib/seller-claims.ts";
test("seller profiles canonicalize independently of host, trailing slash and tracking", () => {
  for (const url of [
    "https://facebook.com/marketplace/profile/123?ref=foo",
    "https://m.facebook.com/marketplace/profile/123/",
    "https://www.facebook.com/marketplace/profile/123/",
  ])
    assert.equal(
      canonicalFacebookProfile(url),
      "https://www.facebook.com/marketplace/profile/123/",
    );
  for (const url of [
    "https://evil.com/marketplace/profile/123",
    "https://facebook.com/marketplace/item/123",
    "https://facebook.com/marketplace/profile/",
    "not a url",
  ])
    assert.throws(() => canonicalFacebookProfile(url));
});
test("claim tokens reject malformed and low entropy inputs without reflecting secret values", () => {
  assert.equal(validClaimToken("f".repeat(64)), "f".repeat(64));
  for (const token of ["", "a".repeat(63), "g".repeat(64), "token=123"])
    assert.throws(() => validClaimToken(token), /claim link is invalid/);
});
test("claim status covers unclaimed, expired, revoked and consumed with deterministic boundaries", () => {
  const now = 10000;
  assert.equal(claimLinkStatus(null, false, now), "Unclaimed");
  assert.equal(
    claimLinkStatus({ expires_at: new Date(now + 1).toISOString() }, false, now),
    "Unclaimed",
  );
  assert.equal(claimLinkStatus({ expires_at: new Date(now).toISOString() }, false, now), "Expired");
  assert.equal(
    claimLinkStatus(
      { expires_at: new Date(now + 1).toISOString(), revoked_at: "revoked" },
      false,
      now,
    ),
    "Revoked",
  );
  assert.equal(
    claimLinkStatus(
      { expires_at: new Date(now - 1).toISOString(), consumed_at: "done" },
      true,
      now,
    ),
    "Claimed",
  );
});
