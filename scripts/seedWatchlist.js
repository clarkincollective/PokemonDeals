// Run with: node scripts/seedWatchlist.js
//
// Resolves a starter list of popular/high-value Pokémon cards against
// JustTCG (once) and adds them to the "watchlist" table, so the scheduled
// refresh job knows what to scan. Safe to re-run - existing rows are
// updated in place rather than duplicated.
//
// This list is a reasonable starting point, not gospel: each name search
// returns JustTCG's top match, which may not be the exact print you'd
// pick by hand. After running this, feel free to review/edit rows
// directly in the Supabase Table Editor (table: watchlist) - remove ones
// you don't want tracked, or add more by inserting rows with a
// justtcg_tcgplayer_id you look up the same way.

require("dotenv").config({ path: ".env.local" });
const { searchCard } = require("../lib/justtcg");
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

// JustTCG's free tier caps requests at 10/minute - space these out so a
// full run of the starter list doesn't get rate-limited partway through.
const DELAY_BETWEEN_REQUESTS_MS = 6500;

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
          set: card.set_name ?? card.set,
          justtcg_tcgplayer_id: String(card.tcgplayerId),
          justtcg_condition: "Near Mint",
          active: true,
        },
        { onConflict: "name,set" }
      );

      if (error) throw error;
      console.log(`Added: ${card.name} (${card.set_name ?? card.set})`);
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
