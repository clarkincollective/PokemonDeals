// Run with: node scripts/fixSubstringMatches.js
//
// One-off correction for deals that only ever matched because
// listingMatchesCard/listingMatchesSealedProduct used substring
// containment instead of whole-word matching (see lib/dealMatching.js's
// fix) - e.g. a "Pokemon GO" watchlist card matching any listing that
// merely mentions "Dragonite" (the substring "go" hides inside it). Pure
// local re-check against the now-fixed logic - no API calls, since this
// is just re-validating stored title vs. stored name/set.
require("dotenv").config({ path: ".env.local" });
const { listingMatchesCard, listingMatchesSealedProduct } = require("../lib/dealMatching");
const { supabaseAdmin } = require("../lib/supabaseAdmin");

async function fetchAllRows(db, table, select, filters) {
  let all = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(select);
    for (const [col, val] of filters) q = q.eq(col, val);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < 1000) break;
  }
  return all;
}

async function main() {
  const db = supabaseAdmin();

  console.log("Checking card deals...");
  const cardDeals = await fetchAllRows(
    db,
    "deals",
    "id, title, watchlist:watchlist_id(name, set, language)",
    [["is_active", true]]
  );
  let cardChecked = 0;
  let cardDeactivated = 0;
  for (const deal of cardDeals) {
    if (!deal.watchlist) continue;
    cardChecked++;
    if (!listingMatchesCard({ title: deal.title }, deal.watchlist)) {
      const { error } = await db.from("deals").update({ is_active: false }).eq("id", deal.id);
      if (!error) {
        cardDeactivated++;
        console.log(
          `  deactivated (wrong match): deal ${deal.id} - watched "${deal.watchlist.name}" (${deal.watchlist.set}) vs title "${deal.title}"`
        );
      }
    }
  }

  console.log("\nChecking sealed-product deals...");
  const sealedDeals = await fetchAllRows(
    db,
    "sealed_deals",
    "id, title, sealed_watchlist:sealed_watchlist_id(name, set)",
    [["is_active", true]]
  );
  let sealedChecked = 0;
  let sealedDeactivated = 0;
  for (const deal of sealedDeals) {
    if (!deal.sealed_watchlist) continue;
    sealedChecked++;
    if (!listingMatchesSealedProduct({ title: deal.title }, deal.sealed_watchlist)) {
      const { error } = await db.from("sealed_deals").update({ is_active: false }).eq("id", deal.id);
      if (!error) {
        sealedDeactivated++;
        console.log(
          `  deactivated (wrong match): sealed deal ${deal.id} - watched "${deal.sealed_watchlist.name}" (${deal.sealed_watchlist.set}) vs title "${deal.title}"`
        );
      }
    }
  }

  console.log(
    `\nDone. cards: checked=${cardChecked} deactivated=${cardDeactivated} | sealed: checked=${sealedChecked} deactivated=${sealedDeactivated}`
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
