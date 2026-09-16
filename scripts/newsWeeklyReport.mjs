#!/usr/bin/env node
// Weekly market report generator for /news.
//
//   npm run news:weekly            # write the artifact
//   npm run news:weekly -- --dry   # print what it would write, write nothing
//
// Emits a FIXED, DATED artifact to lib/newsReports/<id>.js. The /news page
// renders that artifact and never reads the database, so a published
// figure can never drift from the analysis it came from - the same
// discipline as lib/studies/referencePriceChange30d.js.
//
// Every number here is first-party: the catalogue's own reference prices
// and the local price_history table. There is NO provider request, no eBay
// call and nothing inferred. Movement is decided by lib/social/
// priceMovement.mjs, the same fail-closed gate the card pages and the
// social Market Mover creative use: a printing qualifies only with >= 6
// real observations, a confident trend window, a change of >= 8%, and no
// source disagreement. A card that cannot clear that bar is simply not in
// the report - the report shrinks, it never gets filled in.
//
// READ-ONLY: this script performs SELECTs only.

import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { fetchMovementForCard, MOVER_MIN_ABS_CHANGE_PCT, MOVER_MIN_POINTS } from "../lib/social/priceMovement.mjs";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry");
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

// How many of the best-priced imaged printings to consider, and how many
// price_history reads we are willing to spend. Both bounded so a run is
// predictable; the report states them so a reader knows the sample.
const CANDIDATES = Number(arg("candidates", 260));
const MAX_PROBES = Number(arg("probes", 190));
const MAX_MOVERS = Number(arg("movers", 10));
const MIN_PRICE_USD = 15;

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const today = () => new Date().toISOString().slice(0, 10);
const round1 = (n) => Math.round(Number(n) * 10) / 10;

async function main() {
  const date = arg("date", today());

  // 1. Candidates: imaged catalogue printings with a real reference price.
  //    Highest reference first - a move on a $2 card is noise.
  const { data: rows, error } = await db
    .from("card_catalog")
    .select("tcgplayer_id, name, set, market_price")
    .gt("market_price", MIN_PRICE_USD)
    .not("image_url", "is", null)
    .order("market_price", { ascending: false })
    .limit(CANDIDATES);
  if (error) throw new Error(`card_catalog read failed: ${error.message}`);

  const candidates = (rows ?? []).filter((r) => /^\d+$/.test(String(r.tcgplayer_id ?? "").trim()));
  console.error(`candidates: ${candidates.length} (reference price > $${MIN_PRICE_USD}, imaged)`);

  // 2. Probe each one's real price history through the fail-closed gate.
  const movers = [];
  const reasons = new Map();
  let probed = 0;
  for (const r of candidates) {
    if (probed >= MAX_PROBES) break;
    probed += 1;
    const mv = await fetchMovementForCard(r.tcgplayer_id, { db });
    if (!mv.ok) {
      const key = String(mv.reason ?? "unknown").replace(/\d+/g, "N").slice(0, 70);
      reasons.set(key, (reasons.get(key) ?? 0) + 1);
      continue;
    }
    const s = Array.isArray(mv.series) ? mv.series : [];
    const first = s.length ? Number(s[0].v) : null;
    const last = s.length ? Number(s[s.length - 1].v) : null;
    movers.push({
      tcgplayerId: String(r.tcgplayer_id).trim(),
      name: r.name ?? null,
      set: r.set ?? null,
      pct: round1(mv.pct * 100),
      direction: mv.direction,
      windowLabel: mv.windowLabel,
      fromUsd: first != null ? round1(first) : null,
      toUsd: last != null ? round1(last) : null,
      points: s.length,
      confidence: mv.confidence ?? null,
    });
    if (probed % 25 === 0) console.error(`  probed ${probed}, qualified ${movers.length}`);
  }

  console.error(`probed ${probed}, qualified ${movers.length}`);
  for (const [why, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    console.error(`  withheld x${n}: ${why}`);
  }

  // 3. Biggest absolute movers, risers and fallers kept separate so the
  //    page never implies a one-way market.
  const ranked = [...movers].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, MAX_MOVERS);
  const up = ranked.filter((m) => m.direction === "up");
  const down = ranked.filter((m) => m.direction === "down");

  // 4. Catalogue scale, for context only.
  const { count: catalogueCount } = await db.from("card_catalog").select("tcgplayer_id", { count: "exact", head: true });

  const id = `market-movers-${date}`;
  const report = {
    version: `${date}.1`,
    id,
    date,
    generatedAt: new Date().toISOString(),
    method: {
      source: "This site's own catalogue reference prices and local price_history table. No provider request, no eBay call.",
      gate: `lib/social/priceMovement: >= ${MOVER_MIN_POINTS} real observations, a confident trend window, |change| >= ${MOVER_MIN_ABS_CHANGE_PCT}%, and no source disagreement. Anything else is withheld.`,
      sample: `The ${probed} highest-referenced imaged printings in the catalogue (reference price above $${MIN_PRICE_USD}) were probed.`,
    },
    sample: { candidates: candidates.length, probed, qualified: movers.length, catalogueCount: catalogueCount ?? null },
    movers: { up, down },
  };

  const body = `// GENERATED by scripts/newsWeeklyReport.mjs - do not edit by hand.
// A FIXED, DATED SNAPSHOT for /news/${id}. Every figure is first-party
// (catalogue reference prices + the local price_history table) and passed
// the fail-closed movement gate in lib/social/priceMovement.mjs. These
// numbers describe ${date} and are never refreshed at runtime.

export const REPORT = Object.freeze(${JSON.stringify(report, null, 2)});
`;

  if (DRY) {
    console.error("--dry: nothing written\\n");
    console.log(body);
    return;
  }
  const dir = join("lib", "newsReports");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${id.replace(/-(\d{4})-(\d{2})-(\d{2})$/, "$1$2$3").replace(/-/g, "")}.js`);
  writeFileSync(file, body, "utf8");
  console.error(`wrote ${file}: ${up.length} up, ${down.length} down, from ${probed} probed`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
