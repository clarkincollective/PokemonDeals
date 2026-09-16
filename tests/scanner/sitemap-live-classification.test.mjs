// What a live sitemap observation can and cannot establish.
//
// The live suite samples /deals/<id> URLs out of the sitemap. When one is no
// longer indexable at fetch time, either the membership query advertised
// something it should already have excluded, or the listing changed state
// after the membership was computed - sold, ended, held, quarantined, aged
// out, or lost the permanent card page it would have redirected to. Over
// HTTP those look identical.
//
// TWO ATTEMPTS TO ORDER THEM WERE UNSOUND, and both are pinned against here:
//
//   1. the segment's <lastmod> plus the freshness TTLs. <lastmod> is the
//      row's last_seen_at; it does not date the snapshot, a recent value
//      with a noindex page is explained by any later eligibility change, and
//      age past a TTL is equally consistent with membership that was already
//      stale when the segment was built.
//   2. the response's cache metadata (Date - Age). That dates the HTTP cache
//      entry, not the application-cached membership behind it - the rows come
//      from an unstable_cache with its own revalidate window, so a CDN MISS
//      can serve a membership computed minutes earlier, and a missing Age
//      says nothing at all about when the membership was computed.
//
// So the classifier records what was seen and says only what that supports.
// Ordering is INCONCLUSIVE. Unconditional failures - a malformed URL, an
// invalid or looping redirect destination, a server error - need no
// chronology and still fail. Genuinely incorrect membership is caught
// deterministically on controlled data by
// tests/scanner/sitemap-substance.test.mjs and by the count/comment
// reconciliation in tests/seo/seo3-card-sitemap-shards.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { classifyDealObservation, CLASSIFICATION } from "../seo/lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const URL_ = "https://pokemondealfinder.com/deals/38471";
const page = (over = {}) => ({ status: 200, isRedirect: false, location: null, noindex: false, destinationOk: null, destinationReason: null, ...over });
const classify = (over = {}, advertised = true) => classifyDealObservation({ url: URL_, page: page(over), advertised });

// --- fixture 1: a recent listing held after a snapshot --------------------

test("1. a held listing is INCONCLUSIVE - never a confirmed defect, never a confirmed transition", () => {
  const v = classify({ noindex: true });
  assert.equal(v.kind, CLASSIFICATION.INCONCLUSIVE);
  assert.match(v.reason, /advertised=true/);
  assert.match(v.reason, /noindex/);
  assert.match(v.reason, /neither a defect nor a pass/);
  // the outcome does not depend on how recently the row was seen: there is
  // no last_seen_at, no TTL and no generation time in the input at all
  assert.deepEqual(Object.keys(page()).sort(), ["destinationOk", "destinationReason", "isRedirect", "location", "noindex", "status"]);
});

// --- fixture 2: membership that may already have been stale ---------------

test("2. a later sitemap cannot upgrade the verdict in either direction", () => {
  // the classifier takes no later-membership input, so neither a segment
  // that drops the URL nor one that keeps it can turn this into a verdict
  const src = read("tests/seo/lib.mjs").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(src, /recheck/, "no later-membership input");
  assert.doesNotMatch(src, /generatedAt/, "no membership generation time");
  assert.doesNotMatch(src, /Age|membershipGeneratedAt/, "Date - Age is gone");
  assert.doesNotMatch(src, /TRANSITION|confirmed_transition/, "removal is not a confirmed transition");
  // and the only verdicts available are these three
  assert.deepEqual(Object.values(CLASSIFICATION).sort(), ["confirmed_contract_defect", "inconclusive", "ok"]);
});

test("2b. membership inclusion is RECORDED, whatever it was", () => {
  assert.match(classify({ noindex: true }, true).reason, /advertised=true/);
  assert.match(classify({ noindex: true }, false).reason, /advertised=false/);
  assert.equal(classify({ noindex: true }, false).advertised, false);
});

// --- fixture 3: transition timing unavailable ------------------------------

test("3. 404 and 410 get the same caution - the lifecycle produces them legitimately", () => {
  // an expired deal with no permanent card page 404s by design
  // (tests/scanner/deal-lifecycle-routes.test.mjs case 2c)
  for (const status of [404, 410]) {
    const v = classify({ status });
    assert.equal(v.kind, CLASSIFICATION.INCONCLUSIVE, `HTTP ${status}`);
    assert.match(v.reason, new RegExp(`HTTP ${status}`));
  }
});

test("3b. a valid redirect to a card page is INCONCLUSIVE, not a confirmed transition", () => {
  const v = classify({ status: 308, isRedirect: true, location: "/cards/clefable-jungle", destinationOk: true });
  assert.equal(v.kind, CLASSIFICATION.INCONCLUSIVE);
  assert.match(v.reason, /-> \/cards\/clefable-jungle/);
});

// --- unconditional failures need no chronology ----------------------------

test("4. an invalid redirect destination is a defect", () => {
  const v = classify({ status: 308, isRedirect: true, location: "/pokemon/gengar", destinationOk: false, destinationReason: "destination /pokemon/gengar is not a card page" });
  assert.equal(v.kind, CLASSIFICATION.DEFECT);
  assert.match(v.reason, /is not a card page/);
});

test("4b. a redirect chain or loop is a defect", () => {
  const v = classify({ status: 308, isRedirect: true, location: "/cards/a", destinationOk: false, destinationReason: "destination /cards/a itself redirects to /cards/b (chain or loop)" });
  assert.equal(v.kind, CLASSIFICATION.DEFECT);
  assert.match(v.reason, /chain or loop/);
});

test("5. a server error is a defect; client statuses the lifecycle produces are not", () => {
  for (const status of [500, 502, 503]) {
    assert.equal(classify({ status }).kind, CLASSIFICATION.DEFECT, `HTTP ${status}`);
  }
  for (const status of [404, 410]) {
    assert.equal(classify({ status }).kind, CLASSIFICATION.INCONCLUSIVE, `HTTP ${status}`);
  }
});

test("6. an indexable page is simply OK", () => {
  assert.equal(classify().kind, CLASSIFICATION.OK);
  assert.equal(classify().reason, null);
});

// --- what must stay, elsewhere --------------------------------------------

test("7. deterministic coverage is untouched: own-card redirects and controlled-data membership", () => {
  const offline = read("tests/scanner/deal-lifecycle-routes.test.mjs");
  assert.match(offline, /assert\.equal\(r\.nav\.href, "\/cards\/clefable-jungle"\)/);
  assert.match(offline, /assert\.equal\(r\.nav\.href, "\/cards\/snorlax-jungle"/);
  assert.match(offline, /assert\.equal\(r\.nav\.kind, "notFound", "never a homepage \/ index \/ species fallback"\)/);
  // controlled-data membership rules
  const substance = read("tests/scanner/sitemap-substance.test.mjs");
  assert.match(substance, /selectSitemapCards/);
  assert.match(substance, /a catalogue card that has never provably changed is NOT advertised/);
  // live malformed-URL check stays explicit
  assert.match(read("tests/seo/sitemap.test.mjs"), /malformed URLs in the deals segment/);
  // registry-matched news lastmod stays
  assert.match(read("tests/seo/crawl-hygiene.test.mjs"), /!= the registry's/);
});
