// What a live sitemap observation can actually prove.
//
// The live suite samples /deals/<id> URLs out of the sitemap. When one of
// them is no longer indexable at fetch time, three different things may have
// happened, and they are NOT interchangeable:
//
//   1. the membership query advertised a URL it should already have excluded
//      -> a contract defect;
//   2. the listing sold, was held, was quarantined or aged out AFTER the
//      segment was generated -> correct behaviour;
//   3. neither can be established from what is available -> inconclusive,
//      which must be reported as such rather than counted either way.
//
// An earlier version decided this from the segment's <lastmod> and the
// freshness TTLs. That was unsound in four ways, each of which is pinned
// below: <lastmod> is last_seen_at and does not date the snapshot; a recent
// last_seen_at with a noindex page is explained by any later eligibility
// change; age past a TTL is equally consistent with membership that was
// already stale when the segment was built; and a redirect reaching a real
// card page does not show that card belongs to the listing.
//
// These fixtures drive the pure classifier offline - no server, no provider,
// no clock dependence beyond the instants the fixtures state themselves.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { classifyDealObservation, membershipGeneratedAt, CLASSIFICATION } from "../seo/lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const T = Date.parse("2026-09-16T12:00:00.000Z");
const min = (n) => n * 60_000;

const URL_ = "https://pokemondealfinder.com/deals/38471";
const indexable = (over = {}) => ({ status: 200, isRedirect: false, noindex: false, destinationOk: null, destinationReason: null, observedAt: T, ...over });
const noindex = (over = {}) => indexable({ noindex: true, ...over });
const redirect = (over = {}) => ({ status: 308, isRedirect: true, noindex: false, destinationOk: true, destinationReason: null, observedAt: T, ...over });

// --- fixture 1: a recent listing HELD after the snapshot -------------------

test("1. a listing held after the snapshot is a confirmed transition, never a defect", () => {
  // seen minutes ago, so no freshness tier explains it - an authenticity
  // hold landed after the segment was generated. The later membership,
  // generated after the observation, no longer advertises it.
  const v = classifyDealObservation({
    url: URL_,
    page: noindex(),
    snapshot: { generatedAt: T - min(4) },
    recheck: { generatedAt: T + min(2), advertised: false },
  });
  assert.equal(v.kind, CLASSIFICATION.TRANSITION);
  assert.match(v.reason, /left the indexable set after the snapshot/);
});

test("1b. the same observation with NO later membership is inconclusive, not a defect", () => {
  // this is the case the TTL rule used to call a defect
  const v = classifyDealObservation({ url: URL_, page: noindex(), snapshot: { generatedAt: T - min(4) }, recheck: null });
  assert.equal(v.kind, CLASSIFICATION.INCONCLUSIVE);
  assert.match(v.reason, /no later membership was read/);
  assert.match(v.reason, /neither a defect nor a pass/);
});

// --- fixture 2: membership already stale AT snapshot time -----------------

test("2. a membership generated AFTER the observation that still advertises it is a confirmed defect", () => {
  const v = classifyDealObservation({
    url: URL_,
    page: noindex(),
    snapshot: { generatedAt: T - min(10) },
    recheck: { generatedAt: T + min(3), advertised: true },
  });
  assert.equal(v.kind, CLASSIFICATION.DEFECT);
  assert.match(v.reason, /still advertises it/);
});

test("2b. an old last_seen_at does NOT by itself make it a defect", () => {
  // age past any TTL is equally consistent with a transition; without a
  // later membership the evidence does not close
  const v = classifyDealObservation({ url: URL_, page: noindex(), snapshot: { generatedAt: T - min(600) }, recheck: null });
  assert.equal(v.kind, CLASSIFICATION.INCONCLUSIVE);
});

// --- fixture 3: transition timing unavailable ------------------------------

test("3. a later membership with no usable cache metadata is inconclusive", () => {
  const v = classifyDealObservation({ url: URL_, page: noindex(), snapshot: { generatedAt: T - min(4) }, recheck: { generatedAt: null, advertised: true } });
  assert.equal(v.kind, CLASSIFICATION.INCONCLUSIVE);
  assert.match(v.reason, /no usable cache metadata/);
});

test("3b. a later membership that PREDATES the observation proves nothing", () => {
  // the cache had not turned over: it is the same generation the URL was
  // sampled from, so it cannot speak about a later transition
  const v = classifyDealObservation({ url: URL_, page: noindex(), snapshot: { generatedAt: T - min(4) }, recheck: { generatedAt: T - min(4), advertised: true } });
  assert.equal(v.kind, CLASSIFICATION.INCONCLUSIVE);
  assert.match(v.reason, /predates the observation/);
});

// --- unconditional failures stay unconditional -----------------------------

test("4. an invalid redirect destination is a defect whatever the timing", () => {
  for (const recheck of [null, { generatedAt: T + min(5), advertised: false }]) {
    const v = classifyDealObservation({
      url: URL_,
      page: redirect({ destinationOk: false, destinationReason: "destination /pokemon/gengar is not a card page" }),
      snapshot: { generatedAt: T - min(4) },
      recheck,
    });
    assert.equal(v.kind, CLASSIFICATION.DEFECT, JSON.stringify(recheck));
    assert.match(v.reason, /is not a card page/);
  }
});

test("5. an unexpected status is a defect whatever the timing", () => {
  for (const status of [404, 410, 500, 503]) {
    const v = classifyDealObservation({ url: URL_, page: indexable({ status, noindex: false }), recheck: { generatedAt: T + min(5), advertised: false } });
    assert.equal(v.kind, CLASSIFICATION.DEFECT, `HTTP ${status}`);
    assert.match(v.reason, new RegExp(`HTTP ${status}`));
  }
});

test("6. a valid redirect is never OK by default - it needs the same evidence", () => {
  const unproven = classifyDealObservation({ url: URL_, page: redirect(), snapshot: { generatedAt: T - min(4) }, recheck: null });
  assert.equal(unproven.kind, CLASSIFICATION.INCONCLUSIVE, "a resolving card page does not prove the listing retired after the snapshot");
  const proven = classifyDealObservation({ url: URL_, page: redirect(), snapshot: { generatedAt: T - min(4) }, recheck: { generatedAt: T + min(2), advertised: false } });
  assert.equal(proven.kind, CLASSIFICATION.TRANSITION);
  const wrong = classifyDealObservation({ url: URL_, page: redirect(), snapshot: { generatedAt: T - min(4) }, recheck: { generatedAt: T + min(2), advertised: true } });
  assert.equal(wrong.kind, CLASSIFICATION.DEFECT);
});

test("7. an indexable page is simply OK", () => {
  assert.equal(classifyDealObservation({ url: URL_, page: indexable(), recheck: null }).kind, CLASSIFICATION.OK);
});

// --- dating a membership from cache metadata -------------------------------

test("8. membershipGeneratedAt subtracts Age from Date, and tolerates a missing Age", () => {
  const headers = (o) => ({ get: (k) => o[k.toLowerCase()] ?? null });
  const date = "Wed, 16 Sep 2026 12:00:00 GMT";
  assert.equal(membershipGeneratedAt(headers({ date, age: "120" })), Date.parse(date) - 120_000);
  assert.equal(membershipGeneratedAt(headers({ date })), Date.parse(date), "no Age: generated for this request");
  assert.equal(membershipGeneratedAt(headers({ date, age: "not-a-number" })), Date.parse(date));
  const received = Date.parse("2026-09-16T12:00:05.000Z");
  assert.equal(membershipGeneratedAt(headers({}), received), received, "no Date header: fall back to receipt");
  assert.equal(membershipGeneratedAt(headers({ date: "nonsense" })), null, "an unparseable Date proves nothing");
});

// --- the unsound signals are gone -----------------------------------------

test("9. the live classifier no longer reasons from last_seen_at or a TTL", () => {
  const src = read("tests/seo/lib.mjs").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(src, /FRESHNESS_TTL_HOURS/, "TTL-based inference is gone");
  assert.doesNotMatch(src, /lastmodByPath/, "lastmod is no longer used to date a snapshot");
  assert.doesNotMatch(src, /hoursSince/, "no age arithmetic decides a verdict");
  assert.match(src, /membershipGeneratedAt/, "generation time comes from cache metadata");
  // and the own-card assertion stays where the row is actually known
  const offline = read("tests/scanner/deal-lifecycle-routes.test.mjs");
  assert.match(offline, /assert\.equal\(r\.nav\.href, "\/cards\/clefable-jungle"\)/);
  assert.match(offline, /assert\.equal\(r\.nav\.href, "\/cards\/snorlax-jungle"/);
});
