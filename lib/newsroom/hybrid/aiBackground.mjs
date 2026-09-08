// Phase SOCIAL-CREATIVE-4B - AI BACKGROUND / ENVIRONMENT GENERATION (§6),
// SAFE-ZONE MASKING (§7), IMAGE SAFETY SCAN (§8).
//
// Generates a DECORATIVE background layer only. It never contains card
// art, characters, prices, logos, charts, UI, or readable text - the real
// canonical card and every real fact are composited deterministically
// AFTER, by lib/newsroom/hybrid/compositor + the existing renderer.
//
// The prompt is built here (category + mood + layout intent + palette
// hints + reserved safe zones), and assertDataFree() from
// lib/social/assetPrompts.mjs is run over the finished string immediately
// before the API call - no card name, price, set, id, or URL can reach it.
//
// Model + size + endpoint come from the SINGLE source of truth
// (lib/social/imageModelConfig.mjs), the same one scripts/socialAssets.mjs
// uses. No second image client.

import { createHash } from "node:crypto";
import { assertDataFree, SHARED_NEGATIVE, NO_CARD_DRAWING } from "../../social/assetPrompts.mjs";
import { OPENAI_IMAGE_MODEL, OPENAI_IMAGE_REQUEST_SIZE } from "../../social/imageModelConfig.mjs";
import { failure } from "../editorial/failureStates.mjs";
import { canSpend, recordCall } from "./budget.mjs";

const IMAGES_ENDPOINT = "https://api.openai.com/v1/images/generations";
const VISION_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const VISION_MODEL = process.env.SOCIAL_VISUAL_REVIEW_MODEL || "gpt-4o";

// story layout family -> a data-free MOOD/MOTIF clause. NOTHING here names
// a card, price, set, or number - it is mood only.
export const BACKGROUND_MOODS = Object.freeze({
  deal_hero: "measured deal-discovery: an implied horizontal fair-value line with a calm red bracket marking a gap below it; one spotlight cone; quiet, not hyped",
  market_shape: "market-at-a-glance: a faint abstract distribution of thin bars and points with a calm median line; analyst calm at night",
  printing_compare: "a clean vertical division of the frame into two calm tonal halves for a side-by-side; balanced neutral light; no objects",
  three_up: "a calm triptych rhythm: three evenly weighted vertical bands of soft light on a dark ground; nothing in them",
  asking_vs_sold: "two quiet horizontal reference bands, one higher and paler, one lower and firmer, with air between; a gentle downward step",
  bid_vs_total: "a soft thinning countdown arc and a faint ascending step line; restrained tension in charcoal and red",
  movers_countdown: "three faint ascending step lines of different steepness on a dark grid; a quiet ranking rhythm",
  editorial: "premium editorial dark ground, generous negative space, one crisp geometric focal element, thin luminous hairlines",
});

// A small, fixed vocabulary of safe-zone presets keyed by layout - the
// generated art must keep these rects calm/low-contrast.
export const SAFE_ZONE_BY_LAYOUT = Object.freeze({
  deal_hero: { hero: [64, 120, 560, 1000], stat: [640, 200, 380, 520], foot: [48, 1180, 984, 150] },
  market_shape: { stat: [64, 90, 960, 380], chart: [64, 500, 960, 460], example_card: [700, 980, 320, 300], foot: [48, 1200, 984, 130] },
  printing_compare: { card_a: [70, 260, 430, 760], card_b: [580, 260, 430, 760], callout: [70, 1040, 940, 160], foot: [48, 1200, 984, 130] },
  three_up: { card_1: [60, 300, 300, 640], card_2: [390, 300, 300, 640], card_3: [720, 300, 300, 640], headline: [48, 90, 984, 180] },
  asking_vs_sold: { card: [64, 220, 460, 780], asking: [560, 240, 460, 220], sold: [560, 520, 460, 220], foot: [48, 1200, 984, 130] },
  editorial: { headline: [48, 60, 984, 420], body: [48, 520, 984, 640], foot: [48, 1200, 984, 130] },
});

const PALETTE_HINT =
  "Palette: premium dark charcoal / near-black ground (#0B0B0D to #161619), one restrained signal red (#F0322E), cool near-white highlights, soft dark greys. " +
  "Bright white is a small accent, never a field. Not childish, not casino, not crypto, not a discount blowout, not a bright background.";

const COMPOSITION_HINT =
  "Generous negative space, clean margins, subtle depth (soft shadow, gentle gradient, fine grain), high tonal separation so overlaid text stays legible. No border frame, no heavy vignette over the text zones.";

/**
 * Build the background prompt. `params` = { layout, mood?, densityHint?,
 * cardPaletteHint? } - all mood/enum-ish, never live data. cardPaletteHint
 * is a short colour-family word only ("warm", "cool", "green", "blue") and
 * is validated against a whitelist.
 */
export function buildBackgroundPrompt(params = {}) {
  const allowed = new Set(["layout", "mood", "densityHint", "cardPaletteHint", "storyCategory"]);
  const extra = Object.keys(params).filter((k) => !allowed.has(k));
  if (extra.length) throw new Error(`buildBackgroundPrompt: unexpected key(s) [${extra.join(", ")}] - background prompts are data-free by construction`);

  const layout = params.layout && BACKGROUND_MOODS[params.layout] ? params.layout : "editorial";
  const mood = BACKGROUND_MOODS[layout];
  const density = ["low", "medium"].includes(params.densityHint) ? params.densityHint : "low";
  const paletteWords = new Set(["warm", "cool", "neutral", "green", "blue", "red", "yellow", "purple"]);
  const cardPalette = paletteWords.has(String(params.cardPaletteHint || "").toLowerCase()) ? String(params.cardPaletteHint).toLowerCase() : null;
  const category = /^[a-z_]{1,40}$/i.test(String(params.storyCategory || "")) ? String(params.storyCategory).toUpperCase() : null;

  const zones = SAFE_ZONE_BY_LAYOUT[layout] ?? SAFE_ZONE_BY_LAYOUT.editorial;
  const zoneClause =
    "RESERVED ZONES - keep these rectangles calm, low-detail, near-uniform (a real card image and bright text/data are composited over them later): " +
    Object.entries(zones).map(([n, r]) => `${n} [x${r[0]} y${r[1]} w${r[2]} h${r[3]}]`).join("; ") +
    ". Put visual interest OUTSIDE these rectangles. Leave every reserved rectangle EMPTY - no object, no shape, no rectangle, no card.";

  const prompt = [
    "Original branded BACKGROUND graphic for a premium Pokemon-card market-intelligence brand (PokemonDealFinder). Portrait 4:5 (1080x1350). It will have bright text, data graphics, and one real card image laid over it later - this layer is DECORATIVE ONLY.",
    `MOOD - ${layout}: ${mood}. Density: ${density} (spare, lots of calm ground).`,
    category ? `Editorial context (mood only): a ${category.replace(/_/g, " ").toLowerCase()} story.` : "",
    cardPalette ? `The hero card that will be composited in later reads as ${cardPalette}-toned; let one faint accent harmonise with that, still within the brand palette.` : "",
    PALETTE_HINT,
    COMPOSITION_HINT,
    zoneClause,
    "NO TEXT of any kind rendered in the image - all words and numbers are added later by a separate layout system.",
    NO_CARD_DRAWING,
    SHARED_NEGATIVE,
  ].filter(Boolean).join("\n\n");

  assertDataFree(prompt);

  return {
    layout,
    mood: layout,
    density,
    card_palette_hint: cardPalette,
    story_category: category,
    size: OPENAI_IMAGE_REQUEST_SIZE,
    model: OPENAI_IMAGE_MODEL,
    safe_zones: zones,
    prompt,
  };
}

// ---- generation ----------------------------------------------------
export function backgroundAvailable(env = process.env) {
  return Boolean(env.SOCIAL_IMAGE_GEN_API_KEY || env.OPENAI_API_KEY);
}

/**
 * generateBackground({ spec, budget, env, fetchImpl })
 *   -> { ok:true, b64, mime, sha256, prompt_sha, model, availability }
 *   -> { ok:false, availability } (no key / budget / http)  -- pipeline
 *      then runs DETERMINISTIC_ONLY, never a silent lesser thing.
 */
export async function generateBackground({ spec, budget = null, env = process.env, fetchImpl = fetch } = {}) {
  const key = env.SOCIAL_IMAGE_GEN_API_KEY || env.OPENAI_API_KEY;
  const model = process.env.OPENAI_IMAGE_MODEL || spec?.model || OPENAI_IMAGE_MODEL;
  if (!key) return { ok: false, availability: "no_key" };
  if (budget && !canSpend(budget, "background_generation")) return { ok: false, availability: "budget_exhausted" };
  assertDataFree(spec.prompt); // belt & braces, right before the wire

  const t0 = Date.now();
  try {
    const res = await fetchImpl(IMAGES_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, prompt: spec.prompt, size: spec.size || OPENAI_IMAGE_REQUEST_SIZE, n: 1 }),
      signal: AbortSignal.timeout(120000),
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
    if (budget) recordCall(budget, "background_generation", { ok: true, latencyMs: Date.now() - t0 });
    return {
      ok: true,
      b64,
      mime: "image/png",
      sha256: createHash("sha256").update(Buffer.from(b64, "base64")).digest("hex"),
      prompt_sha: createHash("sha256").update(spec.prompt).digest("hex").slice(0, 16),
      model,
      availability: "openai",
    };
  } catch (e) {
    if (budget) recordCall(budget, "background_generation", { ok: false, latencyMs: Date.now() - t0, detail: String(e?.message ?? e).slice(0, 120) });
    return { ok: false, availability: `error:${String(e?.message ?? e).slice(0, 80)}` };
  }
}

// ---- §8 IMAGE SAFETY SCAN ---------------------------------------
export const SAFETY_FLAGS = Object.freeze([
  "fake_card_like_imagery",
  "readable_generated_text",
  "random_numbers",
  "fake_logos",
  "counterfeit_style_product",
  "watermark",
  "obvious_artifacts",
]);

// Returns { ok:true } | { ok:false, ...failure("AI_BACKGROUND_REJECT"), flags }.
// With no key the scan CANNOT clear the image - the pipeline then declines
// the background (DETERMINISTIC_ONLY), it is never used unscanned.
export async function scanBackground({ b64, budget = null, env = process.env, fetchImpl = fetch } = {}) {
  const key = env.SOCIAL_VISUAL_REVIEW_API_KEY || env.OPENAI_API_KEY;
  if (!key) return { ok: false, availability: "no_key", ...failure("AI_BACKGROUND_REJECT", "no key to run the §8 image safety scan - background not used") };
  if (!b64) return { ok: false, ...failure("AI_BACKGROUND_REJECT", "no image bytes to scan") };

  const dataUrl = `data:image/png;base64,${b64}`;
  const t0 = Date.now();
  try {
    const res = await fetchImpl(VISION_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: VISION_MODEL,
        temperature: 0,
        max_tokens: 300,
        response_format: { type: "json_object" },
        messages: [{
          role: "user",
          content: [
            { type: "text", text:
              `This is a DECORATIVE background layer for a Pokemon-card media post. It must contain NONE of the following. ` +
              `For EACH, answer true if it is present at all:\n` +
              SAFETY_FLAGS.map((f) => `- ${f}`).join("\n") +
              `\n\nAlso "readable_generated_text" is true if ANY letters, words, or numbers are legible anywhere. ` +
              `"fake_card_like_imagery" is true if anything resembles a trading card, a card face, a slab, or a Pokemon creature.\n` +
              `Respond with ONLY one JSON object: {"flags":{${SAFETY_FLAGS.map((f) => `"${f}":<bool>`).join(",")}},"notes":["short"]}` },
            { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
          ],
        }],
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (budget) recordCall(budget, "visual_review_call", { ok: res.ok, latencyMs: Date.now() - t0, detail: "bg_safety_scan" });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      return { ok: false, availability: `http_${res.status}`, detail: errBody.slice(0, 200), ...failure("AI_BACKGROUND_REJECT", `safety scan http ${res.status} - background not used`) };
    }
    const body = await res.json();
    const text = body?.choices?.[0]?.message?.content ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : {};
    const flags = parsed.flags ?? {};
    const tripped = SAFETY_FLAGS.filter((f) => flags[f] === true || flags[f] === "true");
    if (tripped.length) {
      return { ok: false, availability: "openai", flags: tripped, notes: parsed.notes ?? [], ...failure("AI_BACKGROUND_REJECT", `image safety scan flagged: ${tripped.join(", ")}`) };
    }
    return { ok: true, availability: "openai", flags: [], notes: parsed.notes ?? [] };
  } catch (e) {
    if (budget) recordCall(budget, "visual_review_call", { ok: false, latencyMs: Date.now() - t0, detail: "bg_safety_scan_error" });
    return { ok: false, availability: `error`, ...failure("AI_BACKGROUND_REJECT", `safety scan error: ${String(e?.message ?? e).slice(0, 100)} - background not used`) };
  }
}

export const AI_BACKGROUND_VERSION = "4b.1";
