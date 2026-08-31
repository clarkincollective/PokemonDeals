// node scripts/backfillAuthenticity.js [--apply]
//
// AUTHENTICITY stage backfill. Two parts, both deterministic + stored-data
// only (no eBay calls):
//
//  1. Re-judge every active deal against admitsProxyOrCounterfeit() - a
//     stored title that admits the item is a proxy / replica / custom /
//     unofficial / "metal card" novelty of a paper printing is
//     deactivated with disqualified_reason 'authenticity:proxy_or_counterfeit'.
//
//  2. Reclassify the subset of already-inactive rows currently tagged
//     'type:not_a_card' that are actually proxy/fan-made card-shaped items
//     (not keychains/coins/cases) to the more specific authenticity reason.
//
//  3. Re-tag the three deals whose LISTING IMAGE was human-verified as a
//     gold/silver metal counterfeit (titles are clean, so the automatic
//     gate cannot catch them; this is direct evidence, not a heuristic).

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const { admitsProxyOrCounterfeit } = require("../lib/dealMatching");

const APPLY = process.argv.includes("--apply");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const log = (...a) => console.log(...a);

// Human-verified from the eBay listing photo (see task report): a
// brushed gold/silver METAL PLATE reproduction of a paper printing.
// Titles say only "...Holo" so the deterministic gate cannot see it.
const VISUALLY_VERIFIED_COUNTERFEIT = [4220, 4247, 12286];

(async () => {
  // --- 1. active rows ---
  const active = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await db
      .from("deals")
      .select("id, title, card_name, card_set, marketplace, discount_pct, is_active, disqualified_reason")
      .eq("is_active", true)
      .range(f, f + 999);
    if (error) throw new Error(error.message);
    if (!data || !data.length) break;
    active.push(...data);
    if (data.length < 1000) break;
  }
  const bad = active.filter((r) =>
    admitsProxyOrCounterfeit({ title: r.title }, r.card_name ? { name: r.card_name, set: r.card_set } : null)
  );
  log(`active deals: ${active.length}  ->  authenticity:proxy_or_counterfeit: ${bad.length}`);
  for (const r of bad) log(`  #${r.id} ${r.marketplace} "${r.title}"`);

  // --- 2. reclassify inactive type:not_a_card rows that are really proxies ---
  const { data: nac } = await db
    .from("deals")
    .select("id, title, card_name, card_set")
    .eq("disqualified_reason", "type:not_a_card");
  const reclass = (nac ?? []).filter((r) =>
    admitsProxyOrCounterfeit({ title: r.title }, r.card_name ? { name: r.card_name, set: r.card_set } : null)
  );
  log(`\ntype:not_a_card -> authenticity:proxy_or_counterfeit reclassify: ${reclass.length}`);
  for (const r of reclass) log(`  #${r.id} "${r.title}"`);

  // --- 3. image-verified counterfeits ---
  const { data: vv } = await db
    .from("deals")
    .select("id, is_active, disqualified_reason, title")
    .in("id", VISUALLY_VERIFIED_COUNTERFEIT);
  log(`\nimage-verified counterfeits (re-tag ${VISUALLY_VERIFIED_COUNTERFEIT.join(", ")}):`);
  for (const r of vv ?? []) log(`  #${r.id} is_active=${r.is_active} was="${r.disqualified_reason}"  "${r.title}"`);

  if (!APPLY) {
    log("\n(dry run - re-run with --apply)");
    return;
  }

  const setReason = async (ids) => {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await db
        .from("deals")
        .update({ is_active: false, disqualified_reason: "authenticity:proxy_or_counterfeit" })
        .in("id", ids.slice(i, i + 200));
      if (error) throw new Error(error.message);
    }
  };
  await setReason(bad.map((r) => r.id));
  await setReason(reclass.map((r) => r.id));
  await setReason(VISUALLY_VERIFIED_COUNTERFEIT);
  const total = new Set([...bad.map((r) => r.id), ...reclass.map((r) => r.id), ...VISUALLY_VERIFIED_COUNTERFEIT]).size;
  log(`\nAPPLIED: ${total} rows now authenticity:proxy_or_counterfeit.`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
