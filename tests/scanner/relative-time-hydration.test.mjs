// RELATIVE-TIME HYDRATION (2026-09-11). "found Yesterday" / "ends 3h left"
// / the "Just found" badge were computed from the machine clock on both
// sides of the wire: the server (UTC) and then the viewer's browser (their
// zone, minutes later on a cached page) - React error #418 on /search and
// the /deals/* grids. The fix (components/RenderClock.js +
// components/RelativeTime.js) renders the hydration pass from the SERVER's
// clock on the UTC calendar and only then swaps to the viewer's wording.
//
// These tests pin the pure contract deterministically - the same inputs
// under TZ=UTC, Australia/Brisbane and America/New_York - including the
// day-boundary cases that produced the mismatch, plus the "cached HTML
// aged" case. The real hydration is exercised against a production build
// with Chrome timezone emulation (see the deploy notes); no network here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const { timeAgo, timeUntil, isWithin } = require(join(REPO, "lib", "time.js"));
const read = (p) => readFileSync(join(REPO, p), "utf8");
// Source with // and {/* */} comments stripped - the fix is *documented* as
// "not suppressHydrationWarning", so the word legitimately appears in prose.
const code = (p) => read(p).replace(/\/\/[^\n]*/g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const ZONES = ["UTC", "Australia/Brisbane", "America/New_York"];

// Server clock for the fixtures: 06:26Z on 11 Sep 2026 (16:26 Brisbane,
// 02:26 New York) - the moment the production mismatch was measured.
const SERVER_NOW = Date.parse("2026-09-11T06:26:00Z");
const FIXTURES = [
  // then                      UTC calendar wording   why it matters
  ["2026-09-10T20:30:00Z", "Yesterday"], // Brisbane: already 11 Sep -> "Today" locally
  ["2026-09-11T01:00:00Z", "Today"], // New York: still 10 Sep -> "Yesterday" locally
  ["2026-09-10T13:00:00Z", "Yesterday"], // Brisbane: 10 Sep 23:00 -> "Yesterday" both
  ["2026-09-09T23:30:00Z", "1d ago"], // 31h ago, two UTC calendar days back
  ["2026-09-11T05:00:00Z", "1h ago"], // inside the 3h precise window
  ["2026-09-11T06:25:30Z", "just now"],
  ["2026-09-01T06:00:00Z", "10d ago"],
];

// Run a snippet in a child node with a forced zone and return its stdout.
function inZone(tz, code) {
  return execFileSync(process.execPath, ["-e", code], { env: { ...process.env, TZ: tz }, encoding: "utf8" }).trim();
}
const timeLib = JSON.stringify(join(REPO, "lib", "time.js"));

test("1. server snapshot (pinned clock, UTC calendar) is byte-identical across viewer zones, and matches what the server itself renders", () => {
  const expected = FIXTURES.map(([, w]) => w);
  for (const tz of ZONES) {
    const out = inZone(
      tz,
      `const { timeAgo } = require(${timeLib});
       console.log(JSON.stringify(${JSON.stringify(FIXTURES.map(([d]) => d))}.map((d) => timeAgo(d, { now: ${SERVER_NOW}, utc: true }))));`,
    );
    assert.deepEqual(JSON.parse(out), expected, `TZ=${tz}`);
  }
});

test("2. the day-boundary cases really differ on the local calendar (the test is not vacuous) - and the local wording is what the viewer gets after hydration", () => {
  const brisbane = JSON.parse(inZone("Australia/Brisbane", `const { timeAgo } = require(${timeLib}); console.log(JSON.stringify(${JSON.stringify(FIXTURES.map(([d]) => d))}.map((d) => timeAgo(d, { now: ${SERVER_NOW} }))));`));
  const newYork = JSON.parse(inZone("America/New_York", `const { timeAgo } = require(${timeLib}); console.log(JSON.stringify(${JSON.stringify(FIXTURES.map(([d]) => d))}.map((d) => timeAgo(d, { now: ${SERVER_NOW} }))));`));
  assert.equal(brisbane[0], "Today", "20:30Z is already the next day in Brisbane");
  assert.equal(newYork[0], "Yesterday");
  assert.equal(newYork[1], "Yesterday", "01:00Z is still the previous day in New York");
  assert.equal(brisbane[1], "Today");
  // Everything inside the precise (<3h) window is zone-independent.
  for (const i of [4, 5]) { assert.equal(brisbane[i], FIXTURES[i][1]); assert.equal(newYork[i], FIXTURES[i][1]); }
});

test("3. default call is unchanged: timeAgo(d) === timeAgo(d, { now: Date.now() }) on the local calendar; timeUntil/isWithin likewise", () => {
  const d = new Date(Date.now() - 5 * 3600 * 1000).toISOString();
  assert.equal(timeAgo(d), timeAgo(d, { now: Date.now() }));
  assert.equal(timeAgo(d), timeAgo(d, { utc: false }));
  const end = new Date(Date.now() + 5 * 3600 * 1000).toISOString();
  assert.equal(timeUntil(end), timeUntil(end, { now: Date.now() }));
  assert.equal(timeUntil(end), "5h left");
  assert.equal(isWithin(d, 6 * 3600 * 1000), true);
  assert.equal(isWithin(d, 6 * 3600 * 1000, { now: Date.now() }), true);
  assert.equal(isWithin(d, 4 * 3600 * 1000, { now: Date.now() }), false);
  assert.equal(isWithin(null, 1000), false);
});

test("4. cached-HTML ageing: the server snapshot reproduces the stale HTML wording exactly; the client snapshot moves on honestly", () => {
  // Page rendered at T, served from the ISR cache and hydrated 26h later.
  const T = SERVER_NOW;
  const later = T + 26 * 3600 * 1000;
  const found = "2026-09-11T06:00:00Z"; // 26 min before render
  const ends = "2026-09-11T07:09:00Z"; // 43 min after render
  assert.equal(timeAgo(found, { now: T, utc: true }), "26 min ago", "what the cached HTML says");
  assert.equal(timeAgo(found, { now: later, utc: true }), "Yesterday", "what the viewer is told after hydration");
  assert.equal(timeUntil(ends, { now: T }), "43m left");
  assert.equal(timeUntil(ends, { now: later }), "ending soon");
  assert.equal(isWithin(found, 2 * 3600 * 1000, { now: T }), true, "'Just found' in the HTML");
  assert.equal(isWithin(found, 2 * 3600 * 1000, { now: later }), false, "badge dropped after hydration");
  // Same numbers whatever zone the viewer is in - the server snapshot is a pure function of (date, now).
  for (const tz of ZONES) {
    const out = inZone(tz, `const t = require(${timeLib}); console.log([t.timeAgo(${JSON.stringify(found)}, { now: ${T}, utc: true }), t.timeUntil(${JSON.stringify(ends)}, { now: ${T} }), t.isWithin(${JSON.stringify(found)}, 7200000, { now: ${T} })].join("|"))`);
    assert.equal(out, "26 min ago|43m left|true", `TZ=${tz}`);
  }
});

test("5. UTC 'Yesterday' crosses month and year edges correctly", () => {
  for (const tz of ZONES) {
    const out = inZone(tz, `const { timeAgo } = require(${timeLib});
      console.log([
        timeAgo("2026-08-31T22:00:00Z", { now: Date.parse("2026-09-01T10:00:00Z"), utc: true }),
        timeAgo("2025-12-31T23:30:00Z", { now: Date.parse("2026-01-01T09:00:00Z"), utc: true }),
        timeAgo("2026-01-01T00:30:00Z", { now: Date.parse("2026-01-01T09:00:00Z"), utc: true }),
      ].join("|"))`);
    assert.equal(out, "Yesterday|Yesterday|Today", `TZ=${tz}`);
  }
});

test("6. static: the cards render timestamps through <RelativeTime>, the layout provides the render clock, and suppressHydrationWarning is not the fix", () => {
  const dealCard = code("components/DealCard.js");
  const sealed = code("components/SealedDealCard.js");
  for (const [name, src] of [["DealCard", dealCard], ["SealedDealCard", sealed]]) {
    assert.doesNotMatch(src, /\b(timeAgo|timeUntil|isWithin)\(/, `${name} must not call the clock directly`);
    assert.match(src, /import RelativeTime.* from "@\/components\/RelativeTime"/, `${name} imports RelativeTime`);
    assert.match(src, /<RelativeTime date=\{deal\.first_seen_at\} \/>/, `${name}: found <RelativeTime>`);
    assert.match(src, /<RelativeTime date=\{deal\.auction_end_at\} mode="until" \/>/, `${name}: auction end via RelativeTime`);
    assert.doesNotMatch(src, /suppressHydrationWarning/, `${name}: no suppressHydrationWarning`);
  }
  assert.match(dealCard, /<WithinWindow date=\{deal\.first_seen_at\} withinMs=\{JUST_FOUND_MS\}>/, "Just-found badge on the same clock");

  const rt = code("components/RelativeTime.js");
  assert.match(rt, /^\s*"use client"/m);
  assert.doesNotMatch(rt, /suppressHydrationWarning/);
  assert.match(rt, /useClockValue\(/);

  const clock = code("components/RenderClock.js");
  assert.match(clock, /^\s*"use client"/m);
  assert.match(clock, /useSyncExternalStore\(subscribe, getSnapshot, getServerSnapshot\)/, "server snapshot for SSR + hydration, client snapshot after");
  assert.match(clock, /compute\(serverNow, \{ utc: true \}\)/, "server snapshot = server clock on the UTC calendar");
  assert.match(clock, /compute\(t, \{ utc: false \}\)/, "client snapshot = viewer clock on the local calendar");
  assert.doesNotMatch(clock, /suppressHydrationWarning/);
  // browser-safe: nothing but react + lib/time
  for (const m of rt.matchAll(/from "([^"]+)"/g)) assert.ok(["@/components/RenderClock", "@/lib/time"].includes(m[1]), `RelativeTime import: ${m[1]}`);
  for (const m of clock.matchAll(/from "([^"]+)"/g)) assert.equal(m[1], "react", `RenderClock import: ${m[1]}`);

  const layout = code("app/layout.js");
  assert.match(layout, /<RenderClockProvider now=\{Date\.now\(\)\}>[\s\S]*<CurrencyProvider>[\s\S]*<\/CurrencyProvider>\s*<\/RenderClockProvider>/, "clock captured once per server render, above every page");

  // nowhere in the app is the warning suppressed to paper over a clock
  // (git grep exits 1 on no match - that's the pass case)
  let grep = "";
  try { grep = execFileSync("git", ["grep", "-n", "suppressHydrationWarning", "--", "app", "components"], { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch (e) { grep = e.stdout ?? ""; }
  const suppressed = grep.trim().split("\n").filter((l) => l && !/^[^:]+:\d+:\s*(\/\/|\*|\{\/\*)/.test(l));
  assert.deepEqual(suppressed, [], `suppressHydrationWarning found in: ${suppressed.join(", ")}`);
});

test("7. static: server-only pages that print timeAgo() directly are not client boundaries (no hydration pass, nothing to mismatch)", () => {
  // RelativeTime is the one client module allowed to call the helpers - it
  // routes them through the render clock (checked in test 6).
  const direct = execFileSync("git", ["grep", "-l", "timeAgo(", "--", "app", "components"], { cwd: REPO, encoding: "utf8" })
    .trim().split("\n").filter((f) => f && f !== "components/RelativeTime.js");
  for (const f of direct) {
    const src = read(f);
    assert.doesNotMatch(src, /^\s*"use client"/m, `${f} calls timeAgo() directly but is a client module`);
  }
  assert.ok(direct.length >= 3, "the server-only pages still use the plain helper");
});
