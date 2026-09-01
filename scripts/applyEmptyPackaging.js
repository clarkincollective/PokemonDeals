// One-off: retire the active deals whose listing is EMPTY / WRAPPER-ONLY
// PACKAGING, not a trading card (lib/dealMatching EMPTY_PACKAGING_PATTERN
// / qualifiesAsTradingCard). The shared display gate already hides them
// (listingIsTradingCard -> type:not_a_card); this also persists
// disqualified_reason + is_active=false so the DB / headline counts are
// clean and the row is fully retired. Reversible, not a delete - a scan
// that re-sees a genuine card upserts is_active=true again.
//
//   node scripts/applyEmptyPackaging.js            # dry run
//   node scripts/applyEmptyPackaging.js --apply

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const { EMPTY_PACKAGING_PATTERN, qualifiesAsTradingCard } = require("../lib/dealMatching");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");

(async () => {
  const rows = [];
  for (let f = 0; f < 40000; f += 1000) {
    const { data } = await db.from("deals").select("id, title, is_active, disqualified_reason").eq("is_active", true).range(f, f + 999);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const hits = rows.filter(
    (r) => EMPTY_PACKAGING_PATTERN.test(r.title) && !qualifiesAsTradingCard({ title: r.title })
  );
  console.log(`active deals that are empty packaging: ${hits.length}`);
  for (const h of hits) console.log(`  #${h.id}  dq=${h.disqualified_reason ?? "null"}  | ${h.title}`);

  if (!APPLY) {
    console.log("\n(dry run) re-run with --apply");
    return;
  }
  let done = 0;
  for (const h of hits) {
    const { error } = await db
      .from("deals")
      .update({ is_active: false, disqualified_reason: "type:not_a_card" })
      .eq("id", h.id);
    if (error) console.log(`  ! #${h.id}: ${error.message}`);
    else done++;
  }
  console.log(`\nretired ${done}/${hits.length} -> is_active=false, disqualified_reason='type:not_a_card'`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
