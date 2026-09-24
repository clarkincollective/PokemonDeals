// AUDIT 2026-09-23, FINDING 7 — hero chips drop qualifiers.
//
// READ-ONLY. SELECT only: no update/insert/upsert/delete/rpc, no provider
// call, no scan, no affiliate URL requested. It reads the same flagship
// lane the homepage hero renders and asks, for every card in it, what the
// hero says today versus what the SHARED presentation rules say the
// destination will say.
//
//   node scripts/integrity/auditHeroClaims.mjs

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const ROOT = "C:/Users/James/OneDrive/Desktop/pokemon-deals";
for (const line of readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { createClient } = require("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { isDisplayableDeal, listingPresentation, savingsPercentText } = await import(`file:///${ROOT}/lib/dealQuality.js`);
const { offerShipping } = await import(`file:///${ROOT}/lib/offerPresentation.js`);

// The homepage flagship lane: displayable rows, best discount first - the
// same ordering the lane builder uses, close enough to sample what the
// hero actually gets.
const { data, error } = await db
  .from("deals")
  .select("*, watchlist:watchlist_id (name, set, language, justtcg_tcgplayer_id)")
  .eq("is_active", true)
  .eq("source", "ebay")
  .order("discount_pct", { ascending: false })
  .limit(400);
if (error) throw new Error(error.message);

const displayable = (data ?? []).filter((r) => isDisplayableDeal(r));

let chipToday = 0;
let wouldDiffer = 0;
const buckets = { unsupported: 0, before_shipping: 0, auction: 0, no_shipping_basis: 0, agrees: 0 };
const examples = [];

for (const d of displayable) {
  // WHAT THE HERO DOES TODAY (components/HomeHeroArt.js): its own gate.
  const heroPct = Number(d.discount_pct) > 0 ? savingsPercentText(d.discount_pct) : null;
  if (!heroPct) continue;
  chipToday++;

  // WHAT THE SHARED RULES SAY, exactly as DealCard applies them.
  const presentation = listingPresentation(d);
  const showSavings = presentation.savings === "trusted";
  const ship = offerShipping(d);
  const savingsSupported = showSavings && ship.savingClaim !== "none";
  const isAuction = d.listing_type === "AUCTION";

  let verdict = "agrees";
  if (!showSavings) verdict = "unsupported";
  else if (ship.savingClaim === "none") verdict = "no_shipping_basis";
  else if (isAuction) verdict = "auction";
  else if (ship.savingClaim === "before_shipping") verdict = "before_shipping";

  buckets[verdict]++;
  if (verdict !== "agrees") {
    wouldDiffer++;
    if (examples.length < 12) {
      examples.push({
        id: d.id,
        card: (d.watchlist?.name ?? d.title ?? "").slice(0, 44),
        heroChip: `${heroPct} off`,
        verdict,
        savingsTrusted: showSavings,
        reason: presentation.savingsReason ?? null,
        savingClaim: ship.savingClaim,
        qualifier: ship.savingQualifier || "(none)",
        listingType: d.listing_type,
        destinationSays: !savingsSupported
          ? "no savings claim — plain listing"
          : isAuction
            ? `${heroPct} under market ref${ship.savingQualifier} · Auction, bids can rise`
            : `${heroPct} below market${ship.savingQualifier}`,
      });
    }
  }
}

console.log("# finding 7 — hero savings chips vs the shared presentation rules (READ-ONLY)");
console.log(`cutoff: ${new Date().toISOString()}`);
console.log(`population: displayable active eBay rows, discount-first (the hero's lane)\n`);
console.log(`rows displayable                         ${displayable.length}`);
console.log(`…on which the hero would print a chip    ${chipToday}`);
console.log(`…whose chip the destination contradicts  ${wouldDiffer}\n`);
console.log("by reason:");
for (const [k, v] of Object.entries(buckets)) console.log(`  ${k.padEnd(20)} ${v}`);
console.log("\nexamples:");
for (const e of examples) {
  console.log(`  deal ${e.id} — ${e.card}`);
  console.log(`    hero today:  "${e.heroChip}"   (${e.listingType})`);
  console.log(`    destination: ${e.destinationSays}`);
  console.log(`    why:         ${e.verdict}${e.reason ? ` (${e.reason})` : ""}, savingClaim=${e.savingClaim}, qualifier="${e.qualifier}"`);
}
