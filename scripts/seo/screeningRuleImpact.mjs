#!/usr/bin/env node
// SCREENING-RULE IMPACT (2026-09-21). READ-ONLY measurement. Changes
// nothing, screens nothing, holds nothing.
//
//   node scripts/seo/screeningRuleImpact.mjs
//
// Three candidate rules are recorded in docs/listing-reports.md and held
// pending an owner decision. The decision is blocked on one number
// nobody had: how many GOOD listings each rule would withhold.
//
// This answers exactly that, against the live shown set, and checks each
// rule against the three listings the owner actually reported as fake.
// A rule that catches all three and costs little is safe; a rule that
// catches all three by withholding a quarter of the site is not.
//
// The candidates (docs/listing-reports.md, "The pattern after three
// cases"), all scoped to the existing premium high-risk band - market
// reference >= $100 USD AND discount >= 40 % - and never applied outside
// it:
//   A. no trust signals at all (feedback score null) -> withhold
//   B. low feedback AND returns refused -> withhold
//   C. title carries an unread disclosure hedge, "(see description)"
//
// Nothing here writes. It does not call eBay, does not re-screen, and
// does not touch disqualified_reason.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

// The site's OWN display gate, not a re-implementation of it. "Not
// disqualified" is not the same as "shown": it includes rows that ended,
// were not re-seen, or fail one of the other gates, and using it as the
// denominator overstates the shown set roughly seventeen-fold.
const { isDisplayableDeal } = createRequire(import.meta.url)("../../lib/dealQuality.js");

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("  x Supabase credentials missing from .env.local");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const BAND_MARKET_USD = 100;
const BAND_DISCOUNT = 0.4;
// "Low" feedback: the reported cases sat at 33 and 147. Reported as a
// curve rather than one threshold, so the owner picks the line.
const FEEDBACK_THRESHOLDS = [50, 100, 200, 500];
const REPORTED = [40200, 39415, 40885, 41196, 41914];

const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)} %` : "-");

async function main() {
  // The shown set: everything not currently disqualified.
  //
  // PostgREST caps a response at 1,000 rows regardless of .limit(), so a
  // single call silently truncates and every percentage below would be
  // computed against the wrong denominator. Page explicitly.
  const PAGE = 1000;
  const candidates = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("deals")
      .select("*")
      .is("disqualified_reason", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`  x query failed: ${error.message}`);
      process.exit(1);
    }
    candidates.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) break;
  }
  const shown = candidates.filter((r) => isDisplayableDeal(r));
  console.log(`  rows not disqualified: ${candidates.length}; of those actually displayable: ${shown.length}`);
  const inBand = shown.filter(
    (r) => Number(r.market_price) >= BAND_MARKET_USD && Number(r.discount_pct) >= BAND_DISCOUNT
  );

  console.log("Screening-rule impact - READ-ONLY, nothing changed\n");
  console.log(`  shown listings (not disqualified): ${shown.length}`);
  console.log(`  in the premium high-risk band (>= $${BAND_MARKET_USD} and >= ${BAND_DISCOUNT * 100} % off): ${inBand.length} (${pct(inBand.length, shown.length)} of shown)\n`);

  const noSignals = (r) => r.seller_feedback_score == null;
  const refusesReturns = (r) => r.returns_accepted === false;
  const hedged = (r) => /\(see description\)/i.test(String(r.title ?? ""));

  const report = (label, predicate) => {
    const hit = inBand.filter(predicate);
    console.log(`  ${label}`);
    console.log(`      withholds ${hit.length} of ${inBand.length} in band  (${pct(hit.length, inBand.length)} of band, ${pct(hit.length, shown.length)} of everything shown)`);
    return hit;
  };

  console.log("RULE A - no trust signals at all (feedback score null)");
  report("  in band and unenriched:", noSignals);
  console.log("");

  console.log("RULE B - low feedback AND returns refused");
  for (const t of FEEDBACK_THRESHOLDS) {
    report(`  feedback < ${t} and returns refused:`, (r) => !noSignals(r) && Number(r.seller_feedback_score) < t && refusesReturns(r));
  }
  console.log("");

  console.log('RULE C - title carries "(see description)"');
  const c = report("  in band and hedged:", hedged);
  const cAll = shown.filter(hedged);
  console.log(`      for scale, across ALL shown listings: ${cAll.length} carry the phrase - which is why it must never gate on its own`);
  if (c.length) for (const r of c.slice(0, 5)) console.log(`        ${r.id}  ${String(r.title).slice(0, 78)}`);
  console.log("");

  // A and B are disjoint by construction - A requires a null feedback
  // score, B requires a non-null one - so "either" is the sum, and it is
  // the combination that covers all three reported cases.
  const either = inBand.filter(
    (r) => noSignals(r) || (Number(r.seller_feedback_score) < 200 && refusesReturns(r))
  );
  console.log("A OR B (feedback < 200), the combination that covers all three reported cases");
  console.log(`      withholds ${either.length} of ${inBand.length} in band  (${pct(either.length, inBand.length)} of band, ${pct(either.length, shown.length)} of everything shown)`);
  console.log("");

  // Does each rule actually catch what it was written for? A rule that
  // costs little but misses the reported cases is not worth shipping.
  const { data: reported } = await db
    .from("deals")
    .select("id, title, market_price, discount_pct, seller_feedback_score, returns_accepted, disqualified_reason")
    .in("id", REPORTED);
  console.log("AGAINST THE THREE REPORTED LISTINGS");
  const yn = (v) => (v ? "yes" : "no");
  console.log(`  ${"id".padEnd(8)}${"in band".padEnd(9)}${"A".padEnd(6)}${"B<200".padEnd(7)}${"C".padEnd(6)}held now`);
  for (const r of reported ?? []) {
    const band = Number(r.market_price) >= BAND_MARKET_USD && Number(r.discount_pct) >= BAND_DISCOUNT;
    const a = noSignals(r);
    const b = !a && Number(r.seller_feedback_score) < 200 && refusesReturns(r);
    console.log(
      `  ${String(r.id).padEnd(8)}${yn(band).padEnd(9)}${yn(a).padEnd(6)}${yn(b).padEnd(7)}${yn(hedged(r)).padEnd(6)}${r.disqualified_reason ?? "(not held)"}`
    );
  }
  console.log("\n  Read A, B and C as candidates to combine, not alternatives. Nothing");
  console.log("  above has been applied - rule changes remain held for the owner.");
}

main().catch((e) => {
  console.error(`FAILED: ${e.message}`);
  process.exitCode = 1;
});
