// Phase 13E.1 - the DAILY CONTENT MIX. Given the already-fetched active
// deal pool and the local post history, decide today's batch:
//   - at most ONE of each family (deal-of-day / just-found /
//     pokemon-spotlight / set-spotlight / market-snapshot)
//   - target 3-5 posts; FAIL CLOSED to fewer when inventory is thin
//     (SS1, SS25) - never fabricate a candidate to hit a quota
//   - every candidate re-runs the UNCHANGED eligibility gates via the
//     existing pick* selectors, then a cooldown check, then a rights
//     gate
//   - an editorially-imbalanced batch (all Charizard, all one set, all
//     one composition, ...) is FLAGGED, not silently shipped (SS18)
//
// PURE: this module does no I/O. `rows` is the shared DB read; `history`
// is loaded by the caller (scripts/socialDaily.mjs) from the local file.

import { extractSpecies } from "../pokemonSpecies.js";
import {
  pickDealOfTheDay,
  pickJustFound,
  pickPokemonSpotlight,
  pickSetSpotlight,
} from "./candidates.mjs";
import { pickMarketSnapshot, buildMarketSnapshotPayload } from "./marketSnapshot.mjs";
import { buildDealPayload, buildSpotlightPayload } from "./payload.mjs";
import { buildCooldownKeys, checkCooldowns, isBlockedByCooldown, firstBlockingReason } from "./cooldown.mjs";
import { RIGHTS_STATE } from "./rights.mjs";

// The families that make up a daily batch, in a fixed order (SS1). Best
// Deals (the carousel) is deliberately NOT in the daily mix - it stays
// available via the older `social:preview` command.
export const DAILY_FAMILIES = ["deal-of-day", "just-found", "pokemon-spotlight", "set-spotlight", "market-snapshot"];

const REASON_SELECTED = {
  "deal-of-day": (p) => `Top-ranked verified BIN deal today: ${p.deal_data.card_name} at ${Math.round(p.deal_data.discount_pct * 100)}% below reference.`,
  "just-found": (p) => `Newest verified BIN deal: discovered ${p.freshness.discoveryAgeLabel} ago, ${Math.round(p.deal_data.discount_pct * 100)}% below reference.`,
  "pokemon-spotlight": (p) => `${p.subject.deal_count} live ${p.subject.display_name} deals - the deepest current Pokemon grouping.`,
  "set-spotlight": (p) => `${p.subject.deal_count} live deals in ${p.subject.display_name} - the deepest current set grouping.`,
  "market-snapshot": (p) => `${p.market_snapshot.deal_count} cards under market reference right now; widest gap ${Math.round(p.market_snapshot.biggest_gap_pct * 100)}%.`,
};

// The display name a post headlines (single-deal families and the market
// snapshot both name one card; spotlights headline their group).
function headlineNameOf(payload) {
  if (payload.content_type === "market_snapshot") return payload.market_snapshot?.biggest_gap_card ?? null;
  if (payload.content_type === "pokemon_spotlight" || payload.content_type === "set_spotlight") return payload.subject.display_name;
  const deal = Array.isArray(payload.deal_data) ? payload.deal_data[0] : payload.deal_data;
  return deal?.card_name ?? null;
}

// Build a payload for one family from an already-fetched rows array.
// `excludeCardNames` steers market-snapshot away from a card already
// featured earlier in the batch. Returns { payload } or { skip: <reason> }.
function familyCandidate(family, rows, now, excludeCardNames) {
  switch (family) {
    case "deal-of-day": {
      const { candidate } = pickDealOfTheDay(rows, now);
      if (!candidate) return { skip: "no eligible verified BIN deal cleared the premium + social-freshness gates" };
      return { payload: buildDealPayload({ contentType: "deal_of_day", row: candidate, now, utmCampaign: "deal_of_day" }) };
    }
    case "just-found": {
      const { candidate } = pickJustFound(rows, now);
      if (!candidate) return { skip: "no deal was both discovered inside the Just-Added window AND re-verified inside the social-freshness ceiling" };
      return { payload: buildDealPayload({ contentType: "just_found", row: candidate, now, utmCampaign: "just_found" }) };
    }
    case "pokemon-spotlight": {
      const { candidate } = pickPokemonSpotlight(rows, { now });
      if (!candidate) return { skip: "no Pokemon has enough (>=3) live socially-eligible deals to justify a spotlight" };
      return {
        payload: buildSpotlightPayload({
          contentType: "pokemon_spotlight",
          displayName: candidate.pokemon_display_name,
          dealCount: candidate.deal_count,
          topDeals: candidate.top_deals,
          destinationRoute: candidate.destination_url,
          now,
        }),
      };
    }
    case "set-spotlight": {
      const { candidate } = pickSetSpotlight(rows, { now });
      if (!candidate) return { skip: "no set has enough (>=3) live socially-eligible deals to justify a spotlight" };
      return {
        payload: buildSpotlightPayload({
          contentType: "set_spotlight",
          displayName: candidate.set_display_name,
          dealCount: candidate.deal_count,
          topDeals: candidate.top_deals,
          destinationRoute: candidate.destination_url,
          now,
        }),
      };
    }
    case "market-snapshot": {
      const { candidate } = pickMarketSnapshot(rows, now, { excludeCardNames });
      if (!candidate) return { skip: "fewer than 6 socially-eligible BIN deals - not enough spread for a market snapshot" };
      return { payload: buildMarketSnapshotPayload({ candidate, now }) };
    }
    default:
      return { skip: `unknown family "${family}"` };
  }
}

// The rights gate for a daily candidate. Deterministic template families
// only ever need: publishing to be a local-review flow (it is), the
// creative to be Mode B (card_image NOT_CLEARED -> Mode B enforced by
// templates.mjs having no <img>), and - for market_snapshot only - PPT
// social data to be cleared. GenAI state is irrelevant: nothing here
// touches an LLM.
function rightsGate(payload) {
  if (RIGHTS_STATE.publishing !== "DISABLED") return "publishing is not in the expected DISABLED (local-review) state - stop";
  if (RIGHTS_STATE.card_image !== "NOT_CLEARED") return "card_image rights changed - Mode B assumptions need re-checking before production";
  if (payload.content_type === "market_snapshot" && RIGHTS_STATE.ppt_social_data !== "CLEARED") {
    return "market snapshot needs ppt_social_data = CLEARED";
  }
  return null;
}

// The subject key used for the "same Pokemon twice in one batch" mix
// check - the SPECIES, not the raw card name.
function batchSpeciesOf(payload) {
  if (payload.content_type === "pokemon_spotlight") return payload.subject.display_name;
  const deal = Array.isArray(payload.deal_data) ? payload.deal_data[0] : payload.deal_data;
  return deal?.card_name ? extractSpecies(deal.card_name) : null;
}

function batchSetOf(payload) {
  if (payload.content_type === "set_spotlight") return payload.subject.display_name;
  const deal = Array.isArray(payload.deal_data) ? payload.deal_data[0] : payload.deal_data;
  return deal?.card_set ?? null;
}

// SS18 - warn (never silently ship) on an editorially-imbalanced batch.
export function batchMixWarnings(selected) {
  const w = [];
  if (selected.length === 0) return w;

  const species = selected.map((s) => batchSpeciesOf(s.payload)).filter(Boolean);
  const sets = selected.map((s) => batchSetOf(s.payload)).filter(Boolean);
  const types = selected.map((s) => s.payload.content_type);
  const families = selected.map((s) => s.family);

  const allSame = (arr) => arr.length >= 2 && new Set(arr).size === 1;
  const mostly = (arr, frac = 0.7) => {
    if (arr.length < 3) return null;
    const counts = {};
    for (const v of arr) counts[v] = (counts[v] ?? 0) + 1;
    const [top, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return n / arr.length >= frac ? top : null;
  };

  const bigName = species.filter((s) => /^(charizard|pikachu)$/i.test(s));
  if (bigName.length >= 2 && bigName.length === species.length) {
    w.push("Every subject in today's batch is Charizard/Pikachu - vary the Pokemon.");
  }
  if (allSame(species)) w.push(`Every post is about the same Pokemon (${species[0]}) - vary the subject.`);

  // the same exact card headlining two different posts reads as a duplicate
  const headlines = selected.map((s) => {
    const p = s.payload;
    if (p.content_type === "market_snapshot") return p.market_snapshot?.biggest_gap_card ?? null;
    if (p.content_type === "pokemon_spotlight" || p.content_type === "set_spotlight") return null;
    const deal = Array.isArray(p.deal_data) ? p.deal_data[0] : p.deal_data;
    return deal?.card_name ?? null;
  }).filter(Boolean);
  const dupHeadline = headlines.find((h, i) => headlines.indexOf(h) !== i);
  if (dupHeadline) w.push(`"${dupHeadline}" headlines more than one post today - swap one for a different card.`);
  const mostlySet = mostly(sets);
  if (mostlySet) w.push(`Most of today's batch is the same set (${mostlySet}) - vary the set.`);
  if (allSame(types)) w.push(`Every post is the same content type (${types[0]}) - vary the format.`);
  if (allSame(families.map((f) => (f === "deal-of-day" || f === "just-found" || f === "market-snapshot" ? "deal-ish" : f)))) {
    // three deal-ish families in a row still reads as "all the same"
  }
  // composition: all A/B slide layout is fixed per family, so "same
  // composition" == "same family repeated", already covered by allSame(types).

  return w;
}

// The main entry point. Returns:
//   { selected: [{ family, payload, reasonSelected, cooldownKeys }],
//     rejected: [{ family, reason }],
//     considered: <n>, warnings: [<string>], generatedAt }
export function buildDailyBatch(rows, { history = [], now = Date.now() } = {}) {
  const selected = [];
  const rejected = [];
  const featuredNames = new Set(); // card names already headlining a selected post

  for (const family of DAILY_FAMILIES) {
    const res = familyCandidate(family, rows, now, featuredNames);
    if (res.skip) {
      rejected.push({ family, reason: res.skip });
      continue;
    }
    const payload = res.payload;

    const rightsReason = rightsGate(payload);
    if (rightsReason) {
      rejected.push({ family, reason: `rights gate: ${rightsReason}` });
      continue;
    }

    const cooldownKeys = buildCooldownKeys(payload);
    const cooldowns = checkCooldowns(cooldownKeys, history);
    if (isBlockedByCooldown(cooldowns)) {
      rejected.push({ family, reason: `cooldown: ${firstBlockingReason(cooldowns)}` });
      continue;
    }

    // within-batch de-dupe: don't select two families that resolve to the
    // same exact deal id, the same species, or the same set.
    const dealId = cooldownKeys.deal_cooldown_key;
    const speciesKey = batchSpeciesOf(payload);
    const setKey = batchSetOf(payload);
    const clash = selected.find((s) => {
      const otherDealId = s.cooldownKeys.deal_cooldown_key;
      return (
        (dealId && otherDealId && dealId === otherDealId) ||
        (speciesKey && batchSpeciesOf(s.payload) === speciesKey) ||
        (setKey && batchSetOf(s.payload) === setKey && s.family !== "market-snapshot" && family !== "market-snapshot")
      );
    });
    if (clash) {
      rejected.push({ family, reason: `within-batch duplicate: overlaps the already-selected ${clash.family} (same deal/Pokemon/set)` });
      continue;
    }

    selected.push({
      family,
      payload,
      reasonSelected: REASON_SELECTED[family](payload),
      cooldownKeys,
    });
    const hn = headlineNameOf(payload);
    if (hn) featuredNames.add(hn);
  }

  return {
    selected,
    rejected,
    considered: DAILY_FAMILIES.length,
    warnings: batchMixWarnings(selected),
    generatedAt: new Date(now).toISOString(),
  };
}
