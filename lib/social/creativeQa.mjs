// Phase 13E.11A - DETERMINISTIC CREATIVE DENSITY / QUALITY HEURISTIC (§20).
//
// NOT computer vision. It reads a small `meta` object (layout geometry +
// the actual rendered strings the deterministic renderer produced) and
// scores whether the composition is premium-restrained: the hook is the
// hero, the card dominates, the facts are hierarchical (not four equally
// loud blocks), one CTA, one brand lockup, no duplicate fact, no tiny
// text, everything inside the safe rect.
//
// `meta` (all optional; missing -> that check is skipped, never failed):
//   { family, canvasW, canvasH, safe:{top,right,bottom,left},
//     hookText, hookPx, cardMaxHeightPx, metricText, metricPx,
//     numericCallouts:[strings], ctaCount, brandMarkCount, minInlineFontPx,
//     bodyHtml }
//
// Pure. No I/O, no network.

export const DENSITY_LIMITS = Object.freeze({
  headline_max_lines: 3,
  numeric_callouts_max: 3, // simultaneous big-number callouts
  card_occupancy_min: 0.34, // card height / usable canvas height (Deal Drop / Mover)
  cta_count_exact: 1,
  brand_mark_max: 2, // wordmark lockup (carousel close legitimately has 2)
  min_text_px: 22,
  hook_chars_per_line: 22, // uppercase display type on a ~936px column
});

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

// crude but deterministic line estimate for an uppercase display hook.
export function estimateHookLines(text, charsPerLine = DENSITY_LIMITS.hook_chars_per_line) {
  const s = String(text ?? "").trim();
  if (!s) return 0;
  // honour explicit breaks, then wrap each segment
  return s
    .split(/\s*(?:<br\s*\/?>|\n)\s*/)
    .reduce((acc, seg) => acc + Math.max(1, Math.ceil(seg.length / charsPerLine)), 0);
}

// distinct facts among the numeric callouts (a % appearing in the hook AND
// again as a standalone metric is a DUPLICATE fact).
export function duplicateFactCount(callouts = []) {
  const norm = (x) =>
    String(x ?? "")
      .toUpperCase()
      .replace(/[,$\s]/g, "")
      .replace(/\.00\b/g, "");
  const seen = new Map();
  let dups = 0;
  for (const c of callouts) {
    const k = norm(c);
    if (!k) continue;
    if (seen.has(k)) dups += 1;
    else seen.set(k, 1);
  }
  return dups;
}

// minimum inline font-size (px) found in a rendered HTML string.
export function minInlineFontPx(html) {
  const sizes = [...String(html ?? "").matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
  return sizes.length ? Math.min(...sizes) : null;
}

// checks -> [{ id, ok, value, limit, severity }]  severity: P0 | P1 | P2
export function densityChecks(meta = {}) {
  const out = [];
  const add = (id, ok, value, limit, severity) => out.push({ id, ok: Boolean(ok), value, limit, severity });

  const usableH = num(meta.canvasH) != null && meta.safe ? meta.canvasH - (meta.safe.top ?? 0) - (meta.safe.bottom ?? 0) : num(meta.canvasH);

  // headline line count
  if (meta.hookText != null) {
    const lines = estimateHookLines(meta.hookText);
    add("headline_lines", lines <= DENSITY_LIMITS.headline_max_lines, lines, DENSITY_LIMITS.headline_max_lines, "P1");
  }
  // hook is the hero: hookPx should be the largest, or at least not
  // smaller than the standalone metric figure.
  if (num(meta.hookPx) != null && num(meta.metricPx) != null) {
    add("hook_is_hero", meta.hookPx >= meta.metricPx, `hook ${meta.hookPx}px vs metric ${meta.metricPx}px`, "hook >= metric", "P1");
  }
  // numeric callouts
  if (Array.isArray(meta.numericCallouts)) {
    add("numeric_callouts", meta.numericCallouts.length <= DENSITY_LIMITS.numeric_callouts_max, meta.numericCallouts.length, DENSITY_LIMITS.numeric_callouts_max, "P1");
    const dups = duplicateFactCount(meta.numericCallouts);
    add("duplicate_facts", dups === 0, dups, 0, "P1");
  }
  // card occupancy
  if (num(meta.cardMaxHeightPx) != null && num(usableH) != null && usableH > 0) {
    const occ = meta.cardMaxHeightPx / usableH;
    add("card_occupancy", occ >= DENSITY_LIMITS.card_occupancy_min, Number(occ.toFixed(3)), DENSITY_LIMITS.card_occupancy_min, "P1");
  }
  // exactly one CTA
  if (num(meta.ctaCount) != null) {
    add("cta_count", meta.ctaCount === DENSITY_LIMITS.cta_count_exact, meta.ctaCount, DENSITY_LIMITS.cta_count_exact, "P1");
  }
  // brand mark restraint
  if (num(meta.brandMarkCount) != null) {
    add("brand_mark_count", meta.brandMarkCount <= DENSITY_LIMITS.brand_mark_max, meta.brandMarkCount, DENSITY_LIMITS.brand_mark_max, "P2");
  }
  // no tiny text
  const minPx = num(meta.minInlineFontPx) ?? (meta.bodyHtml ? minInlineFontPx(meta.bodyHtml) : null);
  if (minPx != null) {
    add("min_text_px", minPx >= DENSITY_LIMITS.min_text_px, minPx, DENSITY_LIMITS.min_text_px, "P2");
  }
  // safe-zone: every factual element must live inside the safe rect. The
  // deterministic renderer places everything inside `.safe` / `.canvas`
  // padding, so this is a structural assertion on the markup.
  if (meta.bodyHtml != null) {
    const structured = /class="(safe|canvas)"/.test(meta.bodyHtml);
    add("safe_zone_structured", structured, structured, "content inside .safe/.canvas", "P0");
  }
  return out;
}

// 0..1 density score - the fraction of applicable checks that pass,
// P0 failures weighted x3, P1 x2, P2 x1.
export function densityScore(checks) {
  const w = { P0: 3, P1: 2, P2: 1 };
  let num_ = 0;
  let den = 0;
  for (const c of checks) {
    den += w[c.severity] ?? 1;
    if (c.ok) num_ += w[c.severity] ?? 1;
  }
  return den > 0 ? Number((num_ / den).toFixed(3)) : null;
}

// PASS (no P0/P1 failure, score >= 0.9) / WATCH (score >= 0.7) / FAIL.
export function densityGrade(checks) {
  const score = densityScore(checks);
  const hardFail = checks.some((c) => !c.ok && (c.severity === "P0" || c.severity === "P1"));
  if (score == null) return { grade: "WATCH", score: null };
  if (!hardFail && score >= 0.9) return { grade: "PASS", score };
  if (score >= 0.7) return { grade: "WATCH", score };
  return { grade: "FAIL", score };
}

export function scoreCreative(meta = {}) {
  const checks = densityChecks(meta);
  return { ...densityGrade(checks), checks, family: meta.family ?? null };
}

// ---- Impeccable-style category grades (§24) -----------------------
// Maps the density checks onto the eight review categories the phase
// wants. Each category -> PASS | WATCH | FAIL from the checks that inform
// it (a missing informing check -> WATCH, never a silent PASS).
const CATEGORY_CHECKS = Object.freeze({
  HOOK_CLARITY: ["headline_lines", "hook_is_hero"],
  CARD_DOMINANCE: ["card_occupancy", "hook_is_hero"],
  FACT_HIERARCHY: ["numeric_callouts", "duplicate_facts"],
  CTA_CLARITY: ["cta_count"],
  TRUST: ["safe_zone_structured"],
  BRAND_CONSISTENCY: ["brand_mark_count"],
  MOBILE_LEGIBILITY: ["min_text_px", "headline_lines"],
  PREMIUM_FEEL: ["numeric_callouts", "duplicate_facts", "brand_mark_count", "hook_is_hero"],
});

export function categoryGrades(meta = {}) {
  const checks = densityChecks(meta);
  const byId = new Map(checks.map((c) => [c.id, c]));
  const out = {};
  for (const [cat, ids] of Object.entries(CATEGORY_CHECKS)) {
    const present = ids.map((id) => byId.get(id)).filter(Boolean);
    if (!present.length) {
      out[cat] = "WATCH";
      continue;
    }
    if (present.some((c) => !c.ok)) out[cat] = "FAIL";
    else if (present.length < ids.length) out[cat] = "WATCH";
    else out[cat] = "PASS";
  }
  return out;
}
