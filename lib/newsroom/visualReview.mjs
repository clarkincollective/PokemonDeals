// Phase SOCIAL-NEWSROOM-2 - RENDERED-CREATIVE VISUAL REVIEW (§17-§21).
//
// Deliberately lives in lib/newsroom/ (NOT lib/social/) - the social
// preview system tests forbid a GenAI call inside lib/social, and this is
// the same architectural choice scripts/socialAssets.mjs makes for the
// OpenAI image-generation call. Only scripts/ tooling imports this.
//
// It calls the OpenAI Chat Completions API with the ACTUAL final rendered
// PNG (a vision model) and returns the §18 rubric + PASS/WATCH/FAIL.
//
// SAFETY (§19):
//   * the ONLY image sent is a local rendered artifact we produced -
//     never an eBay seller photo, customer data, subscriber data, a
//     token, or a key. The caller passes a file path or a data: URL of
//     OUR render; a http(s) URL is refused.
//   * review context is minimal + non-sensitive (platform, family,
//     series, intended hook text).
//
// FALLBACK (§20): no key / network error / unparseable -> verdict "WATCH".
// A WATCH can never auto-queue to Buffer (qaStack / bufferBacklog).
//
// CACHE (§21): keyed by sha256 of the image bytes. Same artifact is not
// re-reviewed; a changed artifact forces a new review.

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.SOCIAL_VISUAL_REVIEW_MODEL || "gpt-4o";
const CACHE_PATH = path.join(process.cwd(), ".social-preview", "editorial-newsroom", "visual-review-cache.json");

export const RUBRIC_KEYS = Object.freeze([
  // SOCIAL-CREATIVE-3 hobby-native dimensions (SS2)
  "COLLECTIBLE_VISUAL_APPEAL",
  "CARD_ART_USAGE",
  "DATA_VISUAL_IMPACT",
  "SCROLL_STOP_STRENGTH",
  "HOBBY_NATIVE_FEEL",
  "THUMBNAIL_STORY_CLARITY",
  "VISUAL_SPECIFICITY",
  "EMOTIONAL_COLLECTOR_RELEVANCE",
  // retained craft dimensions
  "FACT_HIERARCHY",
  "TYPOGRAPHY",
  "SAFE_ZONE_INTEGRITY",
  "CTA_CLARITY",
  "BRAND_CONSISTENCY",
  "PREMIUM_FEEL",
  "AI_SPAM_RISK",
]);

export function reviewAvailable(env = process.env) {
  return Boolean(env.SOCIAL_VISUAL_REVIEW_API_KEY || env.OPENAI_API_KEY);
}

function loadCache() {
  try {
    return existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, "utf8")) : {};
  } catch {
    return {};
  }
}
function saveCache(c) {
  try {
    mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify(c, null, 2) + "\n", "utf8");
  } catch {
    /* cache is best-effort */
  }
}

// Resolve `image` (path | data: URL) -> { dataUrl, sha, mime } for OUR
// render only. Returns null for anything that isn't a local artifact.
function resolveArtifact(image) {
  if (typeof image !== "string") return null;
  if (/^data:image\//.test(image)) {
    const mime = image.slice(5, image.indexOf(";"));
    const b64 = image.split(",")[1] ?? "";
    const sha = createHash("sha256").update(Buffer.from(b64, "base64")).digest("hex");
    return { dataUrl: image, sha, mime };
  }
  if (/^https?:\/\//.test(image)) return null; // refuse remote URLs
  if (!existsSync(image)) return null;
  const bytes = readFileSync(image);
  const ext = path.extname(image).toLowerCase();
  const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
  const sha = createHash("sha256").update(bytes).digest("hex");
  return { dataUrl: `data:${mime};base64,${bytes.toString("base64")}`, sha, mime };
}

function prompt({ platform, family, series, hookText, editorial = false, ctaIntensity = null, cardForward = false }) {
  const ctaNote =
    ctaIntensity === "NONE"
      ? `\nCTA intensity is NONE by design - a subtle wordmark only is CORRECT: score CTA_CLARITY 100, do not flag a missing CTA.\n`
      : ctaIntensity === "BRAND_ONLY"
        ? `\nCTA intensity is BRAND_ONLY by design - a plain domain mention, no hard pitch. That restraint is CORRECT.\n`
        : "";
  const cardNote = cardForward
    ? `\nThis creative SHOULD feature real Pokemon card artwork prominently (it is a card-specific story). Judge CARD_ART_USAGE on whether a real card is large and identifiable - a tiny or missing card is a serious problem here.\n`
    : `\nThis is a data/market/explainer creative that may not centre one card - judge CARD_ART_USAGE on whether the hobby subject (cards, sets, prices) is visually present at all, not on a single hero card.\n`;
  return (
    `You are the creative director of a PREMIUM Pokemon-card / collectibles media brand, reviewing a FINISHED social post.\n` +
    `Platform: ${platform ?? "?"}. Format/family: ${family ?? "?"}. Series: ${series ?? "?"}.` +
    (hookText ? ` Intended hook: "${hookText}".` : "") +
    cardNote +
    ctaNote +
    `\nThe bar is NOT "clean, readable, technically professional". The bar is: would a Pokemon card COLLECTOR stop scrolling, understand the point in ~2 seconds, and think "this is real hobby media" - not "generic AI-generated finance/SaaS content"?\n` +
    `\nAnswer honestly:\n` +
    `- Does it look like a real Pokemon-card media post, or like AI-generated social filler / a finance dashboard / a stock ad?\n` +
    `- Is the card/data STORY visually obvious at THUMBNAIL size (what card? what happened? why care?)?\n` +
    `- Is it data-specific and card-specific, or vague and templated?\n` +
    `- Is there too much empty dark space / polished-but-empty composition?\n` +
    `- Would it sit comfortably beside a strong collectible-market account?\n` +
    `\nA technically-clean but visually WEAK, empty, or generic post must be WATCH or FAIL - NOT PASS.\n` +
    `\nScore EACH 0-100 (higher = better; for AI_SPAM_RISK higher = MORE generic/AI-filler/finance-y):\n` +
    RUBRIC_KEYS.join(", ") +
    `\n\nThen decide overall:\n` +
    `  PASS  - genuinely hobby-native, scroll-stopping, data/card-specific, strong at thumbnail size, publishable as-is beside top hobby accounts.\n` +
    `  WATCH - readable and on-brand but visually underpowered, too generic, too empty, or the story is not obvious fast enough.\n` +
    `  FAIL  - broken, unreadable, off-brand, or clearly AI-generated generic filler.\n\n` +
    `Respond with ONLY one JSON object:\n` +
    `{"scores":{"COLLECTIBLE_VISUAL_APPEAL":<n>,...every key...},"verdict":"PASS|WATCH|FAIL","blockers":["..."],"notes":["specific critique, not generic praise"]}`
  );
}

const fail = (verdict, notes) => ({ available: false, verdict, scores: null, blockers: [], notes: [notes], model: null, cached: false });

// review(image, context, opts)
//   image   - local file path or data: URL of OUR rendered artifact
//   context - { platform, family, series, hookText }
//   opts    - { fetchImpl, env, noCache }
export async function reviewRenderedCreative(image, context = {}, { fetchImpl = fetch, env = process.env, noCache = false } = {}) {
  const art = resolveArtifact(image);
  if (!art) return fail("WATCH", "no local rendered artifact supplied (a remote URL is refused) - defaulting to WATCH");

  const key = env.SOCIAL_VISUAL_REVIEW_API_KEY || env.OPENAI_API_KEY;
  if (!key) return { ...fail("WATCH", "no OpenAI key configured - visual review unavailable, defaulting to WATCH"), artifact_sha: art.sha };

  const cache = noCache ? {} : loadCache();
  if (cache[art.sha]) {
    return { ...cache[art.sha], cached: true, artifact_sha: art.sha };
  }

  try {
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        temperature: 0, // deterministic verdict at the PASS/WATCH margin
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt(context) },
              { type: "image_url", image_url: { url: art.dataUrl, detail: "low" } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ...fail("WATCH", `visual review http ${res.status} - WATCH`), http: res.status, detail: body.slice(0, 200), artifact_sha: art.sha, system_failure: res.status >= 500 };
    }
    const body = await res.json();
    const text = body?.choices?.[0]?.message?.content ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { ...fail("WATCH", "unparseable visual review response - WATCH"), artifact_sha: art.sha };
    const parsed = JSON.parse(m[0]);
    const verdict = ["PASS", "WATCH", "FAIL"].includes(String(parsed.verdict).toUpperCase()) ? String(parsed.verdict).toUpperCase() : "WATCH";
    const out = {
      available: true,
      verdict,
      scores: parsed.scores ?? null,
      blockers: Array.isArray(parsed.blockers) ? parsed.blockers.slice(0, 8) : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes.slice(0, 8) : [],
      model: MODEL,
      cached: false,
      artifact_sha: art.sha,
    };
    if (!noCache) {
      cache[art.sha] = { available: out.available, verdict: out.verdict, scores: out.scores, blockers: out.blockers, notes: out.notes, model: out.model, reviewed_at: new Date().toISOString() };
      saveCache(cache);
    }
    return out;
  } catch (e) {
    return { ...fail("WATCH", `visual review error: ${String(e.message).slice(0, 120)} - WATCH`), artifact_sha: art.sha, system_failure: true };
  }
}

// SOCIAL-CREATIVE-3 SS20 - multi-sample review, WORST-CASE aggregate.
// Because a single Layer-5 call can flip PASS/WATCH, run it `samples`
// times (default 3, always noCache) and take the strictest verdict: any
// FAIL -> FAIL, any WATCH -> WATCH, all PASS -> PASS. Scores are averaged.
// This is the sanctioned "option A" (no second provider).
export async function reviewRenderedCreativeMulti(image, context = {}, { samples = 3, env = process.env, fetchImpl = fetch } = {}) {
  const runs = [];
  for (let i = 0; i < Math.max(1, samples); i++) {
    // eslint-disable-next-line no-await-in-loop
    runs.push(await reviewRenderedCreative(image, context, { env, fetchImpl, noCache: true }));
  }
  const verdicts = runs.map((r) => r.verdict);
  const worst = verdicts.includes("FAIL") ? "FAIL" : verdicts.includes("WATCH") ? "WATCH" : "PASS";
  const available = runs.some((r) => r.available);
  // average scores across runs that returned any
  const scoreRuns = runs.map((r) => r.scores).filter(Boolean);
  let scores = null;
  if (scoreRuns.length) {
    scores = {};
    for (const k of RUBRIC_KEYS) {
      const vals = scoreRuns.map((s) => Number(s[k])).filter((n) => Number.isFinite(n));
      if (vals.length) scores[k] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
  }
  return {
    available,
    verdict: worst,
    consistent: new Set(verdicts).size === 1,
    verdicts,
    scores,
    blockers: [...new Set(runs.flatMap((r) => r.blockers ?? []))].slice(0, 8),
    notes: [...new Set(runs.flatMap((r) => r.notes ?? []))].slice(0, 8),
    model: runs.find((r) => r.model)?.model ?? null,
    artifact_sha: runs[0]?.artifact_sha ?? null,
    samples: runs.length,
  };
}

export { CACHE_PATH as VISUAL_REVIEW_CACHE_PATH, resolveArtifact as _resolveArtifact };
