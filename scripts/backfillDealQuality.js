// node scripts/backfillDealQuality.js [--apply] [--api]
//
// Runs the shared deal-quality gate (lib/dealQuality) against every
// currently ACTIVE single-card deal and reports / disqualifies the ones a
// damaged, played, or wrong-language listing should never have been:
//
//   pass 1 (always)  - stored title + condition + card_language only, no
//                      eBay calls. Catches "Altered Pin Holes", "(Poor)",
//                      "Japanese ... " on an English row, stored MP/HP.
//   pass 2 (--api)   - for the suspicious remainder (raw, NM/Unknown,
//                      >=25% apparent discount) fetch the structured
//                      "Card Condition" descriptor + Language item-specific
//                      via one getItem per listing, budgeted, and re-judge.
//                      This is what catches deal 24391 (eBay says "Heavily
//                      played (Poor)" but the title is clean).
//
// Without --apply it only prints the audit. With --apply it sets
// is_active=false (and disqualified_reason if that column exists) on the
// failures - the scanner's own broadened gate then keeps them retired.

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const {
  disqualificationReason,
  classifyListingCondition,
  conditionAllowsPromotion,
} = require("../lib/dealQuality");
const {
  getItemsByLegacyIds,
  cardConditionDescriptorContent,
  languageAspect,
} = require("../lib/ebay");
const { legacyIdFromListingId } = require("../lib/discoveryLog");

const APPLY = process.argv.includes("--apply");
const USE_API = process.argv.includes("--api");
const API_BUDGET = Number((process.argv.find((a) => a.startsWith("--budget=")) || "").split("=")[1]) || 1500;

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const log = (...a) => console.log(...a);

async function columnExists(table, col) {
  const { error } = await db.from(table).select(col).limit(1);
  return !error;
}

async function loadActive() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("deals")
      .select(
        "id, listing_id, marketplace, title, condition, is_graded, is_active, discount_pct, total_price_usd, market_price, card_language, card_name, card_set, watchlist_id"
      )
      .eq("is_active", true)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data || !data.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

function tally(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

async function disqualify(ids, reasonById, hasReasonCol) {
  if (!ids.length) return;
  for (let i = 0; i < ids.length; i += 200) {
    const slice = ids.slice(i, i + 200);
    if (hasReasonCol) {
      // one update per distinct reason so the audit trail is exact
      const byReason = new Map();
      for (const id of slice) {
        const r = reasonById.get(id) ?? "quality_gate";
        if (!byReason.has(r)) byReason.set(r, []);
        byReason.get(r).push(id);
      }
      for (const [reason, rids] of byReason) {
        const { error } = await db
          .from("deals")
          .update({ is_active: false, disqualified_reason: reason })
          .in("id", rids);
        if (error) throw new Error(error.message);
      }
    } else {
      const { error } = await db.from("deals").update({ is_active: false }).in("id", slice);
      if (error) throw new Error(error.message);
    }
  }
}

(async () => {
  const hasReasonCol = await columnExists("deals", "disqualified_reason");
  log(`disqualified_reason column: ${hasReasonCol ? "present (audit trail on)" : "ABSENT (is_active=false only)"}`);

  const active = await loadActive();
  const singles = active.filter((r) => !r.is_graded);
  log(`\nactive deals: ${active.length}  (single cards: ${singles.length}, graded: ${active.length - singles.length})`);

  // ---- Top Deals membership (for the "failures currently in Top Deals" line) ----
  // fetchBestFinds ranks is_active raw+graded by discount desc, dedup by
  // watchlist_id, take top ~10 per (country|all). Approximate: the 40
  // highest-discount active single-card rows.
  const topSet = new Set(
    [...singles].sort((a, b) => (b.discount_pct ?? 0) - (a.discount_pct ?? 0)).slice(0, 40).map((r) => r.id)
  );

  const reasonById = new Map();
  const failIds = [];
  const byReason = new Map();
  const byMkt = new Map();
  let inTop = 0;

  // ---------- PASS 1: stored data only ----------
  const survivors = [];
  for (const r of singles) {
    const reason = disqualificationReason(r);
    if (reason) {
      reasonById.set(r.id, reason);
      failIds.push(r.id);
      tally(byReason, reason.split(":")[0]);
      tally(byMkt, r.marketplace);
      if (topSet.has(r.id)) inTop++;
    } else {
      survivors.push(r);
    }
  }
  log(`\n===== PASS 1 (stored data) =====`);
  log(`failures: ${failIds.length}`);
  for (const [k, v] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) log(`   ${k}: ${v}`);

  // ---------- PASS 2: structured getItem for the suspicious remainder ----------
  let pass2Fail = 0;
  const pass2ByReason = new Map();
  if (USE_API) {
    const suspicious = survivors.filter(
      (r) => (r.discount_pct ?? 0) >= 0.25 && legacyIdFromListingId(r.listing_id)
    );
    // most-suspicious first, bounded by budget
    suspicious.sort((a, b) => (b.discount_pct ?? 0) - (a.discount_pct ?? 0));
    const take = suspicious.slice(0, API_BUDGET);
    log(`\n===== PASS 2 (structured, --api) =====`);
    log(`suspicious survivors: ${suspicious.length}  | checking: ${take.length} (budget ${API_BUDGET})`);

    const byMarket = new Map();
    for (const r of take) {
      if (!byMarket.has(r.marketplace)) byMarket.set(r.marketplace, []);
      byMarket.get(r.marketplace).push(r);
    }
    let calls = 0;
    for (const [marketplace, rs] of byMarket) {
      const legacyById = new Map(rs.map((r) => [String(legacyIdFromListingId(r.listing_id)), r]));
      const { listings, calls: c } = await getItemsByLegacyIds(
        rs.map((r) => legacyIdFromListingId(r.listing_id)),
        marketplace,
        { concurrency: 5 }
      );
      calls += c;
      for (const l of listings) {
        const r = legacyById.get(String(legacyIdFromListingId(l.listingId)));
        if (!r) continue;
        const reason = disqualificationReason(r, {
          descriptorContent: cardConditionDescriptorContent(l.conditionDescriptors),
          itemSpecificLanguage: languageAspect(l.localizedAspects),
        });
        if (reason) {
          reasonById.set(r.id, reason);
          failIds.push(r.id);
          pass2Fail++;
          tally(pass2ByReason, reason.split(":")[0]);
          tally(byMkt, r.marketplace);
          if (topSet.has(r.id)) inTop++;
        }
      }
      log(`   ${marketplace}: ${rs.length} checked, ${c} browse calls`);
    }
    log(`pass 2 browse calls: ${calls}  | pass 2 failures: ${pass2Fail}`);
    for (const [k, v] of [...pass2ByReason.entries()].sort((a, b) => b[1] - a[1])) log(`   ${k}: ${v}`);
  }

  // ---------- extreme-discount sanity (report only) ----------
  const buckets = [0.5, 0.6, 0.7, 0.8];
  log(`\n===== EXTREME-DISCOUNT SANITY =====`);
  for (const b of buckets) {
    const inB = singles.filter((r) => (r.discount_pct ?? 0) >= b);
    const failB = inB.filter((r) => failIds.includes(r.id)).length;
    log(`   >=${b * 100}% : ${inB.length} active, ${failB} fail the quality gate`);
  }

  // ---------- summary ----------
  const uniqFail = [...new Set(failIds)];
  log(`\n===== SUMMARY =====`);
  log(`total active single-card deals : ${singles.length}`);
  log(`disqualified (all passes)      : ${uniqFail.length}`);
  log(`  ...currently in ~Top Deals   : ${inTop}`);
  log(`by marketplace:`);
  for (const [k, v] of [...byMkt.entries()].sort((a, b) => b[1] - a[1])) log(`   ${k}: ${v}`);

  // sample
  log(`\nsample failures:`);
  for (const id of uniqFail.slice(0, 30)) {
    const r = singles.find((x) => x.id === id);
    log(`   #${id} [${reasonById.get(id)}] ${r?.marketplace} disc=${((r?.discount_pct ?? 0) * 100).toFixed(0)}%  ${r?.title}`);
  }

  if (APPLY) {
    log(`\n--apply: disqualifying ${uniqFail.length} rows ...`);
    await disqualify(uniqFail, reasonById, hasReasonCol);
    log(`done.`);
  } else {
    log(`\n(dry run - re-run with --apply to disqualify)`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
