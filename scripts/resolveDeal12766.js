// One-off: resolve deal 12766 after the forensic image/authenticity
// investigation (see the session report).
//
// Findings:
//  - eBay item 358784774259 (seller mljsports_andthings) is a gold-metal
//    novelty COUNTERFEIT of Charizard GX Rainbow Rare 150/147 (Burning
//    Shadows). Human-verified visual MISMATCH vs the canonical scan:
//    solid brushed-gold plate background, embossed/relief attack text,
//    gold-disc energy symbols, "(c)2020 Pokemon|Nintendo|Creatures|
//    GAMEFREAK" on a 2017 set. Same family as deals 4220 / 4247 / 12286.
//  - The stored image_url IS the exact image eBay Browse returns for that
//    listing_id - there is NO listing_id -> image_url mismatch. The
//    listing itself is the fake.
//  - The listing has since ENDED; /itm/358784774259 now redirects to the
//    eBay catalog page /p/24043367539, which shows an unrelated LIVE PSA
//    listing from a different seller. That PSA slab is not, and never was,
//    deal 12766.
//
// Action: record the human-verified MISMATCH (durable counterfeit flag ->
// authenticity:proxy_or_counterfeit -> hidden by isDisplayableDeal) and
// mark the row inactive (the listing genuinely ended = soft-expire).
//
//   node scripts/resolveDeal12766.js            # dry run
//   node scripts/resolveDeal12766.js --apply    # write

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");

const REASON =
  "vision:human-verified MISMATCH. Listing photo (i.ebayimg g/uLwAAeSwPGtqUr~w) is a gold-metal " +
  "novelty plate: solid brushed-gold background where the genuine Rainbow Rare 150/147 has " +
  "white/pastel foil, embossed relief attack text, gold-disc energy symbols, and '(c)2020 " +
  "Pokemon|Nintendo|Creatures|GAMEFREAK' on a 2017 Burning Shadows card. Same gold-metal " +
  "counterfeit family as deals 4220/4247/12286. eBay item 358784774259 (mljsports_andthings) " +
  "has ENDED; /itm/ now redirects to catalog page /p/24043367539 showing an unrelated live PSA " +
  "listing from another seller. queue-miss: 54.85% < 0.55 steep gate, trust cols null.";

(async () => {
  const { data: before, error: e0 } = await db
    .from("deals")
    .select("id, is_active, visual_authenticity_status, visual_authenticity_reason")
    .eq("id", 12766)
    .single();
  if (e0) throw new Error(e0.message);
  console.log("BEFORE:", JSON.stringify(before, null, 1));

  if (!APPLY) {
    console.log("\n(dry run) re-run with --apply to write.");
    return;
  }

  const { error } = await db
    .from("deals")
    .update({
      visual_authenticity_status: "MISMATCH",
      visual_authenticity_reason: REASON,
      visual_authenticity_checked_at: new Date().toISOString(),
      is_active: false,
    })
    .eq("id", 12766);
  if (error) throw new Error(error.message);

  const { data: after } = await db
    .from("deals")
    .select("id, is_active, visual_authenticity_status, visual_authenticity_checked_at")
    .eq("id", 12766)
    .single();
  console.log("AFTER: ", JSON.stringify(after, null, 1));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
