// Phase SOCIAL-DISCOVERY-2 SS9/SS11 - PERSISTED DISCOVERY HISTORY.
//
// Reads REAL rotation history from social_story_placements - no new
// table, no schema migration. Discovery metadata (hashtags/primary
// keyword/family/pokemon/card/set) is embedded in the SAME existing
// flexible `caption_style` JSONB column patchPlacement/upsertPlacements
// already write to (previously only {caption_sha256}) - this is the one
// place that both writes it (via buildDiscoveryCaptionStyle, used by
// bufferHandoff.mjs when building a placement) and reads it back.

import { supabaseAdmin } from "../../supabaseAdmin.js";

export const DISCOVERY_HISTORY_VERSION = "discovery2.1";

// Any of these indicates the placement was a REAL queue/publish event,
// not just a locally-simulated dry-run row (§9 - "do not rely on
// proof-pack files for production history").
const REAL_HISTORY_STATUSES = Object.freeze(["BUFFER_QUEUED", "PUBLISHED", "RECONCILED"]);

/**
 * buildDiscoveryCaptionStyle({ captionSha256, discoveryFields }) -> object
 * The ONE place a placement's caption_style gains discovery metadata -
 * called from bufferHandoff.mjs when building a real placement.
 */
export function buildDiscoveryCaptionStyle({ captionSha256 = null, discoveryFields = null } = {}) {
  const base = { caption_sha256: captionSha256 };
  if (!discoveryFields) return base;
  return { ...base, discovery: discoveryFields };
}

/**
 * getRecentDiscoveryHistory(platform, lookback = 50) ->
 *   { ready, rows: [{ story_family, pokemon, card, set, primary_keyword,
 *     hashtags, status, scheduled_for, updated_at }] }
 * Read-only. Never writes. Degrades to an empty (not fabricated) history
 * if the DB isn't reachable or no rows carry discovery metadata yet (a
 * fresh deploy before this phase's own writes exist).
 */
export async function getRecentDiscoveryHistory(platform, lookback = 50) {
  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("social_story_placements")
      .select("story_id, platform, status, scheduled_for, updated_at, caption_style")
      .eq("platform", platform)
      .in("status", REAL_HISTORY_STATUSES)
      .order("updated_at", { ascending: false })
      .limit(lookback);
    if (error) return { ready: false, rows: [], error: error.message };
    const rows = (data ?? [])
      .map((r) => {
        const d = r.caption_style?.discovery;
        if (!d) return null;
        return {
          story_id: r.story_id, platform: r.platform, status: r.status,
          scheduled_for: r.scheduled_for, updated_at: r.updated_at,
          story_family: d.family ?? null, pokemon: d.pokemon ?? null, card: d.card ?? null, set: d.set ?? null,
          primary_keyword: d.primary_keyword ?? null, hashtags: d.hashtags ?? [],
        };
      })
      .filter(Boolean);
    return { ready: true, rows };
  } catch (e) {
    return { ready: false, rows: [], error: String(e?.message ?? e) };
  }
}

/** recentTagsFor(rows) -> flat lowercase string[] (for hashtagPools.mjs's recentTags param) */
export function recentTagsFor(rows) {
  return rows.flatMap((r) => r.hashtags ?? []);
}

/** recentCombosFor(rows) -> string[][] (exact combinations, for SS10's "identical combination" check) */
export function recentCombosFor(rows) {
  return rows.map((r) => (r.hashtags ?? []).slice().sort());
}

/** recentPrimaryKeywordsFor(rows) -> string[] (for SS11's keyword-history repetition check) */
export function recentPrimaryKeywordsFor(rows) {
  return rows.map((r) => r.primary_keyword).filter(Boolean);
}
