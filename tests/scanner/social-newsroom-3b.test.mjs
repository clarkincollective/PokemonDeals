// Phase SOCIAL-NEWSROOM-3B - card-forward creative wired into the
// persisted backlog pipeline + automated render runner. Source-scan +
// pure. No DB, no Chrome, no OpenAI, no Buffer.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  CARD_FORWARD_SERIES, isCardForwardSeries,
} from "../../lib/newsroom/cardForwardRender.mjs";
import { familyStatusFor } from "../../lib/social/newsroom/cardLayoutStatus.mjs";
import { REFILL_SCHEDULE } from "../../lib/social/newsroom/refill.mjs";
import { RIGHTS_STATE } from "../../lib/social/rights.mjs";
import { VISUAL_REVIEW_POLICY_VERSION } from "../../lib/newsroom/visualConsensus.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const code = (p) => {
  let s = read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  if (p.endsWith(".yml") || p.endsWith(".yaml")) s = s.replace(/(^|\n)\s*#[^\n]*/g, "$1"); // strip YAML comments
  return s;
};

// ---- the card-forward series -> layout map --------------------
test("N3B-1. the 5 card-forward families map to the card-forward layouts, MANUAL_ONLY families are absent", () => {
  assert.equal(CARD_FORWARD_SERIES.MARKET_SNAPSHOT.layout, "market_shape");
  assert.equal(CARD_FORWARD_SERIES.EXACT_PRINTING_MATTERS.layout, "printing_compare");
  assert.equal(CARD_FORWARD_SERIES.WHY_SOLD_PRICES_MATTER.layout, "asking_vs_sold");
  assert.equal(CARD_FORWARD_SERIES.THREE_UNDER_25.layout, "three_up");
  assert.equal(CARD_FORWARD_SERIES.DEAL_DROP.layout, "deal_hero");
  assert.ok(!("AUCTION_BID_VS_TOTAL" in CARD_FORWARD_SERIES));
  assert.ok(!("BIGGEST_MOVERS" in CARD_FORWARD_SERIES));
  assert.equal(isCardForwardSeries("AUCTION_BID_VS_TOTAL"), false);
});

test("N3B-2. CONDITIONAL card-forward families are flagged conditional; AUTONOMOUS_SAFE are not", () => {
  assert.equal(CARD_FORWARD_SERIES.MARKET_SNAPSHOT.conditional, false);
  assert.equal(CARD_FORWARD_SERIES.EXACT_PRINTING_MATTERS.conditional, false);
  assert.equal(CARD_FORWARD_SERIES.WHY_SOLD_PRICES_MATTER.conditional, true);
  assert.equal(CARD_FORWARD_SERIES.THREE_UNDER_25.conditional, true);
  assert.equal(CARD_FORWARD_SERIES.DEAL_DROP.conditional, true);
  // matches the family status source of truth
  for (const [s, spec] of Object.entries(CARD_FORWARD_SERIES)) {
    assert.equal(spec.conditional, familyStatusFor(s) === "CONDITIONAL", `${s} conditional flag`);
  }
});

// ---- renderCardForwardStory contract -------------------------
test("N3B-3. renderCardForwardStory: MANUAL_ONLY never renders; missing data WITHHOLDS with no typographic fallback (SS3/SS5)", () => {
  const s = read("lib/newsroom/cardForwardRender.mjs");
  assert.match(s, /MANUAL_ONLY_NEVER_AUTONOMOUS/);
  assert.match(s, /familyStatusFor\(series\)/);
  assert.match(s, /VISUALLY_UNDERPOWERED_DATA/);
  assert.match(s, /CARD_FORWARD_RENDER_UNAVAILABLE/);
  // it renders ONLY renderCardEditorialHtml, never renderEditorialHtml (typographic)
  assert.match(s, /renderCardEditorialHtml/);
  assert.doesNotMatch(code("lib/newsroom/cardForwardRender.mjs"), /renderEditorialHtml|trust_editorial|process_explainer|editorial_dashboard/);
});

test("N3B-4. renderCardForwardStory auto-runs the staged consensus (3c.1) for CONDITIONAL families (SS12)", () => {
  const s = read("lib/newsroom/cardForwardRender.mjs");
  assert.match(s, /reviewConsensus\(localPath/);
  assert.match(s, /spec\.conditional/);
  assert.match(s, /reviewRenderedCreative\(localPath/); // single review for AUTONOMOUS_SAFE
  assert.match(s, /VISUAL_REVIEW_POLICY_VERSION/);
  assert.match(String(VISUAL_REVIEW_POLICY_VERSION), /^3c\.\d+$/);
});

test("N3B-5. DEAL_DROP resolution applies the SS8 pull gate + dealHeroChecks and only near-term (SS10)", () => {
  const s = read("lib/newsroom/cardForwardRender.mjs");
  assert.match(s, /dealHeroWithholdReason/);
  assert.match(s, /dealHeroChecks/);
  assert.match(s, /nearTermOnly: true/);
});

test("N3B-6. THREE_UNDER_25 resolution runs threeUpChecks (3 distinct printings, budget cap, real saving) and carries shelf_items", () => {
  const s = read("lib/newsroom/cardForwardRender.mjs");
  assert.match(s, /threeUpChecks/);
  assert.match(s, /resolveThreeUnderSamples/);
  assert.match(s, /shelfItems: st\.items/);
});

// ---- persisted render flow uses the card-forward path -----------
test("N3B-7. renderPass routes card-forward series to renderCardForwardStory and NEVER to buildEditorialAsset (SS5)", () => {
  const s = read("scripts/socialBacklogRender.mjs");
  assert.match(s, /if \(isCardForwardSeries\(story\.series\)\) \{/);
  assert.match(s, /renderCardForwardStory\(story, p\.platform/);
  // the withhold branch records QA + does NOT fall through to buildEditorialAsset
  assert.match(s, /NO typographic fallback/);
  assert.match(s, /status: "WITHHELD"/);
  // MANUAL_ONLY excluded from render scope
  assert.match(s, /cardFamilyStatusFor\(S\) === "MANUAL_ONLY"\) return false/);
});

test("N3B-8. renderPass persists the artifact-scoped QA rows the queue path consumes (STACK + consensus VISUAL_REVIEW) (SS11)", () => {
  const s = read("scripts/socialBacklogRender.mjs");
  assert.match(s, /qaType: "STACK", result: detPass/);
  assert.match(s, /qaType: "VISUAL_REVIEW"/);
  assert.match(s, /consensus_result: cf\.consensus\?\.result/);
  assert.match(s, /policy_version: cf\.policy_version/);
  assert.match(s, /artifact_sha256: cf\.sha256Hex/);
});

// ---- legacy audit (SS23) -------------------------------------
test("N3B-9. the legacy BUFFER_READY audit classifies + can mark old typographic creative SUPERSEDED (history preserved)", () => {
  const s = read("scripts/socialBacklogRender.mjs");
  assert.match(s, /LEGACY_WEAK_CREATIVE/);
  assert.match(s, /CURRENT_CREATIVE_BAR_PASS/);
  assert.match(s, /SUPERSEDED_CREATIVE_BAR/);
  assert.match(s, /TYPOGRAPHIC_LAYOUTS = new Set/);
  // apply only touches BUFFER_READY without a provider ref (preserve history: keeps artifact_hash / hosted_url)
  assert.match(s, /p\.status === "BUFFER_READY" && !p\.buffer_provider_ref/);
  assert.doesNotMatch(s, /\.delete\(\)\s*;?\s*\/\/ legacy|DROP legacy/);
});

// ---- automated render runner (SS14/SS15) ---------------------
test("N3B-10. a GitHub Actions render runner exists, is workflow_dispatch-only (schedule commented), concurrency-locked, and never queues", () => {
  const w = read(".github/workflows/social-backlog-build-render.yml");
  assert.match(w, /on:\s*\n\s*workflow_dispatch:/);
  assert.match(w, /#\s*schedule:/);           // schedule prepared but commented
  assert.match(w, /concurrency:/);
  assert.match(w, /CHROME_BIN/);
  assert.match(w, /socialBacklogRender\.mjs --render/);
  assert.doesNotMatch(w, /SOCIAL_BUFFER_BACKLOG_ENABLED:\s*("true"|true)/);
  assert.doesNotMatch(w, /--refill|--queue-proof|queue-reconcile/);
});

test("N3B-11. the two-stage cadence is documented in Brisbane + UTC; recurring not activated (SS16/SS28)", () => {
  assert.equal(REFILL_SCHEDULE.activated, false);
  assert.match(REFILL_SCHEDULE.build_render_cron_utc, /0 19 \* \* 6,2/);
  assert.match(REFILL_SCHEDULE.queue_cron_utc, /0 20 \* \* 6,2/);
  assert.match(REFILL_SCHEDULE.brisbane_local, /06:00 Australia\/Brisbane Sun \+ Wed/);
  const v = JSON.parse(read("vercel.json"));
  assert.ok(!v.crons.some((c) => c.path.includes("social-backlog-refill")), "Stage-B cron not in vercel.json yet");
});

// ---- SAFETY (SS1) -----------------------------------------
test("N3B-12. permanent autonomy stays OFF: no env writes, no cron activation, Stage 1 / RIGHTS / email / eBay Browse / verify untouched", () => {
  assert.equal(RIGHTS_STATE.publishing, "DISABLED");
  for (const p of ["lib/newsroom/cardForwardRender.mjs", "scripts/socialBacklogRender.mjs", ".github/workflows/social-backlog-build-render.yml", "lib/social/newsroom/refill.mjs"]) {
    const c = code(p);
    assert.doesNotMatch(c, /process\.env\.SOCIAL_BUFFER_BACKLOG_ENABLED\s*=|process\.env\.SOCIAL_AUTONOMOUS_ENABLED\s*=|RIGHTS_STATE\.publishing\s*=|REFILL_SCHEDULE\.activated\s*=\s*true/, `${p} flips a production flag`);
    assert.doesNotMatch(c, /EMAIL_AUTONOMOUS|DIGEST_SEND_ENABLED|sendDigest|newsletter_subscribers/i, `${p} touches email`);
    assert.doesNotMatch(c, /ebayBrowse|\/buy\/browse|browseSearch/i, `${p} eBay Browse`);
    assert.doesNotMatch(c, /verifyAllocator|allocateVerifyBatch|api\/verify-deals/, `${p} verify`);
  }
});

test("N3B-13. the card-forward render helper uses only canonical art (no generated art) and reuses the existing renderer (no new one)", () => {
  const s = read("lib/newsroom/cardForwardRender.mjs");
  assert.doesNotMatch(code("lib/newsroom/cardForwardRender.mjs"), /openai|dall-?e|images\/generations|createRenderer/i);
  assert.match(s, /resolveCardArtwork/);
  assert.match(s, /renderer\.renderToPng/);   // caller passes the shared renderer
  assert.match(s, /canonical art missing/);
});

test("N3B-14. the retired weak typographic proof set is no longer the default seed", () => {
  const s = read("scripts/socialBacklogRender.mjs");
  assert.match(s, /PROOF_SERIES = has\("--legacy-proof-set"\)/);
  // the default arm is the card-forward families
  const m = s.match(/PROOF_SERIES = has\("--legacy-proof-set"\)[\s\S]*?:\s*(\[[^\]]+\]);/);
  assert.ok(m, "PROOF_SERIES default arm not found");
  assert.match(m[1], /MARKET_SNAPSHOT/);
  assert.match(m[1], /THREE_UNDER_25/);
  assert.doesNotMatch(m[1], /PRICE_STORY|BIGGEST_MOVERS/);
});

test("N3B-15. idempotency: card-forward placements use the stable placementId hash (SS17)", () => {
  const s = read("scripts/socialBacklogRender.mjs");
  assert.match(s, /plc_\$\{createHash\("sha256"\)\.update\(`\$\{story\.story_id\}::\$\{platform\}`\)/);
});
