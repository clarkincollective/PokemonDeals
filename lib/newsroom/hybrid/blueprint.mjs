// Phase SOCIAL-CREATIVE-4B.1 - FREEFORM DESIGN BLUEPRINT: schema, bounds
// clamping, the freeform composition validator (§16), the dead-space /
// crowding scorers (§17), the generic-composition reject (§8), the
// concept scorer (§19) and the engagement objectives (§7).
//
// FREEDOM IN DESIGN, RIGIDITY IN FACTS: the AI art director may return an
// arbitrary arrangement of content zones + supporting graphics; this
// module validates/clamps it deterministically. Every zone still renders
// through a deterministic primitive (primitives.mjs) whose content comes
// only from the FACT_LOCK / sanctioned resolvers.
//
// Pure. No I/O.

import { PRIMITIVES, isPrimitive } from "./primitives.mjs";
import { assertNoClip } from "./textFit.mjs";

export const BLUEPRINT_VERSION = "4b1.1";

export const CANVAS = Object.freeze({ ig_45: { w: 1080, h: 1350 }, short_916: { w: 1080, h: 1920 } });

export const COMPOSITION_STYLES = Object.freeze([
  "asymmetric_editorial", "centered_feature", "split_feature", "stacked_hierarchy",
  "triptych", "full_width_band", "side_annotated", "ranked_list", "data_led",
]);

export const ZONE_ROLES = Object.freeze([...PRIMITIVES.keys()]);

// §7 - what the design optimises for.
export const ENGAGEMENT_OBJECTIVES = Object.freeze([
  "SCROLL_STOP", "CURIOSITY", "USEFULNESS", "SAVEABILITY", "SHAREABILITY",
  "CLICK_INTENT", "COLLECTOR_RELEVANCE", "BRAND_RECALL",
]);

// §19 - concept scoring dimensions.
export const CONCEPT_DIMENSIONS = Object.freeze([
  "story_clarity", "scroll_stop", "collector_relevance", "information_richness",
  "premium_feel", "originality", "brand_fit", "thumbnail_clarity",
  "save_share_potential", "click_intent",
]);

const clampNum = (v, lo, hi, dflt) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
};

// Deep-clamp one content zone to the canvas + sane bounds.
function clampZone(z, canvas, i) {
  const w = clampNum(z.width, 40, canvas.w, Math.round(canvas.w * 0.4));
  const h = clampNum(z.height, 24, canvas.h, Math.round(canvas.h * 0.15));
  const x = clampNum(z.x, 0, canvas.w - w, 0);
  const y = clampNum(z.y, 0, canvas.h - h, 0);
  return {
    role: z.role,
    primitive: isPrimitive(z.primitive ?? z.role) ? (z.primitive ?? z.role) : null,
    x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h),
    priority: clampNum(z.priority, 1, 10, i === 0 ? 10 : 5),
    alignment: ["start", "center", "end"].includes(z.alignment) ? z.alignment : "start",
    source_fact_ids: Array.isArray(z.source_fact_ids) ? z.source_fact_ids.slice(0, 8) : [],
  };
}

/**
 * Validate + clamp a raw blueprint from the AI. Returns
 *   { ok, blueprint, errors, warnings }
 * `ok:false` -> COMPOSITION_REJECT (the caller falls back to a
 * deterministic per-family blueprint).
 */
export function validateBlueprint(raw, { target = "ig_45", factIds = [] } = {}) {
  const canvas = CANVAS[target] ?? CANVAS.ig_45;
  const errors = [];
  const warnings = [];

  if (!raw || typeof raw !== "object") return { ok: false, errors: ["blueprint is not an object"], blueprint: null };

  const rawZones = Array.isArray(raw.content_zones) ? raw.content_zones : [];
  if (rawZones.length < 2) errors.push("a blueprint needs at least 2 content zones");
  if (rawZones.length > 14) warnings.push(`${rawZones.length} zones - trimming to 14 (crowding)`);

  const zones = rawZones.slice(0, 14).map((z, i) => clampZone(z, canvas, i));

  // §28 - unknown / invalid primitive rejected
  for (const z of zones) {
    if (!z.role) { errors.push("a zone has no role"); continue; }
    if (!isPrimitive(z.role) && !z.primitive) errors.push(`unknown primitive/role "${z.role}"`);
  }

  // a hero-ish zone must exist and be sizeable
  const hero = zones.find((z) => /hero_card|hero_stat|card_triptych|price_pair|spotlight_panel/.test(z.role));
  if (!hero) errors.push("no hero zone (hero_card / hero_stat / card_triptych / price_pair / spotlight_panel)");
  else if (hero.width * hero.height < canvas.w * canvas.h * 0.1) warnings.push("hero zone is small (< 10% of frame)");

  // brand + a why-this-matters presence are expected (not hard)
  if (!zones.some((z) => /brand_mark|website_footer/.test(z.role))) warnings.push("no brand zone - brand should feel designed-in (§15)");
  if (!zones.some((z) => z.role === "why_this_matters_box" || z.role === "collector_tip")) warnings.push("no 'why this matters' / collector tip zone (§6)");

  // §16 - overlap of two HIGH-priority zones is a reject; low-priority
  // overlap (a badge sitting on a panel) is allowed.
  for (let a = 0; a < zones.length; a++) {
    for (let b = a + 1; b < zones.length; b++) {
      const Z = zones[a], Y = zones[b];
      const ox = Math.max(0, Math.min(Z.x + Z.width, Y.x + Y.width) - Math.max(Z.x, Y.x));
      const oy = Math.max(0, Math.min(Z.y + Z.height, Y.y + Y.height) - Math.max(Z.y, Y.y));
      const overlapArea = ox * oy;
      const minArea = Math.min(Z.width * Z.height, Y.width * Y.height);
      if (overlapArea > minArea * 0.35 && Z.priority >= 7 && Y.priority >= 7) {
        errors.push(`zones "${Z.role}" and "${Y.role}" overlap ${Math.round((overlapArea / minArea) * 100)}% (both high priority)`);
      }
    }
  }

  const spacing = clampSpacing(raw);
  const density = ["low", "medium", "high"].includes(raw.visual_density) ? raw.visual_density : "medium";

  const blueprint = {
    version: BLUEPRINT_VERSION,
    target,
    canvas,
    composition_style: COMPOSITION_STYLES.includes(raw.composition_style) ? raw.composition_style : "asymmetric_editorial",
    visual_flow: typeof raw.visual_flow === "string" ? raw.visual_flow.slice(0, 200) : "top-left headline -> hero -> supporting -> footer",
    content_zones: zones,
    hero_card_strategy: str(raw.hero_card_strategy, 200),
    hero_fact_strategy: str(raw.hero_fact_strategy, 200),
    supporting_graphics: normSupporting(raw.supporting_graphics, factIds),
    callouts: arrStr(raw.callouts, 6, 120),
    annotations: arrStr(raw.annotations, 6, 160),
    why_this_matters: str(raw.why_this_matters, 240),
    chart_strategy: str(raw.chart_strategy, 160),
    spacing_strategy: spacing,
    visual_density: density,
    brand_strategy: str(raw.brand_strategy, 160) || "wordmark top-right, red accent, footer domain; <=5% of frame",
    cta_strategy: str(raw.cta_strategy, 160),
    thumbnail_strategy: str(raw.thumbnail_strategy, 160),
    expected_scroll_stop_reason: str(raw.expected_scroll_stop_reason, 200),
    expected_share_save_reason: str(raw.expected_share_save_reason, 200),
    engagement_objectives: Array.isArray(raw.engagement_objectives)
      ? raw.engagement_objectives.filter((o) => ENGAGEMENT_OBJECTIVES.includes(o)).slice(0, 6)
      : ["SCROLL_STOP", "USEFULNESS", "COLLECTOR_RELEVANCE"],
  };

  return { ok: errors.length === 0, blueprint, errors, warnings };
}

const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const arrStr = (v, k, n) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").map((x) => x.slice(0, n)).slice(0, k) : []);
function clampSpacing(raw) {
  const s = raw?.spacing_strategy;
  if (typeof s === "string") return s.slice(0, 160);
  return "generous; air increases top-to-bottom; footer pinned";
}
function normSupporting(list, factIds) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 8).map((g) => ({
    type: isPrimitive(g?.type) ? g.type : "metric_strip",
    purpose: str(g?.purpose, 140),
    source_fact_ids: Array.isArray(g?.source_fact_ids) ? g.source_fact_ids.filter((id) => factIds.length === 0 || factIds.includes(id)).slice(0, 6) : [],
    preferred_zone: str(g?.preferred_zone, 40),
  }));
}

// ---- §17 DEAD-SPACE + CROWDING SCORERS ------------------------
// Both 0..100; lower is better for each. A good composition avoids both
// extremes. Intentional editorial whitespace is NOT penalised below a
// generous floor.
export function scoreDeadSpaceAndCrowding(blueprint) {
  const { canvas, content_zones: zones } = blueprint;
  const frame = canvas.w * canvas.h;

  // occupancy grid at 40px cells
  const cell = 40;
  const cols = Math.ceil(canvas.w / cell);
  const rowsN = Math.ceil(canvas.h / cell);
  const grid = new Uint8Array(cols * rowsN);
  let claimed = 0;
  for (const z of zones) {
    for (let cy = Math.floor(z.y / cell); cy < Math.ceil((z.y + z.height) / cell); cy++) {
      for (let cx = Math.floor(z.x / cell); cx < Math.ceil((z.x + z.width) / cell); cx++) {
        const idx = cy * cols + cx;
        if (idx >= 0 && idx < grid.length) { if (!grid[idx]) claimed++; grid[idx] = Math.min(255, grid[idx] + 1); }
      }
    }
  }
  const occ = claimed / grid.length;

  // dead space: largest empty contiguous region as a share of frame
  let emptyRun = 0, maxEmptyRun = 0;
  for (let i = 0; i < grid.length; i++) {
    if (!grid[i]) { emptyRun++; maxEmptyRun = Math.max(maxEmptyRun, emptyRun); }
    else emptyRun = 0;
  }
  const biggestEmptyShare = maxEmptyRun / grid.length;
  // a 12% empty band is fine (editorial air); above that ramps up
  const deadSpaceScore = Math.round(Math.max(0, Math.min(100, (biggestEmptyShare - 0.12) * 320 + (occ < 0.42 ? (0.42 - occ) * 180 : 0))));

  // crowding: overlap volume + zone count + share of cells with >=2 zones
  let dblCells = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i] >= 2) dblCells++;
  const dblShare = dblCells / grid.length;
  const crowdingScore = Math.round(Math.max(0, Math.min(100,
    (zones.length > 10 ? (zones.length - 10) * 12 : 0) +
    dblShare * 260 +
    (occ > 0.8 ? (occ - 0.8) * 300 : 0)
  )));

  return { dead_space_score: deadSpaceScore, crowding_score: crowdingScore, occupancy: Number(occ.toFixed(3)), biggest_empty_share: Number(biggestEmptyShare.toFixed(3)) };
}

// ---- §8 GENERIC COMPOSITION REJECT ---------------------------
// Reject layouts that read as a SaaS dashboard / crypto infographic /
// PowerPoint / "card left, text right" repetition / empty-black-with-
// numbers. Heuristic on the blueprint shape + recent fingerprints.
export function genericCompositionReject(blueprint, { recentFingerprints = [] } = {}) {
  const reasons = [];
  const zones = blueprint.content_zones;
  const { dead_space_score, occupancy } = scoreDeadSpaceAndCrowding(blueprint);

  // empty black + a few numbers
  const dataOnly = zones.filter((z) => /stat|number|metric|price/.test(z.role)).length;
  if (occupancy < 0.32 && dataOnly >= 1 && zones.length <= 4) reasons.push("sparse: near-empty frame with a few numbers");
  if (dead_space_score >= 70) reasons.push(`dead space score ${dead_space_score}`);

  // KPI-tile / dashboard grid: >=4 similar small rectangles in a grid
  const smallRects = zones.filter((z) => z.width < blueprint.canvas.w * 0.34 && z.height < blueprint.canvas.h * 0.22);
  if (smallRects.length >= 4) {
    const xs = new Set(smallRects.map((z) => Math.round(z.x / 40)));
    const ys = new Set(smallRects.map((z) => Math.round(z.y / 40)));
    if (xs.size <= 3 && ys.size <= 3) reasons.push("KPI-tile grid (reads as a SaaS dashboard)");
  }

  // "card left, text right" exact repetition vs recent feed
  const heroZone = zones.find((z) => z.role === "hero_card");
  if (heroZone) {
    const heroLoc = heroZone.x < blueprint.canvas.w * 0.4 ? "left" : heroZone.x > blueprint.canvas.w * 0.55 ? "right" : "center";
    const sameLeftRail = recentFingerprints.filter((f) => f.hero_location === heroLoc && f.composition_style === blueprint.composition_style).length;
    if (heroLoc === "left" && sameLeftRail >= 4) reasons.push("repeats the 'card left / text right' layout that dominates the recent feed");
  }

  // chart chrome without data
  if (blueprint.chart_strategy && !zones.some((z) => /chart|bar|distribution|range|gap/.test(z.role))) {
    reasons.push("chart strategy declared but no data primitive present (chart chrome)");
  }

  return { generic: reasons.length > 0, reasons };
}

// ---- §19 CONCEPT SCORER ------------------------------------
// Deterministic score of one validated blueprint against the 10
// dimensions + the two §17 penalties. Higher = better. Returns
// { scores, overall, valid, generic, dead_space_score, crowding_score }.
export function scoreConcept(blueprint, { enrichmentKinds = [], relevance = null, recentFingerprints = [] } = {}) {
  const dc = scoreDeadSpaceAndCrowding(blueprint);
  const gen = genericCompositionReject(blueprint, { recentFingerprints });
  const zones = blueprint.content_zones;
  const n = zones.length;
  const hero = zones.find((z) => /hero_card|hero_stat|card_triptych|spotlight_panel|price_pair/.test(z.role));
  const heroShare = hero ? (hero.width * hero.height) / (blueprint.canvas.w * blueprint.canvas.h) : 0;
  const supporting = zones.filter((z) => /bar|badge|strip|arrow|range|axis|timeline|tip|box|panel|tag/.test(z.role)).length;
  const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));

  const scores = {
    story_clarity: clamp(50 + (blueprint.why_this_matters ? 18 : -10) + (hero ? 15 : -20) + (blueprint.visual_flow ? 8 : 0)),
    scroll_stop: clamp(40 + heroShare * 90 + (blueprint.expected_scroll_stop_reason ? 10 : 0) - dc.dead_space_score * 0.25),
    collector_relevance: clamp(45 + (relevance?.score ? relevance.score * 40 : 15) + (zones.some((z) => /card/.test(z.role)) ? 12 : -15)),
    information_richness: clamp(28 + supporting * 11 + enrichmentKinds.length * 5),
    premium_feel: clamp(62 - dc.crowding_score * 0.3 - dc.dead_space_score * 0.2 + (blueprint.composition_style !== "stacked_hierarchy" ? 8 : 0)),
    originality: clamp(55 - sameStyleRepeat(blueprint, recentFingerprints) * 16 + (blueprint.composition_style === "asymmetric_editorial" || blueprint.composition_style === "side_annotated" ? 10 : 0)),
    brand_fit: clamp(55 + (blueprint.brand_strategy ? 15 : -10) + (zones.some((z) => /brand|footer/.test(z.role)) ? 15 : -20)),
    thumbnail_clarity: clamp(45 + heroShare * 70 + (n <= 8 ? 15 : -(n - 8) * 6) + (blueprint.thumbnail_strategy ? 8 : 0)),
    save_share_potential: clamp(38 + supporting * 8 + (blueprint.why_this_matters ? 15 : 0) + (blueprint.expected_share_save_reason ? 10 : 0)),
    click_intent: clamp(40 + (blueprint.cta_strategy ? 20 : -5) + (relevance?.classification === "COMMERCIAL" ? 15 : 5)),
  };

  let overall = CONCEPT_DIMENSIONS.reduce((a, k) => a + scores[k], 0) / CONCEPT_DIMENSIONS.length;
  overall -= dc.dead_space_score * 0.18;
  overall -= dc.crowding_score * 0.18;
  if (gen.generic) overall -= 25;
  overall = clamp(overall);

  return { scores, overall, dead_space_score: dc.dead_space_score, crowding_score: dc.crowding_score, occupancy: dc.occupancy, generic: gen.generic, generic_reasons: gen.reasons };
}

function fingerprintOf(blueprint) {
  const hero = blueprint.content_zones.find((z) => z.role === "hero_card") ?? blueprint.content_zones[0];
  return {
    composition_style: blueprint.composition_style,
    hero_location: hero ? (hero.x < blueprint.canvas.w * 0.4 ? "left" : hero.x > blueprint.canvas.w * 0.55 ? "right" : "center") : "center",
    zone_count: blueprint.content_zones.length,
    density: blueprint.visual_density,
  };
}
function sameStyleRepeat(bp, recent) {
  return recent.filter((f) => f.composition_style === bp.composition_style).length;
}

// Pick the best VALID, non-generic concept. If all are generic/invalid,
// returns { chosen: null, reason }.
export function chooseConcept(concepts, ctx = {}) {
  const scored = concepts.map((bp) => ({ blueprint: bp, ...scoreConcept(bp, ctx) }));
  const valid = scored.filter((s) => !s.generic && s.overall >= 45);
  const pool = valid.length ? valid : scored.filter((s) => !s.generic);
  if (!pool.length) return { chosen: null, scored, reason: "all concepts were GENERIC_COMPOSITION_REJECT" };
  pool.sort((a, b) => b.overall - a.overall);
  return { chosen: pool[0].blueprint, chosenScore: pool[0], scored, reason: null };
}

export { fingerprintOf as blueprintFingerprint };
