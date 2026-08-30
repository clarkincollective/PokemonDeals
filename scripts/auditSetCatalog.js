// node scripts/auditSetCatalog.js
// For each set that currently has a /sets/<slug> page (>= SET_MIN_LISTINGS
// active deals), report: card_catalog rows we hold for it, PPT's real
// card count for that set (via /sets + set card count if cheap), and
// whether the "every card" grid will render (>= SET_CATALOG_MIN_CARDS).
require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const { listSets } = require("../lib/pokemonPriceTracker");

const SET_MIN_LISTINGS = 3;
const SET_CATALOG_MIN_CARDS = 10;

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const numOf = (s) => {
  const m = String(s ?? "").match(/\d+/);
  return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
};

async function activeDealSetCounts() {
  const counts = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("deals")
      .select("watchlist:watchlist_id!inner (set, language)")
      .eq("is_active", true)
      .eq("watchlist.language", "english")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data || !data.length) break;
    for (const r of data) {
      const s = r.watchlist?.set;
      if (s) counts.set(s, (counts.get(s) || 0) + 1);
    }
    if (data.length < 1000) break;
  }
  return counts;
}

async function catalogSetCounts() {
  const counts = new Map();
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from("card_catalog")
      .select("set")
      .eq("language", "english")
      .range(from, from + 999);
    if (!data || !data.length) break;
    for (const r of data) counts.set(r.set, (counts.get(r.set) || 0) + 1);
    if (data.length < 1000) break;
  }
  return counts;
}

(async () => {
  const [dealCounts, catCounts, pptSets] = await Promise.all([
    activeDealSetCounts(),
    catalogSetCounts(),
    listSets("english").catch((e) => {
      console.log("listSets failed:", e.message);
      return [];
    }),
  ]);

  const pptByName = new Map();
  for (const s of pptSets) {
    // PPT set objects: { name, printedTotal / total / cardCount ... } - log one to see
    pptByName.set(s.name, s);
  }
  if (pptSets[0]) console.log("PPT set object keys:", Object.keys(pptSets[0]).join(", "), "\n");

  const pages = [...dealCounts.entries()]
    .filter(([, c]) => c >= SET_MIN_LISTINGS)
    .sort((a, b) => b[1] - a[1]);

  console.log(`${pages.length} sets currently have a /sets/<slug> page (>= ${SET_MIN_LISTINGS} active deals)\n`);
  console.log(
    "set".padEnd(42) +
      "deals".padStart(6) +
      "catalog".padStart(9) +
      "pptCards".padStart(9) +
      "  grid?"
  );
  console.log("-".repeat(78));

  const focus = ["XY - Flashfire", "Base Set", "SV: Prismatic Evolutions", "Jungle", "Skyridge", "SWSH01: Sword & Shield Base Set"];
  const rows = [];
  for (const [set, deals] of pages) {
    const cat = catCounts.get(set) || 0;
    const ppt = pptByName.get(set);
    const pptCards = ppt ? (ppt.printedTotal ?? ppt.total ?? ppt.cardCount ?? ppt.cardsCount ?? "?") : "(not in PPT /sets)";
    const grid = cat >= SET_CATALOG_MIN_CARDS ? "YES" : "no";
    rows.push({ set, deals, cat, pptCards, grid });
  }

  // print focus sets first, then the top 25 by deals
  const shown = new Set();
  for (const set of focus) {
    const r = rows.find((x) => x.set === set);
    if (r) {
      shown.add(set);
      console.log(
        r.set.padEnd(42) +
          String(r.deals).padStart(6) +
          String(r.cat).padStart(9) +
          String(r.pptCards).padStart(9) +
          "  " +
          r.grid +
          "   <-- focus"
      );
    } else {
      console.log(`${set.padEnd(42)}${"(no /sets page - <3 active deals or name mismatch)"}`);
    }
  }
  console.log("");
  for (const r of rows.slice(0, 30)) {
    if (shown.has(r.set)) continue;
    console.log(
      r.set.padEnd(42) +
        String(r.deals).padStart(6) +
        String(r.cat).padStart(9) +
        String(r.pptCards).padStart(9) +
        "  " +
        r.grid
    );
  }

  const withGrid = rows.filter((r) => r.grid === "YES").length;
  console.log(`\n${withGrid}/${rows.length} set pages will render the "every card" grid right now (rest below ${SET_CATALOG_MIN_CARDS}-card threshold = known backfill gap).`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
