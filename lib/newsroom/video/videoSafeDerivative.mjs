// Phase SOCIAL-CREATIVE-4C.4 / 4C.5 / 4C.6 - VIDEO-SAFE EDITORIAL DERIVATIVE.
//
// The approved FULL_GENERATIVE_SOCIAL static master is the benchmark. The
// video should feel like a MOTION EXTENSION of that master, not a
// stripped-down replacement. We do NOT literally export the static post
// (it is too dense / tall for vertical video and clipped in 4C.3), but the
// derivative must reach visual PARITY with it:
//   * every kept block FULLY inside a conservative mobile centre-safe
//     region - nothing half-shown (4C.4)
//   * framed zones, panel depth, red rule accents, spotlighting, atmosphere
//     (4C.5)
//   * 4C.6 - CONTROLLED IMPACT: a large hero card, large high-contrast key
//     numbers, a strong editorial value block (NOT soft glass), a premium
//     chart container, decisive hierarchy, 60-82% visual density. The
//     4C.5 build overcorrected into too much breathing room / small cards /
//     dim panels; this restores composition weight.
//
// Still deterministic - from data the pipeline already froze. The model
// may invent DESIGN, never DATA.

import { SAFE } from "./videoDirector.mjs";

export const VIDEO_SAFE_DERIVATIVE_VERSION = "4c6.1";
export const VS_W = 1080;
export const VS_H = 1920;

export const VS_SAFE = Object.freeze({ top: 210, right: 100, bottom: 400, left: 100 });

// 4C.6 §4 - meaningful content should fill this share of the safe field
// (family-aware). Below the low bound -> UNDERCOMPOSED_FRAME_FAIL; above
// the high bound -> FRAME_DENSITY_TOO_HIGH_FAIL.
export const FRAME_DENSITY_BANDS = Object.freeze({
  asking_vs_sold: [0.58, 0.84],
  deal_hero: [0.58, 0.84],
  market_shape: [0.62, 0.93],
  three_up: [0.55, 0.88],
  printing_compare: [0.55, 0.88],
  _default: [0.58, 0.90],
});

// design language cloned from the approved masters, plus 4C.6 STRONG
// editorial tokens (the 4C.5 soft-glass panel read as SaaS / underlit).
export const VS_STYLE = Object.freeze({
  bg: "#0b0b0d",
  ink: "#f6f6f8",
  sub: "#c2c2ca",
  accent: "#e8493d",
  accent_soft: "#ff6a5f",
  positive: "#3fb27f",
  font: '"Helvetica Neue",Arial,system-ui,-apple-system,sans-serif',
  card_shadow: "0 40px 90px rgba(0,0,0,.66)",
  card_rim: "0 0 0 2px rgba(255,255,255,.09)",
  card_backlight: "0 0 90px rgba(232,73,61,.30)",
  // strong value block - a darker high-contrast slab with a thin red keyline
  value_block_bg: "linear-gradient(180deg,#151518,#0e0e11)",
  value_block_border: "1px solid rgba(232,73,61,.30)",
  value_block_shadow: "0 28px 70px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.05)",
  // chart container keeps a subtle glass but with a red keyline
  panel_bg: "linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.015))",
  panel_border: "1px solid rgba(232,73,61,.24)",
  panel_shadow: "0 26px 64px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.05)",
  keyline: "3px solid #e8493d",
  spine: "rgba(232,73,61,.9)",
});

// minimum on-screen size per role
export const VS_MIN_FONT = Object.freeze({
  label: 32, hook: 54, hero_stat: 92, primary_stat: 58, comparison: 46,
  value_spine: 46, hero_row: 46, context: 36, takeaway: 34, domain: 32, footer: 28,
});

// 4C.6 §5 - real card presence, up from 4C.5. A hero card must FEEL like
// the subject, not a thumbnail.
export const CARD_SCALE = Object.freeze({
  asking_vs_sold: 1.0,
  deal_hero: 1.0,
  market_shape: 1.0,     // was 0.82 - the example card was a tiny thumbnail
  three_up: 1.0,
  printing_compare: 0.95,
});

const clampFont = (role, px) => Math.max(VS_MIN_FONT[role] ?? 30, Math.round(px));
const money = (n) => (n == null || !Number.isFinite(Number(n)) ? null : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: Number(n) < 100 && !Number.isInteger(Number(n)) ? 2 : 0, maximumFractionDigits: Number(n) < 100 ? 2 : 0 })}`);
const T = (x) => (x == null ? null : String(x).trim() || null);
const ST = (o = {}) => Object.freeze({ panel: false, spotlight: false, rule: false, emphasis: false, spine: false, framed_base: false, ...o });

export function centreSafe(safe = SAFE) {
  return Object.freeze({
    x: safe.left, y: safe.top,
    w: VS_W - safe.left - safe.right,
    h: VS_H - safe.top - safe.bottom,
    right: VS_W - safe.right,
    bottom: VS_H - safe.bottom,
  });
}

const FAMILY_GIST = Object.freeze({
  deal_hero: "This card is listed below its market reference.",
  asking_vs_sold: "The listing price and the market price are very different.",
  market_shape: "This is a Pokemon card market statistic.",
  three_up: "These are affordable Pokemon cards.",
  printing_compare: "These printings differ and the distinction matters.",
});

// -------------------------------------------------------------
// PRIORITY BLOCKS - deterministic, from frozen data only
// -------------------------------------------------------------
function blocksFor({ family, semanticManifest: S = {}, factLock: F = {}, cardAssets = [] }) {
  const rn = S.required_numeric_facts ?? {};
  const cardName = T(S.card_identity?.name ?? F.card_name);
  const cardSet = T(S.card_identity?.set ?? F.card_set);
  const cardScale = CARD_SCALE[family] ?? 0.95;
  const b = [];

  if (family === "deal_hero" || family === "asking_vs_sold") {
    const left = S.comparison_left ?? {};
    const right = S.comparison_right ?? {};
    const pct = family === "deal_hero" ? rn.discount_pct : rn.premium_pct;
    const dir = S.comparison_direction === "ABOVE_MARKET" ? "ABOVE MARKET"
      : S.comparison_direction === "BELOW_MARKET" ? "BELOW MARKET" : "VS MARKET";
    const askText = T(left.text) ?? money(left.value) ?? "listed";
    const mktText = T(right.text) ?? money(right.value) ?? "market";
    b.push({ id: "hook", priority: 1, role: "label", h: 92,
      text: family === "deal_hero" ? "LISTED VS MARKET" : "ASKING VS MARKET",
      font: clampFont("label", 42), style: ST({ rule: true }) });
    // §6 - LEFT large hero card, RIGHT strong stacked comparison with a red
    // comparison spine. ONE block, rendered side by side.
    b.push({
      id: "hero_row", priority: 1, role: "hero_row", h: 726,
      cardIds: cardAssets[0] ? [cardAssets[0]] : [], cardScale,
      caption: [cardName, cardSet].filter(Boolean).join("  ·  "),
      spine: [
        { label: family === "deal_hero" ? "LISTED PRICE" : "ASKING PRICE", value: askText, kind: "ask" },
        { op: "↓" },
        { label: pct != null ? `${Math.abs(pct)}% ${dir}` : "PRICE GAP", kind: "gap", emphasis: true },
        { op: "↓" },
        { label: "RECENT MARKET", value: mktText, kind: "mkt" },
      ],
      font: clampFont("value_spine", 46),
      style: ST({ spotlight: true, spine: true }),
    });
    b.push({ id: "takeaway", priority: 2, role: "takeaway", h: 84,
      text: family === "deal_hero" ? "Check the listing against recent sales." : "Compare the asking price with recent sales.",
      font: clampFont("takeaway", 35), style: ST() });
    b.push({ id: "_facts", priority: 9, role: "_hidden", h: 0, text: `${askText} ${mktText} ${pct != null ? Math.abs(pct) + "%" : ""}`, style: ST() });
  } else if (family === "market_shape") {
    const u25 = rn.under_25_pct ?? S.claim_value;
    const tracked = rn.tracked_count;
    b.push({ id: "hook", priority: 1, role: "label", h: 82, text: "MARKET SNAPSHOT", font: clampFont("label", 42), style: ST({ rule: true }) });
    b.push({ id: "hero_stat", priority: 1, role: "hero_stat", h: 190, text: u25 != null ? `${u25}%` : "—", font: clampFont("hero_stat", 134), style: ST({ spotlight: true, emphasis: true }) });
    b.push({ id: "population", priority: 1, role: "context", h: 84,
      text: tracked != null ? `of ${Number(tracked).toLocaleString("en-US")} tracked singles sell under $25` : "of tracked singles sell under $25",
      font: clampFont("context", 40), style: ST() });
    const viz = S.visualization_data_manifest?.allowed_points ?? [];
    if (viz.length) b.push({ id: "chart", priority: 1, role: "chart", h: 322, premium: true, dominant_first: true,
      points: viz.map((p) => ({ label: T(p.label) ?? "", value: Number(p.value) || 0 })), style: ST({ panel: true }) });
    if (cardAssets[0]) b.push({ id: "example_card", priority: 1, role: "card", h: 400, cardIds: [cardAssets[0]], cardScale,
      example_label: "REAL EXAMPLE",
      caption: T(S.example_card ?? S.card_identity?.name) ?? "a tracked single", style: ST({ spotlight: true, framed_base: true }) });
    b.push({ id: "takeaway", priority: 2, role: "takeaway", h: 88,
      text: "Most tracked singles sit at the affordable end of the market.", font: clampFont("takeaway", 34), style: ST() });
    b.push({ id: "_facts", priority: 9, role: "_hidden", h: 0, text: `${u25 != null ? u25 + "%" : ""} ${tracked != null ? Number(tracked).toLocaleString("en-US") : ""}`, style: ST() });
  } else if (family === "three_up") {
    b.push({ id: "hook", priority: 1, role: "label", h: 90, text: "THREE UNDER $25", font: clampFont("label", 44), style: ST({ rule: true }) });
    const ids = cardAssets.slice(0, 3);
    if (ids.length) b.push({ id: "card_row", priority: 1, role: "card_row", h: 540, cardIds: ids, cardScale, style: ST({ spotlight: true }) });
    const items = (S.item_identities ?? []).slice(0, 3);
    if (items.length) b.push({ id: "price_strip", priority: 1, role: "comparison", h: 138,
      text: items.map((it) => money(it.price)).filter(Boolean).join("      "), font: clampFont("comparison", 52), style: ST({ panel: true }) });
    b.push({ id: "context", priority: 1, role: "context", h: 88, text: "Real live listings, each below its own market reference.", font: clampFont("context", 36), style: ST() });
    b.push({ id: "takeaway", priority: 2, role: "takeaway", h: 90, text: "You do not need a big budget to collect well.", font: clampFont("takeaway", 34), style: ST() });
    b.push({ id: "_facts", priority: 9, role: "_hidden", h: 0, text: items.map((it) => money(it.price)).filter(Boolean).join(" "), style: ST() });
  } else if (family === "printing_compare") {
    b.push({ id: "hook", priority: 1, role: "label", h: 90, text: "SAME POKEMON, DIFFERENT PRINTING", font: clampFont("label", 36), style: ST({ rule: true }) });
    const ids = cardAssets.slice(0, 2);
    if (ids.length >= 2) b.push({ id: "card_pair", priority: 1, role: "card_row", h: 540, cardIds: ids, cardScale, style: ST({ spotlight: true }) });
    const l = S.comparison_left ?? {}; const r = S.comparison_right ?? {};
    b.push({ id: "compare", priority: 1, role: "comparison", h: 138, text: `${T(l.text) ?? "A"}   vs   ${T(r.text) ?? "B"}`, font: clampFont("comparison", 48), style: ST({ panel: true }) });
    const proof = T(S.printing_difference_proof);
    if (proof) b.push({ id: "context", priority: 1, role: "context", h: 120, text: proof, font: clampFont("context", 36), style: ST() });
    b.push({ id: "_facts", priority: 9, role: "_hidden", h: 0, text: `${T(l.text) ?? ""} ${T(r.text) ?? ""}`, style: ST() });
  }

  b.push({ id: "domain", priority: 3, role: "domain", h: 66, text: "pokemondealfinder.com", font: clampFont("domain", 34), style: ST() });
  return b;
}

// -------------------------------------------------------------
// STACK LAYOUT - top-to-bottom inside centre-safe. Anything that does not
// fit is removed WHOLE (lowest priority first), never shown partially.
// -------------------------------------------------------------
function layout(blocks, safe) {
  const cs = centreSafe(safe);
  const GAP = 22;
  let kept = blocks.filter((x) => x.role !== "_hidden");
  const hidden = blocks.filter((x) => x.role === "_hidden");
  const removed = [];

  const totalH = (arr) => arr.reduce((s, x) => s + x.h, 0) + GAP * Math.max(0, arr.length - 1);

  while (totalH(kept) > cs.h && kept.some((x) => x.priority >= 2)) {
    let worstIdx = -1, worstP = 1;
    kept.forEach((x, i) => { if (x.priority >= 2 && x.priority >= worstP) { worstP = x.priority; worstIdx = i; } });
    if (worstIdx < 0) break;
    removed.push({ id: kept[worstIdx].id, reason: `removed whole to fit the mobile centre-safe region (priority ${kept[worstIdx].priority})` });
    kept.splice(worstIdx, 1);
  }

  const fits = totalH(kept) <= cs.h + 0.5;
  const used = totalH(kept);
  const contentH = kept.reduce((s, x) => s + x.h, 0);
  let y = cs.y + Math.max(0, Math.floor((cs.h - used) / 2));
  const placed = kept.map((x) => {
    const zone = { x: cs.x, y, w: cs.w, h: x.h };
    y += x.h + GAP;
    const overflow = zone.y < cs.y - 0.5 || zone.y + zone.h > cs.bottom + 0.5 || zone.x < cs.x - 0.5 || zone.x + zone.w > cs.right + 0.5;
    return { ...x, zone: Object.freeze(zone), fully_inside_safe: !overflow, partial: false };
  });

  const overflow = placed.filter((p) => !p.fully_inside_safe).map((p) => ({ id: p.id, zone: p.zone }));
  return { placed, hidden, removed, fits: fits && !overflow.length, overflow, cs, content_ratio: contentH / cs.h };
}

// rough on-frame height of the visual SUBJECT (hero card / example card),
// as a fraction of the safe-region height - the §5 / §28 "does it feel
// like the subject" metric.
function heroFraction(placed, cs) {
  const hr = placed.find((p) => p.role === "hero_row");
  if (hr) {
    // card sits in the left ~52% column; height is width-limited
    const colW = cs.w * 0.52;
    const cardH = Math.min((hr.h - 48), colW / 0.716);
    return cardH / cs.h;
  }
  const card = placed.find((p) => p.role === "card");
  if (card) {
    const cardScale = card.cardScale ?? 1;
    const cardH = Math.min((card.h - 56) * cardScale, (cs.w * 0.72) / 0.716);
    return cardH / cs.h;
  }
  const row = placed.find((p) => p.role === "card_row");
  if (row) return Math.min((row.h - 40), cs.h * 0.42) / cs.h;
  return 0;
}

// largest inactive vertical gap inside the safe region, as a fraction of
// its height (a big one reads as an unfinished / undercomposed frame).
function largestGapFraction(placed, cs) {
  if (!placed.length) return 1;
  const sorted = [...placed].sort((a, b) => a.zone.y - b.zone.y);
  let gap = sorted[0].zone.y - cs.y;
  gap = Math.max(gap, cs.bottom - (sorted[sorted.length - 1].zone.y + sorted[sorted.length - 1].zone.h));
  for (let i = 1; i < sorted.length; i++) {
    gap = Math.max(gap, sorted[i].zone.y - (sorted[i - 1].zone.y + sorted[i - 1].zone.h));
  }
  return gap / cs.h;
}

export function buildVideoSafeDerivative({ family = "deal_hero", semanticManifest = {}, factLock = {}, cardAssets = [], safe = VS_SAFE } = {}) {
  const cleanCards = (cardAssets ?? []).map((p) => String(p ?? "").replace(/^file:\/\//, "")).filter(Boolean);
  const raw = blocksFor({ family, semanticManifest, factLock, cardAssets: cleanCards });
  const { placed, hidden, removed, fits, overflow, content_ratio, cs } = layout(raw, safe);

  const shown_numbers = [];
  const scan = (txt) => { for (const m of String(txt ?? "").matchAll(/-?\$?\d[\d,]*\.?\d*%?/g)) shown_numbers.push(m[0]); };
  for (const blk of placed) {
    scan(blk.text);
    for (const p of blk.points ?? []) shown_numbers.push(`${p.value}%`);
    for (const r of blk.rows ?? blk.spine ?? []) { scan(r.value); scan(r.label); }
  }
  for (const h of hidden) scan(h.text);

  const [lo, hi] = FRAME_DENSITY_BANDS[family] ?? FRAME_DENSITY_BANDS._default;
  const hero_fraction = Math.round(heroFraction(placed, cs) * 1000) / 1000;
  const largest_gap = Math.round(largestGapFraction(placed, cs) * 1000) / 1000;

  return Object.freeze({
    version: VIDEO_SAFE_DERIVATIVE_VERSION,
    family,
    width: VS_W, height: VS_H,
    safe: Object.freeze({ ...safe }),
    centre_safe: centreSafe(safe),
    style: VS_STYLE,
    blocks: placed,
    removed: Object.freeze(removed),
    fits,
    overflow: Object.freeze(overflow),
    comprehension_line: FAMILY_GIST[family] ?? "A Pokemon card story.",
    priority1_ids: placed.filter((b) => b.priority === 1).map((b) => b.id),
    shown_numbers: Object.freeze([...new Set(shown_numbers)]),
    card_asset_paths: Object.freeze(cleanCards),
    // 4C.6 §4 / §5 / §28 - composition weight metrics
    density: Object.freeze({
      content_ratio: Math.round(content_ratio * 1000) / 1000,
      hero_fraction,
      largest_gap,
      target_lo: lo, target_hi: hi,
    }),
    atmosphere: Object.freeze({ variant: "story", enabled: true }),
    dropped_from_master: Object.freeze([
      "methodology / “why this matters” paragraph copy",
      "tiny metadata rows (set code, rarity glyphs, collector number chrome)",
      "dense footer sections",
      "duplicated percentages / repeated stats",
      "decorative labels that add no meaning",
    ]),
  });
}
