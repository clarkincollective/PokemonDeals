// node scripts/backfillDealQuality.js [--apply] [--api] [--budget=N]
//
// Runs the shared deal-quality gate (lib/dealQuality) against every
// currently ACTIVE single-card deal.
//
//   pass 1 (always, no eBay) - stored title + condition + card_language.
//     * HARD fail (played/damaged/wrong-language) -> is_active=false.
//     * "unknown_unverified" (bare "Ungraded"/null, no wear evidence) ->
//       NOT deactivated: isDisplayableDeal already hides these from every
//       ranking/grid live. Reported only. Overwritten to a literal
//       "Unknown" (+ disqualified_reason if the column exists) for a tidy
//       audit trail.
//   pass 2 (--api) - for promotable-tier + suspicious (>=25% discount OR
//     high-value vintage) survivors, one getItem each (budgeted) to read
//     the structured "Card Condition" descriptor + Language item-specific.
//     Structured HP/MP/Damaged or wrong-language -> is_active=false.
//     No descriptor on a high-value-vintage / >=50% listing -> condition
//     overwritten to "Unknown" (its physical condition could not be
//     established; the display gate then hides it).
//
// Dry run prints the audit. --apply writes.

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const {
  disqualificationReason,
  storedDealCondition,
  physicalConditionOf,
  classifyListingCondition,
  isHighValueVintage,
} = require("../lib/dealQuality");
const {
  getItemsByLegacyIds,
  cardConditionDescriptorContent,
  languageAspect,
  getBrowseRateLimit,
} = require("../lib/ebay");
const { legacyIdFromListingId } = require("../lib/discoveryLog");

const APPLY = process.argv.includes("--apply");
const USE_API = process.argv.includes("--api");
const STAMP_INACTIVE = process.argv.includes("--stamp-inactive");
const argN = (name, def) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? Number(a.split("=")[1]) : def;
};
const API_BUDGET = argN("budget", 2500);
// Never let this run drive the shared eBay Browse quota below this floor -
// the scanner crons (sweep floor 250, priority 600) need headroom.
const QUOTA_RESERVE = argN("reserve", 800);

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const log = (...a) => console.log(...a);
const tally = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);

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
        // listing_url + affiliate_url are REQUIRED - disqualificationReason
        // now runs isExactEbayDealDestination first; without the url
        // columns every row falsely reads as destination:non_exact.
        "id, listing_id, listing_url, affiliate_url, listing_type, auction_end_at, marketplace, title, condition, is_graded, is_active, discount_pct, total_price_usd, market_price, card_language, card_set, watchlist_id"
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

async function updateInChunks(ids, patch) {
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await db.from("deals").update(patch).in("id", ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }
}

async function applyDeactivations(byReason, hasReasonCol) {
  for (const [reason, ids] of byReason) {
    await updateInChunks(ids, hasReasonCol ? { is_active: false, disqualified_reason: reason } : { is_active: false });
  }
}

async function stampInactive(hasReasonCol) {
  if (!hasReasonCol) return log(`(--stamp-inactive skipped: no disqualified_reason column)`);
  // Inactive rows with no reason yet - stamp one ONLY where the stored
  // title/condition/language re-derives a definite reason. Never fabricate:
  // a row deactivated via a structured getItem (evidence not stored) whose
  // stored data looks benign stays reason-less.
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("deals")
      .select(
        "id, listing_id, listing_url, affiliate_url, listing_type, auction_end_at, title, condition, is_graded, card_language, discount_pct"
      )
      .eq("is_active", false)
      .is("disqualified_reason", null)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data || !data.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const byReason = new Map();
  for (const r of rows) {
    if (r.is_graded) continue;
    const reason = disqualificationReason(r); // stored data only
    // don't fabricate a reason where stored data can't establish one -
    // an inactive row is usually just an expired listing.
    if (!reason || reason === "condition:unknown_unverified" || reason === "destination:non_exact") continue;
    if (!byReason.has(reason)) byReason.set(reason, []);
    byReason.get(reason).push(r.id);
  }
  const total = [...byReason.values()].reduce((n, a) => n + a.length, 0);
  log(`\n===== STAMP INACTIVE (${rows.length} reason-less inactive rows) =====`);
  for (const [k, ids] of [...byReason.entries()].sort((a, b) => b[1].length - a[1].length)) log(`   ${k}: ${ids.length}`);
  log(`   (left reason-less, evidence unavailable from stored data: ${rows.filter((r) => !r.is_graded).length - total})`);
  if (APPLY) {
    for (const [reason, ids] of byReason) await updateInChunks(ids, { disqualified_reason: reason });
    log(`   stamped ${total}`);
  }
}

(async () => {
  const hasReasonCol = await columnExists("deals", "disqualified_reason");
  log(`disqualified_reason column: ${hasReasonCol ? "present (audit trail on)" : "ABSENT (is_active / condition only)"}`);
  const rl = await getBrowseRateLimit();
  log(`rate limit: ${JSON.stringify(rl)}`);

  if (STAMP_INACTIVE) await stampInactive(hasReasonCol);

  const active = await loadActive();
  const singles = active.filter((r) => !r.is_graded);
  log(`\nactive deals: ${active.length}  (single cards ${singles.length}, graded ${active.length - singles.length})`);

  // approx "in Top Deals": the 40 highest-discount active single rows
  const topSet = new Set(
    [...singles].sort((a, b) => (b.discount_pct ?? 0) - (a.discount_pct ?? 0)).slice(0, 40).map((r) => r.id)
  );

  // ---------- PASS 1 ----------
  const hardByReason = new Map();     // reason -> [id]  (deactivate)
  const unknownIds = [];             // display-hidden, keep active
  const byMkt = new Map();
  let inTopHard = 0;
  const survivors = [];

  for (const r of singles) {
    const reason = disqualificationReason(r);
    if (!reason) { survivors.push(r); continue; }
    if (reason === "condition:unknown_unverified") {
      unknownIds.push(r.id);
    } else {
      if (!hardByReason.has(reason)) hardByReason.set(reason, []);
      hardByReason.get(reason).push(r.id);
      tally(byMkt, r.marketplace);
      if (topSet.has(r.id)) inTopHard++;
    }
  }
  const hardCount = [...hardByReason.values()].reduce((n, a) => n + a.length, 0);
  log(`\n===== PASS 1 (stored data) =====`);
  log(`HARD failures (-> is_active=false): ${hardCount}`);
  for (const [k, ids] of [...hardByReason.entries()].sort((a, b) => b[1].length - a[1].length))
    log(`   ${k}: ${ids.length}`);
  log(`unknown-unverified (display-hidden, kept active): ${unknownIds.length}`);
  log(`  ...currently in ~Top Deals: hard ${inTopHard}`);

  // ---------- PASS 2 ----------
  const p2ByReason = new Map();
  const p2UnknownIds = [];
  const p2RescueByTier = new Map(); // tier -> [id]  (structured descriptor confirms NM/LP)
  let p2Checked = 0;
  if (USE_API) {
    // include the pass-1 "unknown" rows here - a structured descriptor can
    // RESCUE them (confirm NM/LP) as well as demote them.
    const pool = survivors.concat(singles.filter((r) => unknownIds.includes(r.id)));
    const candidates = pool.filter(
      (r) =>
        legacyIdFromListingId(r.listing_id) &&
        ((r.discount_pct ?? 0) >= 0.25 ||
          unknownIds.includes(r.id) ||
          isHighValueVintage({ set: r.card_set, marketPrice: r.market_price }))
    );
    // vintage + steepest discount first
    candidates.sort((a, b) => {
      const av = isHighValueVintage({ set: a.card_set, marketPrice: a.market_price }) ? 1 : 0;
      const bv = isHighValueVintage({ set: b.card_set, marketPrice: b.market_price }) ? 1 : 0;
      return bv - av || (b.discount_pct ?? 0) - (a.discount_pct ?? 0);
    });
    // Respect the shared Browse quota: never spend past `remaining - reserve`.
    const quotaRoom = rl && rl.remaining != null ? Math.max(0, rl.remaining - QUOTA_RESERVE) : API_BUDGET;
    const limit = Math.min(API_BUDGET, quotaRoom);
    const take = candidates.slice(0, limit);
    log(`\n===== PASS 2 (structured, --api) =====`);
    log(
      `suspicious survivors: ${candidates.length} | quota room: ${quotaRoom} (remaining ${rl?.remaining ?? "?"} - reserve ${QUOTA_RESERVE}) | checking ${take.length}`
    );
    if (limit === 0) log(`  quota too low - run again after the ${rl?.reset ?? "next"} reset.`);

    const byMarket = new Map();
    for (const r of take) {
      if (!byMarket.has(r.marketplace)) byMarket.set(r.marketplace, []);
      byMarket.get(r.marketplace).push(r);
    }
    let calls = 0;
    for (const [marketplace, rs] of byMarket) {
      const byLegacy = new Map(rs.map((r) => [String(legacyIdFromListingId(r.listing_id)), r]));
      const { listings, calls: c } = await getItemsByLegacyIds(
        rs.map((r) => legacyIdFromListingId(r.listing_id)),
        marketplace,
        { concurrency: 5 }
      );
      calls += c;
      for (const l of listings) {
        const r = byLegacy.get(String(legacyIdFromListingId(l.listingId)));
        if (!r) continue;
        p2Checked++;
        const descriptor = cardConditionDescriptorContent(l.conditionDescriptors);
        const reason = disqualificationReason(r, {
          descriptorContent: descriptor,
          itemSpecificLanguage: languageAspect(l.localizedAspects),
        });
        const structuredTier = descriptor
          ? classifyListingCondition({ title: r.title, descriptorContent: descriptor })
          : null;
        if (reason && reason !== "condition:unknown_unverified") {
          if (!p2ByReason.has(reason)) p2ByReason.set(reason, []);
          p2ByReason.get(reason).push(r.id);
        } else if (structuredTier === "Near Mint") {
          // structured descriptor CONFIRMS Near Mint - rescue a row pass 1
          // could only see as "Ungraded"/Unknown.
          if (physicalConditionOf(r.condition) !== "Near Mint") {
            if (!p2RescueByTier.has("Near Mint")) p2RescueByTier.set("Near Mint", []);
            p2RescueByTier.get("Near Mint").push(r.id);
          }
        } else if (structuredTier === "Lightly Played") {
          // Structured LP. The stored discount was computed against the NM
          // reference, and this backfill can't reprice - so an overstated
          // "X% below market" would remain. Conservative: hide it (Unknown)
          // and let the scanner re-discover it against real LP pricing.
          p2UnknownIds.push(r.id);
        } else if (
          !descriptor &&
          (isHighValueVintage({ set: r.card_set, marketPrice: r.market_price }) || (r.discount_pct ?? 0) >= 0.5)
        ) {
          // physical condition could not be established for a high-value
          // vintage / steep-discount listing -> Unknown, hide it.
          p2UnknownIds.push(r.id);
        }
      }
      log(`   ${marketplace}: ${rs.length} rows, ${c} browse calls`);
    }
    const p2Hard = [...p2ByReason.values()].reduce((n, a) => n + a.length, 0);
    const p2Rescued = [...p2RescueByTier.values()].reduce((n, a) => n + a.length, 0);
    log(`checked ${p2Checked} | browse calls ${calls}`);
    log(`pass 2 HARD failures: ${p2Hard}`);
    for (const [k, ids] of [...p2ByReason.entries()].sort((a, b) => b[1].length - a[1].length))
      log(`   ${k}: ${ids.length}`);
    log(`pass 2 -> Unknown (unverifiable high-value/steep): ${p2UnknownIds.length}`);
    log(`pass 2 RESCUED (structured descriptor confirms NM/LP): ${p2Rescued}`);
    for (const [k, ids] of p2RescueByTier) log(`   ${k}: ${ids.length}`);
  }

  // ---------- extreme-discount sanity ----------
  const allHardIds = new Set([...hardByReason.values()].flat().concat([...p2ByReason.values()].flat()));
  log(`\n===== EXTREME-DISCOUNT SANITY =====`);
  for (const b of [0.5, 0.6, 0.7, 0.8]) {
    const inB = singles.filter((r) => (r.discount_pct ?? 0) >= b);
    const fail = inB.filter((r) => allHardIds.has(r.id) || unknownIds.includes(r.id) || p2UnknownIds.includes(r.id)).length;
    log(`   >=${b * 100}% : ${inB.length} active, ${fail} fail the quality gate`);
  }

  // ---------- summary ----------
  const deactivate = new Map([...hardByReason.entries()]);
  for (const [k, ids] of p2ByReason) deactivate.set(k, (deactivate.get(k) ?? []).concat(ids));
  const deactCount = [...deactivate.values()].reduce((n, a) => n + a.length, 0);
  const unknownAll = [...new Set(unknownIds.concat(p2UnknownIds))];
  log(`\n===== SUMMARY =====`);
  log(`active single-card deals        : ${singles.length}`);
  log(`-> is_active=false (hard)       : ${deactCount}`);
  log(`-> condition="Unknown" (hidden) : ${unknownAll.length}`);
  log(`by marketplace (hard):`);
  for (const [k, v] of [...byMkt.entries()].sort((a, b) => b[1] - a[1])) log(`   ${k}: ${v}`);

  const rescuedIds = new Set([...p2RescueByTier.values()].flat());
  if (APPLY) {
    log(`\n--apply ...`);
    await applyDeactivations(deactivate, hasReasonCol);
    // rescues first so they aren't caught by the Unknown overwrite
    for (const [tier, ids] of p2RescueByTier) {
      await updateInChunks(
        ids,
        hasReasonCol ? { condition: tier, disqualified_reason: null } : { condition: tier }
      );
    }
    const toUnknown = unknownAll.filter((id) => !rescuedIds.has(id) && !allHardIds.has(id));
    if (toUnknown.length) {
      await updateInChunks(
        toUnknown,
        hasReasonCol ? { condition: "Unknown", disqualified_reason: "condition:unknown_unverified" } : { condition: "Unknown" }
      );
    }
    log(`done: ${deactCount} deactivated, ${toUnknown.length} -> Unknown, ${rescuedIds.size} rescued.`);
  } else {
    log(`\n(dry run - re-run with --apply)`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
