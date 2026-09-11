// Phase 17C.8 - the Latest Releases hub. The model is pure; the route is
// checked statically (it needs a DB + React to render).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  latestReleaseLineup,
  featuredRelease,
  featuredReleaseLine,
  HUB_SECTIONS,
  COVERAGE_NOTE,
  setHref,
  LATEST_RELEASED_COUNT,
} from "../../lib/latestReleases.js";
import { OFFICIAL_RELEASES } from "../../lib/pokemonSets.js";
import { NAV_PRIMARY } from "../../lib/navLinks.js";
import { EVENTS } from "../../lib/analytics/events.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p) => readFileSync(join(ROOT, p), "utf8");
const PAGE = src("app/latest-releases/page.js");
const BEFORE = "2026-09-12T12:00:00Z"; // 30th Celebration still upcoming
const AFTER = "2026-09-20T12:00:00Z";
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

test("H-1. the lineup is the officially dated releases: upcoming first, then the newest released", () => {
  const l = latestReleaseLineup(BEFORE);
  assert.deepEqual(l.upcoming.map((e) => e.set), ["ME: 30th Celebration"]);
  assert.deepEqual(l.released.map((e) => e.set), ["ME05: Pitch Black", "ME04: Chaos Rising", "ME03: Perfect Order", "ME: Ascended Heroes"]);
  assert.equal(l.released.length, LATEST_RELEASED_COUNT);
  assert.deepEqual(l.sets, [...l.upcoming, ...l.released].map((e) => e.set));
  for (const e of [...l.upcoming, ...l.released]) {
    const official = OFFICIAL_RELEASES.find((r) => r.set === e.set);
    assert.equal(e.officialName, official.officialName, `${e.set}: official name, not the catalogue label`);
    assert.ok(e.sources.length > 0, `${e.set}: keeps its official sources`);
  }
});

test("H-2. after release day the same set moves into the released list, by evidence of its own date", () => {
  const after = latestReleaseLineup(AFTER);
  assert.deepEqual(after.upcoming, []);
  assert.equal(after.released[0].set, "ME: 30th Celebration");
  assert.equal(after.released[0].status, "released");
});

test("H-3. the featured release leads with the confirmed date and never implies availability", () => {
  const f = featuredRelease(BEFORE);
  assert.equal(f.set, "ME: 30th Celebration");
  assert.equal(f.status, "upcoming");
  assert.equal(f.releaseDateText, "16 September");
  assert.equal(featuredReleaseLine(f), "Releases 16 September · listings appear here only once eBay confirms them");
  assert.equal(featuredReleaseLine(featuredRelease(AFTER)), "Released 16 September");
  assert.doesNotMatch(featuredReleaseLine(f), /in stock|available|buy now/i);
});

test("H-4. set links only ever point at an existing /sets page - the hub creates none", () => {
  assert.equal(setHref("ME: 30th Celebration", ["me-30th-celebration"], slugify), "/sets/me-30th-celebration");
  assert.equal(setHref("ME: 30th Celebration", [], slugify), null, "no page -> no link");
  assert.doesNotMatch(PAGE, /generateStaticParams|\[slug\]/, "the hub is one route, not a set-page generator");
  assert.match(PAGE, /href=\{setHref\(/);
});

test("H-5. sections carry honest empty states with real catalogue destinations", () => {
  assert.deepEqual(HUB_SECTIONS.map((s) => s.key), ["singles", "sealed", "graded"]);
  for (const s of HUB_SECTIONS) {
    assert.ok(s.empty.length > 0 && s.emptyHref.startsWith("/"), s.key);
    assert.match(s.empty, /No eligible/);
  }
  assert.match(COVERAGE_NOTE, /not every card, product or listing that exists/);
  assert.match(COVERAGE_NOTE, /no savings claim/);
  assert.match(PAGE, /\{COVERAGE_NOTE\}/);
});

test("H-6. the hub never ranks by discount and never sorts on savings", () => {
  // rendered code only - comments explaining the rule don't count
  const code = PAGE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  assert.doesNotMatch(code, /sort: "discount"/);
  assert.equal((code.match(/sort: "newest"/g) || []).length, 2, "singles + graded, newest first");
  assert.doesNotMatch(code, /discountPct|% below|dealScore/i, "no savings vocabulary rendered by the hub itself");
  // listings decide their own presentation (plain when unevidenced)
  assert.match(PAGE, /import DealCard from "@\/components\/DealCard"/);
  assert.match(PAGE, /import SealedDealCard from "@\/components\/SealedDealCard"/);
});

test("H-7. the route renders release status, so its cache stays inside the release-boundary bound", () => {
  assert.match(PAGE, /export const revalidate = (\d+);/);
  const secs = Number(PAGE.match(/export const revalidate = (\d+);/)[1]);
  assert.ok(secs > 0 && secs <= 3600, `revalidate ${secs}s must be <= RELEASE_STATUS_MAX_REVALIDATE`);
  assert.match(PAGE, /RELEASE_STATUS_MAX_REVALIDATE/, "the bound is referenced where it is set");
});

test("H-8. a visible navigation entry, shared by the desktop bar and the mobile menu", () => {
  const entry = NAV_PRIMARY.find((l) => l.href === "/latest-releases");
  assert.ok(entry, "NAV_PRIMARY carries the hub");
  assert.equal(entry.label, "Latest Releases");
  // both renderers read the same model, so one entry covers both
  assert.match(src("components/SiteHeader.js"), /NAV_PRIMARY\.map/);
  assert.match(src("components/NavMenu.js"), /NAV_PRIMARY\.map/);
});

test("H-9. PostHog: existing conventions only - section attributes, card analytics props, named events", () => {
  for (const s of ["latest_featured", "latest_lineup"]) {
    assert.match(PAGE, new RegExp(`data-analytics-section="${s}"`), s);
  }
  // the three listing groups render the attribute from their model
  assert.match(PAGE, /data-analytics-section=\{section\.analyticsSection\}/);
  assert.deepEqual(HUB_SECTIONS.map((s) => s.analyticsSection), ["latest_singles", "latest_sealed", "latest_graded"]);
  assert.match(PAGE, /analytics=\{\{ section: "latest_singles", rank: i \+ 1 \}\}/);
  assert.match(PAGE, /data-analytics-click="latest_releases_set_clicked"/);
  assert.match(PAGE, /data-analytics-click="latest_releases_empty_link_clicked"/);
  assert.equal(EVENTS.LATEST_RELEASES_SET_CLICKED, "latest_releases_set_clicked");
  assert.equal(EVENTS.LATEST_RELEASES_EMPTY_LINK_CLICKED, "latest_releases_empty_link_clicked");
  assert.equal(EVENTS.LATEST_RELEASES_CLICKED, "latest_releases_clicked");
});
