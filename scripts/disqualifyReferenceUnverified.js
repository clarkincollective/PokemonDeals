// node scripts/disqualifyReferenceUnverified.js [--apply]
//
// The Phase-1 ~141-listing Browse audit proved 8 catalogue cards have an
// untrustworthy market_price reference: >=4 independent active listings
// (incl. large established sellers) every one priced <=55% of our
// reference. Until the catalogue price is re-synced from a trusted
// source, NO deal on these cards can be advertised with a real "% below
// market" - so every currently-active raw deal for them is deactivated
// with disqualified_reason 'reference:price_unverified'. Deterministic,
// stored-data only, no eBay calls. (Graded deals are left alone - priced
// against grade-specific sold comps, not this raw reference.)

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const APPLY = process.argv.includes("--apply");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// tcgplayer_id -> why (for the log)
const CARDS = {
  85929: "Groudon ex / EX Hidden Legends ($263 ref, every ask <=$102)",
  87399: "Mew / EX Legend Maker ($209 ref, every ask <=$73)",
  87432: "Mewtwo EX (98 Full Art) / Next Destinies ($254 ref, every ask <=$100)",
  88642: "Rayquaza ex / EX Dragon ($485 ref, every ask <=$188)",
  107001: "Clefairy / Base Set Shadowless ($199 ref, every ask <=$73)",
  181694: "Magikarp & Wailord GX / SM Promos ($168 ref, every ask <=$67)",
  183806: "Pikachu & Zekrom GX (Secret) 184/181 / SM Team Up ($241 ref, every ask <=$110)",
  185985: "Pikachu & Zekrom GX / SM Promos ($225 ref, 16 asks $58-85)",
};

(async () => {
  const ids = Object.keys(CARDS);
  const { data, error } = await db
    .from("deals")
    .select("id, card_tcgplayer_id, card_name, card_set, marketplace, discount_pct, is_graded, disqualified_reason")
    .in("card_tcgplayer_id", ids)
    .eq("is_active", true);
  if (error) throw new Error(error.message);

  const targets = data.filter((r) => !r.is_graded);
  const byCard = {};
  for (const r of targets) (byCard[r.card_tcgplayer_id] ??= []).push(r);
  for (const id of ids) {
    console.log(`\ntcg ${id} - ${CARDS[id]}`);
    for (const r of byCard[id] ?? []) {
      console.log(`  #${r.id} ${r.marketplace} ${((r.discount_pct ?? 0) * 100).toFixed(0)}%${r.disqualified_reason ? " (was " + r.disqualified_reason + ")" : ""}`);
    }
  }
  console.log(`\ntotal active raw deals to disqualify: ${targets.length}  (graded left alone: ${data.length - targets.length})`);

  if (APPLY) {
    const tids = targets.map((r) => r.id);
    for (let i = 0; i < tids.length; i += 200) {
      const { error: e } = await db
        .from("deals")
        .update({ is_active: false, disqualified_reason: "reference:price_unverified" })
        .in("id", tids.slice(i, i + 200));
      if (e) throw new Error(e.message);
    }
    console.log(`\nAPPLIED: ${tids.length} deactivated (reference:price_unverified).`);
  } else {
    console.log("\n(dry run - re-run with --apply)");
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
