// Run with: node scripts/resolveJapanesePrints.js
//
// One-off follow-up to the English-card-matched-Japanese-listing bug fix:
// for each real card that was wrongly matched (now deactivated, see
// lib/dealMatching.js's fix), tries to find the ACTUAL correct Japanese
// print in PokemonPriceTracker's Japanese catalog and add it to the
// watchlist - but ONLY when a specific print can be identified with real
// confidence (matched by card number, not just Pokemon name) AND has a
// real price. No guessing: cards that can't be confidently resolved are
// skipped and logged, not added with a best-guess print.
require("dotenv").config({ path: ".env.local" });
const fs = require("fs");
const { searchCards } = require("../lib/pokemonPriceTracker");
const { supabaseAdmin } = require("../lib/supabaseAdmin");
const { coreTokens } = require("../lib/dealMatching");

const CANDIDATES_PATH = process.argv[2];
if (!CANDIDATES_PATH) {
  console.error("Usage: node scripts/resolveJapanesePrints.js <path to candidates JSON>");
  process.exit(1);
}
const candidates = JSON.parse(fs.readFileSync(CANDIDATES_PATH, "utf-8"));

const YEAR_LIKE = new Set(
  Array.from({ length: 30 }, (_, i) => 1998 + i) // 1998-2027
);

// Pulls the most-repeated plausible card number out of a card's real eBay
// listing titles - "NO. 215", "064/XY-P", "068" etc. Taking the mode
// across several titles filters out one-off noise (a listing count like
// "(4)", a price, a year).
function extractCardNumber(titles) {
  const counts = new Map();
  for (const title of titles) {
    const matches = title.matchAll(/\bno\.?\s*(\d{1,3})\b|\b(\d{1,3})\s*\/\s*[A-Za-z0-9-]+\b|\b(\d{1,3})\b/gi);
    for (const m of matches) {
      const n = parseInt(m[1] ?? m[2] ?? m[3], 10);
      if (!Number.isFinite(n) || n <= 0 || n > 999 || YEAR_LIKE.has(n)) continue;
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// The Pokemon's own name - the first capitalized word run, stripping
// possessive/owner prefixes ("Giovanni's Machamp" -> "Machamp",
// "Rocket's Sneasel" -> "Sneasel") since Japanese-catalog names don't
// always carry the same trainer-owner prefix wording.
function pokemonName(cardName) {
  const stripped = cardName.replace(/^[A-Z][a-z]+'s\s+/, "").replace(/\s*[-(].*$/, "");
  return stripped.trim() || cardName;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const db = supabaseAdmin();
  let resolved = 0;
  let noPricing = 0;
  let noNumberMatch = 0;
  let ambiguous = 0;
  let noCardNumber = 0;
  const results = [];

  for (const card of candidates) {
    const number = extractCardNumber(card.titles);
    if (number == null) {
      noCardNumber++;
      results.push({ ...card, outcome: "no_card_number_found" });
      continue;
    }

    const searchName = pokemonName(card.name);
    let searchResults;
    try {
      const { results: r } = await searchCards(searchName, { limit: 15, language: "japanese" });
      searchResults = r;
    } catch (err) {
      results.push({ ...card, outcome: `search_failed: ${err.message}` });
      await sleep(200);
      continue;
    }
    await sleep(200);

    // Card number alone is NOT enough - verified on a real case: "Umbreon"
    // (XY Promos, #256) matched "Umbreon VMAX" from a completely
    // unrelated modern "Start Deck 100" set purely because that set
    // ALSO happens to number a card 256 (that set runs past 400 cards).
    // Also requiring the set names to share a real token (same
    // coreTokens-based approach lib/dealMatching.js already uses to
    // disambiguate listings) catches exactly that case - "XY Promos" and
    // "Start Deck 100" share nothing, "XY Promos" and "XY-P: XY Promos"
    // share "xy". If the original set has no tokens to compare (rare -
    // an empty/missing set field), this can't safely resolve at all, so
    // it's treated as unresolvable rather than falling back to a
    // number-only guess.
    const originalSetTokens = coreTokens(card.set ?? "");
    const matches =
      originalSetTokens.length === 0
        ? []
        : searchResults.filter((c) => {
            if (!c.cardNumber) return false;
            const leading = c.cardNumber.match(/^0*(\d{1,3})/);
            if (!leading || parseInt(leading[1], 10) !== number) return false;
            const candidateSetTokens = coreTokens(c.setName ?? "");
            return originalSetTokens.some((t) => candidateSetTokens.includes(t));
          });

    if (matches.length === 0) {
      noNumberMatch++;
      results.push({ ...card, extractedNumber: number, outcome: "no_number_match", candidateCount: searchResults.length });
      continue;
    }

    const priced = matches.filter((c) => c.prices?.market != null);
    if (priced.length === 0) {
      noPricing++;
      results.push({ ...card, extractedNumber: number, outcome: "matched_but_no_pricing", matches: matches.map((m) => m.name + " | " + m.setName) });
      continue;
    }

    if (priced.length > 1) {
      // More than one differently-priced candidate shares this number -
      // could be real (different rarities of the same numbered card) or a
      // false positive. Don't guess which one - skip and log for review.
      ambiguous++;
      results.push({
        ...card,
        extractedNumber: number,
        outcome: "ambiguous",
        matches: priced.map((m) => `${m.name} | ${m.setName} | $${m.prices.market} | id=${m.tcgPlayerId}`),
      });
      continue;
    }

    const match = priced[0];
    const { error } = await db.from("watchlist").upsert(
      {
        name: match.name,
        set: match.setName,
        justtcg_tcgplayer_id: String(match.tcgPlayerId),
        justtcg_condition: "Near Mint",
        active: true,
        source: "manual",
        tier: "priority",
        language: "japanese",
      },
      { onConflict: "name,set,language" }
    );

    if (error) {
      results.push({ ...card, outcome: `insert_failed: ${error.message}` });
      continue;
    }

    resolved++;
    console.log(`RESOLVED: "${card.name}" (${card.set}) -> "${match.name}" (${match.setName}) $${match.prices.market}`);
    results.push({ ...card, extractedNumber: number, outcome: "resolved", resolvedTo: `${match.name} | ${match.setName} | $${match.prices.market}` });
  }

  fs.writeFileSync(CANDIDATES_PATH.replace(".json", ".results.json"), JSON.stringify(results, null, 2));

  console.log(`\nDone. ${candidates.length} candidates checked.`);
  console.log(`  resolved (added to Japanese watchlist): ${resolved}`);
  console.log(`  no card number extractable from titles: ${noCardNumber}`);
  console.log(`  card number extracted, no matching print found: ${noNumberMatch}`);
  console.log(`  matching print found, but no real price: ${noPricing}`);
  console.log(`  ambiguous (multiple differently-priced candidates): ${ambiguous}`);
  console.log(`\nFull results written to ${CANDIDATES_PATH.replace(".json", ".results.json")}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
