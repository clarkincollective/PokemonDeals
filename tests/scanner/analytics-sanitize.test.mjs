// Phase 13A - the "nothing sensitive leaves the browser" guards.

import { test } from "node:test";
import assert from "node:assert/strict";
import { stripUrlQuery, redactPII, sanitizeProps, buildBeforeSend } from "../../lib/analytics/sanitize.js";
import { EVENTS } from "../../lib/analytics/events.js";

test("stripUrlQuery removes search + hash, keeps origin + path", () => {
  assert.equal(
    stripUrlQuery("https://pokemondealfinder.com/search?q=my+secret+card#q=other"),
    "https://pokemondealfinder.com/search"
  );
  assert.equal(stripUrlQuery("/search?q=charizard"), "/search");
  assert.equal(stripUrlQuery(""), "");
  assert.equal(stripUrlQuery(null), null);
});

test("redactPII masks emails and caps length", () => {
  assert.equal(redactPII("contact bob@example.com now"), "contact [redacted-email] now");
  assert.equal(redactPII("x".repeat(500)).length, 200);
  assert.equal(redactPII(42), 42);
});

test("sanitizeProps drops forbidden keys and email values", () => {
  const out = sanitizeProps({
    section: "best_deals",
    rank: 2,
    email: "a@b.com",
    query: "charizard base set",
    q: "pikachu",
    search_term: "lugia",
    note: "user typed a@b.com here",
    listing_type: "AUCTION",
    nested: { a: 1 },
  });
  assert.deepEqual(Object.keys(out).sort(), ["listing_type", "rank", "section"].sort());
  assert.equal(out.section, "best_deals");
  assert.ok(!("email" in out));
  assert.ok(!("query" in out));
  assert.ok(!("q" in out));
  assert.ok(!("search_term" in out));
  assert.ok(!("note" in out)); // dropped: contained an email
  assert.ok(!("nested" in out)); // objects dropped
});

test("sanitizeProps is null-safe", () => {
  assert.deepEqual(sanitizeProps(null), {});
  assert.deepEqual(sanitizeProps(undefined), {});
  assert.deepEqual(sanitizeProps("nope"), {});
});

// ---- before_send ------------------------------------------------

const beforeSend = buildBeforeSend();
const run = (event) => beforeSend.reduce((e, fn) => (e == null ? e : fn(e)), event);

test("before_send strips query strings from url properties", () => {
  const out = run({
    event: EVENTS.HOMEPAGE_VIEW,
    properties: {
      $current_url: "https://pokemondealfinder.com/search?q=charizard",
      $referrer: "https://google.com/search?q=pokemon+cards",
      $pathname: "/search?q=x",
    },
  });
  assert.equal(out.properties.$current_url, "https://pokemondealfinder.com/search");
  assert.equal(out.properties.$referrer, "https://google.com/search");
  assert.equal(out.properties.$pathname, "/search");
});

test("before_send hard-drops a non-allowlisted custom event", () => {
  assert.equal(run({ event: "rogue_event", properties: {} }), null);
  assert.equal(run({ event: "keydown", properties: {} }), null);
});

test("before_send lets SDK-internal $ events through", () => {
  const out = run({ event: "$feature_flag_called", properties: {} });
  assert.ok(out);
});

test("before_send redacts email-looking property values and removes forbidden keys", () => {
  const out = run({
    event: EVENTS.SEARCH_REQUEST,
    properties: { note: "reach me at spy@example.com", query: "charizard", grader_token: "psa" },
  });
  assert.ok(!out.properties.note.includes("@example.com"));
  assert.ok(!("query" in out.properties));
  assert.equal(out.properties.grader_token, "psa");
});

test("before_send strips $set / $set_once (no person profiles)", () => {
  const out = run({ event: EVENTS.AFFILIATE_CLICK, properties: {}, $set: { a: 1 }, $set_once: { b: 2 } });
  assert.ok(!("$set" in out));
  assert.ok(!("$set_once" in out));
});

// 13A.3 regression: before_send MUST NOT delete or rewrite PostHog's own
// reserved properties. `token` is required for ingestion - if before_send
// removes it, posthog-js silently drops the whole event (no error,
// is_capturing() stays true, nothing hits the network). This is the exact
// shape posthog-js attaches to a real event.
test("before_send leaves PostHog reserved props ($*, token, distinct_id) untouched", () => {
  const out = run({
    event: EVENTS.HOMEPAGE_VIEW,
    properties: {
      token: "phc_realprojecttoken",
      distinct_id: "$posthog_cookieless",
      $lib: "web",
      $lib_version: "1.425.1",
      $current_url: "https://pokemondealfinder.com/?utm_source=tiktok",
      $device_id: "abc",
      $geoip_city_name: "Brisbane",
      $insert_id: "xyz",
      // our own structural props alongside
      variant: "promo",
      page: 1,
      listing_type: "AUCTION",
    },
  });
  assert.ok(out, "event must not be dropped");
  assert.equal(out.properties.token, "phc_realprojecttoken", "token must survive");
  assert.equal(out.properties.distinct_id, "$posthog_cookieless", "distinct_id must survive");
  assert.equal(out.properties.$lib, "web");
  assert.equal(out.properties.$device_id, "abc");
  assert.equal(out.properties.$geoip_city_name, "Brisbane");
  assert.equal(out.properties.$insert_id, "xyz");
  // $current_url still gets its querystring stripped (value replace, not delete)
  assert.equal(out.properties.$current_url, "https://pokemondealfinder.com/");
  // our own props still pass through
  assert.equal(out.properties.variant, "promo");
  assert.equal(out.properties.listing_type, "AUCTION");
});

test("before_send still deletes a forbidden key when it's one of OUR (non-reserved) props", () => {
  const out = run({
    event: EVENTS.SEARCH_REQUEST,
    properties: { token: "phc_keepme", email: "a@b.com", query: "pikachu", grader_token: "psa" },
  });
  assert.equal(out.properties.token, "phc_keepme", "reserved token kept");
  assert.ok(!("email" in out.properties), "our forbidden key removed");
  assert.ok(!("query" in out.properties), "our forbidden key removed");
  assert.equal(out.properties.grader_token, "psa");
});

test("before_send is null-safe", () => {
  assert.equal(run(null), null);
});
