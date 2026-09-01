// One-off: revert two MISMATCH verdicts the widened-queue global screen
// produced on GENUINE cards (see session report - false-positive check).
//
//  #25493 / #25563  Umbreon (Delta Species) 17/113  (EBAY_GB / EBAY_DE)
//    Both point at the same listing photo. Vision read the holo-foil
//    sheen on the delta-species artwork (rings appearing green/teal under
//    angled light) as "altered/custom colouring" and returned MISMATCH.
//    Both images were checked by hand against canonical 90151: identical
//    genuine card - 70 HP, Poke-Body "Delta Moon", Feint Attack, (c)2005,
//    Illus. Ryo Ueda, 17/113. This is exactly the "minor colour shift /
//    lighting" the prompt says NOT to treat as MISMATCH.
//
// Revert to UNKNOWN with a note (visionRan reason kept, so the
// high-value + extreme-discount hide still applies if it ever belongs;
// both are ~47-49% off so they simply show normally again).
//
//   node scripts/revertVisualFalsePositives.js            # dry run
//   node scripts/revertVisualFalsePositives.js --apply

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");

const IDS = [25493, 25563];
const REASON =
  "reverted:false-positive. Prior vision MISMATCH ('altered ring colour') was a holo-foil " +
  "sheen / lighting artefact on genuine EX Delta Species Umbreon 17/113 - verified by hand " +
  "against canonical 90151 (70HP, Delta Moon, Feint Attack, (c)2005, Illus. Ryo Ueda). " +
  "vision:not-a-structural-mismatch.";

(async () => {
  const { data: before } = await db
    .from("deals")
    .select("id, marketplace, visual_authenticity_status, is_active")
    .in("id", IDS);
  console.log("BEFORE:", JSON.stringify(before));

  if (!APPLY) {
    console.log("\n(dry run) re-run with --apply to write.");
    return;
  }

  const { error } = await db
    .from("deals")
    .update({
      visual_authenticity_status: "UNKNOWN",
      visual_authenticity_reason: REASON,
      visual_authenticity_checked_at: new Date().toISOString(),
    })
    .in("id", IDS);
  if (error) throw new Error(error.message);

  const { data: after } = await db
    .from("deals")
    .select("id, visual_authenticity_status, visual_authenticity_checked_at")
    .in("id", IDS);
  console.log("AFTER: ", JSON.stringify(after));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
