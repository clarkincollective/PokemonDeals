// Phase SOCIAL-CREATIVE-4A - CREATIVE BRIEF (§5) + CREATIVE VERSIONING (§34).
//
// A structured brief is built BEFORE any rendering, from real story data +
// the story contract + the fact lock. The AI creative director (4B) only
// ever REFINES this object and may never touch its factual content. The
// brief and its version stamp are persisted so any asset is explainable
// later.
//
// Deterministic. No I/O, no OpenAI.

import { createHash } from "node:crypto";
import { contractFor } from "./storyContracts.mjs";
import { factLockHash } from "./factLock.mjs";
import { BRAND_SYSTEM_VERSION } from "./brandSystem.mjs";
import { PRINTING_RELEVANCE_VERSION } from "./printingRelevance.mjs";

export const CREATIVE_BRIEF_VERSION = "4a.1";
export const LAYOUT_VERSION = "4a.1";

// §5 - the brief schema. `f` = factual (must trace to the fact lock and is
// never AI-editable); `d` = direction (AI may refine).
export const BRIEF_SCHEMA = Object.freeze({
  story_type: { kind: "f", required: true },
  editorial_angle: { kind: "d", required: true, max_words: 20 },
  why_it_matters: { kind: "d", required: true, max_words: 24 },
  target_collector: { kind: "d", required: true, max_words: 12 },
  hook: { kind: "d", required: true, max_words: 14, max_lines: 3 },
  supporting_facts: { kind: "f", required: true }, // array of strings, each traceable to the lock
  hero_element: { kind: "d", required: true },
  secondary_elements: { kind: "d", required: false },
  visual_hierarchy: { kind: "d", required: true }, // ordered array
  layout_family: { kind: "d", required: true },
  mood: { kind: "d", required: true, max_words: 10 },
  platform: { kind: "f", required: true },
  aspect_ratio: { kind: "f", required: true },
  cta_style: { kind: "d", required: true },
  shelf_life: { kind: "f", required: true },
  must_show: { kind: "f", required: true }, // from the contract
  must_not_show: { kind: "f", required: true }, // from the contract
  visual_reference_notes: { kind: "d", required: false, max_words: 40 },
  animation_notes: { kind: "d", required: false, max_words: 40 },
});

export const BRIEF_FIELDS = Object.freeze(Object.keys(BRIEF_SCHEMA));
export const FACTUAL_BRIEF_FIELDS = Object.freeze(BRIEF_FIELDS.filter((k) => BRIEF_SCHEMA[k].kind === "f"));

const ASPECT = { instagram: "4:5", x: "16:9", youtube: "9:16", tiktok: "9:16" };

// Build the deterministic first-pass brief. `story` is the resolved story
// row/opportunity; `factLock` is buildFactLock(story)'s output.
export function buildCreativeBrief({ story, platform, factLock, contract = null, layoutFamily = null } = {}) {
  const c = contract ?? contractFor(story?.series ?? story?.story_type);
  if (!c) throw new Error(`creativeBrief: no story contract for "${story?.series ?? story?.story_type}"`);

  const supporting = supportingFactsFromLock(factLock, c);
  const brief = {
    story_type: c.id,
    editorial_angle: leadClause(c.meaningful, 18),
    why_it_matters: c.meaningful,
    target_collector: c.classification === "COMMERCIAL" ? "an active buyer scanning for value" : "a collector building market judgement",
    hook: null, // the caption layer / AI fills the wording; contract.acceptable_hook is the rule
    supporting_facts: supporting,
    hero_element: c.required_visual_evidence[0] ?? "canonical card art",
    secondary_elements: c.required_visual_evidence.slice(1),
    visual_hierarchy: [...c.required_visual_evidence],
    layout_family: layoutFamily ?? c.layout_family ?? "editorial",
    mood: "premium, editorial, collector-native",
    platform,
    aspect_ratio: ASPECT[platform] ?? "4:5",
    cta_style: c.classification === "COMMERCIAL" ? "SOFT link-out" : "BRAND_ONLY",
    shelf_life: c.shelf_life,
    must_show: [...c.required_visual_evidence],
    must_not_show: [...c.must_not_do],
    visual_reference_notes: null,
    animation_notes: null,
    hook_rule: c.acceptable_hook,
  };
  return brief;
}

// The first clause of the contract's `meaningful` sentence, capped at
// `maxWords` - a legible editorial angle the AI director later refines.
function leadClause(sentence, maxWords) {
  const firstClause = String(sentence || "").split(/[,-]\s|\s-\s/)[0].trim();
  const words = firstClause.split(/\s+/);
  return words.length <= maxWords ? firstClause : words.slice(0, maxWords).join(" ");
}

function supportingFactsFromLock(lock, contract) {
  if (!lock) return [];
  const out = [];
  const money = (n) => `$${Number(n).toLocaleString("en-US")}`;
  if (lock.card_name) out.push(`Card: ${lock.card_name}${lock.card_set ? ` (${lock.card_set})` : ""}`);
  if (lock.listed_price != null) out.push(`Listed: ${money(lock.listed_price)}`);
  if (lock.market_price != null) out.push(`Market reference: ${money(lock.market_price)}`);
  if (lock.sold_price != null) out.push(`Recent sold: ${money(lock.sold_price)}`);
  if (lock.discount_pct != null) out.push(`${lock.discount_pct}% below reference`);
  if (lock.current_bid != null) out.push(`Current bid: ${money(lock.current_bid)}`);
  if (lock.shipping != null) out.push(`Shipping: ${money(lock.shipping)}`);
  if (lock.grade) out.push(`Grade: ${lock.grade}`);
  if (lock.sample_size != null) out.push(`Sample size: ${lock.sample_size}`);
  if (lock.tracked_count != null) out.push(`Tracked cards: ${lock.tracked_count}`);
  return out.length ? out : [`Editorial premise: ${contract.meaningful}`];
}

// Validate a brief (deterministic first-pass OR an AI-refined one).
// Returns { ok, errors, warnings }.
export function validateCreativeBrief(brief, { factLock = null } = {}) {
  const errors = [];
  const warnings = [];
  for (const [field, spec] of Object.entries(BRIEF_SCHEMA)) {
    const v = brief?.[field];
    const empty = v == null || v === "" || (Array.isArray(v) && v.length === 0);
    if (spec.required && empty) {
      // `hook` may be filled downstream by the caption layer
      if (field === "hook") warnings.push("hook not yet written (caption layer / creative director fills it)");
      else errors.push(`missing required field: ${field}`);
      continue;
    }
    if (empty) continue;
    if (spec.max_words && typeof v === "string" && v.trim().split(/\s+/).length > spec.max_words) {
      errors.push(`${field} exceeds ${spec.max_words} words`);
    }
    if (spec.max_lines && typeof v === "string" && v.split(/\n/).length > spec.max_lines) {
      errors.push(`${field} exceeds ${spec.max_lines} lines`);
    }
  }
  // factual fields must be present and (for the ones the lock covers) consistent
  if (factLock) {
    if (Array.isArray(brief?.supporting_facts)) {
      const joined = brief.supporting_facts.join(" | ").toLowerCase();
      if (factLock.card_name && !joined.includes(String(factLock.card_name).toLowerCase())) {
        warnings.push("supporting_facts does not mention the locked card_name");
      }
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

// A compact fingerprint of the brief's STRUCTURE (not its facts) for
// anti-repetition (§26).
export function briefStructureKey(brief) {
  const s = {
    layout: brief?.layout_family ?? null,
    hero: brief?.hero_element ?? null,
    hierarchy: (brief?.visual_hierarchy ?? []).slice(0, 4).join(">"),
    cta: brief?.cta_style ?? null,
    platform: brief?.platform ?? null,
  };
  return createHash("sha256").update(JSON.stringify(s)).digest("hex").slice(0, 16);
}

// §34 - the version stamp persisted with every asset. Every value here
// must be explainable later.
export const CREATIVE_VERSION_FIELDS = Object.freeze([
  "creative_brief_version",
  "creative_director_model",
  "background_generation_model",
  "layout_version",
  "brand_system_version",
  "printing_relevance_version",
  "artifact_sha256",
  "fact_lock_hash",
  "visual_review_policy_version",
]);

export function buildVersionStamp({
  factLock,
  artifactSha256 = null,
  creativeDirectorModel = null,
  backgroundGenerationModel = null,
  visualReviewPolicyVersion = null,
} = {}) {
  const flh = factLock ? factLockHash(factLock).short : null;
  return Object.freeze({
    creative_brief_version: CREATIVE_BRIEF_VERSION,
    creative_director_model: creativeDirectorModel, // null in 4A (no AI yet)
    background_generation_model: backgroundGenerationModel, // null in 4A
    layout_version: LAYOUT_VERSION,
    brand_system_version: BRAND_SYSTEM_VERSION,
    printing_relevance_version: PRINTING_RELEVANCE_VERSION,
    artifact_sha256: artifactSha256,
    fact_lock_hash: flh,
    visual_review_policy_version: visualReviewPolicyVersion,
  });
}
