// One-off: revert two MISMATCH verdicts the widened-queue global screen
// produced on GENUINE cards (see session report - false-positive check).
//
//  #25493 / #25563  Umbreon (Delta Species) 17/113  (EBAY_GB / EBAY_DE)
//    Both point at the same listing photo. Vision read the holo-foil
//    sheen on the delta-species artwork (rings appearing green/teal under
//    angled light) as "altered/custom colouring" and returned MISMATCH.
//    Checked by hand against canonical 90151: identical genuine card -
//    70 HP, Poke-Body "Delta Moon", Feint Attack, (c)2005, Illus. Ryo
//    Ueda, 17/113. Exactly the "minor colour shift / lighting" the prompt
//    says NOT to treat as MISMATCH.
//
//  #12807  Dialga EX 122/119  XY - Phantom Forces  (EBAY_US, $987)
//    Vision called the genuine 122/119 full-art SECRET RARE an "engraved
//    metal plate ... etched text, edge dents". Checked by hand against
//    canonical 94689: identical genuine card - the 122/119 secret rare
//    legitimately has a full-bleed embossed silver-foil texture and a
//    rainbow holo line; the "dents" are rounded corners shot in-hand.
//    Same false-positive mode as the Umbreons - vision mistaking a
//    heavily-textured genuine foil for novelty metal stock.
//
// Revert to UNKNOWN with a note. All three are 43-49% off, well under
// the 70% visual_unverified hide gate, so they simply show normally.
// (Genuine metal-plate counterfeits found by the same pass - 4582, and
//  12766 - are NOT touched.)
//
//   node scripts/revertVisualFalsePositives.js            # dry run
//   node scripts/revertVisualFalsePositives.js --apply

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");

const REVERTS = [
  {
    ids: [25493, 25563],
    reason:
      "reverted:false-positive. Prior vision MISMATCH ('altered ring colour') was a holo-foil " +
      "sheen / lighting artefact on genuine EX Delta Species Umbreon 17/113 - verified by hand " +
      "against canonical 90151 (70HP, Delta Moon, Feint Attack, (c)2005, Illus. Ryo Ueda). " +
      "not-a-structural-mismatch.",
  },
  {
    ids: [12807],
    reason:
      "reverted:false-positive. Prior vision MISMATCH ('engraved metal plate') was the genuine " +
      "122/119 Dialga EX full-art SECRET RARE - verified by hand against canonical 94689. That " +
      "printing has a full-bleed embossed silver-foil texture + rainbow holo line; the 'dents' " +
      "are rounded corners shot in-hand. not-a-structural-mismatch.",
  },
];

(async () => {
  const allIds = REVERTS.flatMap((r) => r.ids);
  const { data: before } = await db
    .from("deals")
    .select("id, marketplace, visual_authenticity_status, is_active")
    .in("id", allIds);
  console.log("BEFORE:", JSON.stringify(before));

  if (!APPLY) {
    console.log("\n(dry run) re-run with --apply to write.");
    return;
  }

  for (const { ids, reason } of REVERTS) {
    const { error } = await db
      .from("deals")
      .update({
        visual_authenticity_status: "UNKNOWN",
        visual_authenticity_reason: reason,
        visual_authenticity_checked_at: new Date().toISOString(),
      })
      .in("id", ids);
    if (error) throw new Error(error.message);
  }

  const { data: after } = await db
    .from("deals")
    .select("id, visual_authenticity_status, visual_authenticity_checked_at")
    .in("id", allIds);
  console.log("AFTER: ", JSON.stringify(after));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
