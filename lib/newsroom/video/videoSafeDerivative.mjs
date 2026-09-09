// Phase SOCIAL-CREATIVE-4C.4 - VIDEO-SAFE EDITORIAL DERIVATIVE (§7, §8, §9).
//
// The approved FULL_GENERATIVE_SOCIAL static master is premium but too
// dense / tall / detailed for vertical video (§7): the owner found the
// 4C.3 loop visibly clipped the lower CARD DETAILS section.
//
// So we do NOT literally export the static post. We build a SIMPLIFIED
// 1080x1920 composition that:
//   * keeps the master's design language (black / red / white, editorial
//     typography character, soft-shadow card treatment, restrained accent)
//   * keeps only PRIORITY-1 content (hero fact, real card, primary
//     stat/comparison, enough context to understand the story), an
//     optional short collector takeaway (P2), and a small domain line (P3)
//   * removes methodology paragraphs, tiny metadata, dense footers,
//     duplicated stats, decorative labels (§9)
//   * lays every kept block FULLY inside a conservative mobile centre-safe
//     region - nothing is ever half-shown (§10, §11)
//
// This is NOT a new AI generation - it is a deterministic re-composition
// from data the pipeline already froze (factLock / semantic manifest /
// card_metadata_lock / visualization_data_manifest) + the real canonical
// card PNG(s). The model may invent DESIGN, never DATA.

import { SAFE } from "./videoDirector.mjs";

export const VIDEO_SAFE_DERIVATIVE_VERSION = "4c4.1";
export const VS_W = 1080;
export const VS_H = 1920;

// §12 - a conservative-but-realistic mobile centre-safe rectangle for a
// CALM editorial video frame (the 4C `SAFE` union is tuned for full-bleed
// motion and reserves the bottom 500px - too aggressive here; the
// universal CTA end screen owns the bottom-heavy content). Keeps every
// essential element clear of the platform title UI (top), the interaction
// rail (right) and the caption / nav / buttons (bottom).
export const VS_SAFE = Object.freeze({ top: 210, right: 100, bottom: 400, left: 100 });

// design language cloned from the approved masters (5 / 5A / 5A.1)
export const VS_STYLE = Object.freeze({
  bg: "#0b0b0d",
  ink: "#f4f4f6",
  sub: "#b9b9c1",
  accent: "#e4483d",
  positive: "#3fb27f",
  font: '"Helvetica Neue",Arial,system-ui,-apple-system,sans-serif',
  card_shadow: "0 24px 60px rgba(0,0,0,.55)",
  card_rim: "0 0 0 2px rgba(255,255,255,.06)",
});

// §13 - minimum on-screen size per role so nobody has to pause / zoom
export const VS_MIN_FONT = Object.freeze({
  hook: 58, hero_stat: 68, primary_stat: 54, comparison: 46,
  context: 34, takeaway: 32, label: 30, domain: 30, footer: 26,
});

const clampFont = (role, px) => Math.max(VS_MIN_FONT[role] ?? 30, Math.round(px));
const money = (n) => (n == null || !Number.isFinite(Number(n)) ? null : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: Number(n) < 100 && !Number.isInteger(Number(n)) ? 2 : 0, maximumFractionDigits: Number(n) < 100 ? 2 : 0 })}`);
const T = (x) => (x == null ? null : String(x).trim() || null);

// the centre-safe rectangle every kept block must live inside (§12)
export function centreSafe(safe = SAFE) {
  return Object.freeze({
    x: safe.left, y: safe.top,
    w: VS_W - safe.left - safe.right,
    h: VS_H - safe.top - safe.bottom,
    right: VS_W - safe.right,
    bottom: VS_H - safe.bottom,
  });
}

// one-line "what is this?" the §4 comprehension gate checks against
const FAMILY_GIST = Object.freeze({
  deal_hero: "This card is listed below its market reference.",
  asking_vs_sold: "The listing price and the market price are very different.",
  market_shape: "This is a Pokemon card market statistic.",
  three_up: "These are affordable Pokemon cards.",
  printing_compare: "These printings differ and the distinction matters.",
});

// -------------------------------------------------------------
// PRIORITY BLOCKS - deterministic, from frozen data only (§9)
// -------------------------------------------------------------
function blocksFor({ family, semanticManifest: S = {}, factLock: F = {}, cardAssets = [] }) {
  const rn = S.required_numeric_facts ?? {};
  const cardName = T(S.card_identity?.name ?? F.card_name);
  const cardSet = T(S.card_identity?.set ?? F.card_set);
  const b = [];

  if (family === "deal_hero" || family === "asking_vs_sold") {
    const left = S.comparison_left ?? {};
    const right = S.comparison_right ?? {};
    const pct = family === "deal_hero" ? rn.discount_pct : rn.premium_pct;
    const dir = S.comparison_direction === "ABOVE_MARKET" ? "above market"
      : S.comparison_direction === "BELOW_MARKET" ? "below market" : "vs market";
    const pctText = pct != null ? `${Math.abs(pct)}% ${dir}` : null;
    b.push({ id: "hook", priority: 1, role: "hook", h: 150,
      text: family === "deal_hero" ? "LISTED BELOW MARKET" : "ASKING vs MARKET",
      font: clampFont("hook", 62) });
    if (cardAssets[0]) b.push({ id: "hero_card", priority: 1, role: "card", h: 500, cardIds: [cardAssets[0]], caption: [cardName, cardSet].filter(Boolean).join("  ·  ") });
    b.push({ id: "compare", priority: 1, role: "comparison", h: 150,
      text: `${T(left.text) ?? money(left.value) ?? "listed"}   →   ${T(right.text) ?? money(right.value) ?? "market"}`,
      font: clampFont("comparison", 52) });
    if (pctText) b.push({ id: "primary_stat", priority: 1, role: "primary_stat", h: 150, text: pctText, font: clampFont("primary_stat", 76) });
    b.push({ id: "context", priority: 1, role: "context", h: 92,
      text: family === "deal_hero" ? "Live listing checked against a real market reference." : "Asking price checked against the recent market.",
      font: clampFont("context", 34) });
    const lesson = T(S.appropriate_lesson);
    if (lesson) b.push({ id: "takeaway", priority: 2, role: "takeaway", h: 108, text: lesson, font: clampFont("takeaway", 32) });
  } else if (family === "market_shape") {
    const u25 = rn.under_25_pct ?? S.claim_value;
    const tracked = rn.tracked_count;
    b.push({ id: "hero_stat", priority: 1, role: "hero_stat", h: 190, text: u25 != null ? `${u25}%` : "—", font: clampFont("hero_stat", 128) });
    b.push({ id: "population", priority: 1, role: "context", h: 96,
      text: tracked != null ? `of ${Number(tracked).toLocaleString("en-US")} tracked singles sell under $25` : "of tracked singles sell under $25",
      font: clampFont("context", 38) });
    const viz = S.visualization_data_manifest?.allowed_points ?? [];
    if (viz.length) b.push({ id: "chart", priority: 1, role: "chart", h: 360, points: viz.map((p) => ({ label: T(p.label) ?? "", value: Number(p.value) || 0 })) });
    if (cardAssets[0]) b.push({ id: "example_card", priority: 1, role: "card", h: 360, cardIds: [cardAssets[0]], caption: `one example: ${T(S.example_card ?? S.card_identity?.name) ?? "a tracked single"}` });
    b.push({ id: "takeaway", priority: 2, role: "takeaway", h: 100, text: "Most singles are affordable - the market is not just the expensive cards.", font: clampFont("takeaway", 32) });
  } else if (family === "three_up") {
    b.push({ id: "hook", priority: 1, role: "hook", h: 150, text: "THREE UNDER $25", font: clampFont("hook", 66) });
    const ids = cardAssets.slice(0, 3);
    if (ids.length) b.push({ id: "card_row", priority: 1, role: "card_row", h: 500, cardIds: ids });
    const items = (S.item_identities ?? []).slice(0, 3);
    if (items.length) b.push({ id: "price_strip", priority: 1, role: "comparison", h: 130,
      text: items.map((it) => money(it.price)).filter(Boolean).join("      "), font: clampFont("comparison", 50) });
    b.push({ id: "context", priority: 1, role: "context", h: 92, text: "Real live listings, each below its own market reference.", font: clampFont("context", 34) });
    b.push({ id: "takeaway", priority: 2, role: "takeaway", h: 100, text: "You do not need a big budget to collect well.", font: clampFont("takeaway", 32) });
  } else if (family === "printing_compare") {
    b.push({ id: "hook", priority: 1, role: "hook", h: 150, text: "SAME POKEMON, DIFFERENT PRINTING", font: clampFont("hook", 52) });
    const ids = cardAssets.slice(0, 2);
    if (ids.length >= 2) b.push({ id: "card_pair", priority: 1, role: "card_row", h: 500, cardIds: ids });
    const l = S.comparison_left ?? {}; const r = S.comparison_right ?? {};
    b.push({ id: "compare", priority: 1, role: "comparison", h: 140,
      text: `${T(l.text) ?? "A"}   vs   ${T(r.text) ?? "B"}`, font: clampFont("comparison", 48) });
    const proof = T(S.printing_difference_proof);
    if (proof) b.push({ id: "context", priority: 1, role: "context", h: 120, text: proof, font: clampFont("context", 34) });
  }

  // P3 - a small domain line (the end screen carries the real CTA)
  b.push({ id: "domain", priority: 3, role: "domain", h: 74, text: "pokemondealfinder.com", font: clampFont("domain", 32) });
  return b;
}

// -------------------------------------------------------------
// STACK LAYOUT - top-to-bottom inside centre-safe. Anything that
// does not fit is removed WHOLE (lowest priority first), never
// shown partially (§11). Never returns a half-block.
// -------------------------------------------------------------
function layout(blocks, safe) {
  const cs = centreSafe(safe);
  const GAP = 22;
  let kept = blocks.slice();
  const removed = [];

  const totalH = (arr) => arr.reduce((s, x) => s + x.h, 0) + GAP * Math.max(0, arr.length - 1);

  // drop lowest-priority (highest number) blocks until it fits
  while (totalH(kept) > cs.h && kept.some((x) => x.priority >= 2)) {
    let worstIdx = -1, worstP = 1;
    kept.forEach((x, i) => { if (x.priority >= 2 && x.priority >= worstP) { worstP = x.priority; worstIdx = i; } });
    if (worstIdx < 0) break;
    removed.push({ id: kept[worstIdx].id, reason: `removed whole to fit the mobile centre-safe region (priority ${kept[worstIdx].priority})` });
    kept.splice(worstIdx, 1);
  }

  const fits = totalH(kept) <= cs.h + 0.5;
  // vertically centre the stack in the safe region
  const used = totalH(kept);
  let y = cs.y + Math.max(0, Math.floor((cs.h - used) / 2));
  const placed = kept.map((x) => {
    const zone = { x: cs.x, y, w: cs.w, h: x.h };
    y += x.h + GAP;
    const overflow = zone.y < cs.y - 0.5 || zone.y + zone.h > cs.bottom + 0.5 || zone.x < cs.x - 0.5 || zone.x + zone.w > cs.right + 0.5;
    return { ...x, zone: Object.freeze(zone), fully_inside_safe: !overflow, partial: false };
  });

  const overflow = placed.filter((p) => !p.fully_inside_safe).map((p) => ({ id: p.id, zone: p.zone }));
  return { placed, removed, fits: fits && !overflow.length, overflow };
}

/**
 * buildVideoSafeDerivative({ family, semanticManifest, factLock, cardAssets, safe })
 *
 * cardAssets: array of LOCAL canonical card image paths (already validated
 * by lib/social/cardArtwork.mjs - real TCGplayer product art, never eBay,
 * never AI). This module does not resolve or fetch them.
 *
 * -> { version, family, width, height, safe, centre_safe, style, blocks,
 *      removed, fits, overflow, comprehension_line, priority1_ids,
 *      shown_numbers, card_asset_paths }
 */
export function buildVideoSafeDerivative({ family = "deal_hero", semanticManifest = {}, factLock = {}, cardAssets = [], safe = VS_SAFE } = {}) {
  const cleanCards = (cardAssets ?? []).map((p) => String(p ?? "").replace(/^file:\/\//, "")).filter(Boolean);
  const raw = blocksFor({ family, semanticManifest, factLock, cardAssets: cleanCards });
  const { placed, removed, fits, overflow } = layout(raw, safe);

  const shown_numbers = [];
  for (const blk of placed) {
    for (const m of String(blk.text ?? "").matchAll(/-?\$?\d[\d,]*\.?\d*%?/g)) shown_numbers.push(m[0]);
    for (const p of blk.points ?? []) shown_numbers.push(`${p.value}%`);
  }

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
    // §9 - what the static master carries that the derivative intentionally drops
    dropped_from_master: Object.freeze([
      "methodology / “why this matters” paragraph copy",
      "tiny metadata rows (set code, rarity glyphs, collector number chrome)",
      "dense footer sections",
      "duplicated percentages / repeated stats",
      "decorative labels that add no meaning",
    ]),
  });
}
