// Phase 13E.1 - deterministic hashtag sets (docs/social-daily-workflow.md
// SS19). Small and fixed: a shared base + one type tag + at most one
// subject-specific tag, capped at 6 total. Never 30-tag stuffing, never
// EPN's not-approved tags (#eBayad, #Partner, #Endorsement - see
// docs/social-compliance-readiness.md SS7). Returned as its OWN array so
// the daily workflow can write it to a separate file the owner edits
// without touching the caption body.

const BASE = ["#PokemonCards", "#PokemonTCG", "#PokemonCollector"];

const PER_TYPE = {
  deal_of_day: "#PokemonDeals",
  just_found: "#PokemonDeals",
  best_deals_found_today: "#PokemonDeals",
  pokemon_spotlight: "#PokemonCommunity",
  set_spotlight: "#TCGCollector",
  market_snapshot: "#TCGMarket",
  market_mover: "#TCGMarket",
};

// A deterministic PascalCase hashtag from a display name - letters/digits
// only, first two words max, never the full messy catalogue string.
function tagFromName(name) {
  const words = String(name ?? "")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!words.length) return null;
  return "#" + words.map((w) => w[0].toUpperCase() + w.slice(1)).join("");
}

export function buildHashtags(payload) {
  const tags = [...BASE];
  const typeTag = PER_TYPE[payload.content_type];
  if (typeTag) tags.push(typeTag);

  let subject = null;
  if (payload.content_type === "pokemon_spotlight" || payload.content_type === "set_spotlight") {
    subject = tagFromName(payload.subject.display_name);
  } else if (payload.content_type === "market_snapshot") {
    subject = payload.market_snapshot?.biggest_gap_card
      ? tagFromName(String(payload.market_snapshot.biggest_gap_card).split(/[-(]/)[0])
      : null;
  } else {
    const deal = Array.isArray(payload.deal_data) ? payload.deal_data[0] : payload.deal_data;
    // just the leading identity word(s) of the card name, never the full
    // "Charizard - 11/108 (Prerelease)" mess
    if (deal?.card_name) subject = tagFromName(String(deal.card_name).split(/[-(]/)[0]);
  }
  if (subject && !tags.includes(subject)) tags.push(subject);

  return [...new Set(tags)].slice(0, 6);
}
