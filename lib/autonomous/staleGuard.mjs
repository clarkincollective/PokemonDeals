// Phase SOCIAL-AUTOPILOT-1 §14 - STALE STORY PROTECTION.
//
// Live-deal content can expire between snapshot freeze and Buffer queue,
// and again between queue and publish. This module NEVER mutates the
// frozen snapshot (§1's guarantee stays absolute) - it only determines
// whether the ALREADY-FROZEN facts are still true enough to publish, by
// comparing them against a freshly re-queried live record.
//
// A material change means the story must be re-discovered from scratch
// (a NEW snapshot with a NEW hash) - never a silent patch of the old one.

import { failure } from "../newsroom/editorial/failureStates.mjs";

export const STALE_GUARD_VERSION = "auto1.1";

// Live-deal families carry a single active listing per canonical card id
// that can be re-checked directly; editorial/evergreen families have no
// "listing" to go stale (their claim is either a catalogue aggregate or a
// timeless lesson) and are always STILL_VALID.
const LIVE_DEAL_FAMILIES = Object.freeze(["deal_drop", "three_under_25", "asking_vs_sold"]);

// `priceTolerancePct`: how much the live price may move before the
// snapshot is considered materially stale (never silently re-labelled).
export function checkStale(snapshot, liveRecord = null, { priceTolerancePct = 0.05 } = {}) {
  if (!LIVE_DEAL_FAMILIES.includes(snapshot.story_family)) {
    return { verdict: "STILL_VALID", ok: true };
  }
  if (!liveRecord) {
    return { verdict: "LISTING_GONE", ok: false, ...failure("LISTING_GONE_FAIL", "no live record found for the snapshot's canonical listing(s)", { story_id: snapshot.story_id }) };
  }
  if (liveRecord.is_active === false) {
    return { verdict: "LISTING_GONE", ok: false, ...failure("LISTING_GONE_FAIL", "the live listing is no longer active", { story_id: snapshot.story_id }) };
  }
  const frozenPrices = Object.values(snapshot.prices ?? {}).filter((v) => typeof v === "number");
  const livePrices = Object.values(liveRecord.prices ?? {}).filter((v) => typeof v === "number");
  for (let i = 0; i < frozenPrices.length; i++) {
    const frozen = frozenPrices[i];
    const live = livePrices[i];
    if (typeof live !== "number" || !frozen) continue;
    const drift = Math.abs(live - frozen) / frozen;
    if (drift > priceTolerancePct) {
      return {
        verdict: "PRICE_CHANGED_MATERIALLY", ok: false,
        ...failure("PRICE_CHANGED_MATERIALLY_FAIL", `live price moved ${(drift * 100).toFixed(1)}% since the snapshot was frozen (> ${priceTolerancePct * 100}% tolerance)`, { story_id: snapshot.story_id, frozen, live }),
      };
    }
  }
  return { verdict: "STILL_VALID", ok: true };
}

// Re-query the ONE live record a frozen deal-family snapshot depends on,
// without mutating anything. Returns null (treated as LISTING_GONE by
// checkStale) if the deal no longer exists.
export async function fetchLiveRecordFor(snapshot) {
  if (!LIVE_DEAL_FAMILIES.includes(snapshot.story_family)) return null;
  const ids = snapshot.canonical_card_ids ?? [];
  if (!ids.length) return null;
  const { supabaseAdmin } = await import("../supabaseAdmin.js");
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("deals")
    .select("card_tcgplayer_id, total_price_usd, market_price, is_active")
    .in("card_tcgplayer_id", ids)
    .eq("is_active", true)
    .order("first_seen_at", { ascending: false })
    .limit(ids.length);
  if (error || !data?.length) return { is_active: false };
  const prices = {};
  for (const row of data) prices[String(row.card_tcgplayer_id)] = Number(row.total_price_usd);
  return { is_active: true, prices };
}
