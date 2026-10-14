import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalSellerSourceProfile,
  validClaimToken,
  claimLinkStatus,
  parseSellerClaimFragment,
} from "../src/lib/seller-claims.ts";
test("email verification returns retain the private claim alongside provider authentication", () => {
  const token = "b".repeat(64);
  for (const marker of ["&", "#", "%23"]) {
    const value = parseSellerClaimFragment(
      `#token=${token}${marker}access_token=example-access&refresh_token=example-refresh&type=signup`,
    );
    assert.equal(value.token, token);
    assert.equal(value.accessToken, "example-access");
    assert.equal(value.refreshToken, "example-refresh");
  }
  assert.equal(parseSellerClaimFragment(`#token=${token}`).token, token);
  assert.equal(parseSellerClaimFragment("#token=bad").token, "");
  assert.equal(parseSellerClaimFragment("#access_token=example").token, null);
  assert.equal(
    parseSellerClaimFragment(`#token=${token}#error=access_denied`).authError,
    "access_denied",
  );
});
test("seller profiles canonicalize independently of host, trailing slash and tracking", () => {
  for (const url of [
    "https://facebook.com/marketplace/profile/123?ref=foo",
    "https://m.facebook.com/marketplace/profile/123/",
    "https://www.facebook.com/marketplace/profile/123/",
  ])
    assert.equal(
      canonicalSellerSourceProfile(url),
      "https://www.facebook.com/marketplace/profile/123/",
    );
  for (const url of [
    "https://classifieds.ksl.com/search/member/5162572",
    "https://classifieds.ksl.com/search/member/5162572/?page=2",
  ])
    assert.equal(
      canonicalSellerSourceProfile(url),
      "https://classifieds.ksl.com/search/member/5162572",
    );
  for (const [url, canonical] of [
    ["https://vinted.com/member/3164840912-stephlaugh25?tab=items", "https://www.vinted.com/member/3164840912"],
    ["https://www.whatnot.com/user/StewsShoes/shop", "https://www.whatnot.com/user/stewsshoes"],
  ])
    assert.equal(canonicalSellerSourceProfile(url), canonical);
  for (const url of [
    "https://evil.com/marketplace/profile/123",
    "https://facebook.com/marketplace/item/123",
    "https://facebook.com/marketplace/profile/",
    "https://classifieds.ksl.com/listing/82308885",
    "https://www.vinted.com/items/10381217076",
    "https://www.whatnot.com/listing/TGlzdGluZ05vZGU6MjQzOTM5NTA0MQ==",
    "https://ksl.com.evil.com/search/member/5162572",
    "not a url",
  ])
    assert.throws(() => canonicalSellerSourceProfile(url));
});
test("claim tokens reject malformed inputs without reflecting secret values", () => {
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
