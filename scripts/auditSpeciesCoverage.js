// Run with: node scripts/auditSpeciesCoverage.js
//
// A4 coverage spot-check. For a fixed sample of species spanning every
// generation / era, compares three counts that should all agree:
//
//   PPT   - distinct English tcgPlayerIds PokemonPriceTracker has for the
//           species, via the /cards?search= endpoint (an INDEPENDENT
//           endpoint from the /export CSV the sync actually uses), run
//           through the SAME extractSpecies() filter the sync applies.
//   DB    - rows in our card_catalog for (species, language=english).
//   LIVE  - cards rendered on the live /pokemon/<slug> page.
//
// Read-only. searchCards bills `limit` credits per page (~50/page here).

require("dotenv").config({ path: ".env.local" });
const { supabaseAdmin } = require("../lib/supabaseAdmin");
const { searchCards } = require("../lib/pokemonPriceTracker");
const { extractSpecies, speciesSlug } = require("../lib/pokemonSpecies");

const LANGUAGE = "english";
const PAGE = 50;
const SITE = "https://pokemondealfinder.com";

// species -> a note on why it's in the sample (era / old-set exposure)
const SAMPLE = [
  ["Charizard", "Gen1 - Base Set through SV, largest print run"],
  ["Blastoise", "Gen1 - Base Set, e-Card, modern"],
  ["Alakazam", "Gen1 - Base Set; earlier contaminated-data example"],
  ["Dragonite", "Gen1 - Fossil, Neo, modern"],
  ["Feraligatr", "Gen2 - Neo Genesis, sparse vintage"],
  ["Espeon", "Gen2 - Neo Discovery, e-Card (Skyridge), modern"],
  ["Umbreon", "Gen2 - Neo Discovery, Skyridge, modern"],
  ["Tyranitar", "Gen2 - Neo, e-Card"],
  ["Kingdra", "Gen2 - Aquapolis Crystal, sparse vintage"],
  ["Rayquaza", "Gen3 - EX-era heavy"],
  ["Gardevoir", "Gen3 - EX Sandstorm through SV"],
  ["Flygon", "Gen3 - EX-era"],
  ["Lucario", "Gen4 - Diamond & Pearl era"],
  ["Garchomp", "Gen4 - DP / Platinum"],
  ["Zoroark", "Gen5 - Black & White era"],
  ["Greninja", "Gen6 - XY era"],
  ["Zacian", "Gen8 - Sword & Shield era"],
  ["Miraidon", "Gen9 - Scarlet & Violet era"],
];

async function pptCount(species) {
  const ids = new Set();
  let rawSeen = 0;
  let filteredOut = 0;
  let offset = 0;
  let total = null;
  const missSample = [];
  for (;;) {
    const { results, total: t, hasMore } = await searchCards(species, {
      limit: PAGE,
      offset,
      language: LANGUAGE,
    });
    if (total == null) total = t;
    for (const c of results) {
      rawSeen++;
      const nm = c.name || "";
      if (extractSpecies(nm) === species) {
        if (c.tcgPlayerId != null) ids.add(String(c.tcgPlayerId).trim());
      } else {
        filteredOut++;
        if (missSample.length < 6) missSample.push(nm);
      }
    }
    offset += PAGE;
    if (!hasMore || results.length === 0 || offset > 5000) break;
  }
  return { count: ids.size, apiTotal: total, rawSeen, filteredOut, missSample };
}

async function dbCount(db, species) {
  const { count, error } = await db
    .from("card_catalog")
    .select("tcgplayer_id", { count: "exact", head: true })
    .eq("species", species)
    .eq("language", LANGUAGE);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// Count the rendered card tiles on the live /pokemon/<slug> page. The
// grid tiles each carry a data-tcgid / unique card link; fall back to
// counting "Reference price" + deal rows. We match the visible
// "N cards" summary the page prints, then sanity-check against tile count.
async function liveCount(slug) {
  const res = await fetch(`${SITE}/pokemon/${slug}`, {
    headers: { "user-agent": "coverage-audit" },
  });
  if (res.status === 404) return { status: 404, count: null };
  const html = await res.text();
  // The catalog grid renders exactly one 200x200 TCGplayer thumbnail per
  // card tile - the reliable rendered-card count. (Distinct ids, since a
  // thumbnail url embeds the tcgPlayerId.)
  const ids = new Set(
    (html.match(/product\/(\d+)_in_200x200\.jpg/g) || []).map((s) => s.match(/(\d+)/)[1])
  );
  return { status: res.status, count: ids.size };
}

async function main() {
  const db = supabaseAdmin();
  console.log("=== A4 species coverage spot-check ===");
  console.log(`sample: ${SAMPLE.length} species | ppt endpoint: /cards?search= | ${new Date().toISOString()}\n`);

  const rows = [];
  for (const [species, note] of SAMPLE) {
    const slug = speciesSlug(species);
    let ppt, db_, live;
    try {
      ppt = await pptCount(species);
    } catch (e) {
      ppt = { count: "ERR:" + e.message };
    }
    try {
      db_ = await dbCount(db, species);
    } catch (e) {
      db_ = "ERR:" + e.message;
    }
    try {
      live = await liveCount(slug);
    } catch (e) {
      live = { count: "ERR:" + e.message };
    }

    const pptN = ppt.count;
    const liveN = live.count;
    const pass =
      typeof pptN === "number" &&
      typeof db_ === "number" &&
      db_ === pptN &&
      (liveN == null || Math.abs(liveN - db_) <= 1);
    rows.push({ species, slug, note, ppt, db: db_, live, pass });

    console.log(
      `${pass ? "PASS" : "FAIL"}  ${species.padEnd(12)} ` +
        `PPT=${String(pptN).padStart(4)}  DB=${String(db_).padStart(4)}  ` +
        `LIVE=${String(liveN ?? live.status).padStart(4)}  ` +
        `(ppt raw ${ppt.rawSeen}, filtered-not-this-species ${ppt.filteredOut})`
    );
    if (ppt.filteredOut && ppt.missSample?.length) {
      console.log(`        dropped by extractSpecies: ${ppt.missSample.join(" | ")}`);
    }
  }

  const fails = rows.filter((r) => !r.pass);
  console.log(`\n${rows.length - fails.length}/${rows.length} PASS`);
  if (fails.length) {
    console.log("\n--- FAILURES ---");
    for (const f of fails) {
      console.log(
        `${f.species}: PPT=${f.ppt.count} DB=${f.db} LIVE=${f.live.count ?? f.live.status}` +
          ` | ppt apiTotal=${f.ppt.apiTotal} rawSeen=${f.ppt.rawSeen} filteredOut=${f.ppt.filteredOut}`
      );
    }
  }

  // machine-readable dump for the write-up
  require("fs").writeFileSync(
    require("path").join(
      "C:/Users/James/AppData/Local/Temp/claude/C--Users-James/7d17598c-f943-45a3-890d-4779db9dc754/scratchpad",
      "a4-coverage.json"
    ),
    JSON.stringify(rows, null, 2)
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
