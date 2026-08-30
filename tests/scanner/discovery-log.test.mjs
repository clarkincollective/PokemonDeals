// The cross-pipeline listing key (lib/discoveryLog.js). The scanner stores
// eBay's RESTful id (v1|<legacy>|<var>); the feed has the bare legacy
// number. Discovery-latency analysis only works if both resolve to the
// same key, so this is a contract test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { legacyIdFromListingId, discoveryListingKey } from "../../lib/discoveryLog.js";

test("legacyIdFromListingId: pulls the legacy number from a RESTful id", () => {
  assert.equal(legacyIdFromListingId("v1|377442529729|0"), "377442529729");
  assert.equal(legacyIdFromListingId("v1|158230582525|123456"), "158230582525");
});

test("legacyIdFromListingId: passes a bare legacy number through", () => {
  assert.equal(legacyIdFromListingId("287520704171"), "287520704171");
});

test("legacyIdFromListingId: null / junk -> null", () => {
  assert.equal(legacyIdFromListingId(null), null);
  assert.equal(legacyIdFromListingId(""), null);
  assert.equal(legacyIdFromListingId("v1||0"), null);
  assert.equal(legacyIdFromListingId("abc"), null);
});

test("discoveryListingKey: scanner RESTful id and feed legacy id collide on one key", () => {
  const fromScanner = discoveryListingKey("EBAY_GB", "v1|377442529729|0");
  const fromFeed = discoveryListingKey("EBAY_GB", "377442529729");
  assert.equal(fromScanner, "EBAY_GB:377442529729");
  assert.equal(fromScanner, fromFeed);
});
