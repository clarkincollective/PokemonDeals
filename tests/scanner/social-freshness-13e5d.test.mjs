// Phase 13E.5D - FRESH LIVE CONTENT + PRE-LIVE GATE CLEANUP.
//
// Pins: no internal "not eligible" copy can reach a creative; a payload
// is never built from a row outside the social freshness ceiling (fail
// closed); freshness is judged from a real stored timestamp, never render
// time; the social selector cannot weaken deal qualification; a creative-
// preference family can fail without aborting the run; the EPN "AI Tools"
// hard blocker is replaced by an owner CLASSIFICATION that never claims a
// formal eBay approval; affiliate disclosure is still required; the
// send-time freshness gate blocks a stale/fixture snapshot. No network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  socialFreshnessLine,
  socialFreshnessState,
  SOCIAL_FRESHNESS_STATE,
  SOCIAL_FRESHNESS_MAX_AGE_HOURS,
  isSociallyEligible,
} from "../../lib/social/eligibility.mjs";
import { buildDealPayload, buildMoverPayload } from "../../lib/social/payload.mjs";
import { readDistributionFlags, EPN_AI_CLASSIFICATIONS } from "../../lib/social/distribution/config.mjs";
import { runAllGates } from "../../lib/social/distribution/gates.mjs";
import { RIGHTS_STATE } from "../../lib/social/rights.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const HOUR = 3_600_000;
const ago = (h) => new Date(Date.now() - h * HOUR).toISOString();

// a minimally-complete displayable, socially-eligible row
const row = (over = {}) => ({
  id: 42,
  card_name: "Ditto",
  card_set: "EX Delta Species",
  card_tcgplayer_id: "84832",
  card_language: "english",
  listing_type: "FIXED_PRICE",
  marketplace: "EBAY_US",
  is_graded: false,
  total_price: 40,
  total_price_usd: 40,
  market_price: 141,
  discount_pct: (141 - 40) / 141,
  is_active: true,
  condition: "Near Mint",
  first_seen_at: ago(6),
  last_seen_at: ago(1),
  exact_verified_at: ago(1),
  auction_end_at: null,
  disqualified_reason: null,
  visual_authenticity_status: null,
  title: "Ditto EX Delta Species Pokemon Card Near Mint",
  ...over,
});

test("13E.5D-1. no internal 'not eligible for preview' string exists in any production creative code path", () => {
  const walk = (dir, out = []) => {
    for (const n of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${n}`;
      statSync(join(ROOT, rel)).isDirectory() ? walk(rel, out) : out.push(rel);
    }
    return out;
  };
  const files = walk("lib/social").filter((f) => !f.includes("/distribution/") && !f.includes("/storage/") && !f.includes("/providers/"));
  for (const f of files) {
    const src = read(f);
    // the OLD debug string must not be emittable as caption/label text.
    assert.doesNotMatch(src, /"[^"]*not eligible for preview[^"]*"/i, `${f} still contains the debug freshness string`);
  }
});

test("13E.5D-2. socialFreshnessLine FAILS CLOSED past the ceiling - renderable:false, label:null", () => {
  const stale = socialFreshnessLine(row({ exact_verified_at: ago(SOCIAL_FRESHNESS_MAX_AGE_HOURS + 3) }));
  assert.equal(stale.renderable, false);
  assert.equal(stale.label, null);
  assert.equal(stale.checkedAt, null);

  const missing = socialFreshnessLine(row({ exact_verified_at: null }));
  assert.equal(missing.renderable, false);

  const fresh = socialFreshnessLine(row({ exact_verified_at: ago(2) }));
  assert.equal(fresh.renderable, true);
  assert.match(fresh.label, /^Checked .+ UTC\. Availability can change\.$/);
});

test("13E.5D-3. a payload is NEVER built from a row past the ceiling (fail closed)", () => {
  assert.throws(
    () => buildDealPayload({ contentType: "deal_of_day", row: row({ exact_verified_at: ago(SOCIAL_FRESHNESS_MAX_AGE_HOURS + 10) }), now: Date.now(), utmCampaign: "deal_of_day" }),
    /social freshness/i
  );
  // a fresh row builds and carries a real timestamp + a truthful state
  const p = buildDealPayload({ contentType: "deal_of_day", row: row({ exact_verified_at: ago(1), first_seen_at: ago(3) }), now: Date.now(), utmCampaign: "deal_of_day" });
  assert.equal(p.freshness.checkedAt, p.freshness.exactVerifiedAt);
  assert.ok([SOCIAL_FRESHNESS_STATE.JUST_FOUND, SOCIAL_FRESHNESS_STATE.FRESH].includes(p.freshness.state));
});

test("13E.5D-4. freshness is derived from exact_verified_at, NOT render time", () => {
  const verifiedAt = ago(3);
  const r = row({ exact_verified_at: verifiedAt });
  // pass a wildly different "render clock" - the label still reports verifiedAt
  const line = socialFreshnessLine(r, { at: new Date(Date.now() + 999 * HOUR) });
  // (now-render is far in the future -> hrs since verify is huge -> not renderable,
  //  proving the check uses the timestamp, not a frozen "0")
  assert.equal(line.renderable, false);
  // and with an honest clock the checkedAt is the real field verbatim
  assert.equal(socialFreshnessLine(r, { at: new Date() }).checkedAt, verifiedAt);
});

test("13E.5D-5. Market Mover is MARKET_DATA: it does NOT require listing freshness and surfaces no 'checked' line", () => {
  const movement = { ok: true, pct: 0.37, direction: "up", windowLabel: "90 days", confidence: "ok", series: [{ t: 1, v: 100 }, { t: 2, v: 137 }] };
  // a row whose exact_verified_at is WAY past the deal ceiling still builds a mover
  const p = buildMoverPayload({ row: row({ exact_verified_at: ago(500) }), movement, now: Date.now() });
  assert.equal(p.freshness.state, "MARKET_DATA");
  assert.equal(p.freshness.label, null); // no per-listing freshness claim
});

test("13E.5D-6. the social selector cannot weaken deal qualification - eligibility is a wrapper, not a fork", () => {
  const src = read("lib/social/eligibility.mjs");
  // it builds ON isDisplayableDeal / isPremiumDealEligible from dealQuality, never redefines them
  assert.match(src, /from "\.\.\/dealQuality\.js"/);
  assert.match(src, /isDisplayableDeal\(row\)/);
  assert.match(src, /isPremiumDealEligible/);
  // an ineligible row has NO freshness state
  assert.equal(socialFreshnessState(row({ is_active: false }), Date.now()), null);
  assert.equal(socialFreshnessState(row({ market_price: 0 }), Date.now()), null);
  // the ceiling constant is still tied to the site's own premium bound (half of it), not an arbitrary looser number
  assert.ok(SOCIAL_FRESHNESS_MAX_AGE_HOURS > 0 && SOCIAL_FRESHNESS_MAX_AGE_HOURS <= 12);
});

test("13E.5D-7. a creative-preference family can fail without aborting the run (graceful availability)", () => {
  const cli = read("scripts/socialVideo.mjs");
  // tryProduce swallows a family's production error and returns { skipped }
  assert.match(cli, /const tryProduce = async \(fam, fn\) => \{[\s\S]*?catch \(e\)[\s\S]*?return \{ family: fam, skipped:/);
  // renderFamily emits an empty family entry rather than throwing
  assert.match(cli, /if \(spec\.skipped\) \{[\s\S]*?return \{ family: spec\.family, skipped: spec\.skipped, platforms: \{\} \};/);
});

test("13E.5D-8. EPN 'AI Tools' is a CLASSIFICATION, not a claimed approval", () => {
  // the accepted values - one is explicitly 'not applicable', the other a real filed approval
  assert.deepEqual([...EPN_AI_CLASSIFICATIONS].sort(), ["APPROVED", "NOT_APPLICABLE_CURRENT_PIPELINE"]);
  // unset -> null -> the gate blocks
  assert.equal(readDistributionFlags({}).epnAiClassification, null);
  assert.equal(readDistributionFlags({ SOCIAL_EPN_AI_CLASSIFICATION: "yes please" }).epnAiClassification, null);
  assert.equal(readDistributionFlags({ SOCIAL_EPN_AI_CLASSIFICATION: "not_applicable_current_pipeline" }).epnAiClassification, "NOT_APPLICABLE_CURRENT_PIPELINE");
  // the gate + config wording explicitly disclaims any formal eBay approval
  const cfg = read("lib/social/distribution/config.mjs");
  const gates = read("lib/social/distribution/gates.mjs");
  assert.match(cfg, /does NOT represent, imply, or claim any/i);
  assert.match(cfg, /formal approval from eBay/i);
  assert.match(gates, /NOT an eBay approval/);
  // no AFFIRMATIVE false claim that eBay/EPN granted approval
  assert.doesNotMatch(gates, /eBay (has )?approved (this|the|our|it)|EPN (has )?granted|formally approved by eBay/i);
  assert.doesNotMatch(cfg, /eBay (has )?approved (this|the|our|it)|formally approved by eBay/i);
  // the removed hard flag name is gone from the gate logic
  assert.doesNotMatch(gates, /epnAiToolsApproved/);
});

test("13E.5D-9. affiliate disclosure is still required by the caption gate", () => {
  const gates = read("lib/social/distribution/gates.mjs");
  assert.match(gates, /DISCLOSURE_MARKER/);
  assert.match(gates, /const DISCLOSURE_MARKER = \/\\bAd\\b\//);
  // a caption with no "Ad" marker fails caption_frozen
  const r = {
    platform: "instagram_reel", creative_family: "brand_ad", status: "APPROVED",
    caption: "No disclosure here at all.", hashtags: [], qa: { ok: true, passed: 1, total: 1, failed: [] },
    rights: { ...RIGHTS_STATE }, snapshot: {}, channel_id: "c1",
    media: { kind: "video_916", files: ["/x.mp4"], width: 1080, height: 1920, durationS: 8, filesExist: true },
    public_media_url: "https://cdn/x.mp4", media_sha256: "abc",
  };
  const v = { media: r.media, qa: r.qa, rights: r.rights, caption_instagram: r.caption, snapshot: {} };
  const flags = { publishEnabled: true, dryRun: false, epnAiClassification: "NOT_APPLICABLE_CURRENT_PIPELINE", hasBufferToken: true };
  const res = runAllGates({ row: r, variant: v, flags, providerConfigured: true, ledger: [], currentMediaSha: "abc" });
  assert.equal(res.gates.find((g) => g.id === "caption_frozen").ok, false);
});

test("13E.5D-10. send-time freshness gate: fixture snapshot or a stale live snapshot BLOCKS a deal placement", () => {
  const base = {
    platform: "instagram_reel", creative_family: "deal_drop", status: "APPROVED",
    caption: "body\n\nAd · x", hashtags: [], qa: { ok: true, passed: 39, total: 39, failed: [] },
    rights: { ...RIGHTS_STATE }, channel_id: "c1",
    media: { kind: "video_916", files: ["/x.mp4"], width: 1080, height: 1920, durationS: 8, filesExist: true },
    public_media_url: "https://cdn/x.mp4", media_sha256: "abc",
  };
  const v = { media: base.media, qa: base.qa, rights: base.rights, caption_instagram: base.caption };
  const flags = { publishEnabled: true, dryRun: false, epnAiClassification: "NOT_APPLICABLE_CURRENT_PIPELINE", hasBufferToken: true };
  const g = (row) => runAllGates({ row, variant: v, flags, providerConfigured: true, ledger: [], currentMediaSha: "abc" }).gates.find((x) => x.id === "freshness_at_send");

  // fixture-sourced -> blocked
  assert.equal(g({ ...base, snapshot: { source_is_live: false, source_captured_at: new Date().toISOString(), market_price: 1, discount_pct: 0.5 } }).ok, false);
  // live but stale (past the ceiling) -> blocked
  assert.equal(g({ ...base, snapshot: { source_is_live: true, source_captured_at: ago(SOCIAL_FRESHNESS_MAX_AGE_HOURS + 2), market_price: 1, discount_pct: 0.5 } }).ok, false);
  // live + fresh -> passes
  assert.equal(g({ ...base, snapshot: { source_is_live: true, source_captured_at: new Date().toISOString(), market_price: 1, discount_pct: 0.5 } }).ok, true);
  // market_mover is EXEMPT (MARKET_DATA) - the gate is not even added
  assert.equal(g({ ...base, creative_family: "market_mover", snapshot: { source_is_live: false, source_captured_at: ago(999) } }), undefined);
  // brand_ad is EXEMPT too
  assert.equal(g({ ...base, creative_family: "brand_ad", snapshot: { source_is_live: false } }), undefined);
});

test("13E.5D-11. social:source freezes a real snapshot + refuses to fabricate; never touches tests/fixtures", () => {
  const src = read("scripts/socialSource.mjs");
  assert.match(src, /\.social-preview.*source.*live-snapshot\.json|SNAPSHOT_PATH/);
  assert.match(src, /empty_reason/);
  assert.match(src, /socialBinPool/); // uses the UNCHANGED eligibility pool
  assert.doesNotMatch(src, /writeFileSync\([^)]*tests\/fixtures/); // never writes the committed fixture
  assert.match(src, /exact_verified_at/); // freezes the real source timestamp
});

test("13E.5D-12. the video manifest records its content source + capture time (freshness provenance)", () => {
  const cli = read("scripts/socialVideo.mjs");
  assert.match(cli, /source: SOURCE_LABEL/);
  assert.match(cli, /source_captured_at:/);
  assert.match(cli, /source_is_live:/);
  // freshness is judged as of snapshot capture time, not Date.now()
  assert.match(cli, /now = Date\.parse\(snap\.captured_at\)/);
});
