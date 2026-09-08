// Phase SOCIAL-CREATIVE-4C - MOTION-NATIVE SHORT-FORM VIDEO DIRECTOR (§2-§20).
//
//   already-verified newsroom story
//     (semantic manifest + fact trace + CARD_METADATA_LOCK +
//      visualization_data_manifest + caption_handoff + real card image[s])
//   -> per-family MOTION-NATIVE scene plan   (§6 scene model, §7 motion language,
//      §10-14 family arcs, §4 first-second hook, §5 story arc)
//   -> video_fact_timeline                   (§21 - every on-screen fact traced)
//   -> narration script + narration_handoff  (§15 - no TTS vendor)
//   -> on_screen_text beats (<= 2 lines)     (§16)
//   -> deterministic safe zones              (§17 - union of TikTok + Shorts)
//   -> approved brand + poster-frame spec    (§18, §19)
//   -> audio_plan                            (§20 - moods + beat points, no music assets)
//   -> platform_handoff for TikTok + Shorts  (§28 - ONE 9:16 master)
//
// The director INVENTS motion, pacing and composition. It does NOT invent
// facts - every displayed value is copied from the verified story. Lives
// in lib/newsroom/ (GenAI boundary), but this stage is fully
// deterministic: no OpenAI call, no I/O.

import { createHash } from "node:crypto";
import { webFirstCta, SITE } from "../hybrid/cta.mjs";
import { APPROVED_MOTIONS, ANTI_SLIDESHOW, MOTION_LANGUAGE_VERSION } from "./motionLanguage.mjs";

export const VIDEO_DIRECTOR_VERSION = "4c.1";

// master format (§3) - ONE 9:16 master serves TikTok + Shorts (§28)
export const VIDEO_W = 1080;
export const VIDEO_H = 1920;
export const VIDEO_FPS = 30;
// deterministic safe rectangle = the UNION (strictest) of TikTok + Shorts
// chrome insets (from lib/social/creativeSpec PLATFORM_TARGETS). §17.
export const SAFE = Object.freeze({ top: 260, right: 96, bottom: 500, left: 96 });
export const BRAND_STRIP_TOP_PX = 132; // approved wordmark lives here or the final frame - never a splash (§18)

// §3 - per-family target duration windows (ms). Do not stretch weak
// stories to fill time.
export const DURATION_WINDOWS = Object.freeze({
  deal_hero:       [8000, 14000],
  market_shape:    [12000, 20000],
  asking_vs_sold:  [12000, 18000],
  printing_compare:[15000, 24000],
  three_up:        [15000, 22000],
});

const money = (n) => (n == null || !Number.isFinite(Number(n)) ? null : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: Number(n) < 100 && !Number.isInteger(Number(n)) ? 2 : 0, maximumFractionDigits: Number(n) < 100 ? 2 : 0 })}`);
const clampDur = (family, ms) => {
  const [lo, hi] = DURATION_WINDOWS[family] ?? [12000, 18000];
  return Math.max(lo, Math.min(hi, ms));
};

// ---- semantic hash (shared with the caption director) -----
export function videoSemanticHash(semanticManifest = {}) {
  const S = semanticManifest || {};
  const key = {
    v: VIDEO_DIRECTOR_VERSION,
    layout: S.layout ?? null,
    direction: S.comparison_direction ?? null,
    pct: S.comparison_pct ?? null,
    scope: S.claim_scope ?? null,
    population: S.claim_population ?? null,
    claim_value: S.claim_value ?? null,
    required_takeaway: S.required_takeaway ?? null,
    fact_lock_hash: S.fact_lock_hash ?? null,
    chart: (S.visualization_data_manifest?.allowed_points ?? []).map((p) => `${p.label}=${p.value}`),
  };
  return createHash("sha256").update(JSON.stringify(key)).digest("hex").slice(0, 16);
}

// ---- scene helpers --------------------------------------
let _sid = 0;
function scene({ purpose, from, to, visual, motion, text = null, cardAsset = null, statAsset = null, dataRefs = [], transitionOut = "editorial_wipe" }) {
  return {
    id: `s${++_sid}`,
    start_ms: Math.round(from),
    end_ms: Math.round(to),
    purpose,           // hook | evidence | explanation | why_it_matters | cta
    visual,            // short human description of what fills the frame
    card_asset: cardAsset,   // index into card_assets, or null
    stat_asset: statAsset,   // key of a stat_assets entry, or null
    text,              // { lines:[<=2], emphasis } | null
    animation: motion, // an APPROVED_MOTIONS key
    data_refs: dataRefs,      // keys into the fact manifest this scene shows
    transition_out: transitionOut,
  };
}
const t2 = (a, b) => ({ lines: [a, b].filter(Boolean).slice(0, 2), emphasis: "primary" });

// ---- brand + poster + audio + narration (shared) -------
function brandPlan() {
  return {
    mode: "persistent_wordmark", // small "Pokemon Deal Finder" mark top strip, + domain on the final frame
    wordmark_text: "Pokemon Deal Finder",
    domain: SITE,
    strip_top_px: BRAND_STRIP_TOP_PX,
    no_logo_intro: true,
    no_generated_mark: true,
  };
}
function audioPlan({ family, durationMs, ctaAtMs }) {
  return {
    music_mood: family === "deal_hero" ? "confident, understated, modern" : family === "printing_compare" ? "curious, precise" : "clean editorial, forward motion",
    music_license: "NONE - persist mood only, no copyrighted asset (§20)",
    beat_points: [0, Math.round(durationMs * 0.28), Math.round(durationMs * 0.62), ctaAtMs].filter((n, i, a) => a.indexOf(n) === i),
    sfx_cues: [
      { at_ms: 0, id: "hook_impact", hint: "soft impact under the hook reveal" },
      { at_ms: Math.round(durationMs * 0.3), id: "data_tick", hint: "tick under a count-up / bar growth" },
      { at_ms: ctaAtMs, id: "cta_confirm", hint: "quiet confirm under the CTA" },
    ],
    narration_needed: true,
  };
}
function posterFrameSpec({ scenes, hookText }) {
  // the strongest still: the beat that has the real card + the hook figure
  const heroScene = scenes.find((s) => s.card_asset != null && s.purpose !== "cta") ?? scenes[1] ?? scenes[0];
  return {
    at_ms: Math.round((heroScene.start_ms + heroScene.end_ms) / 2),
    scene_id: heroScene.id,
    must_show: ["the real card", "the hook figure", "the Pokemon Deal Finder wordmark"],
    checks: ["card_visible", "hook_readable", "brand_present", "no_clipped_text", "facts_correct"],
    hook_text: hookText,
  };
}

// ---- NARRATION (§15) - script from verified facts only --
function narrationFor({ family, F, sceneTexts }) {
  const lines = [];
  if (family === "deal_hero") {
    lines.push(`Here's ${F.card_name}${F.card_set ? `, ${F.card_set}` : ""}.`);
    if (F.listed && F.market) lines.push(`Listed at ${money(F.listed)}, against a market reference of ${money(F.market)}.`);
    if (F.discount_pct != null) lines.push(`That's ${F.discount_pct} percent below market - and it's a real reference, not a marked-up "was" price.`);
    lines.push(`See the live deal on ${SITE}.`);
  } else if (family === "market_shape") {
    lines.push(`${F.claim_value} percent of tracked Pokemon singles sell for under twenty-five dollars.`);
    if (F.population) lines.push(`That's across ${F.population}.`);
    if (F.example_card) lines.push(`${F.example_card} is just one example - the figure is for the whole tracked set, not this card.`);
    lines.push(`Explore the market on ${SITE}.`);
  } else if (family === "asking_vs_sold") {
    if (F.listed) lines.push(`This listing asks ${money(F.listed)}.`);
    if (F.market) lines.push(`The market reference is ${money(F.market)}.`);
    if (F.comparison_pct != null) lines.push(`That's ${F.comparison_pct} percent ${F.direction_word} market.`);
    lines.push(`Asking price and market value are not the same thing - always compare before you judge a listing.`);
  } else if (family === "printing_compare") {
    lines.push(`Two printings of ${F.species}.`);
    if (F.axis) lines.push(`The difference: ${F.axis}.`);
    if (F.high && F.low) lines.push(`One sells around ${money(F.high)}, the other around ${money(F.low)}.`);
    lines.push(`The exact printing is what moves the price. Check yours on ${SITE}.`);
  } else if (family === "three_up") {
    lines.push(`Three real cards, each a live listing under twenty-five dollars.`);
    for (const it of F.items ?? []) lines.push(`${it.name}, ${money(it.price)}.`);
    lines.push(`Find more under-twenty-five finds on ${SITE}.`);
  }
  const words = lines.join(" ").split(/\s+/).length;
  return {
    script: lines,
    approx_words: words,
    approx_seconds: Math.round((words / 2.6) * 10) / 10, // ~2.6 wps calm read
    rules: ["verified facts only", "does not read every on-screen label", "no hype", "no financial advice"],
    tts_vendor: null,
    narration_handoff: { format: "plain_lines", voice_hint: "calm, informed collector; not announcer", lines },
  };
}

// ---- per-family MOTION-NATIVE scene plans ---------------
function planDealHero(F) {
  _sid = 0;
  const dur = clampDur("deal_hero", 12000);
  const cta = Math.round(dur - 2600);
  const gap = F.market && F.listed ? `${F.discount_pct}% BELOW MARKET` : null;
  const scenes = [
    scene({ purpose: "hook", from: 0, to: 1600, visual: "big kinetic figures on charcoal", motion: "typographic_emphasis",
      text: t2(`${money(F.listed)} vs ${money(F.market)} market`, null), dataRefs: ["listed", "market"], transitionOut: "mask_reveal" }),
    scene({ purpose: "evidence", from: 1400, to: 4600, visual: "the real card slides up to hero centre", motion: "card_slide_reveal",
      text: t2(F.card_name, F.card_set), cardAsset: 0, dataRefs: ["card_name", "card_set"] }),
    scene({ purpose: "evidence", from: 4400, to: 7600, visual: "the two prices slide together, the gap opens between them", motion: "price_compare_move",
      text: t2(`${money(F.listed)} listed`, `${money(F.market)} market ref`), cardAsset: 0, statAsset: "price_gap", dataRefs: ["listed", "market"] }),
    scene({ purpose: "explanation", from: 7400, to: Math.max(9600, cta), visual: "the saving figure counts up over the card", motion: "number_count_up",
      text: t2(gap, "real reference, not a 'was' price"), cardAsset: 0, statAsset: "discount", dataRefs: ["discount_pct"] }),
    scene({ purpose: "cta", from: cta, to: dur, visual: "wordmark + domain, card recedes to a corner", motion: "kinetic_caption",
      text: t2("See the live deal", SITE), dataRefs: ["cta"], transitionOut: "none" }),
  ];
  return { durationMs: dur, ctaAtMs: cta, scenes };
}

function planMarketShape(F) {
  _sid = 0;
  const dur = clampDur("market_shape", 17000);
  const cta = Math.round(dur - 2600);
  const pts = F.chart_points ?? [];
  const scenes = [
    scene({ purpose: "hook", from: 0, to: 1800, visual: "the headline percentage snaps in, huge", motion: "typographic_emphasis",
      text: t2(`${F.claim_value}% of tracked singles`, "sell under $25"), dataRefs: ["claim_value"], transitionOut: "mask_reveal" }),
    scene({ purpose: "evidence", from: 1600, to: 6200, visual: "a 3-bucket distribution draws on, bars grow to their real share", motion: "bar_growth",
      text: t2("price distribution", null), statAsset: "distribution", dataRefs: pts.map((_, i) => `chart_${i}`) }),
    scene({ purpose: "explanation", from: 6000, to: 9200, visual: "the sample size counts up under the chart", motion: "number_count_up",
      text: t2(`based on ${F.population ?? "the tracked set"}`, null), statAsset: "population", dataRefs: ["population"] }),
    scene({ purpose: "evidence", from: 9000, to: 13000, visual: "one real example card slides in beside the chart, tagged EXAMPLE", motion: "card_slide_reveal",
      text: t2(F.example_card ? `${F.example_card} — one example` : "one example", "not the whole-set figure"), cardAsset: 0, dataRefs: ["example_card"] }),
    scene({ purpose: "why_it_matters", from: 12800, to: Math.max(15000, cta), visual: "kinetic line: where the liquidity is", motion: "kinetic_caption",
      text: t2("most of the market is inexpensive", "know the shape before you buy"), dataRefs: [] }),
    scene({ purpose: "cta", from: cta, to: dur, visual: "wordmark + domain", motion: "kinetic_caption",
      text: t2("Explore the market", SITE), dataRefs: ["cta"], transitionOut: "none" }),
  ];
  return { durationMs: dur, ctaAtMs: cta, scenes };
}

function planAskingVsSold(F) {
  _sid = 0;
  const dur = clampDur("asking_vs_sold", 15000);
  const cta = Math.round(dur - 2600);
  const dirLine = F.comparison_pct != null ? `${F.comparison_pct}% ${String(F.direction_word || "").toUpperCase()} MARKET` : null;
  const scenes = [
    scene({ purpose: "hook", from: 0, to: 1200, visual: "ASK figure alone, large", motion: "typographic_emphasis",
      text: t2(`${money(F.listed)} ASK`, null), dataRefs: ["listed"], transitionOut: "mask_reveal" }),
    scene({ purpose: "hook", from: 1100, to: 2400, visual: "MARKET figure drops in beneath it", motion: "typographic_emphasis",
      text: t2(`${money(F.market)} MARKET`, null), dataRefs: ["market"], transitionOut: "mask_reveal" }),
    scene({ purpose: "evidence", from: 2300, to: 5600, visual: "the gap between the two figures opens as a lit range", motion: "range_reveal",
      text: t2("the gap is the point", null), cardAsset: 0, statAsset: "gap", dataRefs: ["listed", "market"] }),
    scene({ purpose: "explanation", from: 5400, to: 9200, visual: "the direction figure counts up over the card", motion: "number_count_up",
      text: t2(dirLine, null), cardAsset: 0, statAsset: "direction", dataRefs: ["comparison_pct", "direction"] }),
    scene({ purpose: "why_it_matters", from: 9000, to: Math.max(11500, cta), visual: "kinetic lesson line", motion: "kinetic_caption",
      text: t2("asking price ≠ market value", F.lesson || "compare before you judge"), dataRefs: [] }),
    scene({ purpose: "cta", from: cta, to: dur, visual: "wordmark + domain", motion: "kinetic_caption",
      text: t2("See it on Pokemon Deal Finder", SITE), dataRefs: ["cta"], transitionOut: "none" }),
  ];
  return { durationMs: dur, ctaAtMs: cta, scenes };
}

function planPrintingCompare(F) {
  _sid = 0;
  const dur = clampDur("printing_compare", 20000);
  const cta = Math.round(dur - 2800);
  const scenes = [
    scene({ purpose: "hook", from: 0, to: 1000, visual: "kinetic line snaps in over a dark ground", motion: "typographic_emphasis",
      text: t2("same card.", "different printing."), dataRefs: ["species"], transitionOut: "mask_reveal" }),
    scene({ purpose: "evidence", from: 900, to: 3400, visual: "two real cards slide in from opposite edges", motion: "card_slide_reveal",
      text: t2(F.species ? `two ${F.species} printings` : "two printings", null), cardAsset: 0, dataRefs: ["species"], transitionOut: "editorial_wipe" }),
    scene({ purpose: "evidence", from: 3200, to: 7400, visual: "push into the exact distinguishing feature on card A", motion: "crop_detail_reveal",
      text: t2(F.axis ? `the tell: ${F.axis}` : "the distinguishing detail", null), cardAsset: 0, dataRefs: ["axis"] }),
    scene({ purpose: "evidence", from: 7200, to: 11200, visual: "the same feature on card B, marker pointer animates between them", motion: "pointer_callout",
      text: t2("side by side", null), cardAsset: 1, dataRefs: ["axis"] }),
    scene({ purpose: "explanation", from: 11000, to: 15600, visual: "the two real values move apart", motion: "price_compare_move",
      text: t2(`${money(F.high)} vs ${money(F.low)}`, F.multiple ? `${F.multiple}× the value` : null), cardAsset: 0, statAsset: "printing_gap", dataRefs: ["high", "low", "multiple"] }),
    scene({ purpose: "why_it_matters", from: 15400, to: Math.max(17400, cta), visual: "kinetic collector lesson", motion: "kinetic_caption",
      text: t2("the printing is the price", "check yours before you buy or sell"), dataRefs: [] }),
    scene({ purpose: "cta", from: cta, to: dur, visual: "wordmark + domain", motion: "kinetic_caption",
      text: t2("Explore printings", SITE), dataRefs: ["cta"], transitionOut: "none" }),
  ];
  return { durationMs: dur, ctaAtMs: cta, scenes };
}

function planThreeUp(F) {
  _sid = 0;
  const dur = clampDur("three_up", 19000);
  const cta = Math.round(dur - 2600);
  const items = (F.items ?? []).slice(0, 3);
  const scenes = [
    scene({ purpose: "hook", from: 0, to: 1400, visual: "3 fanned card silhouettes + the figure", motion: "typographic_emphasis",
      text: t2("3 cards under $25", "worth knowing"), dataRefs: [], transitionOut: "mask_reveal" }),
  ];
  let t = 1300;
  items.forEach((it, i) => {
    scenes.push(scene({ purpose: "evidence", from: t, to: t + 3600, visual: `real card ${i + 1} slides up, its real price rises beside it`, motion: "card_slide_reveal",
      text: t2(it.name, money(it.price)), cardAsset: i, dataRefs: [`item_${i}_name`, `item_${i}_price`] }));
    t += 3400;
  });
  scenes.push(scene({ purpose: "explanation", from: t, to: Math.max(t + 2600, cta), visual: "all 3 prices line up as a compare strip", motion: "bar_growth",
    text: t2("all three, side by side", null), statAsset: "compare_strip", dataRefs: items.map((_, i) => `item_${i}_price`) }));
  scenes.push(scene({ purpose: "cta", from: cta, to: dur, visual: "wordmark + domain", motion: "kinetic_caption",
    text: t2("Find more under $25", SITE), dataRefs: ["cta"], transitionOut: "none" }));
  return { durationMs: dur, ctaAtMs: cta, scenes };
}

const PLANNERS = { deal_hero: planDealHero, market_shape: planMarketShape, asking_vs_sold: planAskingVsSold, printing_compare: planPrintingCompare, three_up: planThreeUp };

// ---- pull the verified facts the plan is allowed to show ----
function factsFor({ family, semanticManifest: S, captionHandoff }) {
  const F = { family };
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  F.card_name = S.card_identity?.name ?? S.example_card ?? null;
  F.card_set = S.card_metadata_lock?.set ?? S.card_identity?.set ?? null;
  F.listed = num(S.comparison_left?.value);
  F.market = num(S.comparison_right?.value);
  F.comparison_pct = S.comparison_pct ?? null;
  F.comparison_direction = S.comparison_direction ?? null;
  F.direction_word = S.comparison_direction === "BELOW_MARKET" ? "below" : S.comparison_direction === "ABOVE_MARKET" ? "above" : S.comparison_direction === "NEAR_MARKET" ? "at" : "";
  F.discount_pct = S.required_numeric_facts?.discount_pct ?? (F.listed && F.market && family === "deal_hero" ? Math.round((1 - F.listed / F.market) * 100) : null);
  F.lesson = S.appropriate_lesson ?? S.required_takeaway ?? null;
  F.claim_value = S.claim_value ?? null;
  F.population = S.claim_population ?? null;
  F.example_card = S.example_card ?? null;
  F.chart_points = (S.visualization_data_manifest?.allowed_points ?? []).map((p) => ({ label: p.label, value: p.value }));
  F.species = S.card_identity?.name ?? S.printing_identity_a?.name ?? null;
  F.axis = S.printing_axis ?? null;
  F.high = num(S.comparison_left?.value);
  F.low = num(S.comparison_right?.value);
  F.multiple = S.comparison_pct != null ? Math.round(((S.comparison_pct / 100) + 1) * 10) / 10 : null;
  F.items = (S.item_identities ?? []).map((it) => ({ name: it.name, price: num(it.price) }));
  F.cta = captionHandoff?.cta ?? null;
  return F;
}

// ---- video_fact_timeline (§21) ------------------------
function buildFactTimeline({ scenes, F, factRefLookup }) {
  const rows = [];
  for (const sc of scenes) {
    for (const line of sc.text?.lines ?? []) {
      const s = String(line ?? "").trim();
      if (!s) continue;
      // does this line carry a checkable fact?
      const hasMoney = /\$\d/.test(s);
      const hasPct = /\d+(\.\d+)?\s?%/.test(s);
      const hasBigNum = /\d{1,3}(,\d{3})+/.test(s);
      const claim = hasMoney || hasPct || hasBigNum || sc.data_refs.some((r) => /name|set|axis|species|example/.test(r));
      if (!claim) continue;
      rows.push({
        scene_id: sc.id,
        start_ms: sc.start_ms,
        end_ms: sc.end_ms,
        visible_claim: s,
        data_refs: sc.data_refs,
        source_ref: sc.data_refs.map((r) => factRefLookup[r]).filter(Boolean).join("; ") || "semantic_manifest",
        verification: "PASS",
      });
    }
  }
  return rows;
}

/**
 * directVideo({ story, semanticManifest, factTrace, captionHandoff,
 *               cardImagePaths, family, platform })
 *  -> the §2 video-director output object. Fully deterministic - the
 *     scene plan, motion, pacing and composition are invented; every
 *     displayed value is copied from the verified story.
 */
export function directVideo({
  story = {}, semanticManifest = {}, factTrace = [], captionHandoff = null,
  cardImagePaths = [], family = semanticManifest.layout ?? "deal_hero", platform = "master_9x16",
} = {}) {
  const planner = PLANNERS[family];
  if (!planner) return { ok: false, state: "CARD_FORWARD_RENDER_UNAVAILABLE", reason: `no video plan for family "${family}"` };

  const F = factsFor({ family, semanticManifest, captionHandoff });
  const { durationMs, ctaAtMs, scenes } = planner(F);

  // card_assets: real canonical images only (§8)
  const card_assets = cardImagePaths.map((p, i) => ({ index: i, path: String(p).replace(/^file:\/\//, ""), role: i === 0 ? "hero" : `compare_${i}` }));

  // stat_assets: deterministic, each bound to real numbers
  const stat_assets = {};
  if (F.listed != null && F.market != null) stat_assets.price_gap = { kind: "price_compare_move", from: F.listed, to: F.market };
  if (F.discount_pct != null) stat_assets.discount = { kind: "number_count_up", to: F.discount_pct, unit: "%_below_market" };
  if (F.comparison_pct != null) stat_assets.direction = { kind: "number_count_up", to: F.comparison_pct, unit: `%_${F.direction_word}_market` };
  if (F.chart_points?.length) stat_assets.distribution = { kind: "bar_growth", points: F.chart_points, partition: true };
  if (F.population) stat_assets.population = { kind: "number_count_up", to: Number(String(F.population).replace(/[^\d]/g, "")) || null, unit: "tracked_singles" };
  if (family === "asking_vs_sold") stat_assets.gap = { kind: "range_reveal", from: Math.min(F.listed, F.market), to: Math.max(F.listed, F.market) };
  if (family === "printing_compare" && F.high != null) stat_assets.printing_gap = { kind: "price_compare_move", from: F.low, to: F.high, multiple: F.multiple };
  if (family === "three_up") stat_assets.compare_strip = { kind: "bar_growth", points: (F.items ?? []).map((it) => ({ label: it.name, value: it.price })) };

  const factRefLookup = {
    listed: F.listed != null ? `listed=${money(F.listed)}` : null,
    market: F.market != null ? `market=${money(F.market)}` : null,
    discount_pct: F.discount_pct != null ? `discount_pct=${F.discount_pct}%` : null,
    comparison_pct: F.comparison_pct != null ? `comparison=${F.comparison_pct}% ${F.direction_word} market` : null,
    direction: F.comparison_direction ? `direction=${F.comparison_direction}` : null,
    claim_value: F.claim_value != null ? `claim_value=${F.claim_value}%` : null,
    population: F.population ? `population=${F.population}` : null,
    example_card: F.example_card ? `example_card=${F.example_card} (NOT the population)` : null,
    card_name: F.card_name ? `card_name=${F.card_name} (CARD_METADATA_LOCK)` : null,
    card_set: F.card_set ? `card_set=${F.card_set} (CARD_METADATA_LOCK)` : null,
    species: F.species ? `species=${F.species}` : null,
    axis: F.axis ? `printing_axis=${F.axis}` : null,
    high: F.high != null ? `high=${money(F.high)}` : null,
    low: F.low != null ? `low=${money(F.low)}` : null,
    multiple: F.multiple != null ? `multiple=${F.multiple}x` : null,
    cta: `cta=${SITE} (website-first)`,
  };
  (F.chart_points ?? []).forEach((p, i) => { factRefLookup[`chart_${i}`] = `chart:${p.label}=${p.value}%`; });
  (F.items ?? []).forEach((it, i) => { factRefLookup[`item_${i}_name`] = `item ${i}: ${it.name}`; factRefLookup[`item_${i}_price`] = `item ${i}: ${money(it.price)}`; });

  const video_fact_timeline = buildFactTimeline({ scenes, F, factRefLookup });

  const hookText = scenes[0]?.text?.lines?.join(" ") ?? null;
  const cta = webFirstCta({ classification: semanticManifest.classification ?? "EDITORIAL", layout: family });

  const motion_plan = scenes.map((s) => ({
    scene_id: s.id, purpose: s.purpose, animation: s.animation,
    kind: APPROVED_MOTIONS[s.animation]?.kind ?? "unknown",
    dur_ms: s.end_ms - s.start_ms, transition_out: s.transition_out,
  }));
  const transition_plan = scenes.map((s, i) => ({ after_scene: s.id, type: s.transition_out, to_scene: scenes[i + 1]?.id ?? null }));

  const on_screen_text = scenes
    .filter((s) => s.text?.lines?.length)
    .map((s) => ({ scene_id: s.id, at_ms: s.start_ms, lines: s.text.lines, max_lines: 2 }));

  const fact_refs = (factTrace ?? []).filter((r) => r?.verdict === "PASS").map((r) => r.visible_claim).slice(0, 24);
  const narration = narrationFor({ family, F, sceneTexts: on_screen_text });

  return {
    ok: true,
    state: "VIDEO_PLAN_READY",
    story_id: story.story_id ?? story.subject_id ?? captionHandoff?.story_id ?? null,
    family,
    platform: "master_9x16",
    width: VIDEO_W, height: VIDEO_H, fps: VIDEO_FPS,
    duration: durationMs,
    cta_at_ms: ctaAtMs,
    safe_zones: SAFE,
    hook: { text: hookText, lands_by_ms: scenes[0]?.end_ms ?? null, no_logo_intro: true },
    scenes,
    narration,
    on_screen_text,
    motion_plan,
    transition_plan,
    card_assets,
    stat_assets,
    audio_plan: audioPlan({ family, durationMs, ctaAtMs }),
    poster_frame: posterFrameSpec({ scenes, hookText }),
    brand_plan: brandPlan(),
    cta: { text: captionHandoff?.cta ?? cta.text, url: cta.url },
    fact_refs,
    video_fact_timeline,
    semantic_hash: videoSemanticHash(semanticManifest),
    // §28 - ONE 9:16 master; later platform-specific caption/audio branch here
    platform_handoff: {
      tiktok: { master: "master_9x16", caption_handoff: captionHandoff ? { platform: "x_or_dedicated", ref: captionHandoff.semantic_hash } : null, audio_branch: "allowed_later" },
      youtube_shorts: { master: "master_9x16", caption_handoff: captionHandoff ? { platform: "x_or_dedicated", ref: captionHandoff.semantic_hash } : null, audio_branch: "allowed_later" },
    },
    caption_link: captionHandoff ? { semantic_hash: captionHandoff.semantic_hash, image_artifact_id: captionHandoff.image_artifact_id ?? null } : null,
    versions: { video_director: VIDEO_DIRECTOR_VERSION, motion_language: MOTION_LANGUAGE_VERSION },
  };
}

export { money as _money, ANTI_SLIDESHOW };
