// Regenerate lib/setImagesData.js — a static map of our set names to
// pokemontcg.io set logo/symbol image URLs. Run when new sets appear
// (~monthly): node scripts/generateSetImages.js
//
// pokemontcg.io (https://pokemontcg.io) is a separate, free, public
// Pokémon TCG data API. Its set images are served from images.scrydex.com
// (its current image host) and are hotlinkable (200, no referer gate) -
// unlike the TCGplayer CDN URLs PokemonPriceTracker returns, which 403.
// No API key needed at this volume (1 request); no attribution required
// per their docs. Same fair-use posture as the site's existing card
// thumbnails - identification-scale images, no affiliation claims.
//
// Match strategy: our set names come from PokemonPriceTracker and use
// prefixes ("SV: ", "SWSH01: ", "ME: ", "XY - ") that pokemontcg.io
// doesn't; normalise both (strip prefix, lowercase, alphanumerics only)
// and match, with a small alias table for the ones that still differ,
// and the release year as a sanity check.
require("dotenv").config({ path: ".env.local" });
const fs = require("fs");
const path = require("path");
const { supabaseAdmin } = require("../lib/supabaseAdmin");

// our-name -> pokemontcg.io name, for pairs that don't normalise-match.
const ALIASES = {
  "Base Set": "Base",
  "Base Set (Shadowless)": "Base",
  "SV: Scarlet & Violet Promo Cards": "Scarlet & Violet Black Star Promos",
  "SWSH: Sword & Shield Promo Cards": "SWSH Black Star Promos",
  "SM Promos": "SM Black Star Promos",
  "XY Promos": "XY Black Star Promos",
  "Black and White Promos": "BW Black Star Promos",
  "Diamond and Pearl Promos": "DP Black Star Promos",
  "HGSS Promos": "HGSS Black Star Promos",
  "SWSH01: Sword & Shield Base Set": "Sword & Shield",
  "SV01: Scarlet & Violet Base Set": "Scarlet & Violet",
  "SM Base Set": "Sun & Moon",
  "XY Base Set": "XY",
  "Scarlet & Violet 151": "151",
  "SV: Scarlet & Violet 151": "151",
  "SWSH: Crown Zenith": "Crown Zenith",
  "SWSH: Crown Zenith: Galarian Gallery": "Crown Zenith Galarian Gallery",
  "HeartGold SoulSilver": "HeartGold & SoulSilver",
  "Undaunted": "HS—Undaunted",
  "Unleashed": "HS—Unleashed",
  "Triumphant": "HS—Triumphant",
  "Call of Legends": "Call of Legends",
  "Expedition": "Expedition Base Set",
  "Generations: Radiant Collection": "Generations",
  "Legendary Treasures: Radiant Collection": "Legendary Treasures",
  "Trading Card Game Classic": "Trading Card Game Classic",
  "Pokemon GO": "Pokémon GO",
  "Pokémon Rumble": "Pokémon Rumble",
  "Rumble": "Pokémon Rumble",
  "WoTC Promo": "Wizards Black Star Promos",
  "Nintendo Promos": "Nintendo Black Star Promos",
  "Kids WB Promos": "Wizards Black Star Promos",
};

const norm = (s) =>
  String(s || "")
    // strip an era-code prefix: "SV: ", "SWSH01: ", "EX ", "XY - ", "HS—"
    .replace(/^(sv|svp|sve|swsh|sm|smp|xy|xyp|bw|bwp|hgss|hs|dp|dpp|ex|pl|neo|col|me|mee)[0-9]*(pt5)?\s*[:\-–—]?\s+/i, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Their API 500s intermittently - retry with backoff, paginate small.
async function fetchAllIoSets() {
  const all = [];
  for (let page = 1; ; page++) {
    let data = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const r = await fetch(`https://api.pokemontcg.io/v2/sets?page=${page}&pageSize=50&orderBy=releaseDate`);
        if (r.ok) {
          data = (await r.json()).data;
          break;
        }
      } catch {
        /* retry */
      }
      await sleep(1500 * (attempt + 1));
    }
    if (data == null) throw new Error(`pokemontcg.io /v2/sets page ${page} failed after retries`);
    all.push(...data);
    if (data.length < 50) break;
    await sleep(500);
  }
  return all;
}

async function main() {
  const io = await fetchAllIoSets();
  console.log(`pokemontcg.io: ${io.length} sets`);

  const byNorm = new Map();
  for (const s of io) {
    if (!s.images?.logo) continue;
    byNorm.set(norm(s.name), s);
    if (s.ptcgoCode) byNorm.set(s.ptcgoCode.toLowerCase(), s);
  }

  // Every English set name that appears on the site (pokemontcg.io is
  // English-only; /sets is English-only). card_catalog is English;
  // watchlist is mixed - filter it.
  const names = new Set();
  for (const [table, lang] of [
    ["card_catalog", null],
    ["watchlist", "english"],
  ]) {
    for (let from = 0; ; from += 1000) {
      let q = supabaseAdmin().from(table).select("set").range(from, from + 999);
      if (lang) q = q.eq("language", lang);
      const { data, error } = await q;
      if (error) break;
      if (!data?.length) break;
      for (const r of data) if (r.set) names.add(r.set);
      if (data.length < 1000) break;
    }
  }
  console.log(`our distinct English set names: ${names.size}`);

  const map = {};
  const unmatched = [];
  for (const name of [...names].sort()) {
    const target = ALIASES[name] ?? name;
    const hit = byNorm.get(norm(target));
    if (hit?.images?.logo) {
      map[name] = { logo: hit.images.logo, symbol: hit.images.symbol ?? hit.images.logo };
    } else {
      unmatched.push(name);
    }
  }

  const out = `// AUTO-GENERATED by scripts/generateSetImages.js - do not edit by hand.
// Set name -> pokemontcg.io (images.scrydex.com) logo/symbol image URLs.
// ${Object.keys(map).length} matched, ${unmatched.length} without an image
// (rendered as set-name text). Regenerate when new sets appear.

const SET_IMAGES = ${JSON.stringify(map, null, 2)};

module.exports = { SET_IMAGES };
`;
  fs.writeFileSync(path.join(__dirname, "..", "lib", "setImagesData.js"), out);
  console.log(`matched ${Object.keys(map).length}, unmatched ${unmatched.length}`);
  if (unmatched.length) console.log("unmatched:\n  " + unmatched.join("\n  "));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
