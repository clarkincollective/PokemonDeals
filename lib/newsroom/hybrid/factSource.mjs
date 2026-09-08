// Phase SOCIAL-CREATIVE-5A.1 - FACT-SOURCE LOCKS + AUDITORS.
//
// THE MODEL MAY INVENT DESIGN. THE MODEL MAY NOT INVENT DATA.
//
//   * CARD_METADATA_LOCK (§2/§3)  - only canonical card fields may be
//     shown; a null field is NOT displayable; a shown attribute not in
//     the lock -> UNSUPPORTED_CARD_METADATA_FAIL; a conflicting one ->
//     CARD_METADATA_CONTRADICTION_FAIL.
//   * visualization_data_manifest (§4/§6) - every chart value shown must
//     be an allowed point or a deterministically supported derivative;
//     else UNSUPPORTED_CHART_VALUE_FAIL / CHART_VALUE_MISMATCH /
//     CHART_SCOPE_FAIL.
//   * source_attribution_manifest (§7) - only exact supported source /
//     methodology strings; else UNSUPPORTED_SOURCE_CLAIM_FAIL.
//   * timeframe_manifest (§8) - only explicitly supplied windows; unknown
//     -> OMIT; a shown window not supplied -> UNSUPPORTED_TIMEFRAME_FAIL.
//   * §9 FACT_SOURCE_CLASSES - every published fact traces to one.
//
// Deterministic. No I/O, no OpenAI. The vision extraction happens in
// semanticAudit.extractImageClaims; these functions audit that extraction.

import { failure } from "../editorial/failureStates.mjs";

export const FACT_SOURCE_VERSION = "5a1.1";

// §9
export const FACT_SOURCE_CLASSES = Object.freeze([
  "CARD_CATALOG", "MARKET_DATABASE", "EBAY_LISTING", "DERIVED_CALCULATION", "EDITORIAL_LABEL",
]);

const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const numOf = (s) => { const m = String(s ?? "").replace(/,/g, "").match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; };

// ---- §2 CARD METADATA LOCK ------------------------------------
export const CARD_METADATA_FIELDS = Object.freeze([
  "name", "set", "card_number", "rarity", "printing", "edition", "variant", "language", "grade", "condition",
]);

// catalogRow = a card_catalog record (name,set,card_number,rarity,...);
// factLock supplies name/set/number/grade already normalised.
export function buildCardMetadataLock({ catalogRow = null, factLock = {} } = {}) {
  const C = catalogRow ?? {};
  const F = factLock ?? {};
  const pick = (a, b) => {
    const v = a ?? b;
    if (v == null || String(v).trim() === "" || /^(null|n\/a|unknown)$/i.test(String(v))) return null;
    return String(v).trim();
  };
  const lock = {
    name: pick(F.card_name, C.name),
    set: pick(F.card_set, C.set),
    card_number: pick(F.card_number, C.card_number ?? C.number),
    rarity: pick(F.rarity, C.rarity),
    printing: pick(F.printing, C.printing),
    edition: pick(F.edition, C.edition),
    variant: pick(F.variant, C.variant),
    language: pick(F.language ?? C.language, C.card_language),
    grade: pick(F.grade, C.grade),
    condition: pick(F.condition, C.condition),
  };
  const displayable = CARD_METADATA_FIELDS.filter((k) => lock[k] != null);
  return Object.freeze({ ...lock, _displayable: Object.freeze(displayable), _source_type: "CARD_CATALOG" });
}

// vocabulary of card-descriptive tokens the auditor looks for in the image
const RARITY_TOKENS = ["common", "uncommon", "rare", "holo rare", "rare holo", "ultra rare", "secret rare", "amazing rare", "illustration rare", "special illustration rare", "double rare", "hyper rare", "promo"];
// HARD = an unambiguous printed stamp the design added; SOFT = an
// appearance judgement about the real card face (shadowless / unlimited
// are the *absence* of a feature, routinely inferred by a vision model
// from the canonical art itself) - only a direct contradiction of the
// lock counts, never a bare "unsupported".
const EDITION_TOKENS_HARD = ["1st edition", "first edition"];
const EDITION_TOKENS_SOFT = ["shadowless", "unlimited"];
const GRADE_RE = /\b(psa|bgs|cgc|sgc)\s?\d{1,2}(\.\d)?\b/i;
const CARD_NUM_RE = /\b\d{1,3}\s?\/\s?\d{1,3}\b|#\s?\d{1,3}[a-z]?\b|\b(swsh|sm|xy|hgss|bw)\d{1,3}\b/i;

// ---- §3 CARD METADATA AUDIT ---------------------------------
// Only design chrome the GENERATIVE model added is audited - i.e. the
// vision extraction's `card_metadata_shown` / `card_set_shown`, which the
// prompt scopes to text "printed on the poster (NOT on the card art
// itself)". We deliberately do NOT mine `all_numbers`: the real canonical
// card face legitimately carries its own collector number (5/102), HP,
// level, set symbol and illustrator credit, and those are true by
// construction - flagging them is a false positive.
export function auditCardMetadata({ extraction = {}, metadataLock = {} } = {}) {
  const shown = [...(extraction.card_metadata_shown ?? [])].map(String);
  const shownFlat = norm(shown.join(" | "));
  const findings = [];

  // rarity
  const shownRarity = RARITY_TOKENS.find((t) => new RegExp(`\\b${t.replace(/\s/g, "\\s")}\\b`).test(shownFlat));
  if (shownRarity) {
    if (metadataLock.rarity == null) findings.push({ code: "UNSUPPORTED_CARD_METADATA_FAIL", detail: `rarity "${shownRarity}" shown but no rarity in the canonical record` });
    else if (!norm(metadataLock.rarity).includes(shownRarity) && !shownRarity.includes(norm(metadataLock.rarity))) findings.push({ code: "CARD_METADATA_CONTRADICTION_FAIL", detail: `rarity shown "${shownRarity}" vs canonical "${metadataLock.rarity}"` });
  }
  // edition
  const canonEd = norm([metadataLock.edition, metadataLock.printing, metadataLock.variant, metadataLock.name].filter(Boolean).join(" "));
  const shownEditionHard = EDITION_TOKENS_HARD.find((t) => shownFlat.includes(t));
  if (shownEditionHard && !canonEd.includes(shownEditionHard.replace("first", "1st")) && !canonEd.includes(shownEditionHard)) {
    findings.push({ code: metadataLock.edition || metadataLock.printing ? "CARD_METADATA_CONTRADICTION_FAIL" : "UNSUPPORTED_CARD_METADATA_FAIL", detail: `edition/printing "${shownEditionHard}" not supported by the canonical record` });
  }
  const shownEditionSoft = EDITION_TOKENS_SOFT.find((t) => shownFlat.includes(t));
  if (shownEditionSoft && (metadataLock.edition || metadataLock.printing) && !canonEd.includes(shownEditionSoft)) {
    findings.push({ code: "CARD_METADATA_CONTRADICTION_FAIL", detail: `edition/printing shown "${shownEditionSoft}" vs canonical "${metadataLock.edition || metadataLock.printing}"` });
  }
  // collector number - compare with leading zeros stripped from each
  // numeric run ("005/102" and "5/102" are the same card).
  const normNum = (s) => String(s ?? "").toLowerCase().replace(/\s/g, "").replace(/\b0+(\d)/g, "$1");
  const shownNums = shown.filter((s) => CARD_NUM_RE.test(s)).map((s) => s.replace(/\s/g, ""));
  for (const sn of shownNums) {
    if (metadataLock.card_number == null) { findings.push({ code: "UNSUPPORTED_CARD_METADATA_FAIL", detail: `collector number "${sn}" shown but the canonical record has no card number` }); continue; }
    const canonNum = normNum(metadataLock.card_number);
    const shownNum = normNum(sn);
    if (!canonNum.includes(shownNum) && !shownNum.includes(canonNum)) findings.push({ code: "CARD_METADATA_CONTRADICTION_FAIL", detail: `collector number shown "${sn}" vs canonical "${metadataLock.card_number}"` });
  }
  // grade
  const gm = shown.map((s) => s.match(GRADE_RE)).find(Boolean);
  if (gm) {
    if (metadataLock.grade == null) findings.push({ code: "UNSUPPORTED_CARD_METADATA_FAIL", detail: `grade "${gm[0]}" shown but the card is raw / ungraded in the record` });
    else if (norm(metadataLock.grade) !== norm(gm[0])) findings.push({ code: "CARD_METADATA_CONTRADICTION_FAIL", detail: `grade shown "${gm[0]}" vs canonical "${metadataLock.grade}"` });
  }
  // set
  if (extraction.card_set_shown && metadataLock.set && !norm(extraction.card_set_shown).includes(norm(metadataLock.set)) && !norm(metadataLock.set).includes(norm(extraction.card_set_shown))) {
    findings.push({ code: "CARD_METADATA_CONTRADICTION_FAIL", detail: `set shown "${extraction.card_set_shown}" vs canonical "${metadataLock.set}"` });
  }
  return finish(findings, "card metadata");
}

// ---- §4 VISUALIZATION DATA MANIFEST -----------------------
// resolved = the sanctioned resolver payload. Currently only market_shape
// has a chart worth locking (a 3-bucket price distribution).
export function buildVisualizationManifest({ layout, resolved = null } = {}) {
  const R = resolved?.data ?? resolved ?? {};
  if (layout === "market_shape") {
    const u25 = num(R.under25Pct ?? R.under_25_pct);
    const o100 = num(R.over100Pct ?? R.over_100_pct);
    if (u25 == null) return null;
    const mid = o100 != null ? Math.round((100 - u25 - o100) * 10) / 10 : null;
    const points = [{ label: "Under $25", value: u25 }];
    if (mid != null) points.push({ label: "$25–$100", value: mid });
    if (o100 != null) points.push({ label: "$100+", value: o100 });
    return Object.freeze({
      chart_type: "price_distribution",
      allowed_points: Object.freeze(points),
      source_population: num(R.pricedCards ?? R.priced_cards),
      scope: "ALL_TRACKED_SINGLES",
      calculation_method: "count(catalog rows with market_price in band) / count(catalog rows with market_price>0)",
      rounding_tolerance: 0.2,
      is_complete_partition: true,
      _source_type: "DERIVED_CALCULATION",
    });
  }
  return null;
}

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

// ---- §6 GENERATED CHART AUDITOR ---------------------------
export function auditChartValues({ extraction = {}, vizManifest = null } = {}) {
  const findings = [];
  const shown = extraction.chart_values ?? [];
  if (!shown.length) return finish(findings, "chart");
  if (!vizManifest) {
    // a chart with values but no manifest -> everything is unsupported
    for (const v of shown) findings.push({ code: "UNSUPPORTED_CHART_VALUE_FAIL", detail: `chart shows "${JSON.stringify(v)}" but no deterministic chart data was supplied for this story` });
    return finish(findings, "chart");
  }
  const tol = vizManifest.rounding_tolerance ?? 0.2;
  const allowed = vizManifest.allowed_points ?? [];
  const matchLabel = (lab) => allowed.find((p) => norm(p.label).replace(/[–—-]/g, "-") === norm(lab).replace(/[–—-]/g, "-") || norm(lab).includes(norm(p.label)) || norm(p.label).includes(norm(lab)));

  for (const item of shown) {
    const lab = item.label ?? item.category ?? "";
    const val = item.value != null ? Number(String(item.value).replace(/[^\d.-]/g, "")) : numOf(item);
    const hit = matchLabel(lab);
    if (!hit) {
      findings.push({ code: "UNSUPPORTED_CHART_VALUE_FAIL", detail: `chart bucket "${lab}"${val != null ? ` = ${val}` : ""} is not a supplied data point (allowed: ${allowed.map((p) => p.label).join(", ")})` });
      continue;
    }
    if (val != null && Math.abs(val - Number(hit.value)) > tol) {
      findings.push({ code: "CHART_VALUE_MISMATCH", detail: `chart shows ${lab} = ${val}, supplied value is ${hit.value}` });
    }
  }
  // §6 - if a complete partition, the shown values must sum to ~100
  if (vizManifest.is_complete_partition && shown.length >= 2) {
    const sum = shown.map((i) => Number(String(i.value ?? "").replace(/[^\d.-]/g, "")) || numOf(i) || 0).reduce((a, b) => a + b, 0);
    if (sum > 0 && Math.abs(sum - 100) > Math.max(2, tol * shown.length + 1)) {
      findings.push({ code: "CHART_SCOPE_FAIL", detail: `chart buckets sum to ${Math.round(sum * 10) / 10}%, a complete partition must be ~100%` });
    }
  }
  // §6 - population / scope label check
  if (extraction.chart_population != null && vizManifest.source_population != null) {
    const shownPop = numOf(extraction.chart_population);
    if (shownPop != null && Math.abs(shownPop - vizManifest.source_population) > 1) {
      findings.push({ code: "CHART_SCOPE_FAIL", detail: `chart population shown ${shownPop} vs supplied ${vizManifest.source_population}` });
    }
  }
  return finish(findings, "chart");
}

// ---- §7 SOURCE ATTRIBUTION LOCK --------------------------
export function buildSourceAttributionManifest({ resolved = null, contract = null } = {}) {
  // The current resolvers do NOT supply a source/methodology string. Only
  // add one here when a story genuinely carries it.
  const R = resolved?.data ?? resolved ?? {};
  const allowed = [];
  if (R.source_statement) allowed.push(String(R.source_statement));
  if (R.methodology) allowed.push(String(R.methodology));
  // a plain "market reference" framing IS supported (site-wide definition)
  allowed.push("market reference", "recent market", "market value");
  return Object.freeze({ allowed_statements: Object.freeze(allowed), _source_type: "EDITORIAL_LABEL" });
}

const INVENTED_SOURCE_RE = /\bebay\s+sold\s+listings?\b|\bcompleted\s+listings?\b|\bacross\s+(major\s+)?marketplaces?\b|\blive\s+market\s+data\b|\breal[\s-]?time\s+(pricing|data)\b|\bscraped\s+from\b|\bdata\s+from\s+(ebay|tcgplayer|pricecharting)\b/i;

export function auditSourceAttribution({ extraction = {}, sourceManifest = null } = {}) {
  const findings = [];
  const texts = [extraction.source_attribution_text, ...(extraction.takeaways ?? []), ...(extraction.footnotes ?? [])].filter(Boolean).map(String);
  const allowed = (sourceManifest?.allowed_statements ?? []).map(norm);
  for (const t of texts) {
    if (INVENTED_SOURCE_RE.test(t) && !allowed.some((a) => norm(t).includes(a))) {
      findings.push({ code: "UNSUPPORTED_SOURCE_CLAIM_FAIL", detail: `invented source / methodology statement: "${t}"` });
    }
  }
  return finish(findings, "source");
}

// ---- §8 TIMEFRAME LOCK ---------------------------------
export function buildTimeframeManifest({ resolved = null } = {}) {
  const R = resolved?.data ?? resolved ?? {};
  const allowed = [];
  if (R.window_label) allowed.push(String(R.window_label));
  if (R.timeframe) allowed.push(String(R.timeframe));
  return Object.freeze({ allowed_timeframes: Object.freeze(allowed) });
}

const TIMEFRAME_RE = /\blast\s+\d+\s+(day|week|month)s?\b|\bthis\s+(week|month|year)\b|\bpast\s+\d+\s+(day|week|month)s?\b|\b\d{1,2}\s*[–—-]\s*\d{1,2}\s+\w+\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b|\b(ytd|year[\s-]to[\s-]date|30d|60d|90d)\b|\bover\s+the\s+last\b/i;

export function auditTimeframe({ extraction = {}, timeframeManifest = null } = {}) {
  const findings = [];
  const texts = [extraction.timeframe_text, extraction.source_attribution_text, ...(extraction.takeaways ?? []), ...(extraction.footnotes ?? [])].filter(Boolean).map(String);
  const allowed = (timeframeManifest?.allowed_timeframes ?? []).map(norm);
  for (const t of texts) {
    const m = t.match(TIMEFRAME_RE);
    if (m && !allowed.some((a) => a && norm(t).includes(a))) {
      findings.push({ code: "UNSUPPORTED_TIMEFRAME_FAIL", detail: `invented timeframe: "${m[0]}" (in "${t.slice(0, 80)}")` });
    }
  }
  return finish(findings, "timeframe");
}

// ---- §1 BRAND SAFE ZONE ------------------------------
// The extraction reports what sits in the reserved top strip.
export function auditBrandSafeZone({ extraction = {} } = {}) {
  const bz = extraction.brand_safe_zone_content ?? extraction.top_strip_content ?? null;
  const occupied = extraction.brand_safe_zone_occupied;
  const findings = [];
  const meaningful = (s) => {
    const t = norm(s);
    if (!t || /empty|nothing|clear|blank|calm|quiet|low[\s-]?detail|texture only|subtle gradient|dark background/.test(t)) return false;
    return /headline|title|large text|card|chart|graph|logo|icon|price|number|%|stat|wordmark|badge|button|arrow|photo|illustration/.test(t);
  };
  if (occupied === true || (bz && meaningful(bz))) {
    findings.push({ code: "BRAND_SAFE_ZONE_OCCUPIED", detail: `the reserved top brand strip is not empty: "${String(bz ?? "occupied").slice(0, 100)}"` });
  }
  return finish(findings, "brand safe zone");
}

// ---- combine everything the vision extraction lets us check ----
export function auditFactSources({ extraction = {}, metadataLock = null, vizManifest = null, sourceManifest = null, timeframeManifest = null } = {}) {
  const all = [
    auditBrandSafeZone({ extraction }),
    metadataLock ? auditCardMetadata({ extraction, metadataLock }) : { ok: true, findings: [] },
    auditChartValues({ extraction, vizManifest }),
    auditSourceAttribution({ extraction, sourceManifest }),
    auditTimeframe({ extraction, timeframeManifest }),
  ];
  const findings = all.flatMap((r) => r.findings ?? []);
  if (!findings.length) return { ok: true, findings: [] };
  const ORDER = ["BRAND_SAFE_ZONE_OCCUPIED", "CARD_METADATA_CONTRADICTION_FAIL", "UNSUPPORTED_CARD_METADATA_FAIL", "CHART_SCOPE_FAIL", "CHART_VALUE_MISMATCH", "UNSUPPORTED_CHART_VALUE_FAIL", "UNSUPPORTED_SOURCE_CLAIM_FAIL", "UNSUPPORTED_TIMEFRAME_FAIL"];
  const state = ORDER.find((s) => findings.some((f) => f.code === s)) ?? findings[0].code;
  return { ok: false, ...failure(state, findings.map((f) => f.detail).join(" | ").slice(0, 400), { stage: "fact_source_audit", detail: { findings } }), findings };
}

function finish(findings, label) {
  if (!findings.length) return { ok: true, findings: [] };
  return { ok: false, state: findings[0].code, reason: `${label}: ${findings.map((f) => f.detail).join(" | ")}`, findings };
}
