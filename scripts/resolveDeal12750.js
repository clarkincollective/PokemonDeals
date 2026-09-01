// One-off: deal 12750 - "Reshiram & Charizard GX (Secret) 217/214
// Sm-Unbroken Bonds Holo" (eBay 257674952201, seller handiman38) - a
// hand-verified gold-metal COUNTERFEIT that reached Best Finds / Top 10.
//
// Physical evidence (listing photo i.ebayimg g/PiQAAeSw19lqe4bG vs
// canonical tcgplayer 189319, the genuine Rainbow Rare):
//   - solid brushed/embossed GOLD METAL PLATE on a wood table, not paper
//   - genuine 217/214 has a printed white/pastel rainbow background;
//     this is a solid gold field with embossed radial hatching
//   - attack text ("Outrage", "Flare Strike", "Double Blaze GX") and the
//     rules box are stamped in heavy relief, misregistered, part
//     illegible - genuine cards are flat offset print
//   - gold-disc energy symbols instead of printed colour icons
//   - etched, unreadable "Illus./(c)2019 Pokemon" line
// Same gold-metal reproduction family as deals 12766 / 4582 / 4220 /
// 4247 / 12286.
//
//   node scripts/resolveDeal12750.js            # dry run
//   node scripts/resolveDeal12750.js --apply

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");

const REASON =
  "vision:human-verified COUNTERFEIT. Listing photo (i.ebayimg g/PiQAAeSw19lqe4bG) is a solid " +
  "gold-metal novelty plate: embossed radial-hatch background where the genuine 217/214 Rainbow " +
  "Rare has a printed white/pastel rainbow scene, relief/misregistered attack text, gold-disc " +
  "energy symbols, etched illegible (c)2019 line. Same gold-metal family as 12766/4582. Reached " +
  "Best Finds / Top 10 - $220 mkt, 55% off - it sat below the visual-screening candidate floor " +
  "and premium placement only ran isDisplayableDeal.";

(async () => {
  const { data: before } = await db
    .from("deals")
    .select("id, is_active, visual_authenticity_status, disqualified_reason")
    .eq("id", 12750)
    .single();
  console.log("BEFORE:", JSON.stringify(before));

  if (!APPLY) {
    console.log("\n(dry run) re-run with --apply");
    return;
  }
  const { error } = await db
    .from("deals")
    .update({
      visual_authenticity_status: "COUNTERFEIT_MISMATCH",
      visual_authenticity_reason: REASON,
      visual_authenticity_checked_at: new Date().toISOString(),
      is_active: false,
    })
    .eq("id", 12750);
  if (error) throw new Error(error.message);

  const { data: after } = await db
    .from("deals")
    .select("id, is_active, visual_authenticity_status, visual_authenticity_checked_at")
    .eq("id", 12750)
    .single();
  console.log("AFTER: ", JSON.stringify(after));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
