// Run with: node scripts/reactivateFalsePositives.js
//
// fixSubstringMatches.js deactivated 754 card deals + 5 sealed deals using
// a whole-word-only matching fix that turned out to be too strict for two
// common real patterns (fused set-code+number like "XY83", and redundant
// short set-code prefixes like "ME:" already followed by the spelled-out
// name) - see lib/dealMatching.js's coreTokens/tokenMatchesTitle for the
// refined logic. This re-checks ONLY those exact deal ids (read back from
// that run's own logged output, not "every inactive deal" - most inactive
// deals were deactivated for other legitimate reasons, like the
// cross-language mismatch and condition-pricing fixes earlier this
// session, and title-matching alone doesn't re-verify those) against the
// now-refined matcher and reactivates any that now pass. Pure local
// re-check, no API calls, no data changes beyond is_active.
require("dotenv").config({ path: ".env.local" });
const fs = require("fs");
const { listingMatchesCard, listingMatchesSealedProduct } = require("../lib/dealMatching");
const { supabaseAdmin } = require("../lib/supabaseAdmin");

const CARD_IDS = JSON.parse(fs.readFileSync(__dirname + "/../scratch_card_ids.json", "utf8"));
const SEALED_IDS = JSON.parse(fs.readFileSync(__dirname + "/../scratch_sealed_ids.json", "utf8"));

async function fetchByIds(db, table, select, ids) {
  let all = [];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { data, error } = await db.from(table).select(select).in("id", chunk);
    if (error) throw error;
    all = all.concat(data ?? []);
  }
  return all;
}

async function main() {
  const db = supabaseAdmin();

  console.log(`Checking ${CARD_IDS.length} previously-deactivated card deals...`);
  const cardDeals = await fetchByIds(
    db,
    "deals",
    "id, title, is_active, watchlist:watchlist_id(name, set, language)",
    CARD_IDS
  );
  let cardChecked = 0;
  let cardReactivated = 0;
  for (const deal of cardDeals) {
    if (!deal.watchlist || deal.is_active) continue;
    cardChecked++;
    if (listingMatchesCard({ title: deal.title }, deal.watchlist)) {
      const { error } = await db.from("deals").update({ is_active: true }).eq("id", deal.id);
      if (!error) {
        cardReactivated++;
        console.log(
          `  reactivated (false positive): deal ${deal.id} - watched "${deal.watchlist.name}" (${deal.watchlist.set}) vs title "${deal.title}"`
        );
      }
    }
  }

  console.log(`\nChecking ${SEALED_IDS.length} previously-deactivated sealed deals...`);
  const sealedDeals = await fetchByIds(
    db,
    "sealed_deals",
    "id, title, is_active, sealed_watchlist:sealed_watchlist_id(name, set)",
    SEALED_IDS
  );
  let sealedChecked = 0;
  let sealedReactivated = 0;
  for (const deal of sealedDeals) {
    if (!deal.sealed_watchlist || deal.is_active) continue;
    sealedChecked++;
    if (listingMatchesSealedProduct({ title: deal.title }, deal.sealed_watchlist)) {
      const { error } = await db.from("sealed_deals").update({ is_active: true }).eq("id", deal.id);
      if (!error) {
        sealedReactivated++;
        console.log(
          `  reactivated (false positive): sealed deal ${deal.id} - watched "${deal.sealed_watchlist.name}" (${deal.sealed_watchlist.set}) vs title "${deal.title}"`
        );
      }
    }
  }

  console.log(
    `\nDone. cards: checked=${cardChecked} reactivated=${cardReactivated} | sealed: checked=${sealedChecked} reactivated=${sealedReactivated}`
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
