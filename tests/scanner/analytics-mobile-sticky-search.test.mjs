// Phase 13C.5.1 - MobileStickySearch joins the existing Search analytics
// contract (source:"sticky") so Search-vs-Discover isn't undercounted on
// mobile. Reuses hero_search_focus / search_started / search_submitted -
// no new event names, no new taxonomy.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { EVENTS, ALLOWED_EVENTS } from "../../lib/analytics/events.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const sticky = read("components/MobileStickySearch.js");
const hero = read("components/HeroSearch.js");

test("13C.5.1 - no new event names were added; all three are already allowlisted", () => {
  assert.equal(EVENTS.HERO_SEARCH_FOCUS, "hero_search_focus");
  assert.equal(EVENTS.SEARCH_STARTED, "search_started");
  assert.equal(EVENTS.SEARCH_SUBMITTED, "search_submitted");
  for (const e of [EVENTS.HERO_SEARCH_FOCUS, EVENTS.SEARCH_STARTED, EVENTS.SEARCH_SUBMITTED]) {
    assert.ok(ALLOWED_EVENTS.has(e));
  }
  // the sticky bar must not invent its own event family
  assert.ok(!/sticky_search_submitted|mobile_search_click|sticky_query/.test(sticky));
});

test("13C.5.1 - MobileStickySearch captures focus / started / submitted with source:\"sticky\"", () => {
  assert.match(sticky, /import \{ capture \} from "@\/lib\/analytics\/client"/);
  assert.match(sticky, /import \{ EVENTS \} from "@\/lib\/analytics\/events"/);
  assert.match(sticky, /capture\(EVENTS\.HERO_SEARCH_FOCUS, \{ source: "sticky" \}\)/);
  assert.match(sticky, /capture\(EVENTS\.SEARCH_STARTED, \{ source: "sticky" \}\)/);
  assert.match(sticky, /capture\(EVENTS\.SEARCH_SUBMITTED, \{ source: "sticky"/);
  // never "hero" anywhere in this file's capture calls
  assert.ok(!/capture\(EVENTS\.[A-Z_]+,\s*\{\s*source:\s*"hero"/.test(sticky), "sticky must never emit source:\"hero\"");
});

test("13C.5.1 - HeroSearch is unchanged: still source \"hero\", never \"sticky\"", () => {
  assert.match(hero, /capture\(EVENTS\.HERO_SEARCH_FOCUS, \{ source: "hero" \}\)/);
  assert.match(hero, /capture\(EVENTS\.SEARCH_STARTED, \{ source: "hero" \}\)/);
  assert.match(hero, /capture\(EVENTS\.SEARCH_SUBMITTED, \{ source: "hero", via/);
  assert.ok(!/capture\(EVENTS\.[A-Z_]+,\s*\{\s*source:\s*"sticky"/.test(hero), "HeroSearch must never emit source:\"sticky\"");
});

test("13C.5.1 - focus and started each fire at most once per mount (ref-guarded, resets only on clear)", () => {
  assert.match(sticky, /const focusedRef = useRef\(false\);/);
  assert.match(sticky, /const startedRef = useRef\(false\);/);
  assert.match(sticky, /if \(!focusedRef\.current\) \{\s*focusedRef\.current = true;/);
  assert.match(sticky, /v\.length >= 2 && !startedRef\.current/);
  assert.match(sticky, /else if \(v\.length === 0\) \{\s*startedRef\.current = false;/);
});

test("13C.5.1 - the input stays uncontrolled; onChange only classifies, it never drives state/value", () => {
  assert.ok(!/<input[^>]*\bvalue=\{/.test(sticky), "the sticky input must stay an uncontrolled DOM input");
});

test("13C.5.1 - no raw query, card, title, or other identity is ever sent", () => {
  // every capture() call in this file
  const calls = [...sticky.matchAll(/capture\(EVENTS\.[A-Z_]+,\s*\{([\s\S]*?)\}\)/g)].map((m) => m[1]);
  assert.ok(calls.length >= 3, "expected at least 3 capture() calls (focus/started/submitted)");
  for (const body of calls) {
    assert.ok(!/\bq\s*:|query\s*:|card|title|pokemon|set_name|collector/i.test(body), `capture payload looks identity-bearing: ${body}`);
  }
  // classifyQueryIntent is used for structural intent only, never a raw string literal
  assert.match(sticky, /\.\.\.classifyQueryIntent\(v\)/);
  assert.ok(!/capture\([^)]*\be\.target\.value\b[^)]*\)/.test(sticky), "must not pass the raw input value into capture()");
});

test("13C.5.1 - submit never blocks or delays native navigation (fail-open)", () => {
  // strip comments - check CODE, not prose describing what it doesn't do
  const code = sticky
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  assert.ok(!/preventDefault/.test(code), "MobileStickySearch must never preventDefault() the native form submit");
  // capture() is not awaited
  assert.ok(!/await\s+capture\(/.test(code));
  // the form keeps a plain native action - no client-side router.push replacing it
  assert.match(code, /<form action="\/search"/);
  assert.ok(!/router\.push/.test(code), "sticky search must stay a real native form submission, not client-side routing");
});

test("13C.5.1 - onSubmit is wired exactly once, on the form, not duplicated", () => {
  assert.equal((sticky.match(/onSubmit=\{onSubmit\}/g) ?? []).length, 1);
  assert.equal((sticky.match(/function onSubmit\(/g) ?? []).length, 1);
});

test("13C.5.1 - device_class is not hardcoded here; common props already carry it", () => {
  assert.ok(!/device_class\s*:/.test(sticky), "MobileStickySearch must not set device_class itself - AnalyticsBootstrap's common context already does");
});
