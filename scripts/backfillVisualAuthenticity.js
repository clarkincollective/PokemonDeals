// node scripts/backfillVisualAuthenticity.js [--apply] [--all] [--rescreen]
//
// Runs the bounded visual counterfeit screen (lib/visualAuthenticity) over
// the current HIGH-RISK active population and reports verdicts. --apply
// persists visual_authenticity_status/_reason/_checked_at (requires
// scripts/sql/2026-09-01_visual_authenticity.sql to have been run).
// Without --all it caps at 120 deals so a manual run stays bounded.
// By default a row that already has a visual_authenticity_status is
// skipped (only the newly-eligible unscreened rows + the forced ids run);
// --rescreen re-runs every candidate.
//
// Stage 2 (vision) only fires if VISION_API_KEY / ANTHROPIC_API_KEY is set;
// otherwise inconclusive items stay UNKNOWN.

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const { catalogImageUrl } = require("../lib/cardImage");
const { isVisualScreeningCandidate, screenDeal } = require("../lib/visualAuthenticity");
const { visualAuthenticityReason } = require("../lib/dealQuality");

const APPLY = process.argv.includes("--apply");
const ALL = process.argv.includes("--all");
const RESCREEN = process.argv.includes("--rescreen");
const CAP = ALL ? Infinity : 120;
const ALWAYS = [4220, 4247, 12286, 12766]; // confirmed counterfeits - must be in the run

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const log = (...a) => console.log(...a);

async function fetchImage(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`img ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

(async () => {
  // Pull enough active rows to find the candidates (bounded scan).
  const rows = [];
  for (let f = 0; f < 8000; f += 1000) {
    const { data, error } = await db
      .from("deals")
      .select(
        "id, card_name, card_set, card_tcgplayer_id, image_url, market_price, discount_pct, is_graded, disqualified_reason, seller_feedback_score, image_count, returns_accepted, visual_authenticity_status"
      )
      .eq("is_active", true)
      .range(f, f + 999);
    if (error) throw new Error(error.message);
    if (!data || !data.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }

  // also grab the 3 confirmed counterfeits even though they're inactive
  const { data: forced } = await db
    .from("deals")
    .select(
      "id, card_name, card_set, card_tcgplayer_id, image_url, market_price, discount_pct, is_graded, disqualified_reason, seller_feedback_score, image_count, returns_accepted, visual_authenticity_status"
    )
    .in("id", ALWAYS);

  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const r of forced ?? []) if (!byId.has(r.id)) byId.set(r.id, r);

  const candidates = [...byId.values()].filter(
    (r) =>
      (ALWAYS.includes(r.id) || isVisualScreeningCandidate(r)) &&
      (RESCREEN || ALWAYS.includes(r.id) || !r.visual_authenticity_status)
  );
  log(`active deals scanned: ${rows.length}`);
  log(`visual-screening candidates: ${candidates.filter((r) => isVisualScreeningCandidate(r)).length}` +
      ` (+${ALWAYS.length} forced confirmed counterfeits)`);
  log(`running: ${Math.min(candidates.length, CAP)}\n`);

  const tally = { MATCH: 0, MISMATCH: 0, UNKNOWN: 0, errors: 0, hiddenUnverified: 0 };
  const run = candidates.slice(0, CAP);
  for (const row of run) {
    const canonicalUrl = catalogImageUrl(row.card_tcgplayer_id);
    let v;
    try {
      v = await screenDeal({ row, canonicalUrl }, { fetchImage });
    } catch (e) {
      v = { status: "UNKNOWN", reason: `err:${e.message}` };
      tally.errors++;
    }
    tally[v.status] = (tally[v.status] ?? 0) + 1;
    const reason = visualAuthenticityReason({
      ...row,
      visual_authenticity_status: v.status,
      visual_authenticity_reason: v.reason,
    });
    if (reason === "authenticity:visual_unverified") tally.hiddenUnverified++;
    const mark =
      reason === "authenticity:proxy_or_counterfeit"
        ? " <-- MISMATCH -> counterfeit"
        : reason === "authenticity:visual_unverified"
          ? " (hidden: visual_unverified)"
          : "";
    log(`#${row.id} ${v.status.padEnd(8)} ${((row.discount_pct ?? 0) * 100).toFixed(0)}% $${Math.round(row.market_price)} | ${row.card_name} / ${row.card_set}${mark}`);
    log(`      ${v.reason}`);
    if (APPLY) {
      const { error } = await db
        .from("deals")
        .update({
          visual_authenticity_status: v.status,
          visual_authenticity_reason: v.reason?.slice(0, 500) ?? null,
          visual_authenticity_checked_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (error) {
        log(`      ! persist failed: ${error.message}`);
        tally.errors++;
      }
    }
  }

  log(`\n${JSON.stringify(tally, null, 1)}`);
  if (!APPLY) log("\n(dry run - re-run with --apply once the SQL migration is applied)");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
