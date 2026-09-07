#!/usr/bin/env node
// Phase 13E.5D - `npm run social:source`
//
// Freeze a REAL, eligible content snapshot from live production data. This
// snapshot is the DETERMINISTIC INPUT the render pipeline (social:video /
// social:daily) consumes - it decouples "what content exists right now"
// from "render it".
//
//   npm run social:source -- live          pull from the live DB (default)
//   npm run social:source -- from-fixture  wrap the committed test fixture
//                                          in the snapshot contract
//   npm run social:source -- show          print the current snapshot
//
// It:
//   * reads current production rows (one Supabase read; NO eBay calls)
//   * keeps only rows that pass the UNCHANGED social eligibility gates
//     (lib/social/eligibility.isSociallyEligiblePremium + P0.3 match
//      integrity via socialBinPool) - nothing here weakens deal quality
//   * freezes each row's real source timestamps (exact_verified_at,
//     first_seen_at, last_seen_at) and its source deal id / tcgplayer id
//   * NEVER fabricates inventory: 0 eligible -> an explicit empty snapshot
//     with a machine-readable reason. It NEVER overwrites tests/fixtures/.
//
// Output: .social-preview/source/live-snapshot.json

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

import { fetchActiveDealPool } from "../lib/social/db.mjs";
import { socialBinPool } from "../lib/social/candidates.mjs";
import { fetchMovementForCard } from "../lib/social/priceMovement.mjs";
import { hoursSinceExactVerification } from "../lib/dealQuality.js";
import { SOCIAL_FRESHNESS_MAX_AGE_HOURS, socialFreshnessState } from "../lib/social/eligibility.mjs";

const ROOT = process.cwd();
export const SNAPSHOT_DIR = path.join(ROOT, ".social-preview", "source");
export const SNAPSHOT_PATH = path.join(SNAPSHOT_DIR, "live-snapshot.json");
const FIXTURE_PATH = path.join(ROOT, "tests", "fixtures", "social-deals.json");

const KEEP = [
  "id", "card_tcgplayer_id", "card_name", "card_set", "card_language",
  "card_slug", "is_graded", "grader", "grade", "listing_type", "marketplace",
  "total_price_usd", "total_price", "market_price", "discount_pct",
  "exact_verified_at", "first_seen_at", "last_seen_at", "auction_end_at",
];
const slim = (r) => Object.fromEntries(KEEP.map((k) => [k, r[k] ?? null]));
const nameLen = (r) => String(r.card_name ?? "").length;

// Shared loader used by the render pipeline.
export function loadSourceSnapshot() {
  if (!existsSync(SNAPSHOT_PATH)) return null;
  try {
    return JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
  } catch {
    return null;
  }
}

function pickDeals(pool) {
  const pick = (label, fn) => {
    const hit = pool.find(fn);
    return hit ? { label, row: slim(hit) } : null;
  };
  const picks = [
    pick("short-name raw, large saving", (r) => !r.is_graded && nameLen(r) <= 16 && r.discount_pct >= 0.3 && r.total_price_usd < 200),
    pick("long-name raw, modest saving", (r) => !r.is_graded && nameLen(r) >= 26 && r.discount_pct >= 0.12 && r.discount_pct <= 0.35),
    pick("graded slab, high price", (r) => r.is_graded && r.total_price_usd >= 250),
    pick("graded slab, mid price", (r) => r.is_graded && r.total_price_usd >= 60 && r.total_price_usd < 250),
    pick("raw, low price", (r) => !r.is_graded && r.total_price_usd < 40 && r.discount_pct >= 0.15),
    pick("raw, high price", (r) => !r.is_graded && r.total_price_usd >= 300),
    pick("raw, mid price mid saving", (r) => !r.is_graded && r.total_price_usd >= 60 && r.total_price_usd < 180 && r.discount_pct >= 0.18 && r.discount_pct <= 0.4),
    pick("non-US marketplace", (r) => r.marketplace && r.marketplace !== "EBAY_US"),
  ].filter(Boolean);
  const seen = new Set();
  return picks.filter((p) => (seen.has(p.row.id) ? false : (seen.add(p.row.id), true)));
}

// AUTO-3 - THE ONE canonical live-source resolver. `social:source -- live`
// and `social:auto` both call this; there is no second deal-selection
// truth model. It performs ONE Supabase read (NO eBay Browse call), keeps
// only rows that pass the UNCHANGED social eligibility gates, freezes each
// row's real source timestamps, and NEVER fabricates inventory. 0
// eligible -> an explicit `empty:true` snapshot with a machine-readable
// reason. It never reads or writes a fixture.
export async function resolveLiveSource({ sourceCommit = null } = {}) {
  const snap = await buildLiveSnapshot();
  // stamp the live provenance the autonomous gate checks (§4/§7)
  snap.source_is_live = !snap.empty;
  snap.source_commit = sourceCommit;
  return snap;
}

async function buildLiveSnapshot() {
  const { rows, error } = await fetchActiveDealPool({ poolLimit: 3000 });
  if (error) throw new Error(`pool read failed: ${error}`);
  const now = Date.now();
  const pool = socialBinPool(rows, now).sort((a, b) => b.discount_pct - a.discount_pct);

  const allAges = rows
    .map((r) => hoursSinceExactVerification(r, now))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const freshest = allAges.length ? Number(allAges[0].toFixed(2)) : null;

  if (!pool.length) {
    // AUTO-3 - diagnose *why* nothing is eligible (fresh-but-not-BIN vs
    // stale vs never-verified), so the autonomous skip reason is accurate.
    const freshAll = rows.filter((r) => Number.isFinite(hoursSinceExactVerification(r, now)) && hoursSinceExactVerification(r, now) <= SOCIAL_FRESHNESS_MAX_AGE_HOURS);
    const freshBin = freshAll.filter((r) => String(r.listing_type ?? "").toUpperCase() !== "AUCTION");
    let why;
    if (freshAll.length === 0) {
      why = `0 active deals are exact-verified within the ${SOCIAL_FRESHNESS_MAX_AGE_HOURS}h social ceiling (freshest is ${freshest == null ? "null (never verified)" : freshest + "h"} ago). Upstream: app/api/verify-deals is behind.`;
    } else if (freshBin.length === 0) {
      why = `${freshAll.length} active deal(s) are fresh-verified within ${SOCIAL_FRESHNESS_MAX_AGE_HOURS}h, but ALL of them are AUCTIONs - the social Deal Drop pipeline is Buy-It-Now only, so 0 pass. No scanner/quota issue; the BIN inventory just isn't fresh.`;
    } else {
      why = `${freshBin.length} fresh BIN deal(s) exist but none pass the full premium social gate (match integrity / discount / canonical art / grade rules in lib/social/eligibility.isSociallyEligiblePremium).`;
    }
    return {
      source: "live",
      empty: true,
      empty_reason: why,
      captured_at: new Date(now).toISOString(),
      now: new Date(now).toISOString(),
      active_pool_size: rows.length,
      eligible_pool_size: 0,
      fresh_verified_count: freshAll.length,
      fresh_bin_count: freshBin.length,
      freshest_exact_verified_hours: freshest,
      deals: [],
      movers: [],
      carousel: null,
    };
  }

  const deals = pickDeals(pool).map((d) => ({
    ...d,
    freshness_state: socialFreshnessState(pool.find((r) => r.id === d.row.id) ?? {}, now),
    exact_verified_at: d.row.exact_verified_at,
  }));

  const movers = [];
  for (const r of pool.filter((x) => /^\d+$/.test(String(x.card_tcgplayer_id ?? "")))) {
    if (movers.length >= 4) break;
    const mv = await fetchMovementForCard(r.card_tcgplayer_id);
    if (mv.ok) movers.push({ label: `mover ${mv.direction} ${Math.round(mv.pct * 100)}% / ${mv.windowLabel}`, row: slim(r), movement: mv, freshness_state: "MARKET_DATA" });
  }

  const bySpecies = {};
  for (const r of pool) {
    const key = (r.card_name || "").split(" ")[0].toLowerCase();
    (bySpecies[key] ??= []).push(r);
  }
  const [spKey, spRows] = Object.entries(bySpecies).sort((a, b) => b[1].length - a[1].length)[0] ?? [null, []];
  const carousel = spRows.length >= 2 ? { species: spKey, deals: spRows.slice(0, 4).map(slim) } : null;

  return {
    source: "live",
    empty: false,
    captured_at: new Date(now).toISOString(),
    now: new Date(now).toISOString(),
    active_pool_size: rows.length,
    eligible_pool_size: pool.length,
    freshest_exact_verified_hours: freshest,
    source_deal_ids: deals.map((d) => d.row.id),
    source_tcgplayer_ids: [...new Set([...deals, ...movers].map((d) => d.row.card_tcgplayer_id).filter(Boolean))],
    deals,
    movers,
    carousel,
  };
}

function gitHead() {
  try {
    return execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
  } catch {
    return null;
  }
}

function fromFixture() {
  const fx = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
  return {
    source: "fixture:tests/fixtures/social-deals.json",
    source_is_live: false, // AUTO-3 - explicit: a fixture is NEVER a live source
    empty: !(fx.deals?.length),
    empty_reason: fx.deals?.length ? undefined : "the committed fixture has no deals",
    captured_at: fx.pulled_at, // the fixture's own freeze time - freshness is judged as-of THIS
    now: fx.pulled_at,
    active_pool_size: null,
    eligible_pool_size: fx.pool_size ?? null,
    note: "NON-LIVE. Wraps the committed test fixture so the render pipeline has a stable input. Do NOT treat as fresh live content.",
    source_deal_ids: (fx.deals ?? []).map((d) => d.row.id),
    deals: (fx.deals ?? []).map((d) => ({ ...d, exact_verified_at: d.row.exact_verified_at })),
    movers: fx.movers ?? [],
    carousel: fx.carousel ?? null,
  };
}

async function main() {
  const mode = (process.argv.slice(2).find((a) => !a.startsWith("-")) || "live").toLowerCase();
  if (mode === "show") {
    const s = loadSourceSnapshot();
    if (!s) return console.log("no snapshot at " + path.relative(ROOT, SNAPSHOT_PATH) + " - run: npm run social:source -- live");
    console.log(JSON.stringify(s, null, 2));
    return;
  }

  let snap;
  if (mode === "live") snap = await resolveLiveSource({ sourceCommit: gitHead() });
  else if (mode === "from-fixture") snap = fromFixture();
  else {
    console.error(`unknown mode "${mode}". one of: live, from-fixture, show`);
    process.exit(1);
  }

  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(snap, null, 2) + "\n", "utf8");

  console.log(`wrote ${path.relative(ROOT, SNAPSHOT_PATH)}`);
  console.log(`  source: ${snap.source}   captured_at: ${snap.captured_at}`);
  if (snap.empty) {
    console.log(`  EMPTY - no eligible content. reason:`);
    console.log(`    ${snap.empty_reason}`);
  } else {
    console.log(`  deals: ${snap.deals.length}   movers: ${snap.movers.length}   carousel: ${snap.carousel ? snap.carousel.deals.length + " (" + snap.carousel.species + ")" : "none"}`);
    for (const d of snap.deals) console.log(`    - ${d.label}: ${d.row.card_name} (${d.row.card_set}) $${d.row.total_price_usd} / ${Math.round(d.row.discount_pct * 100)}%  [${d.freshness_state ?? "?"}]  verified ${d.exact_verified_at}`);
  }
  console.log(`\n  NOTHING was published. This command only reads + freezes a content snapshot.`);
}

const isMain = (() => {
  try {
    return process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
  } catch {
    return false;
  }
})();
if (isMain) main().catch((e) => { console.error(e.message); process.exit(1); });
