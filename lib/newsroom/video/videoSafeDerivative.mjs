// Phase SOCIAL-CREATIVE-4C.4 -> 4C.7 - VIDEO-SAFE EDITORIAL DERIVATIVE.
//
// The approved FULL_GENERATIVE_SOCIAL static master is the VISUAL AUTHORITY
// (4C.7 §1). We do NOT reinterpret the dense premium static into a cleaner
// sparser vertical infographic - that repeatedly made the video feel
// cheaper than the source. Instead: understand the master's hierarchy and
// FAITHFULLY REFLOW it into 9:16, preserving visual density, card
// dominance, the red/white hierarchy, and the editorial panels / charts /
// comparisons. The video should feel like the static creative CAME ALIVE.
//
//   * every kept block FULLY inside a conservative mobile centre-safe
//     region - nothing half-shown (4C.4)
//   * framed zones, atmosphere, red accents (4C.5)
//   * a large hero card, strong editorial value block, decisive hierarchy
//     (4C.6)
//   * 4C.7 - the frame is INTENTIONALLY COMPOSED top to bottom: 80-88% of
//     the practical safe region carries meaningful composition, the card
//     is a HERO (not a thumbnail), the lower third is not empty black.
//     ASKING = a large card + an editorial price stack with painted-label
//     chips + a boxed % callout + a LESSON panel. MARKET = a SPLIT
//     composition (giant stat + donut LEFT, a large REAL EXAMPLE card +
//     metadata RIGHT) + a two-item bottom band.
//
// Still deterministic - from data the pipeline already froze. The model
// may invent DESIGN, never DATA.

import { SAFE } from "./videoDirector.mjs";

export const VIDEO_SAFE_DERIVATIVE_VERSION = "4c7.1";
export const VS_W = 1080;
export const VS_H = 1920;

export const VS_SAFE = Object.freeze({ top: 210, right: 100, bottom: 400, left: 100 });

// 4C.7 §3 / §13A - meaningful composition should fill this share of the
// practical safe vertical region. Below the low bound -> CONTENT_OCCUPANCY_FAIL.
export const FRAME_DENSITY_BANDS = Object.freeze({
  asking_vs_sold: [0.78, 0.92],
  deal_hero: [0.78, 0.92],
  market_shape: [0.80, 0.94],
  three_up: [0.70, 0.92],
  printing_compare: [0.70, 0.92],
  _default: [0.75, 0.92],
});

// design language cloned from the approved masters. 4C.7 - stronger
// editorial: a textured value block, painted-label chips, a boxed callout.
export const VS_STYLE = Object.freeze({
  bg: "#0b0b0d",
  ink: "#f7f7f9",
  sub: "#c8c8d0",
  accent: "#e8493d",
  accent_soft: "#ff6a5f",
  positive: "#3fb27f",
  font: '"Helvetica Neue",Arial,system-ui,-apple-system,sans-serif',
  card_shadow: "0 44px 100px rgba(0,0,0,.68)",
  card_rim: "0 0 0 2px rgba(255,255,255,.10)",
  card_backlight: "0 0 110px rgba(232,73,61,.34)",
  // strong editorial value block - a textured near-black slab, red edge
  value_block_bg: "linear-gradient(180deg,#171719 0%,#0d0d10 100%)",
  value_block_border: "1px solid rgba(232,73,61,.32)",
  value_block_shadow: "0 30px 76px rgba(0,0,0,.58), inset 0 1px 0 rgba(255,255,255,.05)",
  panel_bg: "linear-gradient(180deg,#161618 0%,#0e0e11 100%)",
  panel_border: "1px solid rgba(232,73,61,.26)",
  panel_shadow: "0 28px 68px rgba(0,0,0,.52), inset 0 1px 0 rgba(255,255,255,.05)",
  keyline: "3px solid #e8493d",
  spine: "rgba(232,73,61,.9)",
});

export const VS_MIN_FONT = Object.freeze({
  label: 32, hook: 54, hero_stat: 92, primary_stat: 58, comparison: 46,
  value_spine: 46, hero_row: 46, market_split: 40, market_band: 30,
  lesson: 40, context: 36, takeaway: 34, domain: 32, footer: 28,
});

// 4C.7 §4 / §5 - card presence. ASKING/DEAL card is a dominant hero;
// MARKET example card must NOT collapse to a thumbnail.
export const CARD_SCALE = Object.freeze({
  asking_vs_sold: 1.0,
  deal_hero: 1.0,
  market_shape: 1.0,
  three_up: 1.0,
  printing_compare: 0.95,
});

const clampFont = (role, px) => Math.max(VS_MIN_FONT[role] ?? 30, Math.round(px));
const money = (n) => (n == null || !Number.isFinite(Number(n)) ? null : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: Number(n) < 100 && !Number.isInteger(Number(n)) ? 2 : 0, maximumFractionDigits: Number(n) < 100 ? 2 : 0 })}`);
const T = (x) => (x == null ? null : String(x).trim() || null);
const ST = (o = {}) => Object.freeze({ panel: false, spotlight: false, rule: false, emphasis: false, spine: false, framed_base: false, split: false, band: false, ...o });

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

// pull a short deterministic metadata line from the frozen card lock
function cardMeta(S) {
  const L = S.card_metadata_lock ?? {};
  const bits = [];
  if (T(L.set ?? S.card_identity?.set)) bits.push(T(L.set ?? S.card_identity?.set));
  if (T(L.rarity)) bits.push(T(L.rarity));
  return bits.slice(0, 2).join("  ·  ") || null;
}

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
    b.push({ id: "hook", priority: 1, role: "label", h: 84,
      text: family === "deal_hero" ? "LISTED VS MARKET" : "ASKING VS MARKET",
      font: clampFont("label", 44), style: ST({ rule: true }) });
    // §4 - LEFT large hero card, RIGHT an editorial price stack with
    // painted-label chips + a boxed % callout + a drawn comparison arrow.
    b.push({
      id: "hero_row", priority: 1, role: "hero_row", h: 852,
      cardIds: cardAssets[0] ? [cardAssets[0]] : [], cardScale,
      caption: [cardName, cardSet].filter(Boolean).join("  ·  "),
      spine: [
        { label: family === "deal_hero" ? "LISTED PRICE" : "ASKING PRICE", value: askText, kind: "ask", chip: family === "deal_hero" ? "LISTING PRICE" : "LISTING ASK" },
        { op: "arrow" },
        { label: pct != null ? `${Math.abs(pct)}%` : "GAP", sub: pct != null ? dir : "PRICE GAP", kind: "gap", emphasis: true, box: true },
        { op: "arrow" },
        { label: "RECENT MARKET", value: mktText, kind: "mkt", chip: "REAL MARKET VALUE", chip_kind: "positive" },
      ],
      font: clampFont("value_spine", 46),
      style: ST({ spotlight: true, spine: true }),
    });
    // §4 - a LESSON panel (icon + red rule + label + bold body), integrated
    b.push({
      id: "lesson", priority: 1, role: "lesson", h: 214,
      icon: "magnifier_dollar", eyebrow: "LESSON",
      text: T(S.appropriate_lesson) ?? (family === "deal_hero"
        ? "A listing can sit well below market - always check against recent sales."
        : "An asking price can also sit well below market - compare before you judge."),
      font: clampFont("lesson", 42), style: ST({ panel: true }),
    });
    b.push({ id: "_facts", priority: 9, role: "_hidden", h: 0, text: `${askText} ${mktText} ${pct != null ? Math.abs(pct) + "%" : ""}`, style: ST() });
  } else if (family === "market_shape") {
    const u25 = rn.under_25_pct ?? S.claim_value;
    const tracked = rn.tracked_count;
    const viz = (S.visualization_data_manifest?.allowed_points ?? []).map((p) => ({ label: T(p.label) ?? "", value: Number(p.value) || 0 }));
    b.push({ id: "hook", priority: 1, role: "label", h: 80, text: "MARKET INSIGHT", font: clampFont("label", 44), style: ST({ rule: true }) });
    // §5 - a SPLIT composition: giant stat + donut LEFT, a large REAL
    // EXAMPLE card + metadata RIGHT.
    b.push({
      id: "market_split", priority: 1, role: "market_split", h: 900,
      cardIds: cardAssets[0] ? [cardAssets[0]] : [], cardScale,
      stat_lines: [
        u25 != null ? `${u25}%` : "—",
        "OF TRACKED POKEMON",
        "SINGLES SELL UNDER $25",
      ],
      support: tracked != null ? `Based on ${Number(tracked).toLocaleString("en-US")} tracked singles across the market.` : "Based on the tracked-singles population.",
      chart_title: "PRICE DISTRIBUTION",
      chart: viz,               // donut points; dominant first
      example_label: "REAL EXAMPLE",
      example_name: T(S.example_card ?? S.card_identity?.name) ?? "a tracked single",
      meta: cardMeta(S),
      font: clampFont("market_split", 64),
      style: ST({ split: true, spotlight: true }),
    });
    // §5 - a two-item bottom band (fills the lower third, like the master)
    b.push({
      id: "market_band", priority: 1, role: "market_band", h: 196,
      items: [
        { icon: "trend", label: "THE TAKEAWAY", body: "Most tracked singles sit at the affordable end of the market." },
        { icon: "bulb", label: "WHY IT MATTERS", body: "The largest, most active part of the hobby is inexpensive singles." },
      ],
      font: clampFont("market_band", 32), style: ST({ band: true }),
    });
    b.push({ id: "_facts", priority: 9, role: "_hidden", h: 0, text: `${u25 != null ? u25 + "%" : ""} ${tracked != null ? Number(tracked).toLocaleString("en-US") : ""} ${viz.map((p) => p.value + "%").join(" ")}`, style: ST() });
  } else if (family === "three_up") {
    b.push({ id: "hook", priority: 1, role: "label", h: 90, text: "THREE UNDER $25", font: clampFont("label", 44), style: ST({ rule: true }) });
    const ids = cardAssets.slice(0, 3);
    if (ids.length) b.push({ id: "card_row", priority: 1, role: "card_row", h: 560, cardIds: ids, cardScale, style: ST({ spotlight: true }) });
    const items = (S.item_identities ?? []).slice(0, 3);
    if (items.length) b.push({ id: "price_strip", priority: 1, role: "comparison", h: 146,
      text: items.map((it) => money(it.price)).filter(Boolean).join("      "), font: clampFont("comparison", 52), style: ST({ panel: true }) });
    b.push({ id: "context", priority: 1, role: "context", h: 92, text: "Real live listings, each below its own market reference.", font: clampFont("context", 36), style: ST() });
    b.push({ id: "takeaway", priority: 2, role: "takeaway", h: 96, text: "You do not need a big budget to collect well.", font: clampFont("takeaway", 34), style: ST() });
    b.push({ id: "_facts", priority: 9, role: "_hidden", h: 0, text: items.map((it) => money(it.price)).filter(Boolean).join(" "), style: ST() });
  } else if (family === "printing_compare") {
    b.push({ id: "hook", priority: 1, role: "label", h: 90, text: "SAME POKEMON, DIFFERENT PRINTING", font: clampFont("label", 36), style: ST({ rule: true }) });
    const ids = cardAssets.slice(0, 2);
    if (ids.length >= 2) b.push({ id: "card_pair", priority: 1, role: "card_row", h: 560, cardIds: ids, cardScale, style: ST({ spotlight: true }) });
    const l = S.comparison_left ?? {}; const r = S.comparison_right ?? {};
    b.push({ id: "compare", priority: 1, role: "comparison", h: 146, text: `${T(l.text) ?? "A"}   vs   ${T(r.text) ?? "B"}`, font: clampFont("comparison", 48), style: ST({ panel: true }) });
    const proof = T(S.printing_difference_proof);
    if (proof) b.push({ id: "context", priority: 1, role: "context", h: 128, text: proof, font: clampFont("context", 36), style: ST() });
    b.push({ id: "_facts", priority: 9, role: "_hidden", h: 0, text: `${T(l.text) ?? ""} ${T(r.text) ?? ""}`, style: ST() });
  }

  return b;
}

// -------------------------------------------------------------
// STACK LAYOUT
// -------------------------------------------------------------
function layout(blocks, safe) {
  const cs = centreSafe(safe);
  const GAP = 20;
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

// rough on-frame height of the visual SUBJECT card, as a fraction of the
// safe-region height (the "does it feel like the subject" metric).
function heroFraction(placed, cs) {
  const hr = placed.find((p) => p.role === "hero_row");
  if (hr) {
    const colW = cs.w * 0.47;                 // 4C.7 - the card column
    return Math.min((hr.h - 56), colW / 0.716) / cs.h;
  }
  const ms = placed.find((p) => p.role === "market_split");
  if (ms) {
    const colW = cs.w * 0.46;
    return Math.min((ms.h - 70), colW / 0.716) / cs.h;
  }
  const card = placed.find((p) => p.role === "card");
  if (card) {
    const cardScale = card.cardScale ?? 1;
    return Math.min((card.h - 56) * cardScale, (cs.w * 0.72) / 0.716) / cs.h;
  }
  const row = placed.find((p) => p.role === "card_row");
  if (row) return Math.min((row.h - 40), cs.h * 0.42) / cs.h;
  return 0;
}

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

// 4C.7 §3 / §13C - empty black in the LOWER 40% of the safe region.
function lowerDeadSpace(placed, cs) {
  const yStart = cs.y + cs.h * 0.6;
  const lowerBottoms = placed
    .filter((p) => p.zone.y + p.zone.h > yStart)
    .map((p) => p.zone.y + p.zone.h);
  const lastBottom = lowerBottoms.length ? Math.max(...lowerBottoms) : yStart;
  // fraction of the safe height that is empty below the last content block
  return Math.max(0, (cs.bottom - lastBottom) / cs.h);
}

export function buildVideoSafeDerivative({ family = "deal_hero", semanticManifest = {}, factLock = {}, cardAssets = [], safe = VS_SAFE } = {}) {
  const cleanCards = (cardAssets ?? []).map((p) => String(p ?? "").replace(/^file:\/\//, "")).filter(Boolean);
  const raw = blocksFor({ family, semanticManifest, factLock, cardAssets: cleanCards });
  const { placed, hidden, removed, fits, overflow, content_ratio, cs } = layout(raw, safe);

  const shown_numbers = [];
  const scan = (txt) => { for (const m of String(txt ?? "").matchAll(/-?\$?\d[\d,]*\.?\d*%?/g)) shown_numbers.push(m[0]); };
  for (const blk of placed) {
    scan(blk.text);
    for (const p of blk.points ?? blk.chart ?? []) shown_numbers.push(`${p.value}%`);
    for (const r of blk.rows ?? blk.spine ?? []) { scan(r.value); scan(r.label); }
    for (const s of blk.stat_lines ?? []) scan(s);
    scan(blk.support);
  }
  for (const h of hidden) scan(h.text);

  const [lo, hi] = FRAME_DENSITY_BANDS[family] ?? FRAME_DENSITY_BANDS._default;
  const hero_fraction = Math.round(heroFraction(placed, cs) * 1000) / 1000;
  const largest_gap = Math.round(largestGapFraction(placed, cs) * 1000) / 1000;
  const lower_dead = Math.round(lowerDeadSpace(placed, cs) * 1000) / 1000;

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
    density: Object.freeze({
      content_ratio: Math.round(content_ratio * 1000) / 1000,
      hero_fraction,
      largest_gap,
      lower_dead_space: lower_dead,
      target_lo: lo, target_hi: hi,
    }),
    atmosphere: Object.freeze({ variant: "story", enabled: true }),
    dropped_from_master: Object.freeze([
      "the CARD DETAILS icon strip / dense footer",
      "tiny methodology paragraph copy",
      "duplicated percentages / repeated captions",
      "the header domain line (the universal CTA owns the website)",
    ]),
  });
}
