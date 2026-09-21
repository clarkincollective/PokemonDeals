#!/usr/bin/env node
// LISTING-DISAPPEARANCE AGGREGATE (2026-09-21). READ-ONLY on the database.
//
//   node scripts/seo/buildSurvivalAggregate.mjs            # print
//   node scripts/seo/buildSurvivalAggregate.mjs --write    # freeze to lib/studies/
//
// Produces the frozen aggregate for a possible study. It does NOT publish
// anything. Like the reference-price study, the output is a small, fixed,
// dated snapshot containing aggregate figures only - no listing ids, no
// seller fields, no URLs.
//
// THE METHOD, and why the obvious version of it is wrong.
//
// A first probe found 81.5 % of ended listings were seen exactly once -
// discovered and never re-confirmed - and concluded no survival figure was
// publishable, because "not re-seen" might just mean "we never looked
// again".
//
// That is resolvable from the data itself. Every row carries a
// watchlist_id (the search that found it) and a last_seen_at (a time we
// demonstrably ran that search). So for a listing discovered at time T on
// watchlist W, if ANY row on W has a last_seen_at later than T, we know we
// ran that search again and did not find this listing. Its absence is then
// evidence about the listing, not about our coverage.
//
// Rows where no later scan of their own search exists are EXCLUDED, not
// assumed gone.
//
// WHAT THIS CAN AND CANNOT SAY
//   CAN: "of the below-market listings we found and could re-check, N %
//         were no longer in that search the next time we ran it."
//   CANNOT: that they sold. A listing leaves a search when it sells, ends,
//         is cancelled, is relisted, or simply changes price enough to
//         fall outside the below-market filter. We observe absence.
//   CANNOT: a sell-through rate, a time-to-sale, or a market size.
import { existsSync, writeFileSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const DAY = 86_400_000;
const SAME_SCAN_MS = 60_000; // two stamps from one pass differ by ms
const round1 = (n) => Math.round(n * 10) / 10;
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const share = (n, d) => (d ? round1((n / d) * 100) : null);

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("deals")
    .select("id, watchlist_id, first_seen_at, last_seen_at, is_active, disqualified_reason, market_price")
    .order("id", { ascending: true })
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  rows.push(...(data ?? []));
  if ((data?.length ?? 0) < 1000) break;
}

const parsed = rows.filter((r) => r.first_seen_at && r.last_seen_at && r.watchlist_id != null);
const firstDay = new Date(Math.min(...parsed.map((r) => Date.parse(r.first_seen_at)))).toISOString().slice(0, 10);
const lastDay = new Date(Math.max(...parsed.map((r) => Date.parse(r.last_seen_at)))).toISOString().slice(0, 10);

// Times we demonstrably ran each search.
const scans = new Map();
for (const r of parsed) {
  const t = Date.parse(r.last_seen_at);
  if (!scans.has(r.watchlist_id)) scans.set(r.watchlist_id, []);
  scans.get(r.watchlist_id).push(t);
}
for (const v of scans.values()) v.sort((a, b) => a - b);

const span = (r) => Date.parse(r.last_seen_at) - Date.parse(r.first_seen_at);
const nextScanAfter = (r) => {
  const t = Date.parse(r.first_seen_at);
  const later = (scans.get(r.watchlist_id) ?? []).filter((x) => x > t + SAME_SCAN_MS);
  return later.length ? Math.min(...later) : null;
};

// Exclusions, each for a stated reason.
const held = parsed.filter((r) => r.disqualified_reason);
const stillActive = parsed.filter((r) => !r.disqualified_reason && r.is_active !== false);
const dayOne = parsed.filter(
  (r) => !r.disqualified_reason && r.is_active === false && String(r.first_seen_at).slice(0, 10) === firstDay
);
const candidates = parsed.filter(
  (r) => !r.disqualified_reason && r.is_active === false && String(r.first_seen_at).slice(0, 10) !== firstDay
);

const reSeen = candidates.filter((r) => span(r) >= SAME_SCAN_MS);
const seenOnce = candidates.filter((r) => span(r) < SAME_SCAN_MS);
const seenOnceResolved = seenOnce.filter((r) => nextScanAfter(r) != null);
const seenOnceUnresolved = seenOnce.filter((r) => nextScanAfter(r) == null);

const measured = [...reSeen, ...seenOnceResolved];
const goneByNextScan = seenOnceResolved.length;
const gaps = seenOnceResolved.map((r) => (nextScanAfter(r) - Date.parse(r.first_seen_at)) / DAY);
const reSeenSpans = reSeen.map((r) => span(r) / DAY);

const band = (lo, hi) => {
  const inBand = (r) => Number(r.market_price) >= lo && (hi === null || Number(r.market_price) < hi);
  const m = measured.filter(inBand);
  const once = seenOnceResolved.filter(inBand);
  const rs = reSeen.filter(inBand);
  return {
    records: m.length,
    goneByNextScanPct: share(once.length, m.length),
    reSeenMedianDays: rs.length ? round1(median(rs.map((r) => span(r) / DAY))) : null,
  };
};

const AGG = {
  version: `${lastDay}.1`,
  id: "listing-disappearance-2026-09",
  window: { start: firstDay, end: lastDay, days: Math.round((Date.parse(lastDay) - Date.parse(firstDay)) / DAY) },
  method: {
    unit: "one below-market eBay listing as first found by our scanner",
    resolvedBy:
      "a later confirmed run of the SAME search (watchlist), so absence is evidence about the listing rather than about our coverage",
    excludes: "listings we withheld ourselves, listings still live, and listings first seen on day one (unknown age)",
  },
  population: {
    rowsConsidered: parsed.length,
    excludedHeldByUs: held.length,
    excludedStillActive: stillActive.length,
    excludedFirstDay: dayOne.length,
    candidates: candidates.length,
    excludedNeverReSearched: seenOnceUnresolved.length,
    measured: measured.length,
    measuredShareOfCandidates: share(measured.length, candidates.length),
  },
  headline: {
    goneByNextScan,
    goneByNextScanPct: share(goneByNextScan, measured.length),
    medianGapToNextScanDays: gaps.length ? round1(median(gaps)) : null,
    reSeenAtLeastOnce: reSeen.length,
    reSeenMedianObservedDays: reSeenSpans.length ? round1(median(reSeenSpans)) : null,
  },
  byReferenceBand: {
    "under $25": band(0, 25),
    "$25 to $100": band(25, 100),
    "$100 or more": band(100, null),
  },
  limits: [
    "Absence from a search is not a sale. A listing also leaves when it ends, is cancelled, is relisted, or changes price enough to fall outside the below-market filter.",
    "No sell-through rate, time-to-sale or market size can be derived from this.",
    "Resolution is limited by how often each search runs: the finding is 'gone by the next run', not an exact moment.",
    "Listings first seen on day one are excluded because their age at discovery is unknown.",
  ],
};

console.log(JSON.stringify(AGG, null, 2));

if (process.argv.includes("--write")) {
  const out = `// GENERATED by scripts/seo/buildSurvivalAggregate.mjs - do not edit by hand.
// A FIXED, DATED SNAPSHOT of listing-disappearance figures. Aggregates
// only: no listing ids, no seller fields, no URLs.
//
// Read the \`limits\` array before using any number here. In particular:
// absence from a search is NOT a sale.
export const LISTING_DISAPPEARANCE = Object.freeze(${JSON.stringify(AGG, null, 2)});
`;
  writeFileSync("lib/studies/listingDisappearance.js", out);
  console.log("\nwrote lib/studies/listingDisappearance.js");
}
