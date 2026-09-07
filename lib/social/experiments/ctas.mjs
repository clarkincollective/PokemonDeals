// Phase 13E.10A - CTA VARIANT LIBRARY (§4).
//
// Deterministic. Each CTA maps to the destination KINDS it can honestly
// fulfil - a CTA is never allowed on a destination that doesn't deliver
// what it promises ("SEE THE LIVE DEAL" must point at an exact listing
// page, "FULL PRICE HISTORY" at a card hub, etc.).
//
// Labels reuse lib/social/creativeSpec.CTA_INTENTS where they already
// exist; CHECK_CURRENT_LISTING is the one new label.

import { CTA_INTENTS } from "../creativeSpec.mjs";

// The on-site destination kinds a social CTA can land on.
export const DESTINATION_KINDS = Object.freeze(["deal_exact", "deals_index", "card_hub"]);

export const CTA_VARIANTS = Object.freeze({
  SEE_LIVE_DEAL: { label: CTA_INTENTS.live_deal, destinations: ["deal_exact"] }, // "SEE THE LIVE DEAL"
  CHECK_CURRENT_LISTING: { label: "CHECK THE CURRENT LISTING", destinations: ["deal_exact"] },
  SEE_TODAYS_DEALS: { label: CTA_INTENTS.todays_deals, destinations: ["deals_index"] }, // "SEE TODAY'S DEALS"
  SEE_ALL_LIVE_FINDS: { label: CTA_INTENTS.all_live_finds, destinations: ["deals_index"] }, // "SEE ALL LIVE FINDS"
  COMPARE_LIVE_LISTINGS: { label: CTA_INTENTS.compare_live, destinations: ["card_hub", "deals_index"] }, // "COMPARE LIVE LISTINGS"
  FULL_PRICE_HISTORY: { label: CTA_INTENTS.card_history, destinations: ["card_hub"] }, // "FULL PRICE HISTORY"
});

export const CTA_IDS = Object.freeze(Object.keys(CTA_VARIANTS));

// The destination kind for a real on-site route.
//   /deals/12345      -> deal_exact
//   /deals            -> deals_index
//   /deals/under-25   -> deals_index
//   /cards/<slug>     -> card_hub
//   /pokemon|/sets/*  -> deals_index (a browse of live deals, not one listing / one card's history)
export function destinationKindForRoute(route) {
  const r = String(route ?? "").replace(/^https?:\/\/[^/]+/i, "").split("?")[0];
  if (/^\/deals\/\d+$/.test(r)) return "deal_exact";
  if (/^\/cards\//.test(r)) return "card_hub";
  if (r === "/deals" || /^\/deals\/[a-z-]+$/.test(r)) return "deals_index";
  if (/^\/(pokemon|sets)\//.test(r) || r === "/best-finds" || r === "/") return "deals_index";
  return "deals_index";
}

// Can this CTA honestly be used with this destination kind?
export function ctaFitsDestination(ctaId, destinationKind) {
  const c = CTA_VARIANTS[ctaId];
  if (!c) return { ok: false, reason: `unknown CTA "${ctaId}"` };
  if (!c.destinations.includes(destinationKind)) {
    return { ok: false, reason: `${ctaId} promises "${c.label}" but the destination is a ${destinationKind}` };
  }
  return { ok: true, reason: "" };
}

export function ctaLabel(ctaId) {
  return CTA_VARIANTS[ctaId]?.label ?? null;
}

// Every CTA valid for a destination kind (deterministic order).
export function ctasForDestination(destinationKind) {
  return CTA_IDS.filter((id) => CTA_VARIANTS[id].destinations.includes(destinationKind));
}
