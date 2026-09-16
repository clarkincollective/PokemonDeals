#!/usr/bin/env node
// LIVE-DATA INVARIANTS - read-only.
//
//   npm run check:invariants            # human output, exit 1 on a breach
//   npm run check:invariants -- --json  # machine output for a cron/alert
//
// WHY THIS EXISTS. On 16 Sep 2026 three separate bugs shipped that the
// 3,500-test scanner suite could not see, because all three were correct
// code applied to the wrong SET OF ROWS:
//
//   1. RELEASE_TIME_ZONE was fixed to America/Los_Angeles, so a worldwide
//      release read as "upcoming" for everyone east of California and 60
//      real deals were hidden on release day.
//   2. The catalogue snapshot refresh did not SELECT the evidence columns
//      that its own savingsClaimTrusted filter reads, so every row of any
//      set with an official release record silently failed the filter and
//      the set could never become deal-backed.
//   3. savingsClaimTrusted returned true for any set outside the tracked
//      releases, so ~71% of live savings claims carried no evidence.
//
// Every one of them is invisible to a test that reads source files. Each
// is obvious the moment you ask a question of the live data. That is what
// this script does: a small number of questions whose answer is knowable,
// cheap, and would have been wrong on that day.
//
// It reads. It never writes, holds, deactivates or deletes anything.

import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createRequire } from "node:module";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const require = createRequire(import.meta.url);
const dq = require("../lib/dealQuality.js");
const JSON_OUT = process.argv.includes("--json");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PAGE = 1000;

async function readAll(table, select, tune = (q) => q) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const q = tune(db.from(table).select(select)).order("id", { ascending: true }).range(from, from + PAGE - 1);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

const results = [];
const check = (name, ok, detail, severity = "fail") => {
  results.push({ name, ok, detail, severity });
  if (!JSON_OUT) {
    const mark = ok ? "ok  " : severity === "warn" ? "WARN" : "FAIL";
    console.log(`${mark}  ${name}`);
    if (!ok && detail) console.log(`        ${detail}`);
  }
};

// ---------------------------------------------------------------------
const deals = await readAll("deals", "*", (q) => q.eq("is_active", true).is("disqualified_reason", null));
const countable = deals.filter((r) => dq.isOfferCountable(r));
const displayable = countable.filter((r) => dq.isDisplayableDeal(r));

// INV-1. The site must always have deals to show. The single thing the
// owner asked never to break: "I don't want to lose deals, people must
// see lots of deals all the time."
check(
  "INV-1  the site is showing a healthy number of listings",
  displayable.length >= 250,
  `only ${displayable.length} displayable listings (active unheld: ${deals.length})`
);

// INV-2. BUG CLASS 3 - a savings claim must be evidenced. This can only
// ever be a WARNING on a ratio, not a hard gate: rows legitimately arrive
// unevidenced (the scanner writes provenance at scan time, so a row is
// unevidenced until its next scan) and they render as plain listings,
// which is correct behaviour, not a breach.
const claiming = countable.filter((r) => Number(r.discount_pct) > 0 && Number(r.market_price) > 0);
const trusted = claiming.filter((r) => dq.savingsClaimTrusted(r));
const trustedPct = claiming.length ? trusted.length / claiming.length : 1;
check(
  "INV-2  most rows that could claim a saving can evidence it",
  trustedPct >= 0.3,
  `${trusted.length}/${claiming.length} (${Math.round(trustedPct * 100)}%) evidenced - if this is falling, the scanner has stopped writing reference provenance`,
  "warn"
);

// INV-3. Anything that DOES claim a saving must carry real evidence.
// Unlike INV-2 this is absolute: a displayed "% below market" with no
// evidence behind it is the failure the whole rule exists to prevent.
const claimingWithoutEvidence = trusted.filter((r) => {
  const e = r.sealed_watchlist ? dq.storedSealedReferenceEvidence(r) : dq.storedReferenceEvidence(r);
  return !e;
});
check(
  "INV-3  every displayed savings claim has stored evidence behind it",
  claimingWithoutEvidence.length === 0,
  `${claimingWithoutEvidence.length} row(s) pass the trust gate with no evidence: ${claimingWithoutEvidence.slice(0, 5).map((r) => r.id).join(", ")}`
);

// INV-4. BUG CLASS 2 - a query that omits the columns its own filter reads
// fails EVERY row silently. Rather than diff select strings, ask the
// question that matters: do the rows a reader actually receives still
// carry what the trust rule needs? Compared against the same rows read in
// full, so a projection that drops an evidence column shows up as a
// disagreement rather than as a quietly emptier site.
const { DEAL_POOL_SELECT, slimPoolRow } = await import("../lib/dealPoolShape.mjs");
const poolRows = await readAll("deals", DEAL_POOL_SELECT, (q) => q.eq("is_active", true).is("disqualified_reason", null));
const byId = new Map(deals.map((r) => [r.id, r]));
let projectionLost = 0;
const lostExamples = [];
for (const p of poolRows) {
  const full = byId.get(p.id);
  if (!full) continue;
  const slim = slimPoolRow(p);
  if (dq.savingsClaimTrusted(full) && !dq.savingsClaimTrusted(slim)) {
    projectionLost++;
    if (lostExamples.length < 5) lostExamples.push(p.id);
  }
}
check(
  "INV-4  the cached pool projection preserves every savings decision",
  projectionLost === 0,
  `${projectionLost} row(s) are trusted in full but untrusted after projection (e.g. ${lostExamples.join(", ")}) - DEAL_POOL_SELECT / POOL_ROW_FIELDS is missing an evidence column`
);

// INV-5. BUG CLASS 2 at the aggregate, and the single most valuable check
// here. The site does not serve these counts from the deals table - it
// serves catalog_snapshot, written by /api/refresh-catalog. That indirection
// is exactly where the 17C.7 bug lived: the refresh query omitted the
// evidence columns its own filter read, every row of an affected set failed
// silently, and the set simply never appeared. Nothing in the source said so.
//
// So compare the SERVED snapshot against ground truth computed here from the
// full rows. A set with enough countable listings that is missing from the
// snapshot means the refresh is dropping rows.
// The snapshot is written per language and the site's set hubs are the
// English ones (fetchSets({ language: "english" })), so ground truth is
// counted over English rows only - a Japanese set is absent by design,
// not by breakage.
const rawSetCounts = new Map();
for (const r of countable) {
  if (!r.card_set || r.card_language !== "english") continue;
  rawSetCounts.set(r.card_set, (rawSetCounts.get(r.card_set) ?? 0) + 1);
}
const expectedSets = [...rawSetCounts.entries()].filter(([, n]) => n >= 3).map(([s]) => s);

const { data: snapRow, error: snapErr } = await db
  .from("catalog_snapshot")
  .select("data, updated_at")
  .eq("kind", "sets")
  .maybeSingle();

if (snapErr || !snapRow) {
  check("INV-5  the served set snapshot matches the live deal rows", false, `catalog_snapshot("sets") unreadable: ${snapErr?.message ?? "no row"}`, "warn");
} else {
  const payload = snapRow.data;
  const list = Array.isArray(payload) ? payload : payload?.sets ?? [];
  const served = new Set(list.map((s) => s?.set ?? s));
  const missingSets = expectedSets.filter((s) => !served.has(s));
  const ageH = (Date.now() - Date.parse(snapRow.updated_at ?? 0)) / 3.6e6;
  check(
    "INV-5  the served set snapshot matches the live deal rows",
    missingSets.length === 0,
    `${missingSets.length} set(s) have 3+ countable listings but are absent from the served snapshot ` +
      `(age ${ageH.toFixed(1)}h): ${missingSets.slice(0, 6).join(" | ")}`
  );
  check(
    "INV-5b the served snapshot is fresh",
    ageH < 6,
    `catalog_snapshot("sets") is ${ageH.toFixed(1)}h old - the 30-minute refresh cron may not be running`,
    "warn"
  );
}

// INV-6. BUG CLASS 1 - release gating. A set whose official release day
// has passed must not still be judged "upcoming" for anyone, and a set
// that has NOT released must not be treated as released. Evaluated with
// the real clock through the real helper, for every tracked release.
const { OFFICIAL_RELEASES, releasedAt } = await import("../lib/pokemonSets.js");
const now = new Date();
const releaseMistakes = [];
for (const rec of OFFICIAL_RELEASES ?? []) {
  const released = releasedAt(rec, now);
  const dayPassed = new Date(`${rec.released}T23:59:59Z`).getTime() < now.getTime() - 36 * 3600 * 1000;
  const dayFuture = new Date(`${rec.released}T00:00:00Z`).getTime() > now.getTime() + 36 * 3600 * 1000;
  if (dayPassed && !released) releaseMistakes.push(`${rec.set ?? rec.name}: released ${rec.released} but still reads as upcoming`);
  if (dayFuture && released) releaseMistakes.push(`${rec.set ?? rec.name}: releases ${rec.released} but already reads as released`);
}
check(
  "INV-6  release gating agrees with the calendar (36h tolerance for time zones)",
  releaseMistakes.length === 0,
  releaseMistakes.slice(0, 5).join(" | ")
);

// INV-7. The deal-38589 class: a stored reference that disagrees wildly
// with the catalogue's own figure for the SAME product is breakage, and
// it renders as a large false saving.
const ids = [...new Set(countable.map((r) => String(r.card_tcgplayer_id)).filter((x) => x && x !== "null"))];
const anchor = new Map();
for (let i = 0; i < ids.length; i += 300) {
  const { data } = await db.from("card_catalog").select("tcgplayer_id, market_price, name").in("tcgplayer_id", ids.slice(i, i + 300));
  for (const c of data ?? []) anchor.set(String(c.tcgplayer_id), c);
}
const implausible = [];
for (const r of countable) {
  const c = anchor.get(String(r.card_tcgplayer_id));
  if (!c || !(Number(c.market_price) > 0) || !(Number(r.market_price) > 0)) continue;
  if (!dq.referenceIsPlausible({ storedReference: r.market_price, catalogueReference: c.market_price })) {
    implausible.push(`${r.id} ${c.name}: stored $${Math.round(r.market_price)} vs catalogue $${Math.round(c.market_price)}`);
  }
}
check(
  "INV-7  no stored reference is implausible against the catalogue",
  implausible.length === 0,
  `${implausible.length} row(s): ${implausible.slice(0, 5).join(" | ")}  (fix: npm run deals:fix-references -- --apply)`
);

// INV-8. Sitemap/page parity, the direction that matters: a URL we
// advertise must be one that renders as an indexable page.
const sitemapIndexable = countable.filter((r) => dq.isDisplayableDeal(r) && dq.savingsClaimTrusted(r));
check(
  "INV-8  the deals sitemap has something to list",
  sitemapIndexable.length > 0,
  "no active deal qualifies for the sitemap - the select is probably missing a column its gate reads",
  "warn"
);

// INV-12. INVENTORY MIX (listings-rev1, 16 Sep 2026). The scanners' discount
// floor is applied AFTER the eBay call, so every listing discarded for being
// "only" 5% below market had already been paid for in Browse quota. The US
// sweep now runs with minDiscount=0 as a bounded trial: it keeps everything at
// or below market, at no extra quota, while the other five marketplaces stay
// at the 10% floor as a control.
//
// This is a REPORT, not a pass/fail rule - there is no correct mix. It exists
// so the trial's effect is visible: how much inventory the change adds, and
// whether the deep discounts (what the site is actually for) are still there
// and still ranked above the rest.
{
  const band = (lo, hi) => countable.filter((r) => Number(r.discount_pct) >= lo && Number(r.discount_pct) < hi).length;
  const atMarket = band(0, 0.1);
  const real = countable.filter((r) => Number(r.discount_pct) >= 0.1).length;
  const us = countable.filter((r) => r.marketplace === "EBAY_US");
  const usAtMarket = us.filter((r) => Number(r.discount_pct) >= 0 && Number(r.discount_pct) < 0.1).length;
  if (!JSON_OUT) {
    console.log(
      `info  INV-12 inventory mix: ${countable.length} countable | ${real} at 10%+ off | ${atMarket} at 0-10% ` +
        `(US ${usAtMarket} of ${us.length}) | deep (30%+) ${band(0.3, 1.01)}`
    );
  }
  results.push({ name: "INV-12 inventory mix", ok: true, detail: { countable: countable.length, real, atMarket, usAtMarket, usTotal: us.length }, severity: "info" });
}

// --- SCANNER HEALTH ---------------------------------------------------
//
// A JOB THAT IS SCHEDULED BUT NEVER EXECUTES LOOKS EXACTLY LIKE A JOB THAT
// IS WORKING. Found on 2026-09-16: refresh-sealed-deals had been skipped on
// every single attempt for five consecutive days (12-16 Sep), each time
// with skip_reason "ebay_rate_limited" and a quota of ~200-240 against a
// reserve floor of 250. It fires at 06:00 UTC, by which point the 15-minute
// sweeps have taken the daily Browse quota below the floor, so the guard
// correctly refuses to run it - and it therefore never runs at all.
//
// The consequences were invisible from the site: sealed inventory was two
// days stale, and no sealed row had EVER been written with the reference
// provenance added at 17C.10, so no sealed listing could evidence a saving.
// Nothing errored. The cron reported itself as having run.
//
// These checks read the job log only. They change no schedule, budget,
// reserve floor or enforcement rule - that is deliberately the owner's
// call; this only makes the silence audible.
const JOB_MAX_AGE_HOURS = { "refresh-sealed-deals": 48, "refresh-deals:sweep": 6, "verify-deals": 12, "ingest-feed": 12 };
const { data: jobRuns } = await db
  .from("ebay_job_runs")
  .select("job, status, skip_reason, browse_calls, started_at, quota_limit")
  .gte("started_at", new Date(Date.now() - 4 * 86400_000).toISOString())
  .order("started_at", { ascending: false });

const stale = [];
for (const [job, maxH] of Object.entries(JOB_MAX_AGE_HOURS)) {
  const runs = (jobRuns ?? []).filter((r) => r.job === job);
  if (!runs.length) continue; // job not scheduled here; nothing to assert
  const lastOk = runs.find((r) => r.status === "success");
  const ageH = lastOk ? (Date.now() - Date.parse(lastOk.started_at)) / 3.6e6 : Infinity;
  if (ageH > maxH) {
    const reasons = [...new Set(runs.filter((r) => r.status === "skipped").map((r) => r.skip_reason))].join(", ");
    stale.push(
      `${job}: last success ${lastOk ? `${ageH.toFixed(0)}h ago` : "never in this window"}, ` +
        `${runs.filter((r) => r.status === "skipped").length}/${runs.length} attempts skipped (${reasons || "no reason"})`
    );
  }
}
check(
  "INV-9  every scheduled eBay job has actually succeeded recently",
  stale.length === 0,
  stale.join("  |  ")
);

// INV-10. Daily Browse usage against the quota. Overdrawing it is what
// pushes every later job into ebay_rate_limited, and the job that loses is
// whichever is scheduled last.
const byDay = new Map();
for (const r of jobRuns ?? []) {
  const d = String(r.started_at).slice(0, 10);
  byDay.set(d, (byDay.get(d) ?? 0) + (r.browse_calls ?? 0));
}
const limit = (jobRuns ?? []).find((r) => r.quota_limit)?.quota_limit ?? 5000;
const over = [...byDay.entries()].filter(([, n]) => n > limit).map(([d, n]) => `${d}: ${n}/${limit}`);
check(
  "INV-10 daily eBay Browse usage stays inside the quota",
  over.length === 0,
  `over quota on ${over.join(", ")} - later jobs get rate-limited and the last-scheduled one starves`
);

// INV-11. Sealed inventory freshness, stated as a fact about the rows
// rather than about the job, so it stays true whatever the cause.
const { data: sealedFresh } = await db
  .from("sealed_deals")
  .select("last_seen_at")
  .eq("is_active", true)
  .order("last_seen_at", { ascending: false })
  .limit(1);
const sealedAgeH = sealedFresh?.[0] ? (Date.now() - Date.parse(sealedFresh[0].last_seen_at)) / 3.6e6 : Infinity;
check(
  "INV-11 sealed inventory has been re-seen recently",
  sealedAgeH <= 48,
  `the freshest active sealed listing was last seen ${Number.isFinite(sealedAgeH) ? `${sealedAgeH.toFixed(0)}h ago` : "never"} - sealed listings may have sold`
);

// ---------------------------------------------------------------------
const failed = results.filter((r) => !r.ok && r.severity === "fail");
const warned = results.filter((r) => !r.ok && r.severity === "warn");

if (JSON_OUT) {
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), failed: failed.length, warned: warned.length, results }, null, 2));
} else {
  console.log(`\n${results.length} invariants: ${results.length - failed.length - warned.length} ok, ${warned.length} warning, ${failed.length} failed`);
}
process.exit(failed.length ? 1 : 0);
