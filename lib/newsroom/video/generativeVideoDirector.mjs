// Phase SOCIAL-CREATIVE-4C.1 - GENERATIVE VIDEO ART DIRECTION (§1-§10, §16, §17).
//
//   OPENAI DESIGNS THE SCENES. CODE ANIMATES THEM. THE FACT SYSTEM OWNS TRUTH.
//
// 4C's visual layer drew the composition itself (charcoal ground, centred
// card, two text lines) - it looked like a sparse animated template. 4C.1
// REPLACES only that layer: the same OpenAI image-edit workflow that
// produces the owner-approved FULL_GENERATIVE_SOCIAL graphics designs a
// fully-composed 1080x1920-intent keyframe per scene, and code animates
// BETWEEN those designed keyframes.
//
// KEPT unchanged: the 4C scene plan / timing / motion vocabulary, the
// fact timeline, canonical card safety, safe zones, caption handoff, the
// Chrome + ffmpeg render path, and every 5A / 5A.1 fact + semantic + card
// -fidelity auditor. This module adds the generative composition step and
// the §17 creative-quality gate.
//
// Lives in lib/newsroom/ (GenAI boundary).

import { readFileSync, existsSync } from "node:fs";
import { failure } from "../editorial/failureStates.mjs";
import { canSpend } from "../hybrid/budget.mjs";
import {
  buildMasterPrompt, generateFullSocial, buildFactManifest,
  reviewCardFidelity, verifyFacts,
} from "../hybrid/fullGenerative.mjs";
import { semanticVerify } from "../hybrid/semanticAudit.mjs";
import { auditFactSources } from "../hybrid/factSource.mjs";
import { directVideo } from "./videoDirector.mjs";
import { auditVideoCreativeQa, gradeCreativeQa, STYLE_BAR } from "./videoCreativeQa.mjs";

export const GENERATIVE_VIDEO_DIRECTOR_VERSION = "4c1.1";
export const MAX_BOARD_CONCEPTS = 2;
export const MAX_BOARDS_PER_VIDEO = 5;

const b64Of = (p) => { const f = String(p ?? "").replace(/^file:\/\//, ""); return f && existsSync(f) ? readFileSync(f).toString("base64") : null; };

// ---- §2 collapse the micro-scene plan into 3-5 board scenes ----
const ROLE_OF = { hook: "hook", evidence: "evidence", explanation: "explanation", why_it_matters: "why", cta: "cta" };
export function boardScenesFrom(plan) {
  const groups = [];
  for (const s of plan.scenes ?? []) {
    const role = s.card_asset != null && s.purpose === "evidence" ? "card_hero" : (ROLE_OF[s.purpose] ?? s.purpose);
    const last = groups[groups.length - 1];
    if (last && last.role === role) {
      last.end_ms = Math.max(last.end_ms, s.end_ms);
      last.start_ms = Math.min(last.start_ms, s.start_ms);
      last.lines.push(...(s.text?.lines ?? []));
      last.data_refs.push(...(s.data_refs ?? []));
      if (s.card_asset != null) last.card_assets.add(s.card_asset);
      if (s.stat_asset) last.stat_assets.add(s.stat_asset);
      last.motions.push(s.animation);
    } else {
      groups.push({
        role, purpose: s.purpose,
        start_ms: s.start_ms, end_ms: s.end_ms,
        lines: [...(s.text?.lines ?? [])],
        data_refs: [...(s.data_refs ?? [])],
        card_assets: new Set(s.card_asset != null ? [s.card_asset] : []),
        stat_assets: new Set(s.stat_asset ? [s.stat_asset] : []),
        motions: [s.animation],
      });
    }
  }
  // merge tiny adjacent groups so we land on 3-5 boards
  let merged = groups;
  while (merged.length > MAX_BOARDS_PER_VIDEO) {
    let iMin = 1, minLen = Infinity;
    for (let i = 1; i < merged.length - 1; i++) {
      const len = merged[i].end_ms - merged[i].start_ms;
      if (len < minLen && merged[i].role !== "cta" && merged[i].role !== "hook") { minLen = len; iMin = i; }
    }
    const a = merged[iMin - 1], b = merged[iMin];
    a.end_ms = b.end_ms; a.lines.push(...b.lines); a.data_refs.push(...b.data_refs);
    b.card_assets.forEach((x) => a.card_assets.add(x)); b.stat_assets.forEach((x) => a.stat_assets.add(x));
    a.motions.push(...b.motions);
    merged = merged.filter((_, i) => i !== iMin);
  }
  return merged.map((g, i) => ({
    index: i,
    role: g.role,
    purpose: g.purpose,
    start_ms: g.start_ms,
    end_ms: g.end_ms,
    required_copy: [...new Set(g.lines.filter(Boolean))].slice(0, 4),
    data_refs: [...new Set(g.data_refs)],
    card_assets: [...g.card_assets],
    stat_assets: [...g.stat_assets],
    motions: [...new Set(g.motions)],
  }));
}

// ---- §8 deterministic zone emphasis per board (source of truth for
// which way the camera / transition should move, NOT a PNG slice) ----
const ZONE_FOR_ROLE = {
  hook: ["headline_zone", "decorative_layers"],
  card_hero: ["card_zone", "stat_zone"],
  evidence: ["card_zone", "stat_zone"],
  explanation: ["stat_zone", "chart_zone", "why_zone"],
  why: ["why_zone", "headline_zone"],
  cta: ["cta_zone"],
};
export function deriveMotionLayout(boardScene) {
  return {
    board_index: boardScene.index,
    role: boardScene.role,
    emphasis_zones: ZONE_FOR_ROLE[boardScene.role] ?? ["headline_zone"],
    zones: ["background", "card_zone", "headline_zone", "stat_zone", "chart_zone", "why_zone", "cta_zone", "decorative_layers"],
    reads_from: "generated_scene_board", // the board is the composition source of truth (§8)
  };
}

// ---- §4 the generative style prompt for ONE board ----------
const ANTI_SPARSE =
  "EXPLICITLY AVOID: a sparse black or plain-gradient layout; a single centred card on an empty ground; a lower-third slate; a slideshow frame; " +
  "SaaS UI; a gaming HUD / tactical UI; a crypto infographic; generic motion-graphics; a PowerPoint look; an empty lower third; large unused/dead space. " +
  "The frame must be VISUALLY DENSE and fully composed edge to edge - layered panels, a real designed/textured ground, editorial hierarchy, tasteful data viz.";

export function buildBoardBrief({ boardScene, index, total, family, semanticManifest, factManifest, continuity }) {
  const bs = boardScene;
  const roleLine = ({
    hook: "FRAME ROLE: the HOOK. In the first second the viewer must see one dominant reason to keep watching (the key stat / the ASK-vs-MARKET contrast / the headline figure). Card partially present, strong premium composition.",
    card_hero: "FRAME ROLE: the CARD HERO. The real card is dominant; a deal-vs-market panel and one supporting graphic sit alongside it.",
    evidence: "FRAME ROLE: EVIDENCE. Show the real comparison / distribution as designed data viz alongside the card.",
    explanation: "FRAME ROLE: EXPLANATION. A price-comparison / saving visualisation and a short why-this-matters block.",
    why: "FRAME ROLE: WHY IT MATTERS. A confident editorial takeaway panel - the reusable collector lesson.",
    cta: "FRAME ROLE: the CTA. A polished, website-first ending. Leave the deterministic brand strip empty; do not draw a logo.",
  })[bs.role] ?? "FRAME ROLE: a designed editorial scene.";

  const copy = bs.required_copy.length
    ? `This frame MUST render this copy, spelled exactly (design it into the composition, not as a caption bar): ${bs.required_copy.map((t) => `"${t}"`).join(", ")}.`
    : "This frame carries no fixed copy - carry the story visually.";

  // reuse the approved FULL_GENERATIVE_SOCIAL master prompt as the style spine
  const spine = buildMasterPrompt({ layout: family, factManifest });

  const dir = semanticManifest.comparison_direction;
  const dirLine = dir && dir !== "UNKNOWN"
    ? `DIRECTION (do not contradict): the ${semanticManifest.comparison_left?.label} (${semanticManifest.comparison_left?.text}) is ${dir.replace("_", " ").toLowerCase()} the ${semanticManifest.comparison_right?.label} (${semanticManifest.comparison_right?.text}). Any arrow must point ${dir === "BELOW_MARKET" ? "DOWN (toward the lower value)" : dir === "ABOVE_MARKET" ? "UP" : "level"}; any word like "premium"/"discount"/"below"/"above" and any +/- sign must match this. Never draw an up arrow for a below-market story.`
    : "";
  const brandZoneLine =
    "BRAND: keep the TOP-LEFT CORNER of the frame clear - roughly a 380x120px area - for a small PokemonDealFinder brand chip that is composited afterward. " +
    "You MAY place a headline high in the frame, just not overlapping that top-left corner. Do NOT draw the PokemonDealFinder logo/wordmark yourself, and NEVER draw a Poke Ball or any red-and-white ball / official-Pokemon-style mark.";

  return [
    `You are the senior art director for PokemonDealFinder, a premium Pokemon-card collectibles publication. Design one keyframe for a short-form vertical video. Do NOT print any frame number / "1 of 4" / production annotation anywhere on the image.`,
    `CROP-SAFE AREA (important): the finished video is 9:16, and about 10% of the LEFT edge and 10% of the RIGHT edge of your image will be trimmed. So keep EVERY element that must stay visible - headline, card, every price / % / label, the CTA, panels - inside the CENTRE 80% of the width (roughly the middle four-fifths). Let the outer tenth on each side be background / texture bleed only. Use the FULL HEIGHT. Still compose densely - no wide empty band in the middle.`,
    roleLine,
    `STYLE (identical to our approved social graphics): ${STYLE_BAR}`,
    ANTI_SPARSE,
    spine,
    copy,
    dirLine,
    `CONTINUITY (all ${total} keyframes are ONE campaign): ${continuity}`,
    brandZoneLine,
    `Use the REAL canonical card image(s) supplied - design around them, keep each card faithfully recognisable, do NOT redraw / restyle / recolour / distort.`,
    `THE MODEL MAY INVENT DESIGN. THE MODEL MAY NOT INVENT DATA - every visible price, percentage, population, card attribute, chart value, timeframe or source must be one that is supplied here; if it is not supplied, omit it.`,
  ].filter(Boolean).join("\n\n");
}

// ---- §9 generate + verify a full board set ----------------
// numbers already sanctioned for this story (prices + %s in the manifest)
function allowedNumsFor(semanticManifest, factManifest) {
  const nums = new Set();
  const add = (v) => { const n = Number(v); if (Number.isFinite(n)) nums.add(Math.round(n * 100) / 100); };
  const S = semanticManifest || {};
  add(S.comparison_left?.value); add(S.comparison_right?.value);
  add(S.comparison_pct); add(S.claim_value);
  for (const v of Object.values(factManifest?.required_numeric_facts ?? {})) add(v);
  for (const p of S.visualization_data_manifest?.allowed_points ?? []) add(p.value);
  for (const it of S.item_identities ?? []) add(it.price);
  return nums;
}
const finNum = (s) => { const m = String(s ?? "").replace(/,/g, "").match(/-?\d+(\.\d+)?/g); return (m ?? []).map(Number); };

async function verifyBoard({ b64, boardScene, family, semanticManifest, factManifest, cardB64s, env, fetchImpl, budget }) {
  const out = { ok: true, findings: [], state: null, audits: {} };
  const push = (a, k) => { out.audits[k] = a.ok ? "PASS" : (a.state ?? "FAIL"); if (!a.ok && out.ok) { out.ok = false; out.state = a.state ?? "VIDEO_SEMANTIC_FAIL"; out.reason = a.reason; } if (!a.ok) out.findings.push(...(a.findings ?? [{ detail: a.reason }])); };

  // the board's OWN required copy is sanctioned editorial text - fold it
  // into required_text so verifyFacts does not flag a label we asked for.
  const boardFactManifest = Object.freeze({
    ...factManifest,
    required_text: [...new Set([...(factManifest.required_text ?? []), ...(boardScene.required_copy ?? [])])],
  });
  const allowedNums = allowedNumsFor(semanticManifest, factManifest);
  const near = (n) => [...allowedNums].some((v) => Math.abs(v - n) <= Math.max(0.5, Math.abs(v) * 0.01));

  // card fidelity only for boards that feature a card
  if (boardScene.card_assets.length && cardB64s.length) {
    const fid = await reviewCardFidelity({ b64, cardImageB64s: cardB64s, cardIdentity: semanticManifest.card_identity ?? {}, env, fetchImpl, budget });
    push(fid.ok ? fid : { ok: false, state: "VIDEO_CARD_FIDELITY_FAIL", reason: fid.reason, findings: fid.findings }, "card_fidelity");
    out.fidelity_score = fid.fidelity_score ?? null;
  } else out.audits.card_fidelity = "N/A";

  const sem = await semanticVerify({ b64, layout: family, semanticManifest, env, fetchImpl, budget });
  push(sem.ok ? sem : { ok: false, state: "VIDEO_SEMANTIC_FAIL", reason: sem.reason, findings: sem.findings }, "semantic");
  if (sem.extraction) {
    const fs = auditFactSources({
      extraction: sem.extraction,
      metadataLock: semanticManifest.card_metadata_lock,
      vizManifest: semanticManifest.visualization_data_manifest,
      sourceManifest: semanticManifest.source_attribution_manifest,
      timeframeManifest: semanticManifest.timeframe_manifest,
    });
    // a designed price-comparison panel is NOT an invented distribution
    // chart: for non-market_shape families, drop CHART_* findings whose
    // shown values are already sanctioned prices/%s for this story.
    let fsFindings = fs.findings ?? [];
    if (family !== "market_shape") {
      fsFindings = fsFindings.filter((f) => {
        if (!/CHART/.test(f.code)) return true;
        const ns = finNum(f.detail);
        return !ns.length || !ns.every((n) => near(n));
      });
    }
    // §11/§18: the brand is a small deterministic CORNER mark on video,
    // not a full-width reserved bar. A designed HEADLINE high in the frame
    // is good editorial video - only a GENERATED logo / wordmark / ball /
    // brand mark in the top strip is a real fail (that is also covered by
    // detectGeneratedBrandRisk in the semantic pass).
    fsFindings = fsFindings.filter((f) => {
      if (f.code !== "BRAND_SAFE_ZONE_OCCUPIED") return true;
      const d = String(f.detail ?? "").toLowerCase();
      if (/logo|wordmark|ball|brand mark|pok[eé]mondealfinder/.test(d)) return true; // keep - real risk
      out.audits.brand_safe_zone = "WARN_HEADLINE_HIGH"; // note, not a blocker
      return false;
    });
    const fsOk = fsFindings.length === 0;
    push(fsOk ? { ok: true } : { ok: false, state: (fs.state && fsFindings.some((x) => x.code === fs.state)) ? fs.state : fsFindings[0].code, reason: fsFindings.map((x) => x.detail).join(" | "), findings: fsFindings }, "fact_sources");
  }
  const facts = await verifyFacts({ b64, factManifest: boardFactManifest, env, fetchImpl, budget });
  const factsOk = facts.ok || facts.state === "SAFE_REPAIR_REQUIRED";
  push(factsOk ? { ok: true } : { ok: false, state: "VIDEO_FACT_FAIL", reason: facts.reason }, "fact_verify");

  const cq = await auditVideoCreativeQa({ b64, frameRole: boardScene.role, env, fetchImpl, budget });
  push(cq, "creative_quality");
  out.creative_scores = cq.scores ?? null;

  return out;
}

/**
 * generateSceneBoards({ plan, family, semanticManifest, factLock, resolved,
 *                       contract, cardImagePaths, concepts, budget, env, fetchImpl })
 *  -> { ok, boards:[{ index, role, b64, sha256, prompt, verify }], concept, state?, reason? }
 */
export async function generateSceneBoards({
  plan, family, semanticManifest, factLock = {}, resolved = null, contract = null,
  cardImagePaths = [], concepts = MAX_BOARD_CONCEPTS, budget, env = process.env, fetchImpl = fetch,
} = {}) {
  const key = env.SOCIAL_IMAGE_GEN_API_KEY || env.OPENAI_API_KEY;
  if (!key) return { ok: false, state: "SCENE_BOARD_GENERATION_FAILED", reason: "no image-gen key" };

  const factManifest = buildFactManifest({ layout: family, factLock, resolved, contract });
  const boardScenes = boardScenesFrom(plan);
  const cardB64s = cardImagePaths.map(b64Of).filter(Boolean);
  if (!cardB64s.length && family !== "market_shape") return { ok: false, state: "SCENE_BOARD_GENERATION_FAILED", reason: "no canonical card image for the board set" };

  const continuity =
    `same typography family, the same dark charcoal editorial ground with subtle texture + depth, one restrained red accent, the same card treatment ` +
    `(soft drop shadow, consistent zone), the same header/footer treatment, the same editorial voice. No visual reset between frames - it must read as one designed set.`;

  const buildConcept = async (conceptIdx) => {
    const boards = [];
    for (const bs of boardScenes) {
      if (budget && !canSpend(budget, "background_generation")) return { failed: true, reason: "image budget exhausted" };
      const prompt =
        buildBoardBrief({ boardScene: bs, index: bs.index, total: boardScenes.length, family, semanticManifest, factManifest, continuity }) +
        (conceptIdx > 0 ? `\n\nCONCEPT ${conceptIdx + 1}: use a distinctly different composition + grid from concept 1 (vary the card scale/placement and the panel layout) while keeping the SAME style system.` : "");
      // eslint-disable-next-line no-await-in-loop
      const g = await generateFullSocial({ prompt, cardImagePaths, budget, env, fetchImpl });
      if (!g.ok) return { failed: true, reason: `board ${bs.index} generation failed (${g.availability})`, detail: g.detail };
      boards.push({ index: bs.index, role: bs.role, boardScene: bs, b64: g.b64, sha256: g.sha256, model: g.model, prompt });
    }
    return { boards };
  };

  const assessConcept = async (boards) => {
    const verified = [];
    for (const b of boards) {
      // eslint-disable-next-line no-await-in-loop
      const v = await verifyBoard({ b64: b.b64, boardScene: b.boardScene, family, semanticManifest, factManifest, cardB64s, env, fetchImpl, budget });
      verified.push({ ...b, verify: v });
    }
    return verified;
  };

  // concept 1
  const c1 = await buildConcept(0);
  if (c1.failed) return { ok: false, state: "SCENE_BOARD_GENERATION_FAILED", reason: c1.reason, detail: c1.detail };
  let boards = await assessConcept(c1.boards);
  let conceptUsed = 1;

  const cleanAll = (bs) => bs.every((b) => b.verify.ok);

  // concept 2 if concept 1 is not fully clean
  if (!cleanAll(boards) && concepts > 1 && canSpend(budget ?? { limits: {}, used: {} }, "background_generation")) {
    const c2 = await buildConcept(1);
    if (!c2.failed) {
      const boards2 = await assessConcept(c2.boards);
      if (cleanAll(boards2) || boards2.filter((b) => b.verify.ok).length > boards.filter((b) => b.verify.ok).length) { boards = boards2; conceptUsed = 2; }
    }
  }

  // one bounded regeneration of just the failing boards
  if (!cleanAll(boards) && canSpend(budget ?? { limits: {}, used: {} }, "background_generation")) {
    for (let i = 0; i < boards.length; i++) {
      const b = boards[i];
      if (b.verify.ok || !canSpend(budget, "background_generation")) continue;
      const fixHint = b.verify.state && /SPARSE|CENTERED|EMPTY|GENERIC|STYLE_MISMATCH/.test(b.verify.state)
        ? "\n\nIMPORTANT: the previous version was too sparse / template-like. Make this frame VISUALLY DENSE - fill it edge to edge with layered editorial panels, a designed textured ground, real data viz and strong hierarchy. Do NOT centre a lone card on empty space."
        : `\n\nIMPORTANT: fix ONLY this: ${b.verify.reason}. Keep every stated fact identical to the supplied source of truth.`;
      // eslint-disable-next-line no-await-in-loop
      const g = await generateFullSocial({ prompt: b.prompt + fixHint, cardImagePaths, budget, env, fetchImpl });
      if (!g.ok) continue;
      // eslint-disable-next-line no-await-in-loop
      const v = await verifyBoard({ b64: g.b64, boardScene: b.boardScene, family, semanticManifest, factManifest, cardB64s, env, fetchImpl, budget });
      if (v.ok || v.findings.length < b.verify.findings.length) boards[i] = { ...b, b64: g.b64, sha256: g.sha256, model: g.model, verify: v, regenerated: true };
    }
  }

  if (!cleanAll(boards)) {
    const worst = boards.find((b) => !b.verify.ok);
    return {
      ok: false,
      state: worst?.verify.state ?? "VISUAL_STYLE_MISMATCH_FAIL",
      reason: `board ${worst?.index} (${worst?.role}) did not clear the audit: ${worst?.verify.reason}`,
      boards, concept: conceptUsed,
    };
  }
  return { ok: true, boards, concept: conceptUsed, board_scenes: boardScenes };
}

// ---- §7 motion FROM the designed keyframes ---------------
// Each board is a fully-designed frame; motion is a masked editorial
// entrance, a subtle <=3% parallax/push during the hold, and an editorial
// wipe exit + a match-cut transition to the next board. NOT a crossfade
// of static posters.
export function buildGenerativeMotionPlan({ boardScenes, boards, plan }) {
  return boardScenes.map((bs, i) => {
    const layout = deriveMotionLayout(bs);
    const next = boardScenes[i + 1] ?? null;
    const dur = bs.end_ms - bs.start_ms;
    // push toward the emphasis zone of THIS board, then hand off toward
    // the next board's emphasis zone (a match cut reads as element motion)
    const dirFor = (zones) =>
      zones.includes("card_zone") ? { x: 0, y: -1.6 }
      : zones.includes("chart_zone") || zones.includes("stat_zone") ? { x: -1.4, y: 0 }
      : zones.includes("cta_zone") ? { x: 0, y: 0 }
      : { x: 1.2, y: -0.6 };
    const push = dirFor(layout.emphasis_zones);
    return {
      board_index: bs.index,
      role: bs.role,
      start_ms: bs.start_ms,
      end_ms: bs.end_ms,
      entrance: { type: i === 0 ? "mask_reveal_up" : "editorial_wipe", dur_ms: Math.min(560, Math.round(dur * 0.28)), from_scale: 1.05, from_offset: { x: push.x * 6, y: push.y * 6 } },
      hold: { parallax_pct: 2.6, push_dir: push, drift_ms: Math.max(0, dur - 900) }, // <= 3% drift, never a dead static hold
      exit: { type: next ? "editorial_wipe" : "settle", dur_ms: next ? 380 : 240, to_scale: next && next.role !== "cta" ? 1.04 : 1.0 },
      transition_to_next: next ? { type: "match_cut", to_zone: (ZONE_FOR_ROLE[next.role] ?? ["headline_zone"])[0] } : null,
      layout,
    };
  });
}

/**
 * runGenerativeVideoDirector({ story, semanticManifest, factLock, resolved,
 *   contract, factTrace, captionHandoff, cardImagePaths, family, budget, env, fetchImpl })
 *
 * Full 4C.1 flow (§9): verified story -> 4C scene plan (KEPT) -> generate
 * 2 scene-board concepts -> audit facts / card fidelity / visual quality
 * -> select best -> motion plan from the designed boards -> plan object.
 * Does NOT render (call renderGenerativeVideoToMp4 with the result).
 */
export async function runGenerativeVideoDirector(opts = {}) {
  const {
    story = {}, semanticManifest = {}, factLock = {}, resolved = null, contract = null,
    factTrace = [], captionHandoff = null, cardImagePaths = [], concepts = MAX_BOARD_CONCEPTS,
    family = semanticManifest.layout ?? "deal_hero", budget = null, env = process.env, fetchImpl = fetch,
  } = opts;

  // KEEP the 4C director for timing / motion vocab / fact timeline / safe zones
  const plan = directVideo({ story, semanticManifest, factTrace, captionHandoff, cardImagePaths, family });
  if (!plan.ok) return { ok: false, state: plan.state, reason: plan.reason, plan: null };

  const gen = await generateSceneBoards({ plan, family, semanticManifest, factLock, resolved, contract, cardImagePaths, concepts, budget, env, fetchImpl });
  if (!gen.ok) {
    return { ok: false, ...failure(
      ["SPARSE_TEMPLATE_FAIL", "CENTERED_CARD_ONLY_FAIL", "EXCESS_EMPTY_SPACE_FAIL", "GENERIC_MOTION_GRAPHICS_FAIL", "VISUAL_STYLE_MISMATCH_FAIL", "SCENE_BOARD_GENERATION_FAILED", "VIDEO_CARD_FIDELITY_FAIL", "VIDEO_SEMANTIC_FAIL", "VIDEO_FACT_FAIL"].includes(gen.state) ? gen.state : "SCENE_BOARD_GENERATION_FAILED",
      gen.reason, { stage: "generative_video_director" }),
      plan, boards: (gen.boards ?? []).map(stripB64), concept: gen.concept ?? null };
  }

  const boardScenes = gen.board_scenes;
  const motion_plan = buildGenerativeMotionPlan({ boardScenes, boards: gen.boards, plan });

  // §16 poster = the strongest generated board (prefer a card-hero board)
  const scored = gen.boards.map((b) => ({ b, s: (b.verify.creative_scores?.editorial_richness ?? 0) + (b.verify.creative_scores?.composition_density ?? 0) + (b.role === "card_hero" ? 25 : 0) - (b.verify.creative_scores?.empty_space_pct ?? 0) }));
  scored.sort((x, y) => y.s - x.s);
  const posterBoardIndex = scored[0].b.index;

  const blockers = [];
  if (!captionHandoff || !captionHandoff.semantic_hash) blockers.push("VIDEO_CAPTION_LINK_MISSING - no verified caption_handoff to attach (§29 / 4C)");

  return {
    ok: true,
    state: "GENERATIVE_VIDEO_PLAN_READY",
    at: new Date().toISOString(),
    family,
    plan,
    board_scenes: boardScenes,
    boards: gen.boards.map((b) => ({ index: b.index, role: b.role, sha256: b.sha256, model: b.model, regenerated: Boolean(b.regenerated), prompt: b.prompt, verify: b.verify })),
    board_images: gen.boards.map((b) => ({ index: b.index, role: b.role, b64: b.b64 })), // raw pixels for the renderer / proof
    concept: gen.concept,
    motion_plan,
    poster_board_index: posterBoardIndex,
    caption_link: captionHandoff ? { semantic_hash: captionHandoff.semantic_hash, image_artifact_id: captionHandoff.image_artifact_id ?? null } : null,
    blockers,
    versions: { generative_video_director: GENERATIVE_VIDEO_DIRECTOR_VERSION, video_director: plan.versions?.video_director ?? null },
  };
}

function stripB64(b) { const { b64, ...rest } = b; return rest; }
export { STYLE_BAR };
