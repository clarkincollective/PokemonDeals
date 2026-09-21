#!/usr/bin/env node
// LISTING-SURVIVAL FEASIBILITY PROBE (2026-09-21). READ-ONLY.
//
//   node scripts/seo/survivalFeasibility.mjs
//
// "How long does an underpriced Pokemon card stay listed?" is the most
// distinctive question this site could answer - it falls out of running
// the scanner and nobody without one can reproduce it.
//
// This probe does NOT produce a study. It asks whether the stored data
// can support one honestly, and is written to find reasons it cannot:
//
//   1. Do we have a usable start AND end per listing?
//   2. Is the observation window long enough not to be dominated by
//      listings that were already old when we first saw them?
//   3. Can we distinguish "disappeared" from "we stopped looking"?
//   4. Is the sample big enough to cut by price band?
//
// The honest answer may be no, or not yet. That is a result.
import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const DAY = 86_400_000;
const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)} %` : "-");
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("deals")
    .select("id, first_seen_at, last_seen_at, is_active, disqualified_reason, market_price, discount_pct, total_price, listing_type")
    .order("id", { ascending: true })
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  rows.push(...(data ?? []));
  if ((data?.length ?? 0) < 1000) break;
}

console.log("Listing-survival feasibility probe - READ-ONLY\n");
console.log(`  rows: ${rows.length}`);

// 1. Usable timestamps.
const timed = rows.filter((r) => r.first_seen_at && r.last_seen_at);
console.log(`  with BOTH first_seen_at and last_seen_at: ${timed.length} (${pct(timed.length, rows.length)})`);

// 2. Observation window.
const firsts = timed.map((r) => Date.parse(r.first_seen_at)).filter(Number.isFinite);
const lasts = timed.map((r) => Date.parse(r.last_seen_at)).filter(Number.isFinite);
const earliest = Math.min(...firsts);
const latest = Math.max(...lasts);
console.log(`  observation window: ${new Date(earliest).toISOString().slice(0, 10)} to ${new Date(latest).toISOString().slice(0, 10)} (${((latest - earliest) / DAY).toFixed(0)} days)`);

// 3. Left-censoring: a listing already live when we first saw it has an
//    unknown true age, so "how long did it last" is not answerable for it.
//    We can only measure time OBSERVED, never time listed.
const firstDay = new Date(earliest).toISOString().slice(0, 10);
const bornOnFirstDay = timed.filter((r) => String(r.first_seen_at).slice(0, 10) === firstDay).length;
console.log(`  first seen on our very first day (age unknown - left-censored): ${bornOnFirstDay} (${pct(bornOnFirstDay, timed.length)})`);

// 4. Right-censoring: still active = still going, so its lifetime is
//    unknown too. Only ENDED listings have a measurable observed span.
const ended = timed.filter((r) => r.is_active === false);
const active = timed.filter((r) => r.is_active !== false);
console.log(`  ended (is_active=false): ${ended.length} (${pct(ended.length, timed.length)})`);
console.log(`  still active (right-censored): ${active.length} (${pct(active.length, timed.length)})`);

// 5. Can we tell "gone from eBay" from "we stopped looking"? A held row
//    was removed by US, not by the market, and must be excluded.
const held = timed.filter((r) => r.disqualified_reason).length;
console.log(`  removed by us, not the market (disqualified): ${held} (${pct(held, timed.length)}) - must be excluded`);

// 6. The measurable population and what it would say.
const usable = ended.filter((r) => !r.disqualified_reason && String(r.first_seen_at).slice(0, 10) !== firstDay);

// A row whose first and last sighting are the same scan has a span of a
// few MILLISECONDS - often a fraction negative, because the two stamps are
// written moments apart. Those are not bad data: they are listings we saw
// ONCE and never re-confirmed, and they turned out to be the majority.
// The first version of this probe filtered them out with `d >= 0` and so
// silently hid the single most important fact in the set.
const SEEN_ONCE_MS = 60_000; // same scan pass
const spanMs = (r) => Date.parse(r.last_seen_at) - Date.parse(r.first_seen_at);
const seenOnce = usable.filter((r) => Math.abs(spanMs(r)) < SEEN_ONCE_MS);
const reSeen = usable.filter((r) => spanMs(r) >= SEEN_ONCE_MS);
const spans = reSeen.map((r) => spanMs(r) / DAY);

console.log(`\n  MEASURABLE population (ended, not held, not first-day): ${usable.length}`);
console.log(`      seen ONCE and never re-confirmed: ${seenOnce.length} (${pct(seenOnce.length, usable.length)})`);
console.log(`      re-seen at least once           : ${reSeen.length} (${pct(reSeen.length, usable.length)})`);
console.log("      -> every span figure below describes only the re-seen minority");
if (spans.length) {
  console.log(`      median observed span: ${median(spans).toFixed(1)} days`);
  const buckets = [[0, 1], [1, 3], [3, 7], [7, 14], [14, 30], [30, Infinity]];
  for (const [lo, hi] of buckets) {
    const n = spans.filter((d) => d >= lo && d < hi).length;
    console.log(`      ${String(lo).padStart(2)}-${hi === Infinity ? "inf" : String(hi).padStart(3)} days: ${String(n).padStart(5)} (${pct(n, spans.length)})`);
  }
}

// 7. Enough to cut by price band?
console.log("\n  by market-reference band (measurable rows only):");
for (const [label, lo, hi] of [["under $25", 0, 25], ["$25-$100", 25, 100], ["$100+", 100, Infinity]]) {
  const band = usable.filter((r) => Number(r.market_price) >= lo && Number(r.market_price) < hi);
  const bandOnce = band.filter((r) => Math.abs(spanMs(r)) < SEEN_ONCE_MS).length;
  const bandSpans = band.filter((r) => spanMs(r) >= SEEN_ONCE_MS).map((r) => spanMs(r) / DAY);
  console.log(
    `      ${label.padEnd(10)} n=${String(band.length).padStart(5)}  seen-once ${pct(bandOnce, band.length).padStart(7)}  re-seen median ${bandSpans.length ? median(bandSpans).toFixed(1) + " days" : "-"}`
  );
}

console.log("\n  READ THIS BEFORE PUBLISHING ANYTHING:");
console.log("  * 'last_seen_at' is when WE last saw it, not when it sold. A listing");
console.log("    can end, be relisted, or drop out of our search without selling.");
console.log("  * Left-censored rows (already live when we started) have unknown age.");
console.log("  * Right-censored rows (still active) have unknown lifetime.");
console.log("  * The honest statistic is OBSERVED SPAN of ended listings, never");
console.log("    'time to sell' and never a sell-through rate.");
console.log("  * THE BLOCKER: most rows were seen exactly once. 'Not re-seen' only");
console.log("    means 'gone' if we actually looked again - and that depends on the");
console.log("    scanner re-running the SAME search while the listing was still up.");
console.log("    Without per-search cadence, seen-once cannot be separated from");
console.log("    not-re-searched, and no survival figure is publishable.");
