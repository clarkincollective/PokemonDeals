// Phase SOCIAL-CREATIVE-4C.4 / 4C.5 - VIDEO-SAFE EDITORIAL DERIVATIVE.
//
// The approved FULL_GENERATIVE_SOCIAL static master is premium but too
// dense / tall / detailed for vertical video (4C.4 §7): the owner found the
// 4C.3 loop visibly clipped the lower CARD DETAILS section.
//
// So we do NOT literally export the static post. We build a composition
// that:
//   * keeps the master's design language (black / red / white, editorial
//     typography character, soft-shadow card treatment, restrained accent)
//   * keeps only PRIORITY-1 content (hero fact, real card, primary
//     stat/comparison, enough context), an optional short takeaway (P2),
//     and a small domain line (P3)
//   * lays every kept block FULLY inside a conservative mobile centre-safe
//     region - nothing is ever half-shown
//
// 4C.5 - SIMPLIFIED BUT STILL DESIGNED (§8): simplification solved clipping
// but stripped too much richness. Blocks now carry style intent (framed
// zones, panel depth, red rule accents, spotlighting) and family-aware
// card scale (§31); the derivative reports a composition-density figure
// (§30) and declares an atmosphere variant so the frame is never dead
// black (§6). Still deterministic - from data the pipeline already froze.
// The model may invent DESIGN, never DATA.

import { SAFE } from "./videoDirector.mjs";

export const VIDEO_SAFE_DERIVATIVE_VERSION = "4c5.1";
export const VS_W = 1080;
export const VS_H = 1920;

// a conservative-but-realistic mobile centre-safe rectangle for a CALM
// editorial video frame (the 4C `SAFE` union reserves the bottom 500px -
// too aggressive here; the universal CTA end screen owns the bottom-heavy
// content).
export const VS_SAFE = Object.freeze({ top: 210, right: 100, bottom: 400, left: 100 });

// design language cloned from the approved masters (5 / 5A / 5A.1), plus
// 4C.5 panel / rule tokens so simplified is still DESIGNED.
export const VS_STYLE = Object.freeze({
  bg: "#0b0b0d",
  ink: "#f4f4f6",
  sub: "#b9b9c1",
  accent: "#e4483d",
  positive: "#3fb27f",
  font: '"Helvetica Neue",Arial,system-ui,-apple-system,sans-serif',
  card_shadow: "0 30px 70px rgba(0,0,0,.6)",
  card_rim: "0 0 0 2px rgba(255,255,255,.07)",
  panel_bg: "linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.015))",
  panel_border: "1px solid rgba(255,255,255,.10)",
  panel_shadow: "0 24px 60px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.05)",
  rule: "2px solid rgba(228,72,61,.85)",
});

// minimum on-screen size per role so nobody has to pause / zoom
export const VS_MIN_FONT = Object.freeze({
  label: 30, hook: 52, hero_stat: 68, primary_stat: 54, comparison: 44,
  value_ladder: 40, context: 34, takeaway: 32, domain: 30, footer: 26,
});

// §31 - family-aware minimum visual card presence (fraction of the card
// block's own box the artwork should occupy - the renderer honours this)
export const CARD_SCALE = Object.freeze({
  asking_vs_sold: 1.0,   // a genuine hero, not a thumbnail
  deal_hero: 1.0,
  market_shape: 0.82,    // smaller than ASKING but still reads as a collectible
  three_up: 0.92,
  printing_compare: 0.86,
});

const clampFont = (role, px) => Math.max(VS_MIN_FONT[role] ?? 30, Math.round(px));
const money = (n) => (n == null || !Number.isFinite(Number(n)) ? null : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: Number(n) < 100 && !Number.isInteger(Number(n)) ? 2 : 0, maximumFractionDigits: Number(n) < 100 ? 2 : 0 })}`);
const T = (x) => (x == null ? null : String(x).trim() || null);
const ST = (o = {}) => Object.freeze({ panel: false, spotlight: false, rule: false, emphasis: false, ...o });

// the centre-safe rectangle every kept block must live inside
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
  const cardScale = CARD_SCALE[family] ?? 0.9;
  const b = [];

  if (family === "deal_hero" || family === "asking_vs_sold") {
    const left = S.comparison_left ?? {};
    const right = S.comparison_right ?? {};
    const pct = family === "deal_hero" ? rn.discount_pct : rn.premium_pct;
    const dir = S.comparison_direction === "ABOVE_MARKET" ? "ABOVE MARKET"
      : S.comparison_direction === "BELOW_MARKET" ? "BELOW MARKET" : "VS MARKET";
    const askText = T(left.text) ?? money(left.value) ?? "listed";
    const mktText = T(right.text) ?? money(right.value) ?? "market";
    // §11 - a small branded story label
    b.push({ id: "hook", priority: 1, role: "label", h: 96,
      text: family === "deal_hero" ? "LISTED BELOW MARKET" : "ASKING VS MARKET",
      font: clampFont("label", 40), style: ST({ rule: true }) });
    if (cardAssets[0]) b.push({ id: "hero_card", priority: 1, role: "card", h: 520, cardIds: [cardAssets[0]], cardScale,
      caption: [cardName, cardSet].filter(Boolean).join("  ·  "), style: ST({ spotlight: true }) });
    // §11 - the value ladder as ONE framed panel: ASK -> % -> MARKET
    b.push({ id: "value_ladder", priority: 1, role: "value_ladder", h: 344,
      rows: [
        { label: family === "deal_hero" ? "LISTED" : "ASK", value: askText },
        { op: "↓" },
        { label: pct != null ? `${Math.abs(pct)}% ${dir}` : "PRICE GAP", emphasis: true },
        { op: "↓" },
        { label: "RECENT MARKET", value: mktText },
      ],
      font: clampFont("value_ladder", 42), style: ST({ panel: true }) });
    // §11 - short lesson only, no paragraph copy
    b.push({ id: "takeaway", priority: 2, role: "takeaway", h: 84,
      text: family === "deal_hero" ? "Check the listing against recent sales." : "Compare the asking price with recent sales.",
      font: clampFont("takeaway", 33), style: ST() });
    // shown numbers the exact-fact lock cares about
    b.push({ id: "_facts", priority: 9, role: "_hidden", h: 0, text: `${askText} ${mktText} ${pct != null ? Math.abs(pct) + "%" : ""}`, style: ST() });
  } else if (family === "market_shape") {
    const u25 = rn.under_25_pct ?? S.claim_value;
    const tracked = rn.tracked_count;
    b.push({ id: "hook", priority: 1, role: "label", h: 92, text: "MARKET SNAPSHOT", font: clampFont("label", 40), style: ST({ rule: true }) });
    b.push({ id: "hero_stat", priority: 1, role: "hero_stat", h: 176, text: u25 != null ? `${u25}%` : "—", font: clampFont("hero_stat", 122), style: ST({ spotlight: true, emphasis: true }) });
    b.push({ id: "population", priority: 1, role: "context", h: 92,
      text: tracked != null ? `of ${Number(tracked).toLocaleString("en-US")} tracked singles sell under $25` : "of tracked singles sell under $25",
      font: clampFont("context", 37), style: ST() });
    const viz = S.visualization_data_manifest?.allowed_points ?? [];
    if (viz.length) b.push({ id: "chart", priority: 1, role: "chart", h: 320, premium: true,
      points: viz.map((p) => ({ label: T(p.label) ?? "", value: Number(p.value) || 0 })), style: ST({ panel: true }) });
    if (cardAssets[0]) b.push({ id: "example_card", priority: 1, role: "card", h: 328, cardIds: [cardAssets[0]], cardScale,
      caption: `one example: ${T(S.example_card ?? S.card_identity?.name) ?? "a tracked single"}`, style: ST({ spotlight: true }) });
    b.push({ id: "takeaway", priority: 2, role: "takeaway", h: 96,
      text: "Most tracked singles sit at the affordable end of the market.", font: clampFont("takeaway", 33), style: ST() });
    b.push({ id: "_facts", priority: 9, role: "_hidden", h: 0, text: `${u25 != null ? u25 + "%" : ""} ${tracked != null ? Number(tracked).toLocaleString("en-US") : ""}`, style: ST() });
  } else if (family === "three_up") {
    b.push({ id: "hook", priority: 1, role: "label", h: 92, text: "THREE UNDER $25", font: clampFont("label", 42), style: ST({ rule: true }) });
    const ids = cardAssets.slice(0, 3);
    if (ids.length) b.push({ id: "card_row", priority: 1, role: "card_row", h: 500, cardIds: ids, cardScale, style: ST({ spotlight: true }) });
    const items = (S.item_identities ?? []).slice(0, 3);
    if (items.length) b.push({ id: "price_strip", priority: 1, role: "comparison", h: 128,
      text: items.map((it) => money(it.price)).filter(Boolean).join("      "), font: clampFont("comparison", 48), style: ST({ panel: true }) });
    b.push({ id: "context", priority: 1, role: "context", h: 88, text: "Real live listings, each below its own market reference.", font: clampFont("context", 34), style: ST() });
    b.push({ id: "takeaway", priority: 2, role: "takeaway", h: 92, text: "You do not need a big budget to collect well.", font: clampFont("takeaway", 32), style: ST() });
    b.push({ id: "_facts", priority: 9, role: "_hidden", h: 0, text: items.map((it) => money(it.price)).filter(Boolean).join(" "), style: ST() });
  } else if (family === "printing_compare") {
    b.push({ id: "hook", priority: 1, role: "label", h: 92, text: "SAME POKEMON, DIFFERENT PRINTING", font: clampFont("label", 34), style: ST({ rule: true }) });
    const ids = cardAssets.slice(0, 2);
    if (ids.length >= 2) b.push({ id: "card_pair", priority: 1, role: "card_row", h: 500, cardIds: ids, cardScale, style: ST({ spotlight: true }) });
    const l = S.comparison_left ?? {}; const r = S.comparison_right ?? {};
    b.push({ id: "compare", priority: 1, role: "comparison", h: 128, text: `${T(l.text) ?? "A"}   vs   ${T(r.text) ?? "B"}`, font: clampFont("comparison", 46), style: ST({ panel: true }) });
    const proof = T(S.printing_difference_proof);
    if (proof) b.push({ id: "context", priority: 1, role: "context", h: 116, text: proof, font: clampFont("context", 34), style: ST() });
    b.push({ id: "_facts", priority: 9, role: "_hidden", h: 0, text: `${T(l.text) ?? ""} ${T(r.text) ?? ""}`, style: ST() });
  }

  b.push({ id: "domain", priority: 3, role: "domain", h: 70, text: "pokemondealfinder.com", font: clampFont("domain", 32), style: ST() });
  return b;
}

// -------------------------------------------------------------
// STACK LAYOUT - top-to-bottom inside centre-safe. Anything that does not
// fit is removed WHOLE (lowest priority first), never shown partially.
// -------------------------------------------------------------
function layout(blocks, safe) {
  const cs = centreSafe(safe);
  const GAP = 24;
  // hidden fact-carrier blocks never take space or render
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

/**
 * buildVideoSafeDerivative({ family, semanticManifest, factLock, cardAssets, safe })
 *
 * -> { version, family, width, height, safe, centre_safe, style, blocks,
 *      removed, fits, overflow, comprehension_line, priority1_ids,
 *      shown_numbers, card_asset_paths, density, atmosphere, dropped_from_master }
 */
export function buildVideoSafeDerivative({ family = "deal_hero", semanticManifest = {}, factLock = {}, cardAssets = [], safe = VS_SAFE } = {}) {
  const cleanCards = (cardAssets ?? []).map((p) => String(p ?? "").replace(/^file:\/\//, "")).filter(Boolean);
  const raw = blocksFor({ family, semanticManifest, factLock, cardAssets: cleanCards });
  const { placed, hidden, removed, fits, overflow, content_ratio } = layout(raw, safe);

  const shown_numbers = [];
  const scan = (txt) => { for (const m of String(txt ?? "").matchAll(/-?\$?\d[\d,]*\.?\d*%?/g)) shown_numbers.push(m[0]); };
  for (const blk of placed) {
    scan(blk.text);
    for (const p of blk.points ?? []) shown_numbers.push(`${p.value}%`);
    for (const r of blk.rows ?? []) { scan(r.value); scan(r.label); }
  }
  for (const h of hidden) scan(h.text);

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
    // §30 - composition density (vertical fill of meaningful content, gaps
    // excluded). Target roughly 0.45 - 0.78.
    density: Object.freeze({ content_ratio: Math.round(content_ratio * 1000) / 1000, target_lo: 0.45, target_hi: 0.78 }),
    // §6 - the frame is never dead flat black; the document renders this
    // atmosphere variant behind the composition.
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
