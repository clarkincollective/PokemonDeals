import { test } from "node:test";
import assert from "node:assert/strict";
import { get } from "./lib.mjs";

// A slug that resolves to no real record must never be a
// silently-indexable 200 - it's either a 404, or (for the deal-detail
// routes, which deliberately render an "expired" state rather than a hard
// 404) a 200 that is explicitly noindexed.

const MUST_404 = [
  "/sets/not-a-real-set-xyz",
  "/cards/not-a-real-card-xyz",
  "/pokemon/not-a-real-pokemon-xyz",
  "/this-route-does-not-exist-xyz",
];

const MUST_404_OR_NOINDEX = ["/deals/999999999", "/sealed-deals/999999999"];

for (const path of MUST_404) {
  test(`${path} returns 404`, async () => {
    const res = await get(path);
    assert.equal(res.status, 404, `${path} returned HTTP ${res.status}, expected 404`);
  });
}

for (const path of MUST_404_OR_NOINDEX) {
  test(`${path} is 404 or a noindexed 200`, async () => {
    const res = await get(path);
    if (res.status === 404) return;
    assert.equal(res.status, 200, `${path} returned HTTP ${res.status}`);
    assert.match(
      res.body,
      /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i,
      `${path} returned 200 without a noindex robots meta`
    );
  });
}
