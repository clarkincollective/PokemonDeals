// Phase SOCIAL-CREATIVE-5B - FACT-LOCKED PLATFORM CAPTION DIRECTOR
// (§2-§11, §18-§25, §28).
//
//   verified story (image already BUFFER_READY + owner-reviewable)
//   -> buildCaptionBrief()      deterministic source of truth
//   -> buildCaptionPrompt()     the WRITER prompt (invent wording, not data)
//   -> generateCaptionBundle()  ONE chat call -> { instagram, x } parts
//   -> auditCaption() per platform (captionAudit.mjs - deterministic)
//   -> candidate 1 PASS  ->  use it
//      candidate 1 WATCH/FAIL  ->  ONE more call (candidate 2)
//      candidate 2 fails  ->  CAPTION_GENERATION_HOLD  (NEVER a raw name)
//   -> assembleCaptionText() + reuse the existing affiliate disclosure
//   -> caption_handoff (§28) for Buffer / video / Reddit later
//
// GOOD CAPTION = HOOK + USEFUL CONTEXT + REAL FACT + WHY IT MATTERS +
// WEBSITE-FIRST CTA. Not template filler, hype, raw series names, fake
// urgency, investment language, or unsupported claims.
//
// Lives in lib/newsroom/ (GenAI boundary). No Buffer, no cron, no RIGHTS,
// no eBay Browse, no email. Nothing is published.

import { createHash } from "node:crypto";
import { failure } from "../editorial/failureStates.mjs";
import { contractFor } from "../editorial/storyContracts.mjs";
import { canSpend, recordCall } from "../hybrid/budget.mjs";
import { webFirstCta, SITE, WEB_CTAS } from "../hybrid/cta.mjs";
import { auditCaption, CAPTION_AUDIT_VERSION } from "./captionAudit.mjs";
// reuse the EXISTING, compliance-approved disclosure strings (§19) -
// never invent policy.
import { DISCLOSURE_LINE } from "../../social/caption.mjs";

export const CAPTION_DIRECTOR_VERSION = "5b.1";

const CHAT_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const CAPTION_MODEL = process.env.SOCIAL_CAPTION_MODEL || process.env.SOCIAL_VISUAL_REVIEW_MODEL || "gpt-4o";
const X_DISCLOSURE = "Ad · eBay Partner Network affiliate"; // matches lib/social/distribution/platformCopy.mjs

const money = (n) => (n == null || !Number.isFinite(Number(n)) ? null : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: Number(n) < 100 && !Number.isInteger(Number(n)) ? 2 : 0, maximumFractionDigits: Number(n) < 100 ? 2 : 0 })}`);

// ---- §6-§10 FAMILY CAPTION INTENT -----------------------------
const FAMILY_INTENT = Object.freeze({
  deal_hero: {
    goal: "make a real under-market listing interesting without sounding like spam",
    must_include: ["the exact card", "the exact listed price", "the valid market reference", "the real gap / saving (only if fact-locked)", "why this particular listing is interesting"],
    avoid: ['"HURRY" / "DON\'T MISS OUT" / "STEAL" / "INSANE DEAL"', "any urgency the data does not support", '"buy now"', "guaranteed-value language"],
    cta_pool: [WEB_CTAS.live_deal, WEB_CTAS.more_deals, `Browse it on ${SITE}`],
  },
  asking_vs_sold: {
    goal: "teach that asking price is not the same as market value - in whichever direction the numbers actually go",
    must_include: ["the asking price", "the market reference", "the real direction of the gap", "a reusable collector lesson that matches that direction"],
    avoid: ["forcing one generic lesson regardless of direction", "calling a below-market ask a premium (or vice-versa)", "an unsupported buying recommendation"],
    cta_pool: [SITE, `Explore the market on ${SITE}`],
  },
  market_shape: {
    goal: "make one real market statistic understandable and shareable",
    must_include: ["the exact scoped stat", "the sample / population it is drawn from", "a plain-language explanation", "why it matters to a collector", "the example card ONLY if clearly labelled as an example"],
    avoid: ["attributing a population stat to the example card / species", "inventing extra distribution buckets", "a source or timeframe that was not supplied"],
    cta_pool: [SITE, `Explore the market on ${SITE}`],
  },
  printing_compare: {
    goal: "teach that the exact printing changes the value - with a lesson a collector can reuse",
    must_include: ["the exact related printings", "the real distinguishing axis", "the real value difference (only if supported)", "a practical collector takeaway"],
    avoid: ['"same card" unless the contract supports that phrasing', "any visual difference that is not proven", "an invented variant name"],
    cta_pool: [SITE, `Explore printings on ${SITE}`],
  },
  three_up: {
    goal: "a save- and share-friendly budget collector shortlist",
    must_include: ["the three real cards", "the three real prices", "why these are interesting to a collector"],
    avoid: ['a "top 3" ranking claim unless a ranking is actually supported', "fake urgency", "repeating a card / species"],
    cta_pool: [WEB_CTAS.more_deals, `Browse more under-$25 finds on ${SITE}`],
  },
});
const intentFor = (family) => FAMILY_INTENT[family] ?? FAMILY_INTENT.market_shape;

// ---- deterministic source of truth for the writer -----------
export function buildCaptionBrief({ story = {}, semanticManifest = {}, factTrace = [], cardCatalogRow = null, family = "market_shape", platform = "instagram" } = {}) {
  const S = semanticManifest || {};
  const contract = contractFor(story.series ?? story.family ?? family);
  const classification = contract?.classification ?? S.classification ?? "EDITORIAL";
  const cta = webFirstCta({ classification, layout: family });
  const intent = intentFor(family);

  // the exact facts the caption MAY state (nothing else)
  const facts = {};
  if (S.comparison_left) facts[S.comparison_left.label ?? "left"] = money(S.comparison_left.value);
  if (S.comparison_right) facts[S.comparison_right.label ?? "right"] = money(S.comparison_right.value);
  if (S.comparison_direction && S.comparison_direction !== "UNKNOWN") {
    facts.comparison = `${S.comparison_pct}% ${S.comparison_direction === "BELOW_MARKET" ? "below" : S.comparison_direction === "ABOVE_MARKET" ? "above" : "at"} market`;
  }
  if (S.claim_value != null) facts.headline_stat = `${S.claim_value}% ${S.claim_metric ?? "of tracked singles"}`;
  if (S.claim_population) facts.population = S.claim_population;
  for (const p of S.visualization_data_manifest?.allowed_points ?? []) facts[`chart:${p.label}`] = `${p.value}%`;
  for (const it of S.item_identities ?? []) facts[it.name] = money(it.price);
  if (S.card_identity?.name) facts.card = S.card_identity.name;
  if (S.card_metadata_lock?._displayable?.length) {
    facts.card_metadata = S.card_metadata_lock._displayable.map((k) => `${k}: ${S.card_metadata_lock[k]}`).join(" · ");
  }

  return Object.freeze({
    family, platform,
    story_id: story.story_id ?? story.subject_id ?? null,
    classification,
    story_premise: S.story_premise ?? null,
    required_takeaway: S.appropriate_lesson ?? S.required_takeaway ?? null,
    prohibited_takeaways: [...(S.prohibited_takeaways ?? [])],
    semantic_scope: S.claim_scope ?? (S.comparison_direction ? `comparison:${S.comparison_direction}` : "n/a"),
    comparison_direction: S.comparison_direction ?? null,
    example_card: S.example_card ?? null,
    example_card_is_not_population: Boolean(S.example_card_is_not_population),
    allowed_facts: facts,
    fact_refs: (factTrace ?? []).filter((r) => r?.verdict === "PASS").map((r) => r.visible_claim).slice(0, 24),
    source_refs: (S.source_attribution_manifest?.allowed_statements ?? []),
    allowed_timeframes: (S.timeframe_manifest?.allowed_timeframes ?? []),
    cta_intent: { text: cta.text, url: cta.url, pool: intent.cta_pool },
    goal: intent.goal, must_include: intent.must_include, avoid: intent.avoid,
    disclosure_required: classification === "COMMERCIAL",
    fact_lock_hash: S.fact_lock_hash ?? null,
  });
}

// ---- §4 / §5 / §11 / §21 THE WRITER PROMPT ------------------
export function buildCaptionPrompt({ brief }) {
  const b = brief;
  const factLines = Object.entries(b.allowed_facts).map(([k, v]) => `  - ${k}: ${v}`).join("\n");
  const ig = "roughly 300-900 characters; hook in the first 1-2 lines; readable line breaks; a short factual explanation; a why-this-matters angle; a site-first CTA; 5-8 selective hashtags";
  const x = "roughly 120-260 characters where possible; one strong hook; one core fact; one takeaway; a site-first CTA if useful; 0-2 hashtags (often none is better). Do NOT just truncate the Instagram caption.";
  return [
    `You are the caption writer for PokemonDealFinder, a sharp collector-market publication. Voice: collector-focused, useful, data-led, confident, curious, clear. NOT corporate, NOT hypey, NOT bro-marketing, NOT financial advice, NOT robotic.`,
    ``,
    `Write two platform-native captions for ONE verified story (family: ${b.family}).`,
    ``,
    `GOAL: ${b.goal}`,
    `THE STORY PREMISE: ${b.story_premise ?? "(n/a)"}`,
    `THE LESSON TO CONVEY (paraphrase, do not quote): ${b.required_takeaway ?? "(n/a)"}`,
    b.comparison_direction && b.comparison_direction !== "UNKNOWN" ? `THE COMPARISON DIRECTION IS FIXED: ${b.comparison_direction.replace("_", " ").toLowerCase()}. Any "premium"/"discount"/"above"/"below" wording and the lesson MUST match this.` : ``,
    // SOCIAL-CAPTION-5B.1 §6 - guarded: this clause must NEVER interpolate
    // a falsy b.example_card as the literal string "null"/"undefined". If
    // the example card name is missing, say so explicitly and instruct the
    // model to stay generic rather than invent or echo a placeholder.
    b.example_card_is_not_population && b.example_card
      ? `SCOPE: the headline stat is for the WHOLE tracked-single population (${b.allowed_facts.population ?? "all tracked singles"}), NOT for ${b.example_card}. ${b.example_card} is only ONE example - label it as an example or leave it out. Never write "${b.example_card} singles".`
      : b.example_card_is_not_population
        ? `SCOPE: the headline stat is for the WHOLE tracked-single population. No specific example card name was supplied - do NOT name any specific Pokemon/card as "the example"; either omit the example entirely or refer to it generically ("a tracked single").`
        : ``,
    ``,
    // SOCIAL-CAPTION-5B.1 §7 - an explicit LOCKED FACTS section naming the
    // one legitimate example card, so the model has no ambiguity about
    // which Pokemon/card it may name as "the example" (only rendered when
    // an example card actually exists for this family).
    b.example_card ? `LOCKED EXAMPLE CARD:\nPokemon: ${b.example_card}\nCard: ${b.example_card}${b.allowed_facts.card_metadata ? `\n${b.allowed_facts.card_metadata}` : ""}\n\nRULE: Do not name any OTHER specific Pokemon/card/set as the example. If you mention an example card at all, it MUST be this one, spelled exactly as above.` : ``,
    ``,
    `YOU MAY invent wording, structure, tone and hook style.`,
    `YOU MUST NOT invent: prices, percentages, card metadata, grades, variants, dates, timeframes, source claims, market movement, rarity, urgency, scarcity, investment advice, seller behaviour, buyer behaviour, historical facts, or ANY specific Pokemon/card/set name other than the LOCKED EXAMPLE CARD above (if one is given) - if you are not certain which card/species to name, do not name one.`,
    `NEVER output a literal placeholder, template artifact, or missing-value marker such as "null", "undefined", "NaN", "[object Object]", "N/A", "TBD", "TODO", "unknown value", or an empty/dangling clause where a fact would go. If a detail is not supplied, simply omit that clause - do not write a sentence that references it as missing.`,
    `Use ONLY the facts explicitly supplied here:`,
    factLines || "  (no numeric facts supplied - keep it qualitative)",
    b.source_refs.length ? `Allowed source phrasing: ${b.source_refs.join("; ")}.` : `Do NOT name any data source ("eBay sold listings", "across major marketplaces", "live market data", etc.) - none was supplied.`,
    b.allowed_timeframes.length ? `Allowed timeframe phrasing: ${b.allowed_timeframes.join("; ")}.` : `Do NOT state any timeframe ("today", "this week", "last 30 days", "current market", a date range) - none was supplied.`,
    ``,
    `MUST INCLUDE: ${b.must_include.join("; ")}.`,
    `AVOID: ${b.avoid.join("; ")}.`,
    `NEVER use: "investment", "guaranteed return", "buy before it rises", "undervalued", "easy profit", "this will go up", "load up now"; "hurry", "act fast", "don't miss out", "selling fast", "ending soon", "limited time"; "rare opportunity", "impossible to find", "few left".`,
    `The caption must NEVER be, or resemble, a raw label like "${b.family.replace(/_/g, " ").toUpperCase()}" or "EXACT PRINTING MATTERS".`,
    ``,
    `CTA: website-first only. Use one of: ${b.cta_intent.pool.join(" / ")}. NEVER "View on eBay" or any eBay-first phrasing.`,
    ``,
    `INTERNALLY generate 3 candidate hooks (surprising fact / collector mistake / myth vs reality / practical lesson / value comparison / market observation), then pick the single best for clarity, truth, curiosity, relevance and non-clickbait quality. Only return the chosen one.`,
    ``,
    `INSTAGRAM: ${ig}`,
    `X: ${x}`,
    ``,
    `Respond with ONLY one JSON object:`,
    `{"instagram":{"hook":"...","body":"...","why_it_matters":"...","cta":"...","hashtags":["#..."]},"x":{"hook":"...","body":"...","why_it_matters":"...","cta":"...","hashtags":["#..."]},"hooks_considered":["...","...","..."]}`,
  ].filter((l) => l !== null && l !== undefined).join("\n");
}

// ---- ONE bounded chat call -------------------------------
export async function generateCaptionBundle({ prompt, env = process.env, fetchImpl = fetch, budget = null, temperature = 0.5, extra = null } = {}) {
  const key = env.SOCIAL_CAPTION_API_KEY || env.SOCIAL_VISUAL_REVIEW_API_KEY || env.OPENAI_API_KEY;
  if (!key) return { ok: false, availability: "no_key" };
  if (budget && !canSpend(budget, "creative_director_call")) return { ok: false, availability: "budget_exhausted" };
  const t0 = Date.now();
  try {
    const res = await fetchImpl(CHAT_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: CAPTION_MODEL, temperature, max_tokens: 900, response_format: { type: "json_object" },
        messages: [{ role: "user", content: extra ? `${prompt}\n\n${extra}` : prompt }],
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (budget) recordCall(budget, "creative_director_call", { ok: res.ok, latencyMs: Date.now() - t0, detail: "caption_bundle" });
    if (!res.ok) return { ok: false, availability: `http_${res.status}` };
    const body = await res.json();
    const m = (body?.choices?.[0]?.message?.content ?? "").match(/\{[\s\S]*\}/);
    if (!m) return { ok: false, availability: "unparseable" };
    const parsed = JSON.parse(m[0]);
    return { ok: true, bundle: parsed, model: CAPTION_MODEL };
  } catch (e) {
    if (budget) recordCall(budget, "creative_director_call", { ok: false, latencyMs: Date.now() - t0, detail: "caption_bundle_error" });
    return { ok: false, availability: `error:${String(e?.message ?? e).slice(0, 80)}` };
  }
}

// ---- deterministic assembly -----------------------------
const clean = (s) => String(s ?? "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();

export function disclosureFor({ classification = "EDITORIAL", platform = "instagram" } = {}) {
  if (classification !== "COMMERCIAL") return null; // educational posts point at the domain, not an affiliate link
  return platform === "x" ? X_DISCLOSURE : DISCLOSURE_LINE;
}

export function assembleCaptionText({ parts = {}, platform = "instagram", disclosure = null } = {}) {
  const hook = clean(parts.hook);
  const body = clean(parts.body);
  const why = clean(parts.why_it_matters);
  const cta = clean(parts.cta);
  const tags = (parts.hashtags ?? []).map((h) => String(h).trim()).filter(Boolean);
  const blocks = platform === "x"
    ? [ [hook, body].filter(Boolean).join(" "), why, cta ]
    : [ hook, body, why, cta, tags.join(" ") ];
  let text = blocks.filter(Boolean).join(platform === "x" ? "\n\n" : "\n\n");
  if (disclosure) text += `\n\n${disclosure}`;
  return clean(text);
}

// ---- §28 semantic hash + caption handoff ----------------
export function semanticHash(semanticManifest = {}) {
  const S = semanticManifest || {};
  const key = {
    v: CAPTION_DIRECTOR_VERSION,
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

export function buildCaptionHandoff({ platformResult, storyId, imageArtifactId = null, semanticManifest = {} }) {
  const p = platformResult;
  if (!p || p.status !== "READY") return null;
  return Object.freeze({
    story_id: storyId ?? null,
    image_artifact_id: imageArtifactId,
    platform: p.platform,
    caption_text: p.caption_text,
    hook: p.hook,
    cta: p.cta,
    hashtags: p.hashtags,
    disclosure: p.disclosure,
    fact_refs: p.fact_refs,
    semantic_hash: semanticHash(semanticManifest),
    verification: p.verification,
    quality_score: p.quality_score,
  });
}

// ---- one platform: pick parts, assemble, audit ----------
function evaluatePlatform({ platform, bundle, brief, semanticManifest, factTrace, cardCatalogRow, storyFlags }) {
  const raw = bundle?.[platform] ?? {};
  const parts = {
    hook: raw.hook ?? "",
    body: raw.body ?? "",
    why_it_matters: raw.why_it_matters ?? "",
    cta: raw.cta ?? brief.cta_intent.text,
    hashtags: Array.isArray(raw.hashtags) ? raw.hashtags.slice(0, platform === "x" ? 2 : 8) : [],
  };
  const disclosure = disclosureFor({ classification: brief.classification, platform });
  const captionText = assembleCaptionText({ parts, platform, disclosure });
  const audit = auditCaption({
    parts, captionText, family: brief.family, platform,
    semanticManifest, factTrace,
    cardMetadataLock: semanticManifest.card_metadata_lock ?? null,
    storyFlags,
  });
  return {
    family: brief.family, platform,
    hook: parts.hook, body: parts.body, why_it_matters: parts.why_it_matters,
    cta: parts.cta, hashtags: parts.hashtags, disclosure,
    caption_text: audit.ok ? captionText : null,
    fact_refs: brief.fact_refs, source_refs: brief.source_refs,
    required_takeaway: brief.required_takeaway, prohibited_takeaways: brief.prohibited_takeaways,
    semantic_scope: brief.semantic_scope,
    quality_score: audit.quality.score,
    verification: { ...audit.verification },
    status: audit.ok ? "READY" : audit.state,
    _reason: audit.ok ? null : audit.reason,
    _findings: audit.findings ?? [],
  };
}

/**
 * runCaptionDirector({
 *   story, semanticManifest, factTrace, cardCatalogRow, family, platforms,
 *   imageArtifactId, storyFlags, budget, env, fetchImpl
 * })
 *
 * Returns:
 *   { ok, instagram, x, shared, caption_handoff:[...], budget }
 * where instagram / x are the §2 primary objects. `ok` is true when at
 * least one platform reached READY.
 */
export async function runCaptionDirector(opts = {}) {
  const {
    story = {}, semanticManifest = {}, factTrace = [], cardCatalogRow = null,
    family = semanticManifest.layout ?? "market_shape",
    platforms = ["instagram", "x"], imageArtifactId = null, storyFlags = {},
    budget = null, env = process.env, fetchImpl = fetch,
  } = opts;

  const brief = buildCaptionBrief({ story, semanticManifest, factTrace, cardCatalogRow, family, platform: "instagram" });
  const prompt = buildCaptionPrompt({ brief });

  const holdAll = (state, reason) => {
    const per = {};
    for (const pf of platforms) {
      per[pf] = {
        family, platform: pf, hook: null, body: null, why_it_matters: null, cta: null,
        hashtags: [], disclosure: null, caption_text: null,
        fact_refs: brief.fact_refs, source_refs: brief.source_refs,
        required_takeaway: brief.required_takeaway, prohibited_takeaways: brief.prohibited_takeaways,
        semantic_scope: brief.semantic_scope, quality_score: 0,
        verification: {}, status: state, _reason: reason,
      };
    }
    return per;
  };

  // ---- candidate 1 ----
  let gen = await generateCaptionBundle({ prompt, env, fetchImpl, budget });
  if (!gen.ok) {
    const per = holdAll("CAPTION_GENERATION_HOLD", `caption generation unavailable (${gen.availability})`);
    return {
      ok: false,
      ...failure("CAPTION_GENERATION_HOLD", `no caption bundle (${gen.availability}) - NOT falling back to a raw name`, { stage: "caption_director" }),
      instagram: per.instagram ?? null, x: per.x ?? null,
      shared: sharedBlock(brief, prompt, null), caption_handoff: [], budget,
    };
  }

  let evals = {};
  for (const pf of platforms) evals[pf] = evaluatePlatform({ platform: pf, bundle: gen.bundle, brief, semanticManifest, factTrace, cardCatalogRow, storyFlags });
  let model = gen.model;
  let regenerated = false;

  // ---- one bounded candidate 2 for any non-READY platform ----
  const needsRetry = platforms.filter((pf) => evals[pf].status !== "READY");
  if (needsRetry.length && canSpend(budget ?? { limits: {}, used: {} }, "creative_director_call")) {
    regenerated = true;
    const gripe = needsRetry
      .map((pf) => `The previous ${pf} draft failed: ${evals[pf]._reason}. Fix ONLY that - keep every stated fact identical to the supplied source of truth.`)
      .join(" ");
    const gen2 = await generateCaptionBundle({ prompt, env, fetchImpl, budget, temperature: 0.4, extra: gripe });
    if (gen2.ok) {
      model = gen2.model;
      for (const pf of needsRetry) {
        const e2 = evaluatePlatform({ platform: pf, bundle: gen2.bundle, brief, semanticManifest, factTrace, cardCatalogRow, storyFlags });
        // keep candidate 2 only if it is at least as good
        if (e2.status === "READY" || (evals[pf].status !== "READY" && e2.quality_score > evals[pf].quality_score)) evals[pf] = { ...e2, verification: { ...e2.verification, candidate: 2 } };
      }
    }
  }
  for (const pf of platforms) evals[pf].verification.candidate = evals[pf].verification.candidate ?? 1;
  for (const pf of platforms) evals[pf].verification.regenerated = regenerated;

  const anyReady = platforms.some((pf) => evals[pf].status === "READY");
  const handoff = platforms
    .map((pf) => buildCaptionHandoff({ platformResult: evals[pf], storyId: brief.story_id, imageArtifactId, semanticManifest }))
    .filter(Boolean);

  const base = anyReady
    ? { ok: true, state: "CAPTIONS_READY", at: new Date().toISOString() }
    : failure("CAPTION_WITHHELD", `no platform caption cleared the audit (${platforms.map((pf) => `${pf}:${evals[pf].status}`).join(", ")})`, { stage: "caption_director" });
  return {
    ...base,
    instagram: evals.instagram ?? null,
    x: evals.x ?? null,
    shared: sharedBlock(brief, prompt, model),
    caption_handoff: handoff,
    budget,
  };
}

function sharedBlock(brief, prompt, model) {
  return {
    family: brief.family,
    classification: brief.classification,
    required_takeaway: brief.required_takeaway,
    prohibited_takeaways: brief.prohibited_takeaways,
    semantic_scope: brief.semantic_scope,
    fact_refs: brief.fact_refs,
    source_refs: brief.source_refs,
    cta_intent: brief.cta_intent,
    disclosure_required: brief.disclosure_required,
    fact_lock_hash: brief.fact_lock_hash,
    prompt,
    model: model ?? null,
    caption_director_version: CAPTION_DIRECTOR_VERSION,
    caption_audit_version: CAPTION_AUDIT_VERSION,
    // reusable metadata for later TikTok / YouTube / Reddit adaptation
    reusable: {
      goal: brief.goal,
      must_include: brief.must_include,
      avoid: brief.avoid,
      allowed_facts: brief.allowed_facts,
      allowed_timeframes: brief.allowed_timeframes,
    },
  };
}
