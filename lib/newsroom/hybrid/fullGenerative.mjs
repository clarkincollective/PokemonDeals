// Phase SOCIAL-CREATIVE-5 - FULL_GENERATIVE_SOCIAL (§2-§21).
//
// GENERATE FIRST LIKE A DESIGNER. VERIFY AFTERWARD LIKE AN AUDITOR.
//
// The image model designs the COMPLETE social post - composition,
// typography, card placement, supporting graphics, brand, CTA - from the
// REAL canonical card image(s) supplied as visual input and the REAL
// factual story. Then a structured vision audit checks the finished image
// against a deterministic fact manifest. A small deterministic repair
// layer fixes minor text/price/CTA slips; anything material is rejected.
// No silent fallback to weak creative (§27).
//
// Lives in lib/newsroom/ (GenAI boundary). Model + size from the single
// image-model config.

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { OPENAI_IMAGE_MODEL, OPENAI_IMAGE_MODEL_PREVIOUS, OPENAI_IMAGE_REQUEST_SIZE } from "../../social/imageModelConfig.mjs";
import { failure } from "../editorial/failureStates.mjs";
import { factLockHash } from "../editorial/factLock.mjs";
import { webFirstCta, isEbayFirstCta } from "./cta.mjs";
import { canSpend, recordCall } from "./budget.mjs";

const EDITS_ENDPOINT = "https://api.openai.com/v1/images/edits";
const CHAT_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const VISION_MODEL = process.env.SOCIAL_VISUAL_REVIEW_MODEL || "gpt-4o";

export const FULL_GENERATIVE_VERSION = "5.1";
export const MAX_FULLGEN_CANDIDATES = 2; // §16

// ---- §5 FACT MANIFEST ------------------------------------------
const money = (n) => (n == null ? null : `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: Number(n) < 100 ? 2 : 0 })}`);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

// Build the deterministic expected_fact_manifest - the source of truth the
// finished image is audited against.
export function buildFactManifest({ layout, factLock = {}, resolved = null, contract = null } = {}) {
  const F = factLock || {};
  const R = resolved?.data ?? resolved ?? {};
  const classification = contract?.classification ?? "EDITORIAL";
  const cta = webFirstCta({ classification, layout });

  const requiredText = new Set();
  const requiredNumeric = {};
  const add = (t) => { if (t != null && String(t).trim()) requiredText.add(String(t).trim()); };

  add("PokemonDealFinder");
  add(cta.text);

  if (layout === "deal_hero") {
    const listed = num(F.listed_price ?? R.priceUsd);
    const market = num(F.market_price ?? R.marketUsd);
    const pct = num(F.discount_pct ?? R.discountPct) ?? (listed && market ? Math.round((1 - listed / market) * 100) : null);
    add(F.card_name ?? R.card?.name); add(F.card_set ?? R.card?.set);
    add(money(listed)); add(money(market));
    if (pct != null) { add(`${pct}% below market`); requiredNumeric.discount_pct = pct; }
    requiredNumeric.listed_price = listed; requiredNumeric.market_price = market;
  } else if (layout === "market_shape") {
    const u25 = num(R.under25Pct ?? R.under_25_pct ?? (Array.isArray(F.percentages) ? F.percentages[0] : null));
    const tracked = num(F.tracked_count ?? R.pricedCards ?? R.priced_cards);
    if (u25 != null) { add(`${u25}%`); requiredNumeric.under_25_pct = u25; }
    if (tracked != null) { add(tracked.toLocaleString("en-US")); requiredNumeric.tracked_count = tracked; }
    add("under $25");
    if (R.featured?.card_name) add(R.featured.card_name);
  } else if (layout === "asking_vs_sold") {
    const asking = num(F.listed_price ?? R.askingUsd);
    const market = num(F.market_price ?? R.marketRefUsd);
    add(F.card_name ?? R.card_name);
    add(money(asking)); add(money(market));
    requiredNumeric.asking = asking; requiredNumeric.market = market;
    if (asking && market) { const prem = Math.round((asking / market - 1) * 100); add(`${prem}%`); requiredNumeric.premium_pct = prem; }
  } else if (layout === "printing_compare") {
    add(R.species); add(R.high?.set); add(R.low?.set);
    add(money(R.high?.price_usd)); add(money(R.low?.price_usd));
    if (R.multiple != null) { add(`${R.multiple}x`); requiredNumeric.multiple = num(R.multiple); }
  } else if (layout === "three_up") {
    const items = Array.isArray(R.items) ? R.items : [];
    for (const it of items.slice(0, 3)) { add(it.card_name); add(money(it.price_usd)); }
    add("under $25");
  }

  return Object.freeze({
    layout,
    required_text: [...requiredText],
    required_numeric_facts: requiredNumeric,
    prohibited_claims: [
      "any 'was' / 'RRP' / 'retail' price that is not the real market reference",
      "fake urgency (only X left, ends soon, last chance)",
      "any percentage or price not in required_numeric_facts",
      "any 'View on eBay' / eBay-first call to action",
      "PSA/BGS/CGC grade not present in the source",
    ],
    card_identity: {
      name: F.card_name ?? R.card?.name ?? R.species ?? R.card_name ?? null,
      set: F.card_set ?? R.card?.set ?? null,
      number: F.card_number ?? null,
      tcgplayer_id: F.card_tcgplayer_id ?? R.card?.tcgplayerId ?? null,
    },
    website_first_cta: true,
    cta,
    classification,
    fact_lock_hash: factLockHash(factLock).short,
  });
}

// ---- §9-§14 STORY MASTER PROMPTS -----------------------------
const QUALITY_BAR =
  "ART DIRECTION: premium Pokemon-card COLLECTOR EDITORIAL - a modern trading-card magazine / high-end collectibles publication. " +
  "Rich information design, strong clear visual hierarchy, professional and polished, scroll-stopping, save/share worthy, understandable at a glance, CARD-FIRST, " +
  "useful supporting graphics (a small chart, a comparison mark, a stat strip, a why-this-matters note), strong but restrained PokemonDealFinder branding. " +
  "Dark charcoal / near-black editorial ground, one restrained red accent, crisp white typography, green ONLY for a genuine positive value. " +
  "EXPLICITLY AVOID: gaming HUD, tactical UI, cockpit interface, cyberpunk, sci-fi frames, SaaS dashboard, crypto infographic, PowerPoint layout, generic corporate template, " +
  "giant empty black areas, over-framed UI boxes, fake buttons or controls, neon gamer aesthetic, AI-spam look. " +
  "Render all text crisply and correctly spelled. Portrait 4:5.";

const FAMILY_INTENT = Object.freeze({
  deal_hero: (m) =>
    `STORY: a genuine under-market deal on a real Pokemon card. In 2 seconds the viewer should get: which card, how far below market, and that it is real (not a marked-up 'was' price). ` +
    `KEY FACTS (render them exactly, do not alter): card name "${m.card_identity.name}", set "${m.card_identity.set}", deal price ${money(m.required_numeric_facts.listed_price)}, ` +
    `market reference ${money(m.required_numeric_facts.market_price)}, ${m.required_numeric_facts.discount_pct}% below market. ` +
    `Make the real card the hero. A tasteful savings/gap visual and a short 'why this matters' line help. ` +
    `CTA: "${m.cta.text}" (website-first - NEVER "View on eBay"). Feel: a premium collector feature, not an ad. No BUY NOW, no fake urgency, no sales-sticker look.`,
  market_shape: (m) =>
    `STORY: a premium collector-market editorial insight. In 2 seconds: one dominant market statistic and what it means. ` +
    `KEY FACTS: ${m.required_numeric_facts.under_25_pct}% of ${Number(m.required_numeric_facts.tracked_count).toLocaleString("en-US")} tracked singles sell under $25` +
    `${m.required_text.find((t) => /^[A-Z]/.test(t) && !/PokemonDealFinder|under \$25|%$/.test(t)) ? `; a real example card is "${m.card_identity.name}"` : ""}. ` +
    `Use a real distribution graphic, a tracked/sample context line, one clear takeaway, and a why-this-matters note. ` +
    `Integrate the real example card into the composition (not tacked on). Subtle PokemonDealFinder branding + domain. You may invent the GRAPHIC STYLE but not any number.`,
  asking_vs_sold: (m) =>
    `STORY: asking price is NOT market value. In 2 seconds the viewer should see an 'ask' figure clearly higher than what the card actually sells for. ` +
    `KEY FACTS: a listing asks ${money(m.required_numeric_facts.asking)}, recent market is ${money(m.required_numeric_facts.market)}` +
    `${m.required_numeric_facts.premium_pct != null ? `, ${m.required_numeric_facts.premium_pct}% premium` : ""}. Card: "${m.card_identity.name}". ` +
    `Use a clean comparison graphic (a price ladder, a range bar, a bold connector), the real card, and one simple lesson. Domain-only branding is fine (educational).`,
  printing_compare: (m) =>
    `STORY: two confusingly-similar printings of "${m.card_identity.name}" are worth very different amounts. Show WHY they differ. ` +
    `KEY FACTS: "${m.required_text[2] ?? "printing A"}" ${money(m.required_numeric_facts.high ?? null)} vs "${m.required_text[3] ?? "printing B"}" ${money(m.required_numeric_facts.low ?? null)}` +
    `${m.required_numeric_facts.multiple != null ? `, roughly ${m.required_numeric_facts.multiple}x` : ""}. ` +
    `Use BOTH real card images side by side, a close-up distinction, arrows/callouts, edition/variant labels, and the value difference. A short collector lesson. Domain-only branding.`,
  three_up: (m) =>
    `STORY: a save-worthy collector shortlist - three real cards, all under $25. ` +
    `KEY FACTS (render exactly): ${m.required_text.filter((t) => /\$/.test(t) || (/^[A-Z]/.test(t) && !/PokemonDealFinder|under \$25/.test(t))).join(", ")}. ` +
    `Use all three real card images in an attractive curated grouping, each with its real price, a strong headline, clear PokemonDealFinder branding, and a website-first direction ("${m.cta.text}").`,
});

// §10 - the data-discipline block, on EVERY full-generative prompt.
export const DATA_DISCIPLINE_CLAUSE =
  "YOU ARE THE VISUAL DESIGNER, NOT THE DATA ANALYST. " +
  "You MAY invent composition, typography, shapes, charts, arrows, textures, visual hierarchy and information-design treatment. " +
  "You MUST NOT invent facts. Use ONLY the factual values, labels, card metadata, ranges, dates, sources and statistics explicitly supplied below. " +
  "If a potentially useful fact is not supplied, OMIT it rather than infer it. " +
  "§5: never invent additional statistics, chart values, distribution buckets, categories, percentages, prices, dates, sample sizes, labels, ranges, market metrics, " +
  "a source line ('eBay Sold Listings', 'across major marketplaces'), or a timeframe ('last 60 days', 'this week') merely to make the design richer. " +
  "If there are only two supported data points, design beautifully around two data points - do not fabricate more. " +
  "For the card: show ONLY card metadata that is explicitly listed under CARD METADATA below - do NOT read rarity, edition, set, or collector number off the card art or guess it.";

export function buildMasterPrompt({ layout, factManifest }) {
  const intent = (FAMILY_INTENT[layout] ?? FAMILY_INTENT.market_shape)(factManifest);
  const md = factManifest.card_metadata_lock ?? null;
  const mdLine = md && md._displayable?.length
    ? `CARD METADATA you MAY show (nothing else about the card): ${md._displayable.map((k) => `${k} = "${md[k]}"`).join(", ")}.`
    : "CARD METADATA: none supplied beyond the card name - do NOT print any rarity, edition, set symbol, collector number, or grade.";
  const chartLine = factManifest.visualization_data_manifest?.allowed_points?.length
    ? `CHART DATA (the ONLY values any chart may show; every bucket must be one of these): ${factManifest.visualization_data_manifest.allowed_points.map((p) => `${p.label} = ${p.value}%`).join(", ")}${factManifest.visualization_data_manifest.source_population ? ` (based on ${factManifest.visualization_data_manifest.source_population.toLocaleString("en-US")} ${factManifest.visualization_data_manifest.scope === "ALL_TRACKED_SINGLES" ? "tracked singles" : "records"})` : ""}. Do NOT add extra buckets.`
    : "CHART DATA: no distribution data supplied - do not draw an invented multi-bucket chart.";
  return [
    "You are a senior art director at a premium Pokemon-card collectibles media brand. Design ONE complete, finished, publish-ready social post.",
    intent,
    "You are given the REAL canonical card image(s) - design AROUND them and keep each card faithfully recognisable; do NOT redraw, restyle, recolour, or distort a card.",
    QUALITY_BAR,
    DATA_DISCIPLINE_CLAUSE,
    mdLine,
    chartLine,
    `Required on the post (spelled exactly): ${factManifest.required_text.map((t) => `"${t}"`).join(", ")}.`,
    `Do NOT show: ${factManifest.prohibited_claims.join("; ")}.`,
  ].join("\n\n");
}

// ---- §2/§3 GENERATION (real card images as input) -----------
export function fullGenerativeAvailable(env = process.env) {
  return Boolean(env.SOCIAL_IMAGE_GEN_API_KEY || env.OPENAI_API_KEY);
}

function fileToBlob(p) {
  const buf = readFileSync(p);
  return new Blob([buf], { type: p.toLowerCase().endsWith(".png") ? "image/png" : p.toLowerCase().match(/jpe?g$/) ? "image/jpeg" : "application/octet-stream" });
}

// Generate ONE full social image. cardImagePaths = local canonical PNGs.
// Uses the images/edits endpoint so the model designs around real inputs.
export async function generateFullSocial({ prompt, cardImagePaths = [], size = OPENAI_IMAGE_REQUEST_SIZE, budget = null, env = process.env, fetchImpl = fetch } = {}) {
  const key = env.SOCIAL_IMAGE_GEN_API_KEY || env.OPENAI_API_KEY;
  if (!key) return { ok: false, availability: "no_key" };
  if (budget && !canSpend(budget, "background_generation")) return { ok: false, availability: "budget_exhausted" };
  const paths = cardImagePaths.filter((p) => p && existsSync(String(p).replace(/^file:\/\//, "")));
  if (!paths.length) return { ok: false, availability: "no_card_image" };

  const attempt = async (model) => {
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", prompt);
    form.append("size", size);
    for (const p of paths.slice(0, 4)) form.append("image[]", fileToBlob(String(p).replace(/^file:\/\//, "")), "card.png");
    const t0 = Date.now();
    const res = await fetchImpl(EDITS_ENDPOINT, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(180000) });
    const latency = Date.now() - t0;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, detail: body.slice(0, 240), latency };
    }
    const json = await res.json();
    const b64 = json?.data?.[0]?.b64_json;
    return b64 ? { ok: true, b64, latency } : { ok: false, status: 200, detail: "no b64_json", latency };
  };

  let r = await attempt(process.env.OPENAI_IMAGE_MODEL || OPENAI_IMAGE_MODEL);
  if (!r.ok && r.status === 400 && OPENAI_IMAGE_MODEL_PREVIOUS) r = await attempt(OPENAI_IMAGE_MODEL_PREVIOUS);
  if (budget) recordCall(budget, "background_generation", { ok: r.ok, latencyMs: r.latency, detail: r.ok ? "full_social" : `http_${r.status}` });
  if (!r.ok) return { ok: false, availability: `http_${r.status ?? "err"}`, detail: r.detail };
  return { ok: true, b64: r.b64, mime: "image/png", sha256: createHash("sha256").update(Buffer.from(r.b64, "base64")).digest("hex"), model: process.env.OPENAI_IMAGE_MODEL || OPENAI_IMAGE_MODEL };
}

// ---- vision helpers -------------------------------------------
async function visionJSON({ b64s = [], text, key, fetchImpl, budget, detailTag }) {
  const content = [{ type: "text", text }];
  for (const b of b64s) content.push({ type: "image_url", image_url: { url: `data:image/png;base64,${b}`, detail: "low" } });
  const t0 = Date.now();
  try {
    const res = await fetchImpl(CHAT_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: VISION_MODEL, temperature: 0, max_tokens: 700, response_format: { type: "json_object" }, messages: [{ role: "user", content }] }),
      signal: AbortSignal.timeout(60000),
    });
    if (budget) recordCall(budget, "visual_review_call", { ok: res.ok, latencyMs: Date.now() - t0, detail: detailTag });
    if (!res.ok) return { ok: false, status: res.status };
    const body = await res.json();
    const m = (body?.choices?.[0]?.message?.content ?? "").match(/\{[\s\S]*\}/);
    return m ? { ok: true, parsed: JSON.parse(m[0]) } : { ok: false, status: 200 };
  } catch (e) {
    if (budget) recordCall(budget, "visual_review_call", { ok: false, latencyMs: Date.now() - t0, detail: `${detailTag}_error` });
    return { ok: false, status: "err", error: String(e?.message ?? e).slice(0, 100) };
  }
}

// ---- §20 CARD FIDELITY REVIEW -------------------------------
export async function reviewCardFidelity({ b64, cardImageB64s = [], cardIdentity = {}, env = process.env, fetchImpl = fetch, budget = null } = {}) {
  const key = env.SOCIAL_VISUAL_REVIEW_API_KEY || env.OPENAI_API_KEY;
  if (!key) return { ok: false, ...failure("CARD_FIDELITY_FAIL", "no key to run the §20 card fidelity review") };
  const r = await visionJSON({
    b64s: [b64, ...cardImageB64s].filter(Boolean),
    text:
      `The FIRST image is a finished social post. The remaining image(s) are the REAL canonical trading card(s) it should feature (card: ${cardIdentity.name ?? "?"}${cardIdentity.set ? `, set ${cardIdentity.set}` : ""}). ` +
      `Compare the card as it appears in the post to the real canonical card. Answer:\n` +
      `- artwork_materially_changed: true if the card's illustration is noticeably different (repainted, recoloured, restyled, elements added/removed)\n` +
      `- card_details_altered: true if the name, HP, set symbol, number, or text on the card face were changed\n` +
      `- card_shape_mangled: true if the card is warped, melted, cropped through the art, or malformed\n` +
      `- fake_card_variation_introduced: true if a card appears that is not one of the supplied real cards\n` +
      `- fidelity_score: 0-100 (100 = the real card, faithfully placed)\n` +
      `Respond with ONLY one JSON object: {"artwork_materially_changed":<bool>,"card_details_altered":<bool>,"card_shape_mangled":<bool>,"fake_card_variation_introduced":<bool>,"fidelity_score":<n>,"notes":["short"]}`,
    key, fetchImpl, budget, detailTag: "card_fidelity",
  });
  if (!r.ok) return { ok: false, ...failure("CARD_FIDELITY_FAIL", `card fidelity review unavailable (${r.status})`) };
  const p = r.parsed;
  const hard = p.artwork_materially_changed === true || p.card_details_altered === true || p.card_shape_mangled === true || p.fake_card_variation_introduced === true;
  if (hard || (p.fidelity_score ?? 100) < 62) {
    return { ok: false, ...failure("CARD_FIDELITY_FAIL", `card not faithful: ${JSON.stringify(p).slice(0, 200)}`), detail: p };
  }
  return { ok: true, fidelity_score: p.fidelity_score ?? null, notes: p.notes ?? [] };
}

// ---- §17/§18 FACT VERIFICATION -----------------------------
export async function verifyFacts({ b64, factManifest, env = process.env, fetchImpl = fetch, budget = null } = {}) {
  const key = env.SOCIAL_VISUAL_REVIEW_API_KEY || env.OPENAI_API_KEY;
  if (!key) return { ok: false, ...failure("FACT_VERIFY_FAIL", "no key to run the §17 fact verification") };
  const viz = factManifest.visualization_data_manifest ?? null;
  const vizLine = viz?.allowed_points?.length
    ? `SUPPORTED CHART VALUES (these ARE in the source of truth - a deterministic derived distribution, do NOT report them as invented): ${viz.allowed_points.map((p) => `${p.label} = ${p.value}%`).join(", ")}${viz.source_population ? `; sample size ${viz.source_population}` : ""}\n`
    : "";
  const r = await visionJSON({
    b64s: [b64],
    text:
      `Audit this finished social post against the SOURCE OF TRUTH. Read every word and number in the image.\n\n` +
      `REQUIRED TEXT (must ALL appear, spelled correctly): ${JSON.stringify(factManifest.required_text)}\n` +
      `REQUIRED NUMERIC FACTS: ${JSON.stringify(factManifest.required_numeric_facts)}\n` +
      vizLine +
      `PROHIBITED: ${JSON.stringify(factManifest.prohibited_claims)}\n` +
      `The CTA must be website-first (e.g. "${factManifest.cta.text}" or the domain) - a "View on eBay" style CTA is a FAIL.\n\n` +
      `Report:\n` +
      `- missing_required_text: [strings from REQUIRED TEXT that are absent or misspelled]\n` +
      `- wrong_numbers: [{shown:"...", expected:"...", label:"..."}] for any price/percentage/count that is present but WRONG\n` +
      `- invented_numbers: ["..."] for any price/percentage/stat shown that is NOT in the source of truth\n` +
      `- invented_claims: ["..."] for any prohibited or unsupported claim\n` +
      `- cta_is_ebay_first: <bool>\n` +
      `- branding_present: <bool> (the PokemonDealFinder wordmark or domain)\n` +
      `- typos_or_garbled_text: ["..."] any misspelled or nonsense generated text\n` +
      `- severity: "NONE" | "MINOR" (a small text/price/CTA slip that could be patched) | "MAJOR"\n` +
      `Respond ONLY with that JSON object.`,
    key, fetchImpl, budget, detailTag: "fact_verify",
  });
  if (!r.ok) return { ok: false, ...failure("FACT_VERIFY_FAIL", `fact verification unavailable (${r.status})`) };
  const p = r.parsed;
  const missing = p.missing_required_text ?? [];
  const wrong = p.wrong_numbers ?? [];
  // defensive: never treat a supported derived chart value (or the sample
  // size) as "invented" - it is deterministically part of the source of
  // truth even if it was not spelled out in required_text.
  const vizVals = (viz?.allowed_points ?? []).map((pt) => Number(pt.value));
  if (viz?.source_population != null) vizVals.push(Number(viz.source_population));
  const numMatchesViz = (s) => {
    const m = String(s).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
    if (!m) return false;
    const n = Number(m[0]);
    return vizVals.some((v) => Number.isFinite(v) && Math.abs(v - n) <= 0.25);
  };
  const inventedNumbers = (p.invented_numbers ?? []).filter((s) => !numMatchesViz(s));
  const invented = [...inventedNumbers, ...(p.invented_claims ?? [])];
  const typos = p.typos_or_garbled_text ?? [];
  const ctaBad = p.cta_is_ebay_first === true;
  const brandingMissing = p.branding_present === false;

  // MAJOR: invented numbers/claims, wrong numbers, eBay-first CTA, missing branding -> reject
  if (invented.length || wrong.length || ctaBad || brandingMissing) {
    return { ok: false, ...failure("FACT_VERIFY_FAIL", `fact audit: ${JSON.stringify({ wrong, invented, ctaBad, brandingMissing }).slice(0, 240)}`), detail: p };
  }
  // MINOR: missing text / small typos -> repairable
  if (missing.length || typos.length) {
    return { ok: false, ...failure("SAFE_REPAIR_REQUIRED", `repairable: missing ${JSON.stringify(missing)} typos ${JSON.stringify(typos)}`), detail: p, repairable: { missing, typos } };
  }
  return { ok: true, detail: p };
}

// ---- §21 CREATIVE QUALITY REVIEW ---------------------------
export const FULLGEN_QUALITY_DIMS = Object.freeze([
  "scroll_stop", "professional_polish", "premium_feel", "card_is_hero", "story_instantly_clear",
  "supporting_graphics_useful", "information_rich_not_cluttered", "looks_like_a_real_media_brand",
  "save_share_likelihood", "click_curiosity", "ai_spam_risk",
]);

export async function reviewCreativeQuality({ b64, layout, env = process.env, fetchImpl = fetch, budget = null } = {}) {
  const key = env.SOCIAL_VISUAL_REVIEW_API_KEY || env.OPENAI_API_KEY;
  if (!key) return { available: false, verdict: "WATCH", scores: null };
  const r = await visionJSON({
    b64s: [b64],
    text:
      `You are the creative director of a premium Pokemon-card collectibles media brand reviewing a FINISHED post (${layout}). ` +
      `Score each 0-100 (higher = better; for ai_spam_risk higher = MORE generic/AI-spam):\n${FULLGEN_QUALITY_DIMS.join(", ")}\n` +
      `Then decide overall: PASS (premium, hobby-native, scroll-stopping, publishable beside top collector accounts), ` +
      `WATCH (readable + on-brand but underpowered / generic / unclear), FAIL (broken, off-brand, AI-spam, or a gaming-HUD / tactical / cyberpunk look).\n` +
      `Respond with ONLY one JSON object: {"scores":{...every key...},"verdict":"PASS|WATCH|FAIL","notes":["specific critique"]}`,
    key, fetchImpl, budget, detailTag: "creative_quality",
  });
  if (!r.ok) return { available: false, verdict: "WATCH", scores: null };
  const p = r.parsed;
  const verdict = ["PASS", "WATCH", "FAIL"].includes(String(p.verdict).toUpperCase()) ? String(p.verdict).toUpperCase() : "WATCH";
  return { available: true, verdict, scores: p.scores ?? null, notes: p.notes ?? [] };
}

export { webFirstCta, isEbayFirstCta };
