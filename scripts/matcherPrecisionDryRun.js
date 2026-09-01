// Dry run for the deterministic-matcher precision pass (collector-number
// + Mega/ex form identity). Compares the NEW lib/dealMatching against the
// stored listing title + card_catalog.card_number for:
//   (a) the 47 visual IDENTITY_MISMATCH rows  (should now fail deterministically)
//   (b) the whole active deal population       (what would newly fail)
//
//   node scripts/matcherPrecisionDryRun.js
//
// Read-only. No writes.

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const {
  listingMatchesCard,
  collectorNumberConflict,
  formIdentityConflict,
  megaFormAsserted,
  exMechanicAsserted,
  parseCatalogNumber,
} = require("../lib/dealMatching");
const { isDisplayableDeal } = require("../lib/dealQuality");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const COLS =
  "id, title, card_name, card_set, card_language, card_tcgplayer_id, market_price, discount_pct, " +
  "is_active, is_graded, condition, disqualified_reason, auction_end_at, listing_type, " +
  "listing_url, affiliate_url, visual_authenticity_status, visual_authenticity_reason";

async function loadCatalogNumbers(ids) {
  const map = new Map();
  const uniq = [...new Set(ids.filter(Boolean).map(String))];
  for (let i = 0; i < uniq.length; i += 300) {
    const { data } = await db
      .from("card_catalog")
      .select("tcgplayer_id, card_number, name, set")
      .in("tcgplayer_id", uniq.slice(i, i + 300));
    for (const c of data ?? []) map.set(String(c.tcgplayer_id), c);
  }
  return map;
}

// which NEW gate (if any) rejects this row
function newRejectReason(title, card) {
  if (formIdentityConflict(title, card.name)) {
    const t = megaFormAsserted(title), c = megaFormAsserted(card.name);
    if (t !== c) return `form:mega (${c ? "catalog" : "listing"}-only)`;
    return "form:ex_mechanic (catalog says ex, listing doesn't)";
  }
  if (card.card_number != null && collectorNumberConflict(title, card.card_number)) {
    return `number:conflict (catalog ${card.card_number})`;
  }
  return null;
}

(async () => {
  // ---- (a) the 47 IDENTITY_MISMATCH rows -------------------------------
  const { data: idm } = await db.from("deals").select(COLS).eq("visual_authenticity_status", "IDENTITY_MISMATCH").order("id");
  const catA = await loadCatalogNumbers(idm.map((r) => r.card_tcgplayer_id));

  const buckets = { rejected: [], stillMatched: [], noCatalogNumber: [], visualOnly: [] };
  for (const r of idm) {
    const cc = catA.get(String(r.card_tcgplayer_id));
    const card = { name: r.card_name, set: r.card_set, language: r.card_language, card_number: cc?.card_number ?? null };
    const listing = { title: r.title, listingUrl: r.listing_url, affiliateUrl: r.affiliate_url };
    const matched = listingMatchesCard(listing, card);
    const why = newRejectReason(r.title, card);
    const rec = { id: r.id, title: r.title, cat: `${cc?.name ?? "?"} #${cc?.card_number ?? "?"}`, why };
    if (!matched) buckets.rejected.push(rec);
    else if (card.card_number == null) buckets.noCatalogNumber.push(rec);
    else buckets.visualOnly.push(rec); // still matches deterministically -> only visual catches it
  }

  console.log("=== (a) 47-row IDENTITY_MISMATCH replay against the NEW matcher ===");
  console.log(`rejected deterministically : ${buckets.rejected.length}`);
  console.log(`still matched (has cat #)  : ${buckets.visualOnly.length}  <- still rely on visual`);
  console.log(`no catalogue number        : ${buckets.noCatalogNumber.length}`);
  for (const b of ["rejected", "visualOnly", "noCatalogNumber"]) {
    console.log(`\n--- ${b} ---`);
    for (const r of buckets[b]) console.log(`#${r.id}  ${r.why ?? "(name/set/variant gate)"}\n     T: ${r.title}\n     C: ${r.cat}`);
  }

  // ---- (b) whole active population -----------------------------------
  const all = [];
  for (let f = 0; f < 20000; f += 1000) {
    const { data } = await db.from("deals").select(COLS).eq("is_active", true).range(f, f + 999);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  const catB = await loadCatalogNumbers(all.map((r) => r.card_tcgplayer_id));

  let displayable = 0;
  const newlyFail = [];
  for (const r of all) {
    if (!isDisplayableDeal(r)) continue; // already hidden by some gate
    displayable++;
    const cc = catB.get(String(r.card_tcgplayer_id));
    const card = { name: r.card_name, set: r.card_set, language: r.card_language, card_number: cc?.card_number ?? null };
    const listing = { title: r.title, listingUrl: r.listing_url, affiliateUrl: r.affiliate_url };
    if (!listingMatchesCard(listing, card)) {
      newlyFail.push({
        id: r.id,
        why: newRejectReason(r.title, card) ?? "(other gate)",
        title: r.title,
        cat: `${cc?.name ?? "?"} / ${cc?.set ?? "?"} #${cc?.card_number ?? "?"}`,
        mkt: Math.round(r.market_price),
        disc: Math.round((r.discount_pct ?? 0) * 100),
      });
    }
  }

  console.log(`\n\n=== (b) active-population dry run ===`);
  console.log(`currently displayable deals : ${displayable}`);
  console.log(`would NEWLY fail the matcher : ${newlyFail.length}`);
  const byReason = {};
  for (const n of newlyFail) byReason[n.why.split(" ")[0]] = (byReason[n.why.split(" ")[0]] || 0) + 1;
  console.log("by reason:", JSON.stringify(byReason));

  // distinct wrong-match patterns (watchlist card + catalogue number)
  const patt = new Map();
  for (const n of newlyFail) {
    const k = `${n.cat}`;
    if (!patt.has(k)) patt.set(k, { count: 0, ids: [], sampleTitle: n.title, maxMkt: 0 });
    const p = patt.get(k);
    p.count++; p.ids.push(n.id); p.maxMkt = Math.max(p.maxMkt, n.mkt);
  }
  console.log(`\ndistinct (catalogue card) patterns: ${patt.size}`);
  const sorted = [...patt.entries()].sort((a, b) => b[1].maxMkt - a[1].maxMkt);
  for (const [k, p] of sorted) {
    console.log(`\n[${p.count} listing(s), up to $${p.maxMkt}]  ${k}`);
    console.log(`   e.g. "${p.sampleTitle}"`);
    console.log(`   ids: ${p.ids.slice(0, 12).join(",")}${p.ids.length > 12 ? " …" : ""}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
