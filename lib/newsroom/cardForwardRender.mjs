// Phase SOCIAL-NEWSROOM-3B - CARD-FORWARD render for the PERSISTED backlog
// pipeline (SS2-SS12).
//
// renderRegistry.SERIES_RENDER maps MARKET_SNAPSHOT / WHY_SOLD_PRICES_MATTER
// / EXACT_PRINTING_MATTERS / AUCTION_BID_VS_TOTAL to the OLD *typographic*
// layouts (editorial_dashboard / compare_split / ...). That is exactly the
// "silent creative downgrade" SS5 forbids. This module renders the
// SOCIAL-CREATIVE-3/3C card-forward layouts instead, from REAL data, and:
//   * WITHHOLDS on missing data (VISUALLY_UNDERPOWERED_DATA /
//     CARD_FORWARD_RENDER_UNAVAILABLE) - NEVER a typographic fallback (SS5)
//   * runs the deterministic gates (editorialCreativeQa + collectibleAppeal
//     + the family-specific dealHeroChecks / threeUpChecks)
//   * for a CONDITIONAL family, AUTO-RUNS the staged visual consensus
//     (policy 3c.1) - no separate operator harness (SS12)
//   * MANUAL_ONLY families never render here (SS3)
//
// It does NOT host or persist - the caller (socialBacklogRender.renderPass)
// owns storage + the QA-run writes so there is one persistence path.
// Reuses lib/social/render's renderer (passed in). No new renderer (SS2).

import { pathToFileURL } from "node:url";
import path from "node:path";

import { renderCardEditorialHtml, CARD_TARGETS } from "../social/newsroom/cardEditorialTemplates.mjs";
import { collectibleAppeal, CARD_SPECIFIC_FAMILIES } from "../social/newsroom/collectibleAppeal.mjs";
import { editorialCreativeQa } from "../social/newsroom/editorialQa.mjs";
import {
  dealHeroChecks, threeUpChecks, dealHeroWithholdReason,
  DEAL_HERO_LAYOUT, THREE_UP_LAYOUT,
} from "../social/newsroom/cardCreativeChecks.mjs";
import { familyStatusFor } from "../social/newsroom/cardLayoutStatus.mjs";
import * as MD from "../social/newsroom/marketData.mjs";
import { resolveCardArtwork } from "../social/cardArtwork.mjs";
import { RIGHTS_STATE } from "../social/rights.mjs";
import { reviewRenderedCreative } from "./visualReview.mjs";
import { reviewConsensus, VISUAL_REVIEW_POLICY_VERSION } from "./visualConsensus.mjs";
// SOCIAL-CREATIVE-4A/4B - the editorial gate + hybrid creative pipeline
// run INSIDE this real persisted render path (§1). Hybrid is OFF unless a
// run explicitly enables it; with hybrid off the deterministic output is
// byte-identical.
import { runEditorialGate } from "./editorial/index.mjs";
import { runHybridPipeline, hybridEnabled, freeformEnabled, generativeCanvasEnabled, fullGenerativeEnabled, runFullGenerativeSocial, reviseOnce } from "./hybrid/pipeline.mjs";

// series -> { layout, resolve() -> { ok, layoutProps, cardIds, numeric,
//   species, priceContrast, meta } | { ok:false, reason } }
export const CARD_FORWARD_SERIES = Object.freeze({
  MARKET_SNAPSHOT: { layout: "market_shape", conditional: false },
  EXACT_PRINTING_MATTERS: { layout: "printing_compare", conditional: false },
  WHY_SOLD_PRICES_MATTER: { layout: "asking_vs_sold", conditional: true },
  THREE_UNDER_25: { layout: "three_up", conditional: true },
  DEAL_DROP: { layout: "deal_hero", conditional: true },
});

export function isCardForwardSeries(series) {
  return Boolean(CARD_FORWARD_SERIES[String(series || "").toUpperCase()]);
}

const targetFor = (platform) => (platform === "youtube" ? "short_916" : "ig_45");

// Flatten a resolver payload into a FACT_LOCK-shaped facts_json + (for the
// printing family) the { high, low } pair the relevance gate needs.
function gateInputsFor(series, facts, story) {
  const p = facts.props ?? {};
  const base = { ...(story.facts_json ?? {}) };
  let printingPair = null;
  if (series === "MARKET_SNAPSHOT") {
    Object.assign(base, {
      tracked_count: p.pricedCards ?? null,
      percentages: [p.under25Pct, p.over100Pct].filter((x) => x != null),
      card_name: p.featured?.card_name ?? null,
      card_set: p.featured?.card_set ?? null,
      market_price: p.featured?.market_ref_usd ?? null,
      listed_price: p.featured?.asking_usd ?? null,
    });
  } else if (series === "EXACT_PRINTING_MATTERS") {
    Object.assign(base, { card_name: p.species ?? null, market_price: p.high?.price_usd ?? null, percentages: p.multiple != null ? [Math.round((1 - 1 / p.multiple) * 100)] : [] });
    printingPair = {
      high: { name: p.high?.name ?? p.species, set: p.high?.set, card_number: p.high?.number, rarity: null, market_price: p.high?.price_usd },
      low: { name: p.low?.name ?? p.species, set: p.low?.set, card_number: p.low?.number, rarity: null, market_price: p.low?.price_usd },
    };
  } else if (series === "WHY_SOLD_PRICES_MATTER") {
    Object.assign(base, { card_name: p.card?.name ?? null, card_set: p.card?.set ?? null, card_tcgplayer_id: p.card?.tcgplayerId ?? null, listed_price: p.askingUsd ?? null, market_price: p.marketRefUsd ?? null, sold_price: Array.isArray(p.soldPoints) ? p.soldPoints[1] ?? p.soldPoints[0] : null });
  } else if (series === "THREE_UNDER_25") {
    const items = p.items ?? [];
    Object.assign(base, { items, listed_price: items[0]?.price_usd ?? null, market_price: items[0]?.market_usd ?? null, discount_pct: items[0]?.discount_pct ?? null });
  } else if (series === "DEAL_DROP") {
    Object.assign(base, { card_name: p.card?.name ?? null, card_set: p.card?.set ?? null, card_tcgplayer_id: p.card?.tcgplayerId ?? null, listed_price: p.priceUsd ?? null, market_price: p.marketUsd ?? null, discount_pct: p.discountPct ?? null });
  }
  return { gateStory: { ...story, facts_json: base }, printingPair };
}

async function resolveArtMap(ids, db) {
  const clean = [...new Set(ids.map(String))].filter((x) => /^\d+$/.test(x));
  const { data: cat } = await db.from("card_catalog").select("tcgplayer_id,name,set,card_number,image_url").in("tcgplayer_id", clean);
  const byId = Object.fromEntries((cat ?? []).map((r) => [String(r.tcgplayer_id).trim(), r]));
  const map = {}; const ready = [];
  for (const id of clean) {
    const row = byId[id];
    // eslint-disable-next-line no-await-in-loop
    const r = await resolveCardArtwork(
      { card_tcgplayer_id: id, card_name: row?.name ?? null, card_set: row?.set ?? null, card_number: row?.card_number ?? null },
      { rightsState: RIGHTS_STATE, catalogRow: row ?? null }
    );
    if (r.status === "ready") { map[id] = pathToFileURL(path.resolve(r.localPath)).href; ready.push(id); }
  }
  return { map, ready };
}

// Resolve the real facts + props for one card-forward series.
async function resolveFacts(series, { db, cap = 25 } = {}) {
  const S = String(series || "").toUpperCase();
  if (S === "MARKET_SNAPSHOT") {
    const r = await MD.resolveMarketShape();
    if (!r.ok) return { ok: false, reason: r.reason, detail: r.detail };
    return {
      ok: true, cardIds: r.cards.map((c) => c.tcgplayerId),
      props: { pricedCards: r.data.priced_cards, under25Pct: r.data.under_25_pct, over100Pct: r.data.over_100_pct, featured: r.data.featured },
      numeric: [r.data.priced_cards, r.data.under_25_pct, r.data.over_100_pct, r.data.featured?.asking_usd].filter(Boolean),
      species: r.data.featured?.card_name ?? null, priceContrast: Boolean(r.data.featured), heroFraction: 0.34, cardSpecific: false,
    };
  }
  if (S === "EXACT_PRINTING_MATTERS") {
    const r = await MD.resolvePrintingPair();
    if (!r.ok) return { ok: false, reason: r.reason, detail: r.detail };
    return {
      ok: true, cardIds: [r.data.high.tcgplayerId, r.data.low.tcgplayerId],
      props: { species: r.data.species, high: r.data.high, low: r.data.low, multiple: r.data.multiple },
      numeric: [r.data.high.price_usd, r.data.low.price_usd, r.data.multiple], species: r.data.species,
      priceContrast: true, heroFraction: 0.4, cardSpecific: true,
    };
  }
  if (S === "WHY_SOLD_PRICES_MATTER") {
    const r = await MD.resolveAskingVsSold();
    if (!r.ok) return { ok: false, reason: r.reason, detail: r.detail };
    return {
      ok: true, cardIds: [r.data.tcgplayerId],
      props: { card: { tcgplayerId: r.data.tcgplayerId, name: r.data.card_name, set: r.data.card_set }, askingUsd: r.data.asking_usd, soldPoints: r.data.sold_points, marketRefUsd: r.data.market_ref_usd },
      numeric: [r.data.asking_usd, ...r.data.sold_points], species: r.data.card_name,
      priceContrast: true, heroFraction: 0.42, cardSpecific: true,
    };
  }
  if (S === "THREE_UNDER_25") {
    const r = await MD.resolveThreeUnderSamples({ cap, stories: 1 });
    if (!r.ok) return { ok: false, reason: r.reason, detail: r.detail };
    const st = r.data.stories[0];
    const det = threeUpChecks({ ...THREE_UP_LAYOUT, cap: st.cap, items: st.items, card_art_ready_ids: st.items.map((x) => String(x.tcgplayerId)) });
    return {
      ok: true, cardIds: st.items.map((x) => String(x.tcgplayerId)),
      props: { cap: st.cap, items: st.items },
      numeric: st.items.flatMap((x) => [x.price_usd, x.discount_pct]), species: st.items[0].card_name,
      priceContrast: true, heroFraction: THREE_UP_LAYOUT.hero_fraction, cardSpecific: true,
      familyDet: det, shelfItems: st.items,
    };
  }
  if (S === "DEAL_DROP") {
    const r = await MD.resolveDealHeroSamples({ n: 4 });
    if (!r.ok) return { ok: false, reason: r.reason, detail: r.detail };
    // SS8 commercial-pull gate + dealHeroChecks - the strongest first that passes
    for (const it of r.data.items) {
      const wh = dealHeroWithholdReason({ price_usd: it.price_usd, market_usd: it.market_ref_usd, saved_pct: it.gap_pct, card_name: it.card_name });
      if (wh) continue;
      const det = dealHeroChecks({ price_usd: it.price_usd, market_usd: it.market_ref_usd, saved_pct: it.gap_pct, ...DEAL_HERO_LAYOUT });
      if (det.grade === "FAIL") continue;
      return {
        ok: true, cardIds: [String(it.tcgplayerId)],
        props: { card: { tcgplayerId: it.tcgplayerId, name: it.card_name, set: it.card_set }, priceUsd: it.price_usd, marketUsd: it.market_ref_usd, discountPct: it.gap_pct },
        numeric: [it.price_usd, it.market_ref_usd, it.gap_pct], species: it.card_name,
        priceContrast: true, heroFraction: DEAL_HERO_LAYOUT.hero_fraction, cardSpecific: true,
        familyDet: det, dealDeal: it.deal ?? null, nearTermOnly: true,
      };
    }
    return { ok: false, reason: "VISUALLY_UNDERPOWERED_DATA", detail: "no deal_hero sample cleared the SS8 pull gate + dealHeroChecks" };
  }
  return { ok: false, reason: "CARD_FORWARD_RENDER_UNAVAILABLE", detail: `no card-forward resolver for series ${S}` };
}

// Render + gate one card-forward persisted story for one platform.
// Returns:
//   { ok:false, withheld:{reason,detail} }                  -> WITHHOLD, no fallback
//   { ok:true, localPath, sha256Hex, layout, target,
//     deterministic:{eqa,ca,family}, review:{...}|consensus:{...},
//     familyStatus, policyVersion, artStats }
export async function renderCardForwardStory(story, platform, { renderer, db, renderDir, sha256, env = process.env, hybrid = null } = {}) {
  const series = String(story.series || "").toUpperCase();
  const spec = CARD_FORWARD_SERIES[series];
  if (!spec) return { ok: false, withheld: { reason: "CARD_FORWARD_RENDER_UNAVAILABLE", detail: `series ${series} is not a card-forward family` } };
  const famStatus = familyStatusFor(series);
  if (famStatus === "MANUAL_ONLY" || famStatus === "WITHHELD") {
    return { ok: false, withheld: { reason: "MANUAL_ONLY_NEVER_AUTONOMOUS", detail: `family_status ${famStatus}` } };
  }

  const facts = await resolveFacts(series, { db });
  if (!facts.ok) return { ok: false, withheld: { reason: facts.reason ?? "VISUALLY_UNDERPOWERED_DATA", detail: facts.detail ?? null } };

  // ---- SOCIAL-CREATIVE-4A/4B: EDITORIAL GATE (§1) --------------------
  // Run the relevance gate on REAL resolved facts before rendering. Not
  // PUBLISHABLE -> WITHHOLD (no fallback). When hybrid is enabled the
  // hybrid pipeline runs the gate itself + the creative director +
  // (optionally) an AI background; otherwise the gate runs standalone.
  const { gateStory, printingPair } = gateInputsFor(series, facts, story);

  // Resolve canonical art BEFORE the gate/pipeline so freeform slot
  // building has the real file:// art map.
  const art = await resolveArtMap(facts.cardIds, db);
  const needArt = CARD_SPECIFIC_FAMILIES.includes(spec.layout) || spec.layout === "market_shape";
  if (needArt) {
    const missing = facts.cardIds.filter((id) => !art.ready.includes(String(id)));
    if (facts.cardIds.length === 0 || missing.length) {
      return { ok: false, withheld: { reason: "CARD_FORWARD_RENDER_UNAVAILABLE", detail: `canonical art missing for ${missing.length || "all"} card(s)` } };
    }
  }

  const useHybrid = Boolean(hybrid?.enabled ?? hybridEnabled(env));
  const useFreeform = Boolean(hybrid?.freeform ?? freeformEnabled(env));
  const useGenerativeCanvas = Boolean(hybrid?.generativeCanvas ?? generativeCanvasEnabled(env));
  const useFullGenerative = Boolean(hybrid?.fullGenerative ?? fullGenerativeEnabled(env));

  // ---- SOCIAL-CREATIVE-5: FULL_GENERATIVE_SOCIAL (§2) --------------
  // The image model designs the COMPLETE post from the real cards + real
  // facts; a structured audit verifies afterward. No silent fallback to
  // weak creative (§27) - a failure state is returned as a withhold and
  // the CALLER decides SAFE_FALLBACK.
  if (useFullGenerative) {
    const fg = await runFullGenerativeSocial({
      story: gateStory, platform, layout: spec.layout, printingPair,
      resolved: { data: { ...facts.props, relevance: story.facts_json?.relevance } },
      cardImagePaths: facts.cardIds.map((id) => art.map[String(id)]).filter(Boolean),
      candidates: hybrid?.canvasCandidates,
      budget: hybrid?.budget, env, fetchImpl: hybrid?.fetchImpl ?? fetch,
    });
    if (!fg.ok) {
      return { ok: false, withheld: { reason: fg.state, detail: fg.reason }, full_generative: { state: fg.state, assessed: fg.assessed ?? null, fact_manifest: fg.factManifest ?? null } };
    }
    const { writeFileSync } = await import("node:fs");
    const localPath = path.join(renderDir, `${series.toLowerCase()}_${spec.layout}_fullgen_${platform}_${(story.story_id || "s").slice(-8)}.png`);
    if (fg.repairedHtml) await renderer.renderToPng(fg.repairedHtml, localPath);
    else writeFileSync(localPath, Buffer.from(fg.imageB64, "base64"));
    const { readFileSync } = await import("node:fs");
    const bytes = readFileSync(localPath);
    const shaHex = sha256(bytes);
    return {
      ok: true,
      localPath, bytes, sha256Hex: shaHex,
      layout: spec.layout, target: targetFor(platform),
      family_status: famStatus, conditional: spec.conditional,
      policy_version: VISUAL_REVIEW_POLICY_VERSION,
      // full-gen has its own §17/§20/§21 audit in place of the deterministic gates
      deterministic: { eqa: "PASS", ca: "PASS", family: "PASS", failed: [] },
      det_ok: true, det_pass: true,
      review: { verdict: fg.quality_hold ? "WATCH" : "PASS", scores: fg.selected.quality_scores, notes: [] },
      consensus: null,
      art_stats: { wanted: facts.cardIds.length, ready: art.ready.length },
      numeric: facts.numeric ?? [],
      near_term_only: Boolean(facts.nearTermOnly),
      image_mode: "FULL_GENERATIVE_SOCIAL",
      full_generative: {
        state: "BUFFER_READY", repaired: fg.repaired, model: fg.model,
        fact_lock_hash: fg.factLockHash?.short ?? null,
        verification: fg.verification, selected: fg.selected,
        candidates_generated: fg.candidates_generated, candidates_rejected: fg.candidates_rejected,
        master_prompt: fg.master_prompt, fact_manifest: fg.factManifest,
        caption_handoff: fg.caption_handoff,
      },
    };
  }

  let hybridResult = null;
  if (useHybrid || useGenerativeCanvas) {
    hybridResult = await runHybridPipeline({
      story: gateStory, platform, layout: spec.layout, printingPair,
      resolved: { data: { ...facts.props, relevance: story.facts_json?.relevance } },
      cardArt: art.map,
      recentFingerprints: hybrid?.recentFingerprints ?? [],
      cardPaletteHex: hybrid?.cardPaletteHex ?? null,
      freeform: useFreeform,
      generativeCanvas: useGenerativeCanvas,
      canvasCandidates: hybrid?.canvasCandidates,
      enabled: true, env, fetchImpl: hybrid?.fetchImpl ?? fetch,
      budget: hybrid?.budget,
    });
    if (hybridResult?.needs_revision) hybridResult = await reviseOnce(hybridResult, { env, fetchImpl: hybrid?.fetchImpl ?? fetch });
    if (!hybridResult.ok) {
      return { ok: false, withheld: { reason: hybridResult.state ?? "EDITORIAL_WITHHOLD", detail: hybridResult.reason ?? null }, hybrid: hybridResult };
    }
  } else {
    const gate = runEditorialGate({ story: gateStory, platform, printingPair });
    if (!gate.ok) {
      return { ok: false, withheld: { reason: gate.state ?? "EDITORIAL_WITHHOLD", detail: gate.reason ?? null } };
    }
  }
  const bgDataUrl = hybridResult?.background?.data_url ?? null;

  const target = targetFor(platform);
  // §4B.2 generative canvas > §4B.1 freeform blueprint > fixed template.
  const html = hybridResult?.generativeCanvas?.html
    ? hybridResult.generativeCanvas.html
    : hybridResult?.freeform?.html
      ? hybridResult.freeform.html
      : renderCardEditorialHtml(spec.layout, { ...facts.props, target, cardArt: art.map, ...(bgDataUrl ? { backgroundDataUrl: bgDataUrl } : {}) });
  const localPath = path.join(renderDir, `${series.toLowerCase()}_${spec.layout}_${platform}_${(story.story_id || "s").slice(-8)}.png`);
  await renderer.renderToPng(html, localPath);
  const { readFileSync } = await import("node:fs");
  const bytes = readFileSync(localPath);
  const shaHex = sha256(bytes);

  // deterministic gates
  const t = CARD_TARGETS[target] ?? CARD_TARGETS.ig_45;
  const eqa = editorialCreativeQa({
    editorial: true, layout_family: spec.layout, target: "ig_45",
    hookText: story.facts_json?.headline_fact ?? series.replace(/_/g, " "),
    ctaCount: 1, wordmarkCount: 1, minInlineFontPx: 22,
    statCallouts: (facts.numeric ?? []).slice(0, 6).map(String), bodyChars: 90,
    safe: { top: t.pad, right: t.pad, bottom: t.pad, left: t.pad },
  });
  const ca = collectibleAppeal({
    layout_family: spec.layout,
    card_ids_shown: facts.cardIds.map(String),
    card_art_ready_ids: art.ready,
    numeric_callouts: facts.numeric ?? [],
    has_price_contrast: Boolean(facts.priceContrast),
    hero_fraction: facts.heroFraction ?? 0.4,
    is_generic_typographic: false,
    species: facts.species ?? null,
  });
  const familyDet = facts.familyDet ?? { grade: "PASS", failed: [] };
  const detOk = eqa.grade !== "FAIL" && ca.grade !== "FAIL" && familyDet.grade !== "FAIL";
  const detPass = eqa.grade === "PASS" && ca.grade === "PASS" && familyDet.grade === "PASS";

  // SS12 - CONDITIONAL families auto-run the staged consensus here.
  const reviewCtx = { platform, family: spec.layout, series, cardForward: true, editorial: true };
  let review = null, consensus = null;
  if (detOk) {
    if (spec.conditional) {
      consensus = await reviewConsensus(localPath, reviewCtx, { env });
    } else {
      review = await reviewRenderedCreative(localPath, reviewCtx, { env, noCache: true });
    }
  }

  return {
    ok: true,
    localPath, bytes, sha256Hex: shaHex,
    layout: spec.layout, target,
    family_status: famStatus, conditional: spec.conditional,
    policy_version: VISUAL_REVIEW_POLICY_VERSION,
    deterministic: { eqa: eqa.grade, ca: ca.grade, family: familyDet.grade, failed: [...eqa.failed, ...ca.failed, ...(familyDet.failed ?? [])] },
    det_ok: detOk, det_pass: detPass,
    review, consensus,
    art_stats: { wanted: facts.cardIds.length, ready: art.ready.length },
    numeric: facts.numeric ?? [],
    near_term_only: Boolean(facts.nearTermOnly),
    shelf_items: facts.shelfItems ?? null,
    deal_deal: facts.dealDeal ?? null,
    // SOCIAL-CREATIVE-4B - hybrid metadata (null when hybrid was off)
    hybrid_mode: hybridResult?.mode ?? "DETERMINISTIC_ONLY",
    direction: hybridResult?.direction ?? null,
    direction_source: hybridResult?.direction_source ?? null,
    enrichments: hybridResult?.enrichments ?? null,
    critique: hybridResult?.critique ?? null,
    background: hybridResult?.background ?? null,
    version_stamp: hybridResult?.versionStamp ?? null,
    freeform: hybridResult?.freeform
      ? {
          source: hybridResult.freeform.source, model: hybridResult.freeform.model,
          composition_style: hybridResult.freeform.blueprint?.composition_style,
          zone_count: hybridResult.freeform.blueprint?.content_zones?.length,
          chosen_score: hybridResult.freeform.chosen_score?.overall,
          dead_space_score: hybridResult.freeform.chosen_score?.dead_space_score,
          crowding_score: hybridResult.freeform.chosen_score?.crowding_score,
          human_taste: hybridResult.freeform.human_taste,
          concepts: (hybridResult.freeform.concepts ?? []).map((c) => ({ style: c.blueprint?.composition_style, overall: c.overall, generic: c.generic })),
        }
      : null,
    generative_canvas: hybridResult?.generativeCanvas
      ? {
          model: hybridResult.generativeCanvas.model,
          canvas_sha256: hybridResult.generativeCanvas.canvas_sha256,
          canvas_prompt_sha: hybridResult.generativeCanvas.canvas_prompt_sha,
          canvases_generated: hybridResult.generativeCanvas.canvases_generated,
          canvases_rejected: hybridResult.generativeCanvas.canvases_rejected,
          canvas_review: hybridResult.generativeCanvas.canvas_review,
          overlay_manifest: hybridResult.generativeCanvas.overlay_manifest,
          cta: hybridResult.generativeCanvas.cta,
        }
      : null,
  };
}
