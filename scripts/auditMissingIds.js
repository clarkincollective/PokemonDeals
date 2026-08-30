// node scripts/auditMissingIds.js <Species>
// Confirms the PPT-vs-DB gap is REAL cards, not search phantoms:
// lists tcgPlayerIds searchCards returns for the species, subtracts the
// ones present in card_catalog, and verifies a sample of the missing
// ones directly via /cards?tcgPlayerId= (real English card? which set?).
require("dotenv").config({ path: ".env.local" });
const { supabaseAdmin } = require("../lib/supabaseAdmin");
const { searchCards } = require("../lib/pokemonPriceTracker");
const { extractSpecies } = require("../lib/pokemonSpecies");

const species = process.argv[2] || "Charizard";
const KEY = process.env.POKEMONPRICETRACKER_API_KEY;

async function pptCard(id) {
  const u = new URL("https://www.pokemonpricetracker.com/api/v2/cards");
  u.searchParams.set("tcgPlayerId", id);
  u.searchParams.set("language", "english");
  const r = await fetch(u, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!r.ok) return { id, err: r.status };
  const d = (await r.json()).data;
  if (!d) return { id, err: "no data (not english?)" };
  return { id, name: d.name, set: d.setName || d.set?.name, number: d.cardNumber };
}

(async () => {
  const db = supabaseAdmin();
  const ids = new Map(); // id -> name
  let offset = 0;
  for (;;) {
    const { results, hasMore } = await searchCards(species, { limit: 50, offset, language: "english" });
    for (const c of results) {
      if (extractSpecies(c.name || "") === species && c.tcgPlayerId != null) {
        ids.set(String(c.tcgPlayerId).trim(), c.name);
      }
    }
    offset += 50;
    if (!hasMore || results.length === 0 || offset > 5000) break;
  }

  const allIds = [...ids.keys()];
  const { data: have } = await db
    .from("card_catalog")
    .select("tcgplayer_id")
    .in("tcgplayer_id", allIds);
  const haveSet = new Set((have || []).map((r) => String(r.tcgplayer_id)));
  const missing = allIds.filter((id) => !haveSet.has(id));

  // also: what species value do the rows we DO have carry?
  const { data: haveRows } = await db
    .from("card_catalog")
    .select("tcgplayer_id, name, set, species")
    .in("tcgplayer_id", allIds.slice(0, 200));
  const wrongSpecies = (haveRows || []).filter((r) => r.species !== species);

  console.log(`${species}: PPT distinct ids ${allIds.length} | in card_catalog ${haveSet.size} | MISSING ${missing.length}`);
  console.log(`rows present but species!="${species}": ${wrongSpecies.length}`, wrongSpecies.slice(0, 8).map((r) => `${r.name} [${r.species}]`));

  const sample = missing.slice(0, 10);
  console.log(`\nverifying ${sample.length} missing ids directly against PPT /cards?tcgPlayerId=:`);
  for (const id of sample) {
    const v = await pptCard(id);
    console.log(`  ${id}  searchName="${ids.get(id)}"  ->  ${v.err ? "ERR " + v.err : `${v.name}  |  ${v.set}  #${v.number}`}`);
  }

  // era distribution of the missing set
  const missingByGuess = {};
  for (const id of missing) {
    const nm = ids.get(id) || "";
    missingByGuess[nm] = (missingByGuess[nm] || 0) + 1;
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
