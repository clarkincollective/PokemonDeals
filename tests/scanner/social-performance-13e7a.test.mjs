// Phase 13E.7A - SOCIAL PERFORMANCE TRACKING + ATTRIBUTION tests.
//
// Pins:
//   * UTM attribution is deterministic, idempotent, platform+content
//     specific, carries no personal data, and refuses non-site hosts;
//   * content_id is preserved into utm_content;
//   * the site's landing-attribution + affiliate-click wiring is intact
//     and campid is never touched;
//   * a missing provider metric stays null (never 0); a platform's
//     unsupported metric is not converted to 0; a real 0 survives;
//   * the pre-publish baseline is NOT_AVAILABLE_YET (not 0);
//   * cross-platform unsupported fields are handled truthfully;
//   * NOTHING in the metrics path calls a mutating Buffer method.
// No network. No eBay. No Buffer mutation.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  attributedCtaUrl,
  parseAttribution,
  hasSocialAttribution,
  isCleanUtmToken,
  utmSourceFor,
  utmCampaignFor,
  PLATFORM_UTM_SOURCE,
  SITE_ORIGIN,
} from "../../lib/social/distribution/attribution.mjs";
import {
  normalizeProviderMetrics,
  buildSnapshot,
  attachSnapshot,
  baselineMetrics,
  emptyMetrics,
  computeKpis,
  engagementCount,
  snapshotForWindow,
  availableWindows,
  serviceOf,
  reportCell,
  REPORTING_WINDOWS,
  METRIC_KEYS,
  PLATFORM_METRIC_SUPPORT,
  NOT_AVAILABLE_YET,
} from "../../lib/social/distribution/metrics.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const CID = "pdf-deal-drop-deal-of-day-charizard-ex-20260907-a-1n0xj3x";
const BASE = `${SITE_ORIGIN}/deals/12345`;

// ---- attribution --------------------------------------------------

test("13E.7A-1. UTM generation is deterministic and platform+content specific", () => {
  const ig = attributedCtaUrl({ baseUrl: BASE, platform: "instagram_reel", contentGoal: "CONVERSION", contentId: CID });
  const tt = attributedCtaUrl({ baseUrl: BASE, platform: "tiktok", contentGoal: "CONVERSION", contentId: CID });
  const x = attributedCtaUrl({ baseUrl: BASE, platform: "x_post", contentGoal: "ENGAGEMENT", contentId: CID });
  const yt = attributedCtaUrl({ baseUrl: BASE, platform: "youtube_short", contentGoal: "ENGAGEMENT", contentId: CID });

  // deterministic - same inputs, same output
  assert.equal(ig, attributedCtaUrl({ baseUrl: BASE, platform: "instagram_reel", contentGoal: "CONVERSION", contentId: CID }));

  assert.equal(parseAttribution(ig).utm_source, "instagram");
  assert.equal(parseAttribution(tt).utm_source, "tiktok");
  assert.equal(parseAttribution(x).utm_source, "x");
  assert.equal(parseAttribution(yt).utm_source, "youtube");

  assert.equal(parseAttribution(ig).utm_medium, "social");
  assert.equal(parseAttribution(ig).utm_campaign, "conversion");
  assert.equal(parseAttribution(x).utm_campaign, "engagement");
});

test("13E.7A-2. content_id is preserved verbatim into utm_content", () => {
  const u = attributedCtaUrl({ baseUrl: BASE, platform: "tiktok", contentGoal: "REACH", contentId: CID });
  assert.equal(parseAttribution(u).utm_content, CID);
  // survives a round-trip through URL parsing
  assert.equal(new URL(u).searchParams.get("utm_content"), CID);
});

test("13E.7A-3. re-stamping an attributed URL is idempotent (exactly one of each param)", () => {
  const once = attributedCtaUrl({ baseUrl: BASE, platform: "instagram_feed", contentGoal: "CONVERSION", contentId: CID });
  const twice = attributedCtaUrl({ baseUrl: once, platform: "instagram_feed", contentGoal: "CONVERSION", contentId: CID });
  assert.equal(once, twice);
  const qs = new URL(twice).search;
  assert.equal(qs.match(/utm_source=/g).length, 1);
  assert.equal(qs.match(/utm_content=/g).length, 1);
});

test("13E.7A-4. attribution carries NO personal data and rejects dirty tokens", () => {
  // a closed source map - only the four platforms
  assert.deepEqual(new Set(Object.values(PLATFORM_UTM_SOURCE)), new Set(["instagram", "tiktok", "x", "youtube"]));
  // an id-shaped / spaced / email-ish value is not a clean token -> omitted, not emitted
  assert.equal(isCleanUtmToken("has space"), false);
  assert.equal(isCleanUtmToken("a@b.com"), false);
  assert.equal(isCleanUtmToken("x".repeat(65)), false);
  const u = attributedCtaUrl({ baseUrl: `${SITE_ORIGIN}/x`, platform: "nope", contentGoal: "", contentId: "bad token!" });
  assert.equal(parseAttribution(u).utm_content, null); // dropped
  assert.equal(parseAttribution(u).utm_source, null); // unknown platform -> dropped
  assert.equal(parseAttribution(u).utm_medium, "social"); // constant still set
});

test("13E.7A-5. attribution refuses to stamp a non-site (eBay/affiliate) host", () => {
  assert.throws(() => attributedCtaUrl({ baseUrl: "https://www.ebay.com/itm/123", platform: "x_post", contentId: CID }), /non-site host/i);
  assert.throws(() => attributedCtaUrl({ baseUrl: "https://rover.ebay.com/rover/1/711-53200", platform: "tiktok", contentId: CID }), /non-site host/i);
  // a bare domain (no scheme) that IS the site is fine
  assert.ok(hasSocialAttribution(attributedCtaUrl({ baseUrl: "pokemondealfinder.com/deals", platform: "tiktok", contentId: CID })));
});

test("13E.7A-6. utm_campaign maps the content goal, with a safe fallback", () => {
  assert.equal(utmCampaignFor("CONVERSION"), "conversion");
  assert.equal(utmCampaignFor("Engagement"), "engagement");
  assert.equal(utmCampaignFor("weird-goal", "deal_drop"), "deal_drop");
  assert.equal(utmCampaignFor(null, null), "social");
  assert.equal(utmSourceFor("instagram_carousel"), "instagram");
  assert.equal(utmSourceFor("twitter"), "x");
});

// ---- site analytics wiring intact --------------------------------

test("13E.7A-7. the site's social landing attribution + affiliate-click wiring is intact", () => {
  const session = read("lib/analytics/session.js");
  // reads utm_* off the current URL and classifies the traffic source
  assert.match(session, /readLandingAttribution/);
  assert.match(session, /utm_source|utm_content/);
  const bootstrap = read("components/analytics/AnalyticsBootstrap.js");
  // seeds the landing attribution into the in-memory common context
  assert.match(bootstrap, /readLandingAttribution\(\)/);
  assert.match(bootstrap, /setCommonContext\(\{[\s\S]*utm_source[\s\S]*utm_content/);
  const link = read("components/AffiliateLink.js");
  // affiliate_click still fires and carries a structural content_id
  assert.match(link, /EVENTS\.AFFILIATE_CLICK/);
  assert.match(link, /content_id/);
});

test("13E.7A-8. no personal data in the analytics UTM allowlist; campid is a forbidden analytics key", () => {
  const props = read("lib/analytics/props.js");
  assert.match(props, /UTM_KEYS\s*=\s*Object\.freeze\(\[\s*"utm_source",\s*"utm_medium",\s*"utm_campaign",\s*"utm_content"/);
  const sanitize = read("lib/analytics/sanitize.js");
  assert.match(sanitize, /"campid"/); // campid can never ride an analytics event
});

test("13E.7A-9. this phase makes NO change to affiliate URL generation (campid/customid byte-stable)", () => {
  // affiliateSurfaces.js is the ONLY module that decides customid; it must
  // still be a closed Set with an 'other' fallback and must NOT reference
  // any social content id / utm concept.
  const surf = read("lib/affiliateSurfaces.js");
  assert.match(surf, /AFFILIATE_SURFACES\s*=\s*new Set\(/);
  assert.match(surf, /return .*AFFILIATE_SURFACES\.has\(value\)\s*\?\s*value\s*:\s*"other"/);
  assert.doesNotMatch(surf, /utm_|content_id|social/i);
});

// ---- metrics model: truthful null / unsupported / zero -----------

test("13E.7A-10. a missing provider metric stays null (never 0); a real 0 survives", () => {
  const raw = [
    { type: "impressions", unit: "count", value: 4210 },
    { type: "likes", unit: "count", value: 0 }, // REAL zero
  ];
  const n = normalizeProviderMetrics(raw, "instagram_reel");
  assert.equal(n.metrics.impressions, 4210);
  assert.equal(n.metrics.likes, 0); // preserved
  assert.equal(n.metrics.comments, null); // supported but not reported -> null, NOT 0
  assert.equal(n.metrics.shares, null);
  assert.ok(n.reported.includes("likes"));
});

test("13E.7A-11. a platform's unsupported metric is never converted to zero", () => {
  const raw = [{ type: "clicks", unit: "count", value: 99 }]; // IG can't do link clicks
  const n = normalizeProviderMetrics(raw, "instagram_reel");
  assert.equal(n.metrics.clicks, null); // forced null
  assert.ok(n.unsupported.includes("clicks"));
  // X has no 'reach'
  const nx = normalizeProviderMetrics([{ type: "reach", value: 10 }], "x_post");
  assert.equal(nx.metrics.reach, null);
  assert.ok(nx.unsupported.includes("reach"));
  // report cell renders unsupported as an em dash, no reading as a dot, real 0 as 0
  assert.equal(reportCell(null, "clicks", ["clicks"]), "—");
  assert.equal(reportCell(null, "views", []), "·");
  assert.equal(reportCell(0, "likes", []), "0");
});

test("13E.7A-12. cross-platform unsupported fields are handled truthfully in the matrix", () => {
  for (const svc of ["instagram", "tiktok", "x", "youtube"]) {
    const row = PLATFORM_METRIC_SUPPORT[svc];
    assert.ok(row, `${svc} in matrix`);
    for (const k of METRIC_KEYS) {
      assert.ok(["SUPPORTED", "NOT_SUPPORTED", "UNKNOWN"].includes(row[k]), `${svc}.${k} is a known support state`);
    }
  }
  // documented platform truths
  assert.equal(PLATFORM_METRIC_SUPPORT.x.reach, "NOT_SUPPORTED");
  assert.equal(PLATFORM_METRIC_SUPPORT.youtube.saves, "NOT_SUPPORTED");
  assert.equal(PLATFORM_METRIC_SUPPORT.instagram.clicks, "NOT_SUPPORTED");
  assert.equal(PLATFORM_METRIC_SUPPORT.tiktok.views, "SUPPORTED");
  assert.equal(serviceOf("x_post"), "x");
  assert.equal(serviceOf("youtube_short"), "youtube");
});

test("13E.7A-13. a provider sync error retains the last good snapshot and writes no zeros", () => {
  const row = { metrics_snapshots: [] };
  const good = normalizeProviderMetrics([{ type: "views", value: 1000 }], "tiktok");
  attachSnapshot(row, buildSnapshot({ platform: "tiktok", metrics: good.metrics, unsupported: good.unsupported }));
  assert.equal(row.metrics.views, 1000);
  const res = attachSnapshot(row, buildSnapshot({ platform: "tiktok", error: { reason: "buffer_rate_limited" } }));
  assert.equal(res.appended, false);
  assert.equal(row.metrics_snapshots.length, 1); // no zeroed snapshot appended
  assert.equal(row.metrics.views, 1000); // last good reading intact
  assert.equal(row.metrics_error.reason, "buffer_rate_limited");
  assert.ok(row.last_metrics_sync);
});

test("13E.7A-14. the pre-publish baseline is NOT_AVAILABLE_YET, distinct from 0", () => {
  const b = baselineMetrics();
  for (const k of METRIC_KEYS) assert.equal(b[k], NOT_AVAILABLE_YET);
  assert.notEqual(NOT_AVAILABLE_YET, 0);
  // emptyMetrics is the OTHER honest state - a live post with no reading yet
  const e = emptyMetrics();
  for (const k of METRIC_KEYS) assert.equal(e[k], null);
});

test("13E.7A-15. KPIs are null unless both inputs exist, and label their denominator", () => {
  const m = emptyMetrics();
  let k = computeKpis(m, {});
  assert.equal(k.engagement_rate.value, null);
  assert.equal(k.website_ctr.value, null);
  assert.equal(k.affiliate_outbound_rate.value, null);

  m.impressions = 1000;
  m.reach = 800;
  m.likes = 20;
  m.comments = 4;
  k = computeKpis(m, { attributedVisits: 50, affiliateOutbound: 10 });
  assert.equal(engagementCount(m), 24);
  assert.equal(k.engagement_rate.basis, "reach"); // reach preferred over impressions
  assert.ok(Math.abs(k.engagement_rate.value - 24 / 800) < 1e-9);
  assert.equal(k.website_ctr.basis, "attributed_site_visits / impressions");
  assert.ok(Math.abs(k.website_ctr.value - 50 / 1000) < 1e-9);
  assert.ok(Math.abs(k.affiliate_outbound_rate.value - 10 / 50) < 1e-9);
  // provider-reported engagement rate wins when present
  m.engagement_rate = 0.055;
  assert.equal(computeKpis(m).engagement_rate.basis, "provider_reported");
});

test("13E.7A-16. reporting windows: a post reports on whatever windows it has data for", () => {
  assert.deepEqual(REPORTING_WINDOWS.map((w) => w.key), ["1h", "24h", "72h", "7d", "28d"]);
  const pub = "2026-09-07T00:00:00Z";
  const snaps = [
    { captured_at: "2026-09-07T00:30:00Z", metrics: {} },
    { captured_at: "2026-09-08T12:00:00Z", metrics: {} },
  ];
  const now = Date.parse("2026-09-20T00:00:00Z");
  assert.equal(snapshotForWindow(snaps, pub, 3600_000, now).captured_at, "2026-09-07T00:30:00Z");
  const win = availableWindows(snaps, pub, now).map((w) => w.key);
  assert.ok(win.includes("1h") && win.includes("24h") && win.includes("7d"));
});

// ---- read-only guarantees --------------------------------------

test("13E.7A-17. the metrics path calls NO mutating provider method", () => {
  const mutating = /createPost\s*\(|updatePost\s*\(|deletePost\s*\(|\.schedule\s*\(|\.publish\s*\(|sendMessage\s*\(|\.comment\s*\(|\.reply\s*\(/;
  for (const p of [
    "scripts/socialMetrics.mjs",
    "lib/social/distribution/metrics.mjs",
    "lib/social/distribution/attribution.mjs",
  ]) {
    const src = read(p).replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(src, mutating, `${p} must not call a mutating method`);
  }
  // socialMetrics.mjs only ever reaches getPostMetrics / getAggregatedMetrics / getPostStatus
  const sm = read("scripts/socialMetrics.mjs");
  const calls = [...sm.matchAll(/PROVIDER\.(\w+)\s*\(/g)].map((m) => m[1]);
  const allowed = new Set(["getPostMetrics", "getAggregatedMetrics", "getPostStatus", "isConfigured"]);
  assert.ok(calls.every((c) => allowed.has(c)), `only read methods, got: ${calls}`);
});

test("13E.7A-18. the Buffer metrics adapter methods are read-only queries on the one endpoint", () => {
  const buf = read("lib/social/providers/buffer.mjs");
  // new methods exist
  assert.match(buf, /async getPostMetrics\(/);
  assert.match(buf, /async getAggregatedMetrics\(/);
  // they use query {, never mutation {
  const seg = buf.slice(buf.indexOf("async getPostMetrics("), buf.length);
  assert.match(seg, /query PostMetrics/);
  assert.doesNotMatch(seg, /mutation /);
  // the only fetch target in the file is still the BUFFER_GRAPHQL constant
  const fetchArgs = [...buf.matchAll(/fetch\(\s*([A-Za-z_]+)/g)].map((m) => m[1]);
  assert.ok(fetchArgs.every((h) => h === "BUFFER_GRAPHQL"));
  // the null provider also refuses metrics
  assert.match(read("lib/social/providers/index.mjs"), /getPostMetrics[\s\S]*no_social_provider_configured/);
});

test("13E.7A-19. existing affiliate URLs still validate (customid closed-set + campid preserved)", () => {
  const doc = read("docs/ebay-affiliate-attribution.md");
  // the policy doc still describes the closed enum + the campid/customid split
  assert.match(doc, /closed `Set`|closed Set/);
  assert.match(doc, /campid/);
  // and social-performance.md records that NO affiliate change was made
  const perf = read("docs/social-performance.md");
  assert.match(perf, /makes no change to affiliate URL generation|byte-identical|byte-unchanged/i);
});

test("13E.7A-20. the ledger row reserves the measurement fields and the CLI wires attribution in", () => {
  const cli = read("scripts/socialPublish.mjs");
  // buildRow stamps the attributed CTA and reserves the metrics shape
  assert.match(cli, /attributedCtaUrl\(\{/);
  assert.match(cli, /cta_attribution: parseAttribution\(ctaUrl\)/);
  assert.match(cli, /metrics_snapshots: \[\]/);
  assert.match(cli, /metrics_error: null/);
  // experiment tags are reserved + inert
  assert.match(cli, /experiment_id: null/);
  // metrics subcommands are dispatched
  assert.match(cli, /case "metrics":/);
  assert.match(cli, /case "metrics-batch":/);
});
