// Phase AUTO-3 - live social source resolution + Stage 1 gating.
//
// Pure / structural. No network, no DB, no provider.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { selectAutonomousCandidate, tierAllowedForAutonomy, firstLiveDealSafe } from "../../lib/autonomous/socialAuto.mjs";
import { qualityTier } from "../../lib/social/planner/tiers.mjs";
import { SOCIAL_FRESHNESS_MAX_AGE_HOURS } from "../../lib/social/eligibility.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ---- shared resolver ----

test("AUTO3-1 there is ONE canonical live-source resolver, shared by social:source and social:auto", () => {
  const srcMod = read("scripts/socialSource.mjs");
  // exported from socialSource, and `social:source -- live`'s main() uses it
  assert.match(srcMod, /export async function resolveLiveSource\(/);
  assert.match(srcMod, /if \(mode === "live"\) snap = await resolveLiveSource\(/);
  // social:auto imports the SAME resolver (no second selection truth model)
  const auto = read("scripts/socialAuto.mjs");
  assert.match(auto, /import \{ resolveLiveSource \} from "\.\/socialSource\.mjs"/);
  assert.doesNotMatch(strip(auto), /fetchActiveDealPool|socialBinPool/); // it does not re-implement selection
});

test("AUTO3-2 the resolver reads the DB only - never a fixture, never eBay Browse", () => {
  const src = read("scripts/socialSource.mjs");
  // resolveLiveSource -> buildLiveSnapshot -> fetchActiveDealPool (Supabase)
  assert.match(src, /fetchActiveDealPool/);
  // no eBay Browse anywhere in the source module
  assert.doesNotMatch(strip(src), /browse\.api\.ebay|getBrowseRateLimit|ebay\.com\/buy\/browse|\/rate_limit\//i);
  // the fixture path is explicitly NOT live
  assert.match(src, /source_is_live: false, \/\/ AUTO-3 - explicit: a fixture is NEVER a live source/);
});

test("AUTO3-3 social:auto never falls back to the on-disk snapshot / fixture / historical / stale", () => {
  const auto = strip(read("scripts/socialAuto.mjs"));
  // it calls the resolver and, on empty, returns NO_CONTENT - no read of an old file
  assert.match(auto, /snap = await resolveLiveSource\(/);
  assert.match(auto, /if \(snap\.empty \|\| snap\.source_is_live !== true\)/);
  assert.match(auto, /NO CONTENT: no live eligible social source/);
  assert.doesNotMatch(auto, /loadSourceSnapshot|from-fixture|fromFixture|historical|tests\/fixtures/);
});

test("AUTO3-4 social:auto writes the immutable LIVE snapshot to its OWN path, not the fixture / from-fixture wrap", () => {
  const auto = read("scripts/socialAuto.mjs");
  assert.match(auto, /auto-live-snapshot\.json/);
  assert.doesNotMatch(strip(auto), /writeFileSync[^;]*live-snapshot\.json/); // not the shared/from-fixture file
  assert.doesNotMatch(strip(auto), /writeFileSync[^;]*tests[\/\\]fixtures/);
});

test("AUTO3-5 the resolver's empty snapshot carries a machine-readable, accurate reason", () => {
  const src = read("scripts/socialSource.mjs");
  // distinguishes fresh-but-auction from stale from never-verified
  assert.match(src, /ALL of them are AUCTIONs/);
  assert.match(src, /verify-deals is behind/);
  assert.match(src, /fresh_verified_count/);
  assert.match(src, /fresh_bin_count/);
});

test("AUTO3-6 no required live-source field is synthesized - firstLiveDealSafe fails closed on each", () => {
  const good = {
    source_is_live: true, source: "live", exact_verified_at: "2026-09-07T09:00:00Z",
    image_ok: true, listing_active: true, listed_usd: 40, market_price: 120, discount_pct: 0.66,
    source_captured_at: new Date().toISOString(),
  };
  assert.equal(firstLiveDealSafe(good, { maxAgeHours: SOCIAL_FRESHNESS_MAX_AGE_HOURS }).ok, true);
  for (const k of ["exact_verified_at", "listed_usd", "market_price", "discount_pct"]) {
    const bad = { ...good, [k]: null };
    assert.equal(firstLiveDealSafe(bad, { maxAgeHours: SOCIAL_FRESHNESS_MAX_AGE_HOURS }).ok, false, `missing ${k} must fail closed`);
  }
  assert.equal(firstLiveDealSafe({ ...good, source_is_live: false }).ok, false);
});

// ---- first-live quality: Deal Drop, S/A only ----

test("AUTO3-7 the first autonomous post must be a Deal Drop at S or A tier", () => {
  assert.equal(tierAllowedForAutonomy("deal_drop", "S_TIER"), true);
  assert.equal(tierAllowedForAutonomy("deal_drop", "A_TIER"), true);
  assert.equal(tierAllowedForAutonomy("deal_drop", "B_TIER"), false);
  assert.equal(tierAllowedForAutonomy("deal_drop", "NOT_SOCIAL"), false);
  // Market Mover / Brand Ad are not a substitute for the first live proof
  assert.equal(tierAllowedForAutonomy("brand_ad", "B_TIER"), false);
});

test("AUTO3-8 a strong live BIN Deal Drop grades S/A and is selectable; an auction-derived one never reaches here", () => {
  // shaped exactly as scripts/socialAuto.mjs builds a candidate from the resolver
  const strong = {
    content_id: "pdf-deal_drop-deal_of_day-charizard-20260907-A-abc1234",
    family: "deal_drop", card_name: "Charizard", card_set: "Base Set",
    card_tcgplayer_id: "42360", species: "charizard", is_graded: false,
    total_price_usd: 120, market_price: 400, discount_pct: 0.7, listing_type: "FIXED_PRICE",
    freshness_state: "FRESH",
    snapshot: { source_is_live: true, deal_id: 999, exact_verified_at: "2026-09-07T09:00:00Z", listed_usd: 120, market_price: 400, discount_pct: 0.7, listing_active: true, image_ok: true },
  };
  const t = qualityTier(strong);
  assert.ok(["S_TIER", "A_TIER"].includes(t), `expected S/A, got ${t}`);
  const res = selectAutonomousCandidate([strong], {});
  assert.equal(res.picked?.candidate.content_id, strong.content_id);
  // a shallow / no-canonical-art candidate is NOT_SOCIAL -> not picked
  const weak = { ...strong, content_id: "weak", card_tcgplayer_id: "", discount_pct: 0.05 };
  assert.equal(selectAutonomousCandidate([weak], {}).picked, null);
});

test("AUTO3-9 no candidate -> the run is NO_CONTENT and enables nothing (structural)", () => {
  const auto = strip(read("scripts/socialAuto.mjs"));
  // every no-candidate branch finishes NO_CONTENT and returns before any submit
  const submitIdx = auto.indexOf("submitAutonomousBatch(");
  const firstNoContent = auto.indexOf('finishRun(run, "NO_CONTENT")');
  assert.ok(firstNoContent > -1 && firstNoContent < submitIdx, "NO_CONTENT return precedes the submit path");
  // AUTO-3 does not flip any Vercel flag or RIGHTS_STATE from the CLI
  assert.doesNotMatch(auto, /RIGHTS_STATE\.publishing\s*=|process\.env\.SOCIAL_AUTONOMOUS_ENABLED\s*=/);
});

test("AUTO3-10 candidate mapping freezes a deterministic E1 experiment assignment (not visually chosen)", () => {
  const auto = read("scripts/socialAuto.mjs");
  assert.match(auto, /assignExperimentForPlacement/);
  assert.match(auto, /buildCreativeIdentifiers/);
  assert.match(auto, /hookVariant: exp\?\.hook_variant/);
  // the candidate carries the frozen experiment object
  assert.match(auto, /experiment: exp \?\? null/);
});

test("AUTO3-11 Stage 1 still caps at one content_id/day and the live run at one content_id", async () => {
  const { stageCapCheck } = await import("../../lib/autonomous/socialAuto.mjs");
  assert.equal(stageCapCheck({ maxContentPerDay: 1, publishedTodayContentIds: [], selectedContentId: "c1" }).ok, true);
  assert.equal(stageCapCheck({ maxContentPerDay: 1, publishedTodayContentIds: ["c0"], selectedContentId: "c1" }).ok, false);
  // the CLI selects exactly one candidate (sel.picked) - it never loops submitting many
  const auto = strip(read("scripts/socialAuto.mjs"));
  assert.equal((auto.match(/sel\.picked/g) || []).length >= 1, true);
  assert.doesNotMatch(auto, /for \(const c of candidates\)[\s\S]{0,400}submitAutonomousBatch/);
});

test("AUTO3-12 email stays OFF and untouched by AUTO-3", () => {
  const auto = read("scripts/socialAuto.mjs");
  assert.doesNotMatch(strip(auto), /EMAIL_AUTONOMOUS|DIGEST_SEND_ENABLED|sendAutonomousDigest|crm/i);
  const src = read("scripts/socialSource.mjs");
  assert.doesNotMatch(strip(src), /EMAIL_AUTONOMOUS|DIGEST_SEND_ENABLED|renderDigest/i);
});

test("AUTO3-13 no AUTO-3 file makes an eBay Browse call", () => {
  for (const f of ["scripts/socialAuto.mjs", "scripts/socialSource.mjs", "lib/social/candidates.mjs"]) {
    const s = strip(read(f));
    assert.doesNotMatch(s, /browse\.api\.ebay|getBrowseRateLimit|fetchCardOffers|ebay\.com\/buy\/browse|\/rate_limit\/\?api_context=buy/i, `${f} touches eBay Browse`);
  }
});
