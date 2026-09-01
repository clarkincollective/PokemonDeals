// Run with: node scripts/generateSpeciesFacts.js
//
// One-off generator for lib/pokemonSpeciesFacts.js - static, committed
// species context (types + evolution) for the /pokemon/[slug] template
// (SEO Phase 2A). Dex number, generation and region are already derivable
// from lib/pokemonSpecies.js's dex-ordered SPECIES list, so this file
// only carries the two facts that aren't: TYPES and the EVOLUTION line.
//
// Keyed by the exact English display name in lib/pokemonSpeciesData.js
// (PokeAPI names[].name where language is "en") so speciesFacts() can look
// it up with no slug round-trip. No API key, no DB, no runtime dependency
// - the output is plain data, re-run only when a new generation ships.

const fs = require("fs");
const path = require("path");
const { SPECIES } = require("../lib/pokemonSpeciesData");

const LIST_URL = "https://pokeapi.co/api/v2/pokemon-species?limit=100000&offset=0";
const CONCURRENCY = 20;
const OUT_PATH = path.join(__dirname, "..", "lib", "pokemonSpeciesFacts.js");

async function getJson(url) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return await res.json();
    } catch (err) {
      if (attempt === 5) throw err;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

async function mapPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, run));
  return results;
}

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

async function main() {
  console.log("Fetching species index...");
  const { results: index } = await getJson(LIST_URL);
  console.log(`  ${index.length} species entries`);

  // 1. species resource -> { enName, slug, evolvesFromSlug, chainUrl }
  let done = 0;
  const speciesRows = await mapPool(
    index,
    async (entry) => {
      const d = await getJson(entry.url);
      const en = d.names.find((n) => n.language.name === "en");
      done++;
      if (done % 150 === 0) console.log(`  species ${done}/${index.length}`);
      return {
        id: d.id,
        enName: en ? en.name : d.name,
        slug: d.name,
        evolvesFromSlug: d.evolves_from_species ? d.evolves_from_species.name : null,
        chainUrl: d.evolution_chain ? d.evolution_chain.url : null,
        defaultVarietyUrl:
          (d.varieties.find((v) => v.is_default) ?? d.varieties[0])?.pokemon?.url ?? null,
      };
    },
    CONCURRENCY
  );

  const slugToEn = new Map(speciesRows.map((r) => [r.slug, r.enName]));

  // 2. default variety -> types
  done = 0;
  const typesBySlug = new Map();
  await mapPool(
    speciesRows,
    async (r) => {
      if (!r.defaultVarietyUrl) return;
      try {
        const p = await getJson(r.defaultVarietyUrl);
        const types = (p.types ?? [])
          .sort((a, b) => a.slot - b.slot)
          .map((t) => cap(t.type.name));
        if (types.length) typesBySlug.set(r.slug, types);
      } catch {
        /* leave types unknown for this species */
      }
      done++;
      if (done % 150 === 0) console.log(`  types ${done}/${speciesRows.length}`);
    },
    CONCURRENCY
  );

  // 3. evolution chains (deduped) -> parent -> [children] slug map
  const chainUrls = [...new Set(speciesRows.map((r) => r.chainUrl).filter(Boolean))];
  console.log(`  ${chainUrls.length} evolution chains`);
  const nextBySlug = new Map(); // slug -> Set(child slug)
  done = 0;
  await mapPool(
    chainUrls,
    async (url) => {
      try {
        const c = await getJson(url);
        const walk = (node) => {
          for (const child of node.evolves_to ?? []) {
            if (!nextBySlug.has(node.species.name)) nextBySlug.set(node.species.name, new Set());
            nextBySlug.get(node.species.name).add(child.species.name);
            walk(child);
          }
        };
        walk(c.chain);
      } catch {
        /* skip this chain */
      }
      done++;
      if (done % 100 === 0) console.log(`  chains ${done}/${chainUrls.length}`);
    },
    CONCURRENCY
  );

  // 4. assemble, keyed by en display name, only for names we actually use
  const known = new Set(SPECIES);
  const facts = {};
  let withTypes = 0;
  let withEvo = 0;
  for (const r of speciesRows) {
    if (!known.has(r.enName)) continue;
    const entry = {};
    const types = typesBySlug.get(r.slug);
    if (types && types.length) {
      entry.types = types;
      withTypes++;
    }
    const from = r.evolvesFromSlug ? slugToEn.get(r.evolvesFromSlug) : null;
    if (from) entry.evolvesFrom = from;
    const toSlugs = nextBySlug.get(r.slug);
    const to = toSlugs
      ? [...toSlugs].map((s) => slugToEn.get(s)).filter(Boolean).sort()
      : [];
    if (to.length) entry.evolvesTo = to;
    if (from || to.length) withEvo++;
    if (Object.keys(entry).length) facts[r.enName] = entry;
  }

  const missing = SPECIES.filter((n) => !facts[n]);
  console.log(
    `\n  ${Object.keys(facts).length}/${SPECIES.length} species with facts ` +
      `(${withTypes} typed, ${withEvo} with an evolution relation)`
  );
  if (missing.length) console.log(`  no facts for: ${missing.slice(0, 40).join(", ")}${missing.length > 40 ? " ..." : ""}`);

  const ordered = SPECIES.filter((n) => facts[n]);
  const body =
    "// AUTO-GENERATED by scripts/generateSpeciesFacts.js - do not edit by hand.\n" +
    "// Static species context (types + evolution) for /pokemon/[slug].\n" +
    "// Source: PokeAPI (https://pokeapi.co/). Dex number / generation / region\n" +
    "// come from lib/pokemonSpecies.js, not here. No runtime dependency.\n" +
    `// ${ordered.length} species as of ${new Date().toISOString().slice(0, 10)}.\n\n` +
    "const SPECIES_FACTS = {\n" +
    ordered
      .map((n) => `  ${JSON.stringify(n)}: ${JSON.stringify(facts[n])},`)
      .join("\n") +
    "\n};\n\nmodule.exports = { SPECIES_FACTS };\n";

  fs.writeFileSync(OUT_PATH, body);
  console.log(`\nWrote ${ordered.length} species to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
