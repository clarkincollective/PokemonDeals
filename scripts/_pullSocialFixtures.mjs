// Phase 13E.3 - pull a VARIED set of currently-valid social fixtures from
// production for template rendering + tests. Only rows that pass the
// unchanged P0.3 / social eligibility gates are kept. Writes
// tests/fixtures/social-deals.json.  Run: node scripts/_pullSocialFixtures.mjs
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

import { fetchActiveDealPool } from "../lib/social/db.mjs";
import { socialBinPool } from "../lib/social/candidates.mjs";
import { fetchMovementForCard } from "../lib/social/priceMovement.mjs";

const KEEP = [
  "id", "card_tcgplayer_id", "card_name", "card_set", "card_language",
  "is_graded", "grader", "grade", "listing_type", "marketplace",
  "total_price_usd", "total_price", "market_price", "discount_pct",
  "exact_verified_at", "first_seen_at", "last_seen_at", "auction_end_at",
];
const slim = (r) => Object.fromEntries(KEEP.map((k) => [k, r[k] ?? null]));

function pick(pool, label, fn) {
  const hit = pool.find(fn);
  return hit ? { label, row: slim(hit) } : null;
}

const { rows, error } = await fetchActiveDealPool({ poolLimit: 3000 });
if (error) { console.error("pool read failed:", error); process.exit(1); }
const now = Date.now();
const pool = socialBinPool(rows, now).sort((a, b) => b.discount_pct - a.discount_pct);
console.log(`socially-eligible BIN pool: ${pool.length}`);

const nameLen = (r) => String(r.card_name ?? "").length;
const picks = [
  pick(pool, "short-name raw, large saving", (r) => !r.is_graded && nameLen(r) <= 16 && r.discount_pct >= 0.3 && r.total_price_usd < 200),
  pick(pool, "long-name raw, modest saving", (r) => !r.is_graded && nameLen(r) >= 26 && r.discount_pct >= 0.12 && r.discount_pct <= 0.35),
  pick(pool, "graded slab, high price", (r) => r.is_graded && r.total_price_usd >= 250),
  pick(pool, "graded slab, mid price", (r) => r.is_graded && r.total_price_usd >= 60 && r.total_price_usd < 250),
  pick(pool, "raw, low price", (r) => !r.is_graded && r.total_price_usd < 40 && r.discount_pct >= 0.15),
  pick(pool, "raw, high price", (r) => !r.is_graded && r.total_price_usd >= 300),
  pick(pool, "raw, mid price mid saving", (r) => !r.is_graded && r.total_price_usd >= 60 && r.total_price_usd < 180 && r.discount_pct >= 0.18 && r.discount_pct <= 0.4),
  pick(pool, "non-US marketplace", (r) => r.marketplace && r.marketplace !== "EBAY_US"),
].filter(Boolean);

// de-dupe by id
const seen = new Set();
const deals = picks.filter((p) => (seen.has(p.row.id) ? false : (seen.add(p.row.id), true)));

// find up to 4 cards in the pool that have a real, confident movement
const moverCandidates = [];
for (const r of pool.filter((x) => /^\d+$/.test(String(x.card_tcgplayer_id ?? "")))) {
  if (moverCandidates.length >= 4) break;
  const mv = await fetchMovementForCard(r.card_tcgplayer_id);
  if (mv.ok) moverCandidates.push({ label: `mover ${mv.direction} ${Math.round(mv.pct * 100)}% / ${mv.windowLabel}`, row: slim(r), movement: mv });
}

// a spotlight group (deepest species) for the carousel
const bySpecies = {};
for (const r of pool) {
  const key = (r.card_name || "").split(" ")[0].toLowerCase();
  (bySpecies[key] ??= []).push(r);
}
const [spKey, spRows] = Object.entries(bySpecies).sort((a, b) => b[1].length - a[1].length)[0] ?? [null, []];
const carousel = spRows.slice(0, 4).map(slim);

mkdirSync("tests/fixtures", { recursive: true });
const out = {
  _note: "Phase 13E.3 real social fixtures - currently-valid deals that pass the P0.3 + social eligibility gates. Regenerate: node scripts/_pullSocialFixtures.mjs",
  pulled_at: new Date().toISOString(),
  pool_size: pool.length,
  deals,
  movers: moverCandidates,
  carousel: { species: spKey, deals: carousel },
};
writeFileSync("tests/fixtures/social-deals.json", JSON.stringify(out, null, 2) + "\n");
console.log(`wrote tests/fixtures/social-deals.json  (${deals.length} deals, ${moverCandidates.length} movers, carousel ${spKey} x${carousel.length})`);
for (const d of deals) console.log(`  - ${d.label}: ${d.row.card_name} (${d.row.card_set}) ${d.row.is_graded ? d.row.grader + " " + d.row.grade : "Raw"} $${d.row.total_price_usd} / ${Math.round(d.row.discount_pct * 100)}%`);
for (const m of movers_log()) console.log(m);
function movers_log() { return moverCandidates.map((m) => `  - ${m.label}: ${m.row.card_name}`); }
