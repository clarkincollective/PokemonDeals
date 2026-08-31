// node scripts/auditHighRiskListings.js [--limit=N]
//
// ONE-OFF forensic audit (Phase 1 deal-trust work). Re-fetches every
// active raw single-card deal with market_price >= $100 AND discount >=
// 60% (plus a few explicitly-flagged ids) via the eBay Browse
// get_item_by_legacy_id endpoint - the ONLY place seller feedback score,
// photo count, returns policy and sold/availability state are visible -
// and dumps every trust signal to JSON + a table so the multi-signal
// promotion rule can be derived from real data rather than guessed.
//
// Costs one Browse call per listing (~141). Prints the remaining Browse
// quota before and after; refuses to run if that would breach the 800
// protected reserve.

require("dotenv").config({ path: ".env.local" });
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");
const ebay = require("../lib/ebay");
const { qualifiesAsTradingCard } = require("../lib/dealMatching");

const RESERVE = 800;
const OUT = `${process.env.TEMP || "/tmp"}/hra_audit.json`;
const POP = `${process.env.TEMP || "/tmp"}/hra_population.json`;

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function legacyId(listingId) {
  const m = String(listingId ?? "").match(/^v\d+\|(\d+)\|/) || String(listingId ?? "").match(/^(\d+)$/);
  return m ? m[1] : null;
}

function descWords(html) {
  return String(html || "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
}

(async () => {
  let pop;
  try {
    pop = JSON.parse(fs.readFileSync(POP, "utf8"));
  } catch {
    console.error(`missing ${POP} - run the population builder first`);
    process.exit(1);
  }

  const q0 = await ebay.getBrowseRateLimit();
  console.log("Browse quota before:", JSON.stringify(q0));
  if (q0 && q0.remaining - pop.length < RESERVE) {
    console.error(`would breach the ${RESERVE} reserve (remaining ${q0.remaining}, need ${pop.length}) - aborting`);
    process.exit(1);
  }

  const limitArg = Number((process.argv.find((a) => a.startsWith("--limit=")) || "").split("=")[1]) || pop.length;
  const targets = pop.slice(0, limitArg);

  // Capture raw item bodies by wrapping fetch (getItemsByLegacyIds maps
  // away the fields we need - additionalImages, returnTerms,
  // estimatedAvailabilities, description).
  const origFetch = global.fetch;
  const rawById = new Map();
  global.fetch = async (u, o) => {
    const r = await origFetch(u, o);
    const s = String(u);
    if (s.includes("get_item_by_legacy_id")) {
      const id = new URL(s).searchParams.get("legacy_item_id");
      try {
        rawById.set(id, await r.clone().json());
      } catch {
        /* leave unset */
      }
    }
    return r;
  };

  const out = [];
  let done = 0;
  for (const row of targets) {
    const lid = legacyId(row.listing_id);
    if (!lid) {
      out.push({ id: row.id, error: "no legacy id", row });
      continue;
    }
    await ebay.getItemsByLegacyIds([lid], row.marketplace, { concurrency: 1 });
    const raw = rawById.get(lid);
    done++;
    if (done % 20 === 0) console.log(`  ${done}/${targets.length}`);
    if (!raw) {
      out.push({
        id: row.id,
        legacyId: lid,
        marketplace: row.marketplace,
        gone: true, // ended / removed / blocked
        stored: row,
      });
      continue;
    }
    const avail = raw.estimatedAvailabilities?.[0] ?? {};
    const imgCount = 1 + (raw.additionalImages?.length ?? 0);
    const desc = descWords(raw.description);
    const aspects = Object.fromEntries((raw.localizedAspects ?? []).map((a) => [a.name, a.value]));
    const condDesc = (raw.conditionDescriptors ?? []).find((d) => /card condition/i.test(d.name || ""))?.values?.[0];
    out.push({
      id: row.id,
      legacyId: lid,
      marketplace: row.marketplace,
      storedTitle: row.title,
      liveTitle: raw.title,
      titleChanged: (raw.title || "") !== (row.title || ""),
      qualifiesAsCard: qualifiesAsTradingCard({ title: raw.title, localizedAspects: raw.localizedAspects }),
      cardName: row.card_name,
      cardSet: row.card_set,
      tcgplayerId: row.card_tcgplayer_id,
      marketPrice: row.market_price,
      storedDiscountPct: row.discount_pct,
      storedTotalUsd: row.total_price_usd,
      listingType: row.listing_type,
      livePrice: raw.price?.value ? Number(raw.price.value) : null,
      liveCurrency: raw.price?.currency ?? null,
      currentBid: raw.currentBidPrice?.value ? Number(raw.currentBidPrice.value) : null,
      bidCount: raw.bidCount ?? null,
      sellerScore: raw.seller?.feedbackScore ?? null,
      sellerPct: raw.seller?.feedbackPercentage ? Number(raw.seller.feedbackPercentage) : null,
      sellerName: raw.seller?.username ?? null,
      imageCount: imgCount,
      returnsAccepted: raw.returnTerms?.returnsAccepted ?? null,
      availStatus: avail.estimatedAvailabilityStatus ?? null,
      soldQty: avail.estimatedSoldQuantity ?? null,
      remainingQty: avail.estimatedRemainingQuantity ?? null,
      itemCreationDate: raw.itemCreationDate ?? null,
      itemLocation: raw.itemLocation ? `${raw.itemLocation.city ?? ""}, ${raw.itemLocation.stateOrProvince ?? ""} ${raw.itemLocation.country ?? ""}`.trim() : null,
      topRated: raw.topRatedBuyingExperience ?? null,
      descLen: desc.length,
      descIsJustTitle: desc.toLowerCase().replace(/[^a-z0-9]/g, "").includes((raw.title || "").toLowerCase().replace(/[^a-z0-9]/g, "")) && desc.length < (raw.title || "").length + 40,
      descSample: desc.slice(0, 240),
      aspectSet: aspects["Set"] ?? null,
      aspectCardNumber: aspects["Card Number"] ?? null,
      aspectRarity: aspects["Rarity"] ?? null,
      aspectLanguage: aspects["Language"] ?? null,
      aspectFinish: aspects["Finish"] ?? null,
      aspectFeatures: aspects["Features"] ?? null,
      aspectGrade: aspects["Grade"] ?? aspects["Professional Grader"] ?? null,
      condDescriptor: condDesc?.content ?? null,
      condDescriptorInfo: condDesc?.additionalInfo ?? null,
      affiliateExact: /\/itm\/\d+/.test(raw.itemAffiliateWebUrl || raw.itemWebUrl || ""),
      campidPreserved: /campid=5339197414/.test(raw.itemAffiliateWebUrl || ""),
    });
  }

  global.fetch = origFetch;
  const q1 = await ebay.getBrowseRateLimit();
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), quotaBefore: q0, quotaAfter: q1, count: out.length, rows: out }, null, 1));
  console.log(`\nwrote ${OUT} (${out.length} rows)`);
  console.log("Browse quota after:", JSON.stringify(q1));

  // Quick console summary
  const gone = out.filter((r) => r.gone);
  const sold = out.filter((r) => r.remainingQty === 0 || r.availStatus === "OUT_OF_STOCK");
  const nonCard = out.filter((r) => r.qualifiesAsCard === false);
  console.log(`\ngone/ended: ${gone.length}  sold/oos: ${sold.length}  non-card: ${nonCard.length}`);
  console.log("\nid | disc% | $usd/$mkt | sellerScore | sellerPct | imgs | returns | sold | descLen | card");
  for (const r of out.filter((r) => !r.gone)) {
    console.log(
      `#${r.id} | ${(100 * r.storedDiscountPct).toFixed(0)}% | $${Math.round(r.storedTotalUsd)}/$${Math.round(r.marketPrice)} | ` +
        `${String(r.sellerScore).padStart(6)} | ${r.sellerPct} | ${r.imageCount} | ${r.returnsAccepted} | ` +
        `${r.remainingQty === 0 ? "SOLD" : "-"} | ${r.descLen} | ${r.cardName} / ${r.cardSet}`
    );
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
