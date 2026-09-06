// Phase 13D.4 / 13E.1 - deterministic caption assembly. Every string
// below is a pre-written template fragment; every bracketed value is a
// field pulled directly from an already-validated candidate. No LLM, no
// free-text generation anywhere in this file - see
// docs/social-creative-system.md SS20 for the schema this implements
// (HOOK/FACT/EVIDENCE/CONTEXT/CTA/DISCLOSURE) and docs/social-daily-workflow.md
// SS10-14 for the collector-market-intelligence voice, soft-CTA rules,
// eBay-listing wording, and no-fake-urgency rule this phase enforces.

import { cardDisplayName } from "../cardName.js";

// EPN disclosure. Uses the approved label "Ad" (not any of EPN's
// not-approved phrases - see docs/social-compliance-readiness.md SS7) and
// then plain clarifying prose matching docs/social-daily-workflow.md
// SS14's own example direction. Deliberately avoids the exact
// not-approved string "affiliate link".
const DISCLOSURE_LINE =
  "Ad · PokemonDealFinder is an eBay Partner Network affiliate and may earn a commission from qualifying eBay purchases.";
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

// The FACT line always makes it explicit the listing is a live eBay
// listing (docs/social-daily-workflow.md SS13) and never implies
// PokemonDealFinder owns/sells/guarantees the item.
function dealFact(row) {
  const price = Number(row.total_price_usd ?? row.total_price);
  const reference = Number(row.market_price);
  return `Live eBay listing at ${fmtUsd(price)} vs. our market reference of ${fmtUsd(reference)} — currently ${fmtPct(row.discount_pct)} below reference.`;
}

// Soft CTAs only (docs/social-daily-workflow.md SS12) - never an
// aggressive sales pitch, never fake urgency.
const CTA = {
  deal_of_day: "See today's deals on PokemonDealFinder",
  just_found: "See what we found today on PokemonDealFinder",
  best_deals_found_today: "See today's live deals on PokemonDealFinder",
  pokemon_spotlight: (name) => `Search ${name} on PokemonDealFinder`,
  set_spotlight: (name) => `Browse ${name} deals on PokemonDealFinder`,
  market_snapshot: "See today's under-market listings on PokemonDealFinder",
  market_mover: (name) => `Track ${name} on PokemonDealFinder`,
};

// --- per-content-type assemblers -----------------------------------------
// `mode`: "instagram" (fuller - hook + fact + evidence/context + CTA +
//          disclosure) | "tiktok" (shorter, hook-driven - hook + fact +
//          CTA + disclosure). Both state the same underlying facts;
//          neither is blindly identical to the other.

function dealOfDay(payload, mode) {
  const row = payload.deal_data;
  const hook = `Found today: ${normalizedName(row)} listed under its market reference.`;
  const fact = dealFact(row);
  const evidence = payload.freshness.label;
  const cta = CTA.deal_of_day;
  const parts = mode === "tiktok" ? [hook, fact, cta, DISCLOSURE_LINE] : [hook, fact, evidence, cta, DISCLOSURE_LINE];
  return parts.join("\n\n");
}

function bestDealsFoundToday(payload, mode) {
  const rows = payload.deal_data;
  const hook = `${rows.length} Pokemon cards we found under market reference today.`;
  const fact = rows
    .map((row) => `- ${normalizedName(row)}: live eBay listing at ${fmtUsd(Number(row.total_price_usd ?? row.total_price))} (${fmtPct(row.discount_pct)} below reference)`)
    .join("\n");
  const evidence = payload.freshness.label;
  const cta = CTA.best_deals_found_today;
  const parts = mode === "tiktok" ? [hook, fact, cta, DISCLOSURE_LINE] : [hook, fact, evidence, cta, DISCLOSURE_LINE];
  return parts.join("\n\n");
}

function justFound(payload, mode) {
  const row = payload.deal_data;
  const hook = `Just found: ${normalizedName(row)}, listed recently.`;
  const fact = dealFact(row);
  const evidence = `Discovered ${payload.freshness.discoveryAgeLabel} ago. ${payload.freshness.label}`;
  const cta = CTA.just_found;
  const parts = mode === "tiktok" ? [hook, fact, cta, DISCLOSURE_LINE] : [hook, fact, evidence, cta, DISCLOSURE_LINE];
  return parts.join("\n\n");
}

function pokemonSpotlight(payload, mode) {
  const s = payload.subject;
  const hook = `${s.deal_count} ${s.display_name} listings worth watching today.`;
  const top = payload.deal_data[0];
  const fact = top
    ? `Best current gap: ${normalizedName(top)} at ${fmtUsd(Number(top.total_price_usd ?? top.total_price))}, ${fmtPct(top.discount_pct)} below our market reference.`
    : "";
  const context = `Every current ${s.display_name} listing here is a live eBay listing checked against a real market reference.`;
  const cta = CTA.pokemon_spotlight(s.display_name);
  const parts = mode === "tiktok" ? [hook, fact, cta, DISCLOSURE_LINE] : [hook, fact, context, cta, DISCLOSURE_LINE];
  return parts.filter(Boolean).join("\n\n");
}

function setSpotlight(payload, mode) {
  const s = payload.subject;
  const hook = `${s.deal_count} ${s.display_name} listings under market reference right now.`;
  const top = payload.deal_data[0];
  const fact = top
    ? `Widest gap today: ${normalizedName(top)} at ${fmtUsd(Number(top.total_price_usd ?? top.total_price))}, ${fmtPct(top.discount_pct)} below reference.`
    : "";
  const context = `All live eBay listings, each compared against the market reference already shown on our site.`;
  const cta = CTA.set_spotlight(s.display_name);
  const parts = mode === "tiktok" ? [hook, fact, cta, DISCLOSURE_LINE] : [hook, fact, context, cta, DISCLOSURE_LINE];
  return parts.filter(Boolean).join("\n\n");
}

function marketSnapshot(payload, mode) {
  const m = payload.market_snapshot;
  const hook = `${m.deal_count} Pokemon cards are listed below our market reference right now.`;
  const fact = m.biggest_gap_card
    ? `Widest gap today: ${m.biggest_gap_card}${m.biggest_gap_set ? ` (${m.biggest_gap_set})` : ""} at ${fmtPct(m.biggest_gap_pct)} below reference. Median gap across today's finds: ${fmtPct(m.median_gap_pct)}.`
    : `Median gap across today's finds: ${fmtPct(m.median_gap_pct)}. Median listed price: ${fmtUsd(m.median_listed_usd)}.`;
  const context = `A snapshot of today's live eBay listings vs. the market references already shown on our site — not a price-history forecast.`;
  const cta = CTA.market_snapshot;
  const parts = mode === "tiktok" ? [hook, fact, cta, DISCLOSURE_LINE] : [hook, fact, context, cta, DISCLOSURE_LINE];
  return parts.filter(Boolean).join("\n\n");
}

// Phase 13E.3 - MARKET MOVER caption. States ONLY the real, confident
// movement over the stated window - no forecast, no "buy now", no
// investment framing. `payload.movement` is a resolved { ok:true } from
// lib/social/priceMovement (buildMoverPayload guarantees it).
function marketMover(payload, mode) {
  const name = normalizedName(payload.deal_data || payload.subject || {});
  const m = payload.movement;
  const dir = m.direction === "up" ? "up" : "down";
  const pctAbs = fmtPct(Math.abs(m.pct));
  const hook = `${name}: market reference is ${dir} ${pctAbs} over the last ${m.windowLabel}.`;
  const fact = `Based on our canonical price history for this exact printing — recent sold references, merged with our own daily snapshots. Card prices can move; this is not investment advice.`;
  const context = `We track it the same way our card pages do — we don't say where it heads next.`;
  const cta = CTA.market_mover(name);
  const parts =
    mode === "tiktok"
      ? [hook, "Canonical price history — not investment advice.", cta, DISCLOSURE_LINE]
      : [hook, fact, context, cta, DISCLOSURE_LINE];
  return parts.filter(Boolean).join("\n\n");
}

const ASSEMBLERS = {
  deal_of_day: dealOfDay,
  best_deals_found_today: bestDealsFoundToday,
  just_found: justFound,
  pokemon_spotlight: pokemonSpotlight,
  set_spotlight: setSpotlight,
  market_snapshot: marketSnapshot,
  market_mover: marketMover,
};

// variant: "instagram" | "tiktok" (13E.1 SS20). Legacy aliases kept so
// existing callers/tests don't break: "standard" -> "instagram",
// "short" -> "tiktok".
const VARIANT_ALIASES = { standard: "instagram", short: "tiktok" };

export function assembleCaption(payload, { variant = "instagram" } = {}) {
  const mode = VARIANT_ALIASES[variant] ?? variant;
  const fn = ASSEMBLERS[payload.content_type];
  if (!fn) throw new Error(`assembleCaption: no assembler for content_type "${payload.content_type}"`);
  if (mode !== "instagram" && mode !== "tiktok") throw new Error(`assembleCaption: unknown variant "${variant}"`);
  return fn(payload, mode);
}

// Convenience: both platform captions in one call, for the daily workflow.
export function assemblePlatformCaptions(payload) {
  return {
    instagram: assembleCaption(payload, { variant: "instagram" }),
    tiktok: assembleCaption(payload, { variant: "tiktok" }),
  };
}

export { DISCLOSURE_LINE, normalizedName };
