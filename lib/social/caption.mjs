// Phase 13D.4 - deterministic caption assembly. Every string below is a
// pre-written template fragment; every bracketed value is a field pulled
// directly from an already-validated candidate. No LLM, no free text
// generation anywhere in this file - see docs/social-creative-system.md
// SS20 for the schema this implements (HOOK/FACT/EVIDENCE/CONTEXT/CTA/
// DISCLOSURE).

import { cardDisplayName } from "../cardName.js";

const DISCLOSURE_LINE =
  "Ad · PokemonDealFinder is an eBay Partner — this post may contain affiliate links.";
// payload.freshness.label (lib/social/eligibility.mjs socialFreshnessLine)
// already ends in "Availability can change." - a single source of truth
// for that exact wording, never duplicated here.

const fmtUsd = (n) => `$${Number(n).toFixed(2)}`;
const fmtPct = (n) => `${Math.round(Number(n) * 100)}%`;

// Deliberately NO raw-title fallback (unlike some on-site display code) -
// if a row somehow has no resolved card_name, this must fail loudly
// rather than ever leak seller-written title text into public social
// copy. See docs/social-creative-system.md SS13 / P0.4 brief SS13.
function normalizedName(row) {
  if (!row.card_name) throw new Error("caption.mjs: row has no resolved card_name - refusing to fall back to raw listing title");
  return cardDisplayName({ name: row.card_name });
}

function dealFact(row) {
  const price = Number(row.total_price_usd ?? row.total_price);
  const reference = Number(row.market_price);
  return `Current listing: ${fmtUsd(price)}. Market reference: ${fmtUsd(reference)}. Currently ${fmtPct(row.discount_pct)} below our reference.`;
}

// --- per-content-type assemblers -----------------------------------------

function dealOfDay(payload, variant) {
  const row = payload.deal_data;
  const hook = `Found today: ${normalizedName(row)}.`;
  const fact = dealFact(row);
  const evidence = payload.freshness.label;
  const cta = "Check today's deal →";
  const parts = variant === "short" ? [hook, fact, cta, DISCLOSURE_LINE] : [hook, fact, evidence, cta, DISCLOSURE_LINE];
  return parts.join("\n\n");
}

function bestDealsFoundToday(payload, variant) {
  const rows = payload.deal_data;
  const hook = `${rows.length} Pokemon cards we found under market today.`;
  const fact = rows
    .map((row) => `- ${normalizedName(row)}: ${fmtUsd(Number(row.total_price_usd ?? row.total_price))} (${fmtPct(row.discount_pct)} below reference)`)
    .join("\n");
  const evidence = payload.freshness.label;
  const cta = "See today's live deals →";
  const parts = variant === "short" ? [hook, fact, cta, DISCLOSURE_LINE] : [hook, fact, evidence, cta, DISCLOSURE_LINE];
  return parts.join("\n\n");
}

function justFound(payload, variant) {
  const row = payload.deal_data;
  const hook = `Just found: ${normalizedName(row)}.`;
  const fact = dealFact(row);
  const evidence = `Discovered ${payload.freshness.discoveryAgeLabel} ago. ${payload.freshness.label}`;
  const cta = "See what's new →";
  const parts = variant === "short" ? [hook, fact, cta, DISCLOSURE_LINE] : [hook, fact, evidence, cta, DISCLOSURE_LINE];
  return parts.join("\n\n");
}

function pokemonSpotlight(payload, variant) {
  const s = payload.subject;
  const hook = `${s.deal_count} ${s.display_name} deals worth checking today.`;
  const top = payload.deal_data[0];
  const fact = top ? `Starting from ${fmtUsd(Number(top.total_price_usd ?? top.total_price))}, ${fmtPct(top.discount_pct)} below reference.` : "";
  const context = `Every current ${s.display_name} deal here is checked against a real market reference.`;
  const cta = `See all ${s.display_name} cards →`;
  const parts = variant === "short" ? [hook, fact, cta, DISCLOSURE_LINE] : [hook, fact, context, cta, DISCLOSURE_LINE];
  return parts.filter(Boolean).join("\n\n");
}

function setSpotlight(payload, variant) {
  const s = payload.subject;
  const hook = `The best deals we found in ${s.display_name} today.`;
  const top = payload.deal_data[0];
  const fact = top ? `Starting from ${fmtUsd(Number(top.total_price_usd ?? top.total_price))}, ${fmtPct(top.discount_pct)} below reference.` : "";
  const context = `${s.deal_count} live deals currently in ${s.display_name}.`;
  const cta = `Browse ${s.display_name} →`;
  const parts = variant === "short" ? [hook, fact, cta, DISCLOSURE_LINE] : [hook, fact, context, cta, DISCLOSURE_LINE];
  return parts.filter(Boolean).join("\n\n");
}

const ASSEMBLERS = {
  deal_of_day: dealOfDay,
  best_deals_found_today: bestDealsFoundToday,
  just_found: justFound,
  pokemon_spotlight: pokemonSpotlight,
  set_spotlight: setSpotlight,
};

// variant: "short" | "standard" (13D.2 SS21 - "detailed" deferred, not
// implemented this spike).
export function assembleCaption(payload, { variant = "standard" } = {}) {
  const fn = ASSEMBLERS[payload.content_type];
  if (!fn) throw new Error(`assembleCaption: no assembler for content_type "${payload.content_type}"`);
  if (variant !== "short" && variant !== "standard") throw new Error(`assembleCaption: unknown variant "${variant}"`);
  return fn(payload, variant);
}

export { DISCLOSURE_LINE, normalizedName };
