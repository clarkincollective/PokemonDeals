// Phase SOCIAL-CREATIVE-5A.1 - fact-source + brand-safe-zone hardening.
// THE MODEL MAY INVENT DESIGN. THE MODEL MAY NOT INVENT DATA.
// Pure-logic + source-scan (no OpenAI needed - all auditors are deterministic).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildFactLock } from "../../lib/newsroom/editorial/factLock.mjs";
import { FAILURE_STATES } from "../../lib/newsroom/editorial/failureStates.mjs";
import {
  FACT_SOURCE_CLASSES, CARD_METADATA_FIELDS,
  buildCardMetadataLock, buildVisualizationManifest, buildSourceAttributionManifest, buildTimeframeManifest,
  auditCardMetadata, auditChartValues, auditSourceAttribution, auditTimeframe, auditBrandSafeZone, auditFactSources,
} from "../../lib/newsroom/hybrid/factSource.mjs";
import { BRAND_SAFE_ZONE_CLAUSE, BRAND_SAFE_ZONE_TOP_PX, compositeBrandAssetHtml } from "../../lib/newsroom/hybrid/brandLock.mjs";
import { DATA_DISCIPLINE_CLAUSE, buildMasterPrompt } from "../../lib/newsroom/hybrid/fullGenerative.mjs";
import { buildSemanticManifest } from "../../lib/newsroom/hybrid/semanticManifest.mjs";
import { contractFor } from "../../lib/newsroom/editorial/storyContracts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/`(?:\\[\s\S]|[^`\\])*`/g, "``").replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/'(?:\\.|[^'\\])*'/g, "''");
const newFiles = ["factSource.mjs"].map((f) => `lib/newsroom/hybrid/${f}`);

const THIN_LOCK = buildCardMetadataLock({ catalogRow: { name: "Clefairy", set: "Base Set", card_number: null, rarity: null }, factLock: buildFactLock({ facts_json: { card_name: "Clefairy", card_set: "Base Set" } }) });
const FULL_LOCK = buildCardMetadataLock({ catalogRow: { name: "Clefairy", set: "Base Set", card_number: "5/102", rarity: "Common" }, factLock: {} });
const VIZ = buildVisualizationManifest({ layout: "market_shape", resolved: { data: { under_25_pct: 85.7, over_100_pct: 4.7, priced_cards: 24545 } } });

// ================= CARD METADATA LOCK (§2/§3) ===============
test("SC5A1-1. generated rarity not in the canonical record -> UNSUPPORTED_CARD_METADATA_FAIL", () => {
  const r = auditCardMetadata({ extraction: { card_metadata_shown: ["Common"] }, metadataLock: THIN_LOCK });
  assert.equal(r.ok, false);
  assert.equal(r.state, "UNSUPPORTED_CARD_METADATA_FAIL");
});

test("SC5A1-2. WRONG rarity vs the canonical value -> CARD_METADATA_CONTRADICTION_FAIL", () => {
  const r = auditCardMetadata({ extraction: { card_metadata_shown: ["Holo Rare"] }, metadataLock: FULL_LOCK });
  assert.equal(r.ok, false);
  assert.equal(r.state, "CARD_METADATA_CONTRADICTION_FAIL");
});

test("SC5A1-3. invented edition ('1st Edition' not in the record) -> FAIL", () => {
  const r = auditCardMetadata({ extraction: { card_metadata_shown: ["1st Edition"] }, metadataLock: FULL_LOCK });
  assert.equal(r.ok, false);
  assert.ok(["UNSUPPORTED_CARD_METADATA_FAIL", "CARD_METADATA_CONTRADICTION_FAIL"].includes(r.state));
});

test("SC5A1-4. invented collector number -> FAIL; a WRONG number -> contradiction", () => {
  assert.equal(auditCardMetadata({ extraction: { card_metadata_shown: ["34/102"] }, metadataLock: THIN_LOCK }).state, "UNSUPPORTED_CARD_METADATA_FAIL");
  assert.equal(auditCardMetadata({ extraction: { card_metadata_shown: ["34/102"] }, metadataLock: FULL_LOCK }).state, "CARD_METADATA_CONTRADICTION_FAIL");
});

test("SC5A1-5. the owner P0 '\u2003Base Set \u2022 5/102 \u2022 Common' fails a thin lock, passes a full canonical lock", () => {
  const bad = auditCardMetadata({ extraction: { card_metadata_shown: ["5/102", "Common"], card_set_shown: "Base Set" }, metadataLock: THIN_LOCK });
  assert.equal(bad.ok, false);
  assert.equal(bad.state, "UNSUPPORTED_CARD_METADATA_FAIL");
  const ok = auditCardMetadata({ extraction: { card_metadata_shown: ["5/102", "Common"], card_set_shown: "Base Set" }, metadataLock: FULL_LOCK });
  assert.equal(ok.ok, true, JSON.stringify(ok.findings));
});

test("SC5A1-6. invented grade (raw card shown 'PSA 10') -> UNSUPPORTED_CARD_METADATA_FAIL; unknown metadata omitted -> PASS", () => {
  assert.equal(auditCardMetadata({ extraction: { card_metadata_shown: ["PSA 10"] }, metadataLock: FULL_LOCK }).state, "UNSUPPORTED_CARD_METADATA_FAIL");
  assert.equal(auditCardMetadata({ extraction: { card_metadata_shown: [], card_set_shown: null }, metadataLock: THIN_LOCK }).ok, true);
  assert.deepEqual([...CARD_METADATA_FIELDS].slice(0, 2), ["name", "set"]);
});

// ================= VISUALIZATION DATA MANIFEST (§4/§6) =====
test("SC5A1-7. invented chart percentage / distribution bucket -> UNSUPPORTED_CHART_VALUE_FAIL", () => {
  const r = auditChartValues({ extraction: { chart_values: [
    { label: "Under $25", value: "85.7%" }, { label: "$25-$50", value: "8.2%" }, { label: "$50-$100", value: "3.6%" },
    { label: "$100-$250", value: "1.7%" }, { label: "$250-$500", value: "0.5%" }, { label: "$500+", value: "0.3%" },
  ] }, vizManifest: VIZ });
  assert.equal(r.ok, false);
  assert.equal(r.state, "UNSUPPORTED_CHART_VALUE_FAIL");
});

test("SC5A1-8. a WRONG value for a supplied bucket -> CHART_VALUE_MISMATCH", () => {
  const r = auditChartValues({ extraction: { chart_values: [{ label: "Under $25", value: "72%" }] }, vizManifest: VIZ });
  assert.equal(r.ok, false);
  assert.equal(r.state, "CHART_VALUE_MISMATCH");
});

test("SC5A1-9. chart totals inconsistent (a full partition not summing to ~100) -> CHART_SCOPE_FAIL", () => {
  const r = auditChartValues({ extraction: { chart_values: [{ label: "Under $25", value: "85.7%" }, { label: "$25-$100", value: "40%" }, { label: "$100+", value: "30%" }] }, vizManifest: VIZ });
  assert.equal(r.ok, false);
  assert.ok(["CHART_SCOPE_FAIL", "CHART_VALUE_MISMATCH"].includes(r.state));
});

test("SC5A1-10. valid deterministic chart values (the 3 real buckets) -> PASS; a chart with NO supplied data -> FAIL", () => {
  const ok = auditChartValues({ extraction: { chart_values: [{ label: "Under $25", value: "85.7%" }, { label: "$25\u2013$100", value: "9.6%" }, { label: "$100+", value: "4.7%" }] }, vizManifest: VIZ });
  assert.equal(ok.ok, true, JSON.stringify(ok.findings));
  const noData = auditChartValues({ extraction: { chart_values: [{ label: "Q1", value: "10" }, { label: "Q2", value: "20" }] }, vizManifest: null });
  assert.equal(noData.ok, false);
  assert.equal(noData.state, "UNSUPPORTED_CHART_VALUE_FAIL");
  assert.equal(VIZ.allowed_points.length, 3);
  assert.equal(VIZ.source_population, 24545);
});

// ================= SOURCE + TIMEFRAME LOCKS (§7/§8) =======
test("SC5A1-11. unsupported source attribution -> UNSUPPORTED_SOURCE_CLAIM_FAIL; unsupported timeframe -> UNSUPPORTED_TIMEFRAME_FAIL", () => {
  const sm = buildSourceAttributionManifest({ resolved: { data: {} } });
  assert.equal(auditSourceAttribution({ extraction: { source_attribution_text: "eBay Sold Listings, across major marketplaces" }, sourceManifest: sm }).state, "UNSUPPORTED_SOURCE_CLAIM_FAIL");
  assert.equal(auditSourceAttribution({ extraction: { footnotes: ["Market reference: recent sold prices"] }, sourceManifest: sm }).ok, true); // "market reference" is allowed

  const tm = buildTimeframeManifest({ resolved: { data: {} } });
  assert.equal(auditTimeframe({ extraction: { timeframe_text: "Last 60 Days" }, timeframeManifest: tm }).state, "UNSUPPORTED_TIMEFRAME_FAIL");
  assert.equal(auditTimeframe({ extraction: { takeaways: ["Data over the past 30 days"] }, timeframeManifest: tm }).state, "UNSUPPORTED_TIMEFRAME_FAIL");
  assert.equal(auditTimeframe({ extraction: { takeaways: ["Compare before you buy."] }, timeframeManifest: tm }).ok, true);
  assert.deepEqual([...FACT_SOURCE_CLASSES], ["CARD_CATALOG", "MARKET_DATABASE", "EBAY_LISTING", "DERIVED_CALCULATION", "EDITORIAL_LABEL"]);
});

// ================= BRAND SAFE ZONE (§1) ==================
test("SC5A1-12. brand-safe zone occupied by a headline/card/chart -> BRAND_SAFE_ZONE_OCCUPIED; empty -> PASS", () => {
  assert.equal(auditBrandSafeZone({ extraction: { brand_safe_zone_content: "the giant CLEFAIRY headline", brand_safe_zone_occupied: true } }).state, "BRAND_SAFE_ZONE_OCCUPIED");
  assert.equal(auditBrandSafeZone({ extraction: { brand_safe_zone_content: "a chart and a price" } }).state, "BRAND_SAFE_ZONE_OCCUPIED");
  assert.equal(auditBrandSafeZone({ extraction: { brand_safe_zone_content: "empty dark background, faint texture", brand_safe_zone_occupied: false } }).ok, true);
  assert.equal(auditBrandSafeZone({ extraction: {} }).ok, true);
});

test("SC5A1-13. the master prompt carries the data-discipline block, a HARD brand-safe strip, the metadata lock and the chart lock", () => {
  assert.match(BRAND_SAFE_ZONE_CLAUSE, /top ~8%|top 110 pixels/);
  assert.match(BRAND_SAFE_ZONE_CLAUSE, /COMPLETELY EMPTY/);
  assert.ok(BRAND_SAFE_ZONE_TOP_PX >= 100);
  assert.match(DATA_DISCIPLINE_CLAUSE, /VISUAL DESIGNER, NOT THE DATA ANALYST/);
  assert.match(DATA_DISCIPLINE_CLAUSE, /MUST NOT invent facts/);
  assert.match(DATA_DISCIPLINE_CLAUSE, /never invent additional statistics/i);

  const sem = buildSemanticManifest({
    layout: "market_shape",
    factLock: buildFactLock({ facts_json: { tracked_count: 24545, percentages: [85.7, 4.7], card_name: "Clefairy" } }),
    resolved: { data: { under_25_pct: 85.7, over_100_pct: 4.7, priced_cards: 24545, featured: { card_name: "Clefairy" } } },
    contract: contractFor("MARKET_SNAPSHOT"),
    cardCatalogRow: { name: "Clefairy", set: "Base Set", card_number: "5/102", rarity: "Common" },
  });
  assert.ok(sem.card_metadata_lock && sem.card_metadata_lock._displayable.includes("rarity"));
  assert.equal(sem.visualization_data_manifest.allowed_points.length, 3);
  const prompt = buildMasterPrompt({ layout: "market_shape", factManifest: sem });
  assert.match(prompt, /YOU ARE THE VISUAL DESIGNER, NOT THE DATA ANALYST/);
  assert.match(prompt, /CHART DATA .*Under \$25 = 85\.7%/s);
  assert.match(prompt, /Do NOT add extra buckets/);
});

// ================= COMBINED + SCOPE ======================
test("SC5A1-14. auditFactSources combines every lock; a clean extraction PASSES", () => {
  const clean = auditFactSources({
    extraction: {
      brand_safe_zone_content: "empty", brand_safe_zone_occupied: false,
      card_metadata_shown: ["5/102", "Common"], card_set_shown: "Base Set",
      chart_values: [{ label: "Under $25", value: "85.7%" }, { label: "$25\u2013$100", value: "9.6%" }, { label: "$100+", value: "4.7%" }],
      source_attribution_text: null, timeframe_text: null, takeaways: ["Follow the data."],
    },
    metadataLock: FULL_LOCK, vizManifest: VIZ,
    sourceManifest: buildSourceAttributionManifest({ resolved: { data: {} } }),
    timeframeManifest: buildTimeframeManifest({ resolved: { data: {} } }),
  });
  assert.equal(clean.ok, true, JSON.stringify(clean.findings));

  const dirty = auditFactSources({
    extraction: { brand_safe_zone_occupied: true, card_metadata_shown: ["PSA 10"], chart_values: [{ label: "$500+", value: "0.3%" }], source_attribution_text: "eBay Sold Listings", timeframe_text: "last 60 days" },
    metadataLock: FULL_LOCK, vizManifest: VIZ,
    sourceManifest: buildSourceAttributionManifest({ resolved: { data: {} } }),
    timeframeManifest: buildTimeframeManifest({ resolved: { data: {} } }),
  });
  assert.equal(dirty.ok, false);
  assert.ok(FAILURE_STATES.includes(dirty.state));
  assert.ok(dirty.findings.length >= 4);
});

test("SC5A1-15. all 5A.1 failure states declared; no publishing / video / caption / RIGHTS / email / eBay-Browse work", () => {
  for (const s of ["BRAND_SAFE_ZONE_OCCUPIED", "UNSUPPORTED_CARD_METADATA_FAIL", "CARD_METADATA_CONTRADICTION_FAIL", "UNSUPPORTED_CHART_VALUE_FAIL", "CHART_VALUE_MISMATCH", "CHART_SCOPE_FAIL", "UNSUPPORTED_SOURCE_CLAIM_FAIL", "UNSUPPORTED_TIMEFRAME_FAIL"]) {
    assert.ok(FAILURE_STATES.includes(s), `missing ${s}`);
  }
  for (const f of newFiles) {
    const src = code(f);
    assert.doesNotMatch(src, /createPost|scheduleOne|reconcileOne/, `${f} Buffer`);
    assert.doesNotMatch(src, /REFILL_SCHEDULE|CronCreate|vercel\.json/, `${f} schedule`);
    assert.doesNotMatch(src, /RIGHTS_STATE\.publishing\s*=/, `${f} RIGHTS`);
    assert.doesNotMatch(src, /resend|sendEmail|newsletter_subscribers/i, `${f} email`);
    assert.doesNotMatch(src, /getBrowse|browseApi|api\.ebay\.com/i, `${f} eBay`);
    assert.doesNotMatch(src, /videoRender|storyboard|captionDirector/i, `${f} video/caption`);
  }
  // SOCIAL_IMAGE_MODE selector unchanged (still SAFE_FALLBACK default)
  assert.match(read("lib/newsroom/hybrid/imageMode.mjs"), /return "SAFE_FALLBACK"/);
});
