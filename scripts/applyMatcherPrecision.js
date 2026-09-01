// Apply the matcher precision pass to the EXISTING active population.
// For every currently-displayable deal whose stored listing title no
// longer matches its catalogue printing under the new lib/dealMatching
// (collector-number / Mega / ex identity), deactivate it with
// disqualified_reason 'identity:card_mismatch'. Reversible (is_active
// flag + reason), not a delete. Logs every affected row.
//
//   node scripts/applyMatcherPrecision.js            # dry run - full list
//   node scripts/applyMatcherPrecision.js --apply
//
// SKIP: known card_catalog data errors where the catalogue number itself
// is wrong (so the "conflict" is spurious) - fix the catalog row instead.

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const { listingMatchesCard, collectorNumberConflict, formIdentityConflict } = require("../lib/dealMatching");
const { isDisplayableDeal } = require("../lib/dealQuality");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");

// Deals to leave alone pending manual card_catalog review: the numerator
// is off by only 1-3 from the catalogue at the SAME set size and the card
// is low value, so it could be a seller fat-finger on the right card
// rather than a genuinely different printing. Flagged for a catalogue
// spot-check rather than auto-deactivated.
//   24406 / 24407 - Magikarp & Wailord GX (Full Art) SM Team Up: FA is
//     161/181, catalogue says 160/181.
//   22518 Zapdos 28/83 Generations · 16662 Kabutops 8/100 Majestic Dawn
//   19020 Persian 44/144 Skyridge · 22838/22840/22842 Whirlipede 58/086
//   24365 Growlithe 4/12 McDonald's 2018 · 26813 Lt. Surge's Pikachu 84/132
const SKIP_DEAL_IDS = new Set([
  24406, 24407, 22518, 16662, 19020, 22838, 22840, 22842, 24365, 26813,
]);

const COLS =
  "id, title, card_name, card_set, card_language, card_tcgplayer_id, market_price, discount_pct, " +
  "is_active, is_graded, condition, disqualified_reason, auction_end_at, listing_type, " +
  "listing_url, affiliate_url, visual_authenticity_status";

(async () => {
  const all = [];
  for (let f = 0; f < 30000; f += 1000) {
    const { data } = await db.from("deals").select(COLS).eq("is_active", true).range(f, f + 999);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  const ids = [...new Set(all.map((r) => String(r.card_tcgplayer_id)).filter(Boolean))];
  const num = new Map();
  for (let i = 0; i < ids.length; i += 400) {
    const { data } = await db.from("card_catalog").select("tcgplayer_id, card_number, name, set").in("tcgplayer_id", ids.slice(i, i + 400));
    for (const c of data ?? []) num.set(String(c.tcgplayer_id), c);
  }

  const hits = [];
  for (const r of all) {
    if (!isDisplayableDeal(r)) continue;
    const cc = num.get(String(r.card_tcgplayer_id));
    const card = {
      name: r.card_name,
      set: r.card_set,
      language: r.card_language,
      card_number: cc?.card_number ?? null,
    };
    if (listingMatchesCard({ title: r.title }, card)) continue;
    const why =
      formIdentityConflict(r.title, card.name)
        ? "form"
        : card.card_number != null && collectorNumberConflict(r.title, card.card_number)
          ? "number"
          : "name/set/variant";
    hits.push({
      id: r.id,
      why,
      skip: SKIP_DEAL_IDS.has(r.id),
      mkt: Math.round(r.market_price),
      disc: Math.round((r.discount_pct ?? 0) * 100),
      already: r.visual_authenticity_status === "IDENTITY_MISMATCH",
      title: r.title,
      cat: `${cc?.name ?? "?"} / ${cc?.set ?? "?"} #${cc?.card_number ?? "?"}`,
    });
  }

  const toDeactivate = hits.filter((h) => !h.skip);
  const byWhy = {};
  for (const h of toDeactivate) byWhy[h.why] = (byWhy[h.why] || 0) + 1;
  console.log(`displayable deals failing the new matcher : ${hits.length}`);
  console.log(`  skipped (known catalogue-number bug)    : ${hits.length - toDeactivate.length}`);
  console.log(`  to deactivate                           : ${toDeactivate.length}`);
  console.log(`  of which already vision IDENTITY_MISMATCH: ${toDeactivate.filter((h) => h.already).length}`);
  console.log(`  by reason: ${JSON.stringify(byWhy)}`);
  console.log("\n--- full list ---");
  for (const h of toDeactivate.sort((a, b) => b.mkt - a.mkt)) {
    console.log(`#${h.id}  $${h.mkt}  ${h.disc}%  ${h.why}${h.already ? "  (vision-confirmed)" : ""}\n     T: ${h.title}\n     C: ${h.cat}`);
  }

  if (!APPLY) {
    console.log("\n(dry run) re-run with --apply to deactivate the list above.");
    return;
  }
  let done = 0;
  for (const h of toDeactivate) {
    const { error } = await db
      .from("deals")
      .update({ is_active: false, disqualified_reason: "identity:card_mismatch" })
      .eq("id", h.id);
    if (error) console.log(`  ! #${h.id}: ${error.message}`);
    else done++;
  }
  console.log(`\ndeactivated ${done}/${toDeactivate.length} rows -> disqualified_reason identity:card_mismatch`);
})().catch((e) => { console.error(e); process.exit(1); });
