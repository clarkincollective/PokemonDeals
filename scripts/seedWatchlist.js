// Run with: node scripts/seedWatchlist.js
//
// Resolves a starter list of popular/high-value Pokémon cards against
// PokemonPriceTracker (once) and adds them to the "watchlist" table, so
// the scheduled refresh job knows what to scan. Safe to re-run - existing
// rows are updated in place rather than duplicated.
//
// This list is a reasonable starting point, not gospel: each name search
// returns the top match, which may not be the exact print you'd pick by
// hand. After running this, feel free to review/edit rows directly in the
// Supabase Table Editor (table: watchlist) - remove ones you don't want
// tracked, or add more by inserting rows with a justtcg_tcgplayer_id you
// look up the same way.

require("dotenv").config({ path: ".env.local" });
const { searchCard } = require("../lib/pokemonPriceTracker");
const { supabaseAdmin } = require("../lib/supabaseAdmin");

const STARTER_WATCHLIST = [
  "Charizard",
  "Pikachu",
  "Blastoise",
  "Venusaur",
  "Mewtwo",
  "Mew",
  "Umbreon",
  "Espeon",
  "Rayquaza",
  "Gyarados",
  "Lugia",
  "Ho-Oh",
  "Gengar",
  "Dragonite",
  "Sylveon",
  "Lucario",
  "Greninja",
  "Eevee",
  "Snorlax",
  "Zacian",
  "Zamazenta",
  "Giratina",
  "Palkia",
  "Dialga",
  "Reshiram",
  "Zekrom",
  "Kyogre",
  "Groudon",
  "Arceus",
  "Celebi",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// PokemonPriceTracker's Business tier allows 500 req/min - this is a
// generous safety margin, not a real constraint at this list size.
const DELAY_BETWEEN_REQUESTS_MS = 150;

async function main() {
  const db = supabaseAdmin();
  let added = 0;
  let failed = 0;

  for (const name of STARTER_WATCHLIST) {
    try {
      const card = await searchCard(name);
      const { error } = await db.from("watchlist").upsert(
        {
          name: card.name,
          set: card.setName,
          justtcg_tcgplayer_id: String(card.tcgPlayerId),
          justtcg_condition: "Near Mint",
          active: true,
          // Explicit even on conflict/update - upsert only touches columns
          // you list, so omitting these would silently leave a
          // previously-auto-added row as source='auto' forever.
          source: "manual",
          tier: "priority",
        },
        { onConflict: "name,set" }
      );

      if (error) throw error;
      console.log(`Added: ${card.name} (${card.setName})`);
      added++;
    } catch (err) {
      console.error(`Failed "${name}": ${err.message}`);
      failed++;
    }

    await sleep(DELAY_BETWEEN_REQUESTS_MS);
  }

  console.log(`\nDone. ${added} added/updated, ${failed} failed.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
