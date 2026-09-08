// Phase SOCIAL-CREATIVE-4B.2 - GENERATIVE DESIGN CANVAS (§2, §3, §8-§19).
//
// gpt-image-2 OWNS THE VISUAL DESIGN. It creates the COMPLETE non-factual
// visual architecture - panels, dividers, arrows, comparison structures,
// empty data-viz frames, editorial boxes, brand atmosphere, depth - a
// finished premium social post BEFORE any factual content is inserted.
// OUR CODE OWNS THE TRUTH (canvasCompositor.mjs overlays it afterward).
//
// The prompt is built here and assertDataFree() runs over it immediately
// before the API call - no card / price / set / stat / id / URL can reach
// it. Model + size come from lib/social/imageModelConfig (single source of
// truth), the same one scripts/socialAssets.mjs uses.

import { createHash } from "node:crypto";
import { assertDataFree, SHARED_NEGATIVE, NO_CARD_DRAWING } from "../../social/assetPrompts.mjs";
import { OPENAI_IMAGE_MODEL, OPENAI_IMAGE_REQUEST_SIZE } from "../../social/imageModelConfig.mjs";
import { canSpend, recordCall } from "./budget.mjs";
import { reservedRegionsClause, slotLayoutFor } from "./canvasSlots.mjs";

const IMAGES_ENDPOINT = "https://api.openai.com/v1/images/generations";

export const DESIGN_CANVAS_VERSION = "4b2.1";
export const MAX_CANVAS_CANDIDATES = 2; // §19

// The shared art-direction brief (§8, §9, §10, §12).
const BASE_BRIEF =
  "Design a PREMIUM Pokemon-card COLLECTOR-MEDIA infographic poster, portrait 4:5 (1080x1350). " +
  "Aesthetic: dark charcoal / near-black editorial ground (#0B0B0D-#161619), restrained signal red accents (#F0322E), " +
  "clean white typographic AREAS (no actual letters), a single green reserved only for genuine positive value. " +
  "Feel: a serious sports/finance DATA-EDITORIAL brand at the top of its craft - hand-designed, considered, expensive. " +
  "NOT a SaaS dashboard, NOT crypto, NOT a PowerPoint slide, NOT a generic AI social graphic, NOT a bright or minimalist layout. " +
  "HIGH INFORMATION DESIGN: build real visual structure - supporting panels, graphical dividers, thin annotation lines, " +
  "callout arrows, an empty data-visualisation container (a clean bar / track / plot frame with NO numbers), a subtle icon set, " +
  "an editorial context box with an accent edge, a clear visual hierarchy, and generous but purposeful negative space. " +
  "Strong depth and lighting, fine grain, crisp hairlines. " +
  "Optimise the composition for: an immediate scroll-stop, a premium editorial first impression, collector relevance, " +
  "save/share appeal, and strong brand recall - NOT merely for cleanliness. " +
  "The PokemonDealFinder brand identity must feel BUILT IN (a small wordmark area top, a thin footer strip, the red accent) - never pasted on, never large.";

// Per-family visual direction (§13-§18) - mood/structure only, no layout
// prescription, no data.
const FAMILY_DIRECTION = Object.freeze({
  deal_hero:
    "STORY MOOD - an irresistible editorial DEAL FEATURE: one large real card will sit on the left; to its right, a value story " +
    "(a big number, a listed-vs-market contrast, a savings/gap visualisation) framed like a magazine feature. Design how they relate. " +
    "One confident downward accent marking the gap. A clear website call-to-action area, bottom.",
  market_shape:
    "STORY MOOD - a dramatic COLLECTOR-MARKET infographic: one huge hero statistic dominates, supported by a distribution track, " +
    "a sample-context strip, and a small framed area where one real example card is integrated (not tacked on). " +
    "An editorial market-insight box. No giant meaningless blank sections. Subtle website branding only.",
  asking_vs_sold:
    "STORY MOOD - make 'ASKING PRICE does not equal MARKET VALUE' visually undeniable: a price ladder or a range visual, a bold connector arrow " +
    "between an 'ask' block and a 'sold' block, and an editorial explanation panel. A real card sits on the left.",
  printing_compare:
    "STORY MOOD - two nearly-identical real cards will sit side by side; the design must make a SUBTLE printing/variant distinction feel important: " +
    "close-up comparison frames, a difference callout mark between them, a small lineage/timeline element, a market-comparison block, a variant-label chip. No text.",
  three_up:
    "STORY MOOD - an attractive, save-worthy COLLECTOR SHORTLIST: three visual modules (staggered or ranked), each a framed void for a real card with a value/deal badge area, " +
    "a summary panel, and a ranking treatment (1/2/3). Curated, not a spreadsheet grid.",
});

// candidateSeed lets the two candidates differ deterministically.
export function buildDesignCanvasPrompt(params = {}) {
  const allowed = new Set(["layout", "storyCategory", "candidateSeed"]);
  const extra = Object.keys(params).filter((k) => !allowed.has(k));
  if (extra.length) throw new Error(`buildDesignCanvasPrompt: unexpected key(s) [${extra.join(", ")}] - the design prompt is data-free by construction`);
  const { layout, storyCategory = null, candidateSeed = 0 } = params;

  const L = FAMILY_DIRECTION[layout] ? layout : "market_shape";
  const cat = /^[a-z_]{1,40}$/i.test(String(storyCategory || "")) ? String(storyCategory).toUpperCase().replace(/_/g, " ").toLowerCase() : null;
  const variety = [
    "Lean into a strong asymmetric editorial grid.",
    "Lean into a bold centred feature with orbiting supporting panels.",
  ][candidateSeed % 2];

  const prompt = [
    BASE_BRIEF,
    FAMILY_DIRECTION[L],
    cat ? `Editorial context (mood only, no data): a ${cat} story.` : "",
    variety,
    reservedRegionsClause(L),
    "ABSOLUTELY NO readable text, letters, words, numbers, percentages, prices, or captions anywhere in the image - " +
      "every word and figure is composited on afterward by a separate system. Text AREAS may be suggested (a bar, an underline, a panel) but must contain NO glyphs.",
    NO_CARD_DRAWING,
    SHARED_NEGATIVE,
  ].filter(Boolean).join("\n\n");

  assertDataFree(prompt);

  return {
    layout: L,
    story_category: cat ? cat.toUpperCase().replace(/ /g, "_") : null,
    candidate_seed: candidateSeed,
    size: OPENAI_IMAGE_REQUEST_SIZE,
    model: OPENAI_IMAGE_MODEL,
    slots: slotLayoutFor(L),
    prompt,
    prompt_sha: createHash("sha256").update(prompt).digest("hex").slice(0, 16),
  };
}

export function designCanvasAvailable(env = process.env) {
  return Boolean(env.SOCIAL_IMAGE_GEN_API_KEY || env.OPENAI_API_KEY);
}

// Generate ONE design canvas.
//   -> { ok:true, b64, mime, sha256, prompt_sha, model } | { ok:false, availability }
export async function generateDesignCanvas({ spec, budget = null, env = process.env, fetchImpl = fetch } = {}) {
  const key = env.SOCIAL_IMAGE_GEN_API_KEY || env.OPENAI_API_KEY;
  const model = process.env.OPENAI_IMAGE_MODEL || spec?.model || OPENAI_IMAGE_MODEL;
  if (!key) return { ok: false, availability: "no_key" };
  if (budget && !canSpend(budget, "background_generation")) return { ok: false, availability: "budget_exhausted" };
  assertDataFree(spec.prompt);

  const t0 = Date.now();
  try {
    const res = await fetchImpl(IMAGES_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, prompt: spec.prompt, size: spec.size || OPENAI_IMAGE_REQUEST_SIZE, n: 1 }),
      signal: AbortSignal.timeout(180000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (budget) recordCall(budget, "background_generation", { ok: false, latencyMs: Date.now() - t0, detail: `http ${res.status}` });
      return { ok: false, availability: `http_${res.status}`, detail: body.slice(0, 200) };
    }
    const json = await res.json();
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) {
      if (budget) recordCall(budget, "background_generation", { ok: false, latencyMs: Date.now() - t0, detail: "no b64" });
      return { ok: false, availability: "no_image_returned" };
    }
    if (budget) recordCall(budget, "background_generation", { ok: true, latencyMs: Date.now() - t0, detail: "design_canvas" });
    return {
      ok: true, b64, mime: "image/png",
      sha256: createHash("sha256").update(Buffer.from(b64, "base64")).digest("hex"),
      prompt_sha: spec.prompt_sha, model,
    };
  } catch (e) {
    if (budget) recordCall(budget, "background_generation", { ok: false, latencyMs: Date.now() - t0, detail: String(e?.message ?? e).slice(0, 120) });
    return { ok: false, availability: `error:${String(e?.message ?? e).slice(0, 80)}` };
  }
}
