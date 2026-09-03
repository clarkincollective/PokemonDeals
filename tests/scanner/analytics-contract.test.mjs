// Phase 13A - the analytics event + configuration contract.
//
// Locks:
//   * event names are stable, unique, snake_case, and the allowlist
//     matches the declared set
//   * the PostHog config is the cookieless / EU / no-profile posture the
//     phase brief mandates - and is NOT localStorage/cookie persistence
//   * nothing calls posthog.capture() / identify() / alias() outside
//     lib/analytics/, and posthog-js is only imported from the client
//     singleton

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { EVENTS, ALLOWED_EVENTS, QUALIFIED_ACTION_EVENTS, SECTION_CLICK_EVENT } from "../../lib/analytics/events.js";
import { buildPostHogConfig, getPosthogHost, POSTHOG_EU_API_HOST, ANALYTICS_VERSION } from "../../lib/analytics/config.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function walk(dir, out = []) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.jsx?$/.test(name)) out.push(rel);
  }
  return out;
}
const APP_FILES = [...walk("app"), ...walk("components"), ...walk("lib")];

// === 1. event taxonomy ============================================

test("event names are unique, snake_case, and non-empty", () => {
  const values = Object.values(EVENTS);
  assert.equal(new Set(values).size, values.length, "duplicate event name");
  for (const v of values) {
    assert.match(v, /^[a-z][a-z0-9_]*[a-z0-9]$/, `not snake_case: ${v}`);
  }
});

test("ALLOWED_EVENTS is exactly the declared EVENTS set", () => {
  assert.deepEqual([...ALLOWED_EVENTS].sort(), Object.values(EVENTS).sort());
});

test("the taxonomy still contains every event the brief names", () => {
  const required = [
    "homepage_view",
    "hero_search_focus",
    "search_started",
    "search_request",
    "search_results_shown",
    "search_no_result",
    "search_result_clicked",
    "start_here_clicked",
    "best_deal_clicked",
    "ending_soon_clicked",
    "just_added_clicked",
    "most_active_clicked",
    "browse_catalogue_clicked",
    "browse_sets_clicked",
    "browse_pokemon_clicked",
    "graded_clicked",
    "filter_opened",
    "filter_applied",
    "filter_cleared",
    "sort_changed",
    "country_changed",
    "card_viewed_from_home",
    "deal_viewed_from_home",
    "affiliate_click",
    // impression additions the brief calls "critical"
    "homepage_section_impression",
    "deal_card_impression",
    "filter_bar_impression",
  ];
  const have = new Set(Object.values(EVENTS));
  for (const r of required) assert.ok(have.has(r), `missing event: ${r}`);
});

test("qualified-action events are a subset of the taxonomy", () => {
  for (const e of QUALIFIED_ACTION_EVENTS) assert.ok(ALLOWED_EVENTS.has(e));
});

test("every homepage lane has a click event mapping", () => {
  for (const s of ["best_deals", "ending_soon", "just_added", "most_active"]) {
    assert.ok(ALLOWED_EVENTS.has(SECTION_CLICK_EVENT[s]), `no click event for ${s}`);
  }
});

// === 2. PostHog configuration posture ============================

test("PostHog config is cookieless / EU / no-profile", () => {
  const cfg = buildPostHogConfig({ beforeSend: [] });
  assert.equal(cfg.cookieless_mode, "always");
  assert.equal(cfg.person_profiles, "never");
  assert.equal(cfg.persistence, "memory");
  assert.equal(cfg.autocapture, false);
  assert.equal(cfg.capture_pageview, false);
  assert.equal(cfg.capture_pageleave, false);
  assert.equal(cfg.disable_session_recording, true);
  assert.equal(cfg.disable_surveys, true);
  assert.equal(cfg.respect_dnt, true);
  assert.equal(cfg.disable_external_dependency_loading, true);
  assert.ok(Array.isArray(cfg.before_send));
});

test("PostHog host is always an EU endpoint", () => {
  assert.equal(getPosthogHost(), POSTHOG_EU_API_HOST); // no env override in tests
  const cfg = buildPostHogConfig({});
  assert.match(cfg.api_host, /eu\.i\.posthog\.com/);
  assert.match(cfg.ui_host, /eu\.posthog\.com/);
});

test("config source never mentions localStorage/cookie persistence", () => {
  const src = read("lib/analytics/config.js");
  assert.doesNotMatch(src, /persistence:\s*["'](localStorage|cookie|localStorage\+cookie|sessionStorage)["']/);
});

test("analytics_version is set and stable-looking", () => {
  assert.match(ANALYTICS_VERSION, /^13A\./);
});

// === 3. no rogue PostHog usage ==================================

test("posthog-js is imported only by the analytics client singleton", () => {
  const offenders = [];
  for (const f of APP_FILES) {
    if (f === "lib/analytics/client.js") continue;
    const src = stripComments(read(f));
    if (/from\s+["']posthog-js["']|require\(\s*["']posthog-js["']\s*\)/.test(src)) offenders.push(f);
  }
  assert.deepEqual(offenders, [], `import posthog-js directly: ${offenders.join(", ")}`);
});

test("no identify() / alias() / group() calls anywhere (anonymous only)", () => {
  const offenders = [];
  for (const f of APP_FILES) {
    const src = stripComments(read(f));
    if (/\bposthog\s*\.\s*(identify|alias|group)\s*\(/.test(src)) offenders.push(f);
  }
  assert.deepEqual(offenders, []);
});

test("capture() calls outside lib/analytics/ go through the helper, never posthog.capture()", () => {
  const offenders = [];
  for (const f of APP_FILES) {
    if (f.startsWith("lib/analytics/")) continue;
    const src = stripComments(read(f));
    if (/\bposthog\s*\.\s*capture\s*\(/.test(src)) offenders.push(f);
  }
  assert.deepEqual(offenders, []);
});
