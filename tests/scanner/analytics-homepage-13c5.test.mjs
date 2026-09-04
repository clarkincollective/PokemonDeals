// Phase 13C.5 - homepage conversion-instrumentation integrity.
// Locks the contracts the audit verified / fixed so a future homepage
// change can't silently re-break the funnel.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { EVENTS, ALLOWED_EVENTS, HOMEPAGE_SECTIONS } from "../../lib/analytics/events.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
function walk(dir, out = []) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.jsx?$/.test(name)) out.push(rel);
  }
  return out;
}
const SRC = [...walk("app"), ...walk("components")];

// === every rendered click marker is a declared, allow-listed event ===
// This is the regression guard for the 13C.1 bug where the hero
// "Browse today's deals" CTA and "try a search:" examples shipped with
// data-analytics-click markers that were never added to events.js, so
// capture()'s allowlist + the before_send sanitiser dropped every one.

test("13C.5 - every literal data-analytics-click value is a declared event", () => {
  const bad = [];
  for (const f of SRC) {
    const src = read(f);
    for (const m of src.matchAll(/data-analytics-click="([a-z0-9_]+)"/g)) {
      if (!ALLOWED_EVENTS.has(m[1])) bad.push(`${f}: "${m[1]}"`);
    }
  }
  assert.deepEqual(bad, [], `data-analytics-click markers missing from lib/analytics/events.js:\n${bad.join("\n")}`);
});

test("13C.5 - the hero entry-path events are declared (Search vs Discover is measurable)", () => {
  assert.equal(EVENTS.DISCOVER_DEALS_CLICKED, "discover_deals_clicked");
  assert.equal(EVENTS.HERO_EXAMPLE_CLICKED, "hero_example_clicked");
  assert.ok(ALLOWED_EVENTS.has("discover_deals_clicked"));
  assert.ok(ALLOWED_EVENTS.has("hero_example_clicked"));
  // and they are actually wired on the homepage
  const page = read("app/page.js");
  assert.match(page, /data-analytics-click="discover_deals_clicked"/);
  assert.match(page, /data-analytics-click="hero_example_clicked"/);
});

// === lane click vs affiliate click must be disjoint ================

test("13C.5 - a click inside the affiliate CTA does NOT also fire the lane click", () => {
  const boot = read("components/analytics/AnalyticsBootstrap.js");
  // the guard: bail out of the data-analytics-deal lane-click branch when
  // the target is within a sponsored <a> (AffiliateLink fires its own
  // affiliate_click), so it comes BEFORE the capture(name, props) call.
  assert.match(boot, /if \(dealEl\) \{[\s\S]{0,900}closest\('a\[rel~="sponsored"\]'\)\)\s*return;/);
  const dealBranch = boot.slice(boot.indexOf("if (dealEl)"), boot.indexOf("if (dealEl)") + 1200);
  assert.ok(
    dealBranch.indexOf('rel~="sponsored"') < dealBranch.indexOf("capture(name, props)"),
    "the affiliate guard must run before the lane-click capture"
  );
});

// === All Deals affiliate attribution is not the bare "home" catch-all ==

test("13C.5 - the homepage All Deals grid tags its own origin_section", () => {
  const page = read("app/page.js");
  const grid = page.slice(page.indexOf('data-analytics-filter-bar="all_deals"'));
  assert.match(grid.slice(0, 1500), /<DealCard[^>]*pageName="home_all_deals"/);
  // the promo lanes keep their distinct pageNames
  assert.match(page, /pageName="home_best"/);
  assert.match(page, /pageName="home_ending"/);
  assert.match(page, /pageName="home_fresh"/);
});

// === returning-visitor lane impression (only when shown) ===========

test("13C.5 - CardMemoryStrip fires an impression only when it has content", () => {
  const strip = read("components/CardMemoryStrip.js");
  // returns null before rendering any DOM when empty
  assert.match(strip, /if \(!saved\.length && !recent\.length\) return null;/);
  // the section marker sits on the element that only exists when populated
  assert.match(strip, /<section\s+data-analytics-section="recently_viewed"/);
  assert.ok(HOMEPAGE_SECTIONS.includes("recently_viewed"));
});

// === impression semantics = viewport exposure, once ===============

test("13C.5 - impressions = real viewport exposure, once; tall sections aren't gated by an unreachable ratio", () => {
  const ha = read("components/analytics/HomepageAnalytics.js");
  assert.match(ha, /IntersectionObserver/);
  assert.match(ha, /entry\.isIntersecting/);
  // deal cards / filter bar: plain 0.4 area ratio (they're small)
  assert.match(ha, /entry\.intersectionRatio >= 0\.4/);
  // sections: viewport-relative check (a 2000px+ section can never reach
  // ratio 0.4 on a phone) - "half of min(section height, screen) visible"
  assert.match(ha, /intersectionRect\.height >=\s*0\.5 \* Math\.min\(/);
  // dense thresholds so the callback re-fires as a tall section scrolls in
  assert.match(ha, /threshold: \[0, 0\.1, 0\.2/);
  assert.match(ha, /makeOnceGate\(\)/); // one-shot
  assert.match(ha, /io\.unobserve\(el\)/); // stop after first
  assert.match(ha, /gate\.take\(`section:/);
  assert.match(ha, /gate\.take\(`deal:/);
});

test("13C.5 - scroll depth is percentage-based (13C.3's shorter page didn't change semantics)", () => {
  const obs = read("lib/analytics/observer.js");
  // bucket is derived from a 0..100 percentage of doc height, not raw px
  assert.match(obs, /\/ docH\) \* 100/);
  assert.match(obs, /if \(pct >= 75\) return 75;/);
});

// === privacy: no identity leaks in the homepage payloads ==========

test("13C.5 - deal-card + affiliate payloads carry no card identity / score / listing id", () => {
  for (const f of ["components/DealCard.js", "components/AffiliateLink.js"]) {
    const src = read(f);
    // the analytics payload objects must not forward these
    assert.ok(!/analyticsPayload[\s\S]{0,400}(card_name|pokemon|title|listing_id|item_id|ebay_id|affiliate_url|score)/i.test(src), `${f}: analytics payload leaks identity`);
  }
  const dc = read("components/DealCard.js");
  // the deal payload is structural enums + integer rank only
  assert.match(dc, /listing_type: listingTypeProp/);
  assert.match(dc, /rank: analytics\.rank \?\? rank \?\? undefined/);
  assert.ok(!/data-analytics-deal[\s\S]{0,200}name:/.test(dc));
});
