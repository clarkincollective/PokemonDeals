// One-off: seed the split visual-authenticity taxonomy on the rows that
// were hand-verified during the 12766 / hardening investigation, so the
// bounded ?mode=recheck-mismatch worker only has to re-judge the rest.
//
//   COUNTERFEIT_MISMATCH  #12766  Charizard GX Rainbow 150/147 - gold metal
//                                  plate, (c)2020 on a 2017 set. (inactive)
//   COUNTERFEIT_MISMATCH  #4582   Special Delivery Pikachu SWSH074 - pink
//                                  glitter metal plate, embossed relief text.
//   IDENTITY_MISMATCH     #30835  listing is a genuine Mega Dragonite ex
//                                  152/217 (ME: Ascended Heroes, (c)2026);
//                                  matched to Dragonite-EX 106/108 (XY
//                                  Evolutions, (c)2016, tcgplayer 124119,
//                                  $49 mkt). Seller set the eBay "Set"
//                                  aspect to "Evolutions" - wrong - so the
//                                  deterministic matcher accepted it and
//                                  the $49 reference produced a fake
//                                  "61% below market". A genuine card,
//                                  not a counterfeit. Below the $100
//                                  visual-screening floor, so hand-tagged.
//
//   node scripts/retagVisualTaxonomy.js            # dry run
//   node scripts/retagVisualTaxonomy.js --apply

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");

const ROWS = [
  {
    id: 12766,
    status: "COUNTERFEIT_MISMATCH",
    reason:
      "vision:human-verified COUNTERFEIT. Gold-metal novelty plate of Charizard GX Rainbow 150/147: " +
      "solid brushed-gold field, embossed relief attack text, gold-disc energy symbols, '(c)2020 " +
      "Pokemon|Nintendo|Creatures|GAMEFREAK' on a 2017 Burning Shadows card. Family: deals 4220/4247/12286. " +
      "Listing has ended (/itm/ 301s to catalog /p/24043367539).",
  },
  {
    id: 4582,
    status: "COUNTERFEIT_MISMATCH",
    reason:
      "vision:human-verified COUNTERFEIT. Special Delivery Pikachu SWSH074 as a solid pink glitter " +
      "metal plate - embossed/illegible relief text, no normal print structure, no printed lower-half " +
      "rules box. Genuine SWSH074 is standard yellow paper. Same metal-plate family as 12766.",
  },
  {
    id: 30835,
    status: "IDENTITY_MISMATCH",
    reason:
      "vision:human-verified IDENTITY_MISMATCH (NOT counterfeit). Listing photo is a genuine Mega " +
      "Dragonite ex Full Art 152/217, ME: Ascended Heroes ((c)2026, ASC EN, Sky Transport / Ryuno " +
      "Glide, 370HP). Matched card is Dragonite-EX Full Art 106/108, XY Evolutions ((c)2016, " +
      "tcgplayer 124119, ~$49 market). Seller's eBay 'Set' aspect = 'Evolutions' (wrong) let the " +
      "deterministic matcher accept it; the $49 reference produced a false 61% below-market. Below " +
      "the $100 visual-screening floor so hand-tagged.",
  },
];

(async () => {
  const { data: before } = await db
    .from("deals")
    .select("id, is_active, visual_authenticity_status")
    .in("id", ROWS.map((r) => r.id));
  console.log("BEFORE:", JSON.stringify(before));

  if (!APPLY) {
    console.log("\n(dry run) re-run with --apply to write.");
    return;
  }

  for (const { id, status, reason } of ROWS) {
    const { error } = await db
      .from("deals")
      .update({
        visual_authenticity_status: status,
        visual_authenticity_reason: reason,
        visual_authenticity_checked_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw new Error(`#${id}: ${error.message}`);
  }

  const { data: after } = await db
    .from("deals")
    .select("id, is_active, visual_authenticity_status, visual_authenticity_checked_at")
    .in("id", ROWS.map((r) => r.id));
  console.log("AFTER: ", JSON.stringify(after));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
