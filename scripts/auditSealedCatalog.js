// node scripts/auditSealedCatalog.js
// sealed_catalog coverage vs PPT, for a fixed sample of sets, + a live
// image-resolve check. Read-only; a handful of paced PPT calls.
require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const { listSealedProductsForSet } = require("../lib/pokemonPriceTracker");

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SAMPLE = [
  "SWSH07: Evolving Skies",
  "SWSH08: Fusion Strike",
  "SV07: Stellar Crown",
  "SV: Prismatic Evolutions",
  "XY - Flashfire",
  "Base Set",
  "Jungle",
];

async function dbCount(set) {
  const { count } = await db
    .from("sealed_catalog")
    .select("tcgplayer_id", { count: "exact", head: true })
    .eq("set", set)
    .eq("language", "english");
  return count ?? 0;
}

async function main() {
  const totals = {};
  {
    const seen = new Set();
    for (let f = 0; ; f += 1000) {
      const { data } = await db.from("sealed_catalog").select("set").range(f, f + 999);
      if (!data || !data.length) break;
      data.forEach((r) => (totals[r.set] = (totals[r.set] || 0) + 1));
      if (data.length < 1000) break;
      void seen;
    }
  }
  const totalRows = Object.values(totals).reduce((a, b) => a + b, 0);
  console.log(`sealed_catalog: ${totalRows} products across ${Object.keys(totals).length} sets\n`);
  console.log("set".padEnd(28) + "DB".padStart(5) + "PPT".padStart(6) + "  verdict");
  console.log("-".repeat(52));

  for (const set of SAMPLE) {
    const db_ = await dbCount(set);
    let ppt = "?";
    let pptLoose = "?";
    try {
      const products = await listSealedProductsForSet(set, { language: "english" });
      pptLoose = products.length;
      // PPT ?setName= is a loose match - it can return products from
      // other sets. Count only those whose own setName is this set (which
      // is how sealedCatalogRecord files them).
      ppt = products.filter((p) => p.setName === set).length;
    } catch (e) {
      ppt = "ERR " + e.message.slice(0, 40);
    }
    const ok = typeof ppt === "number" && db_ === ppt;
    console.log(
      set.padEnd(28) +
        String(db_).padStart(5) +
        String(ppt).padStart(6) +
        `  ${ok ? "MATCH" : "DIFF"}` +
        (typeof pptLoose === "number" && pptLoose !== ppt ? `  (loose ?setName= returns ${pptLoose})` : "")
    );
  }

  // image resolve spot-check
  const { data: imgs } = await db
    .from("sealed_catalog")
    .select("name, image_url")
    .not("image_url", "is", null)
    .limit(6);
  console.log("\nimage resolve check:");
  for (const r of imgs || []) {
    try {
      const res = await fetch(r.image_url, { method: "GET" });
      console.log(`  ${res.status}  ${res.headers.get("content-type")}  ${r.name}`);
    } catch (e) {
      console.log(`  ERR ${e.message}  ${r.name}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
