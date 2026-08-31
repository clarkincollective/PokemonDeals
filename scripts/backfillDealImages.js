// node scripts/backfillDealImages.js [--apply] [--limit=N]
//
// Restores deals.image_url for active rows stored with a NULL image (the
// listing came from an item_summary/search result that omitted `image`
// and only had thumbnailImages - now handled by primaryListingImage in
// lib/ebay, but pre-existing rows stay NULL until re-scanned). Re-fetches
// each via get_item_by_legacy_id (1 Browse call each) and writes ONLY
// image_url. Never touches visual_authenticity_* or any other column, so
// the counterfeit-screening evidence is untouched.
//
// Quota-safe: refuses to run if it would drop Browse `remaining` below
// the 800 reserve, and caps at --limit (default 120).

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const { getBrowseRateLimit, getItemsByLegacyIds } = require("../lib/ebay");

const APPLY = process.argv.includes("--apply");
const LIMIT = Number((process.argv.find((a) => a.startsWith("--limit=")) || "").split("=")[1]) || 120;
const RESERVE = 800;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const legacyId = (s) => (String(s ?? "").match(/^v\d+\|(\d+)\|/) || String(s ?? "").match(/^(\d+)$/) || [])[1] ?? null;

(async () => {
  const rows = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await db
      .from("deals")
      .select("id, listing_id, marketplace")
      .eq("is_active", true)
      .is("image_url", null)
      .range(f, f + 999);
    if (error) throw new Error(error.message);
    if (!data || !data.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const targets = rows.filter((r) => legacyId(r.listing_id)).slice(0, LIMIT);
  console.log(`active deals with NULL image_url: ${rows.length}  |  attempting: ${targets.length}`);

  const q = await getBrowseRateLimit();
  console.log("Browse quota:", JSON.stringify(q));
  if (q && q.remaining - targets.length < RESERVE) {
    console.error(`would breach the ${RESERVE}-call reserve - aborting. Re-run after the quota resets.`);
    process.exit(1);
  }
  if (!APPLY) {
    console.log("(dry run - re-run with --apply)");
    return;
  }

  // capture raw bodies (mapItemSummary already returns imageUrl with the
  // thumbnailImages fallback now, so just use that)
  let ok = 0, gone = 0, stillNull = 0;
  const byMkt = {};
  for (const r of targets) {
    byMkt[r.marketplace] = byMkt[r.marketplace] ?? [];
    byMkt[r.marketplace].push(r);
  }
  for (const [mkt, list] of Object.entries(byMkt)) {
    const { listings } = await getItemsByLegacyIds(list.map((r) => legacyId(r.listing_id)), mkt, { concurrency: 4 });
    const imgByLegacy = new Map(listings.map((l) => [String(l.listingId).replace(/^v\d+\|/, "").replace(/\|.*/, ""), l.imageUrl]));
    for (const r of list) {
      const lid = legacyId(r.listing_id);
      const img = imgByLegacy.get(lid) ?? listings.find((l) => String(l.listingId).includes(lid))?.imageUrl ?? null;
      if (!img) {
        // listing not returned (ended/removed) or still no image
        if (listings.some((l) => String(l.listingId).includes(lid))) stillNull++;
        else gone++;
        continue;
      }
      const { error } = await db.from("deals").update({ image_url: img }).eq("id", r.id);
      if (error) console.error(`#${r.id}: ${error.message}`);
      else ok++;
    }
  }
  const q2 = await getBrowseRateLimit();
  console.log(`\nrestored image_url: ${ok}  |  listing gone: ${gone}  |  still no image: ${stillNull}`);
  console.log("Browse quota after:", JSON.stringify(q2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
