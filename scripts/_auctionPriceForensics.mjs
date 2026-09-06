// P0 — AUCTION PRICE INTEGRITY forensic trace. READ-ONLY.
// Pulls deal 33143 (and a sample of active auctions) from production and
// compares STORED vs LIVE eBay (authorized get_item_by_legacy_id path).
//
//   node scripts/_auctionPriceForensics.mjs [dealId]
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
import { getUsdRates, toUsd } from "../lib/fx.js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const TARGET = process.argv[2] || "33143";

const EBAY_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_BROWSE_URL = "https://api.ebay.com/buy/browse/v1";
let _tok = null;
async function token() {
  if (_tok) return _tok;
  const basic = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(EBAY_TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }),
  });
  const b = await res.json();
  _tok = b.access_token;
  return _tok;
}

const legacyOf = (listingId) => String(listingId ?? "").split("|")[1] || String(listingId ?? "") || null;

async function liveListing(legacyId, marketplace) {
  const t = await token();
  const url = `${EBAY_BROWSE_URL}/item/get_item_by_legacy_id?legacy_item_id=${encodeURIComponent(legacyId)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${t}`, "X-EBAY-C-MARKETPLACE-ID": marketplace } });
  if (res.status === 404 || res.status === 410) return { status: "ENDED" };
  if (!res.ok) return { status: `HTTP_${res.status}`, body: await res.text() };
  const b = await res.json();
  const buyingOptions = b.buyingOptions ?? [];
  const isAuction = buyingOptions.includes("AUCTION") && !buyingOptions.includes("FIXED_PRICE");
  const avail = b.estimatedAvailabilities?.[0] ?? null;
  return {
    status: "OK",
    title: b.title,
    buyingOptions,
    isAuction,
    currentBidPrice: b.currentBidPrice ?? null,
    price: b.price ?? null,
    bidCount: b.bidCount ?? null,
    marketingPrice: b.marketingPrice ?? null,
    shipping: b.shippingOptions?.[0]?.shippingCost ?? null,
    itemEndDate: b.itemEndDate ?? null,
    itemLocationCountry: b.itemLocation?.country ?? null,
    soldOut: avail?.estimatedAvailabilityStatus === "OUT_OF_STOCK" || avail?.estimatedRemainingQuantity === 0,
  };
}

function pctDiff(a, b) {
  if (!(a > 0)) return null;
  return (((b - a) / a) * 100).toFixed(1) + "%";
}

async function trace(row, rates) {
  const legacy = legacyOf(row.listing_id);
  const live = await liveListing(legacy, row.marketplace);
  const storedNative = Number(row.total_price);
  const storedUsd = Number(row.total_price_usd ?? row.total_price);
  const storedCur = row.currency || null;

  let liveBidVal = null,
    liveBidCur = null,
    liveShipVal = null,
    liveShipCur = null,
    liveTotalNative = null,
    liveTotalUsd = null;
  if (live.status === "OK") {
    const p = live.isAuction ? live.currentBidPrice : live.price;
    liveBidVal = p ? Number(p.value) : null;
    liveBidCur = p ? p.currency : null;
    liveShipVal = live.shipping ? Number(live.shipping.value ?? 0) : 0;
    liveShipCur = live.shipping ? live.shipping.currency : liveBidCur;
    liveTotalNative = liveBidVal != null ? liveBidVal + (liveShipVal || 0) : null;
    liveTotalUsd = liveTotalNative != null ? toUsd(liveTotalNative, liveBidCur, rates) : null;
  }

  const marketUsd = Number(row.market_price);
  const liveDiscount = liveTotalUsd != null && marketUsd > 0 ? (marketUsd - liveTotalUsd) / marketUsd : null;

  return {
    deal_id: row.id,
    listing_id: row.listing_id,
    legacy,
    marketplace: row.marketplace,
    listing_type: row.listing_type,
    card: `${row.card_name ?? row.title} / ${row.card_set ?? ""}`.trim(),
    is_active: row.is_active,
    exact_verified_at: row.exact_verified_at,
    last_seen_at: row.last_seen_at,
    first_seen_at: row.first_seen_at,
    auction_end_at: row.auction_end_at,
    STORED: {
      price_field: Number(row.price),
      shipping_field: Number(row.shipping),
      total_price_native: storedNative,
      total_price_usd: storedUsd,
      currency: storedCur,
      market_price_usd: marketUsd,
      discount_pct: row.discount_pct,
      bid_count: row.bid_count,
    },
    LIVE: {
      status: live.status,
      isAuction: live.isAuction,
      current_bid: liveBidVal,
      bid_currency: liveBidCur,
      bid_count: live.bidCount,
      shipping: liveShipVal,
      shipping_currency: liveShipCur,
      landed_total_native: liveTotalNative,
      landed_total_usd: liveTotalUsd != null ? Number(liveTotalUsd.toFixed(2)) : null,
      end_date: live.itemEndDate,
      item_location: live.itemLocationCountry,
      sold_out: live.soldOut,
    },
    DELTA: {
      stored_vs_live_bid_only: liveBidVal != null ? pctDiff(liveBidVal, Number(row.price)) : null,
      stored_total_usd_vs_live_landed_usd: liveTotalUsd != null ? pctDiff(liveTotalUsd, storedUsd) : null,
      stored_discount_pct: row.discount_pct != null ? (row.discount_pct * 100).toFixed(1) + "%" : null,
      live_recomputed_discount_pct: liveDiscount != null ? (liveDiscount * 100).toFixed(1) + "%" : null,
      still_qualifies_10pct: liveDiscount != null ? liveDiscount >= 0.1 : null,
    },
  };
}

async function main() {
  const rates = await getUsdRates();
  console.log("FX (USD base):", rates);

  // ---- TARGET DEAL ----
  const { data: t, error: te } = await db.from("deals").select("*").eq("id", TARGET).single();
  if (te) {
    console.error("target fetch error:", te.message);
  } else {
    console.log("\n================ FORENSIC TRACE: deal", TARGET, "================");
    console.log(JSON.stringify(await trace(t, rates), null, 2));
  }

  // ---- ALL ACTIVE AUCTIONS ----
  const auctions = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("deals")
      .select("*")
      .eq("is_active", true)
      .eq("listing_type", "AUCTION")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    auctions.push(...data);
    if (data.length < 1000) break;
  }
  console.log(`\n================ ACTIVE AUCTION AUDIT: ${auctions.length} rows ================`);

  const byCur = {};
  for (const a of auctions) {
    const c = a.currency || "(null)";
    byCur[c] = (byCur[c] || 0) + 1;
  }
  console.log("stored currency distribution:", byCur);
  const nonUsdMarketAuctions = auctions.filter((a) => a.marketplace !== "EBAY_US");
  console.log("auctions on non-US marketplaces:", nonUsdMarketAuctions.length);

  // Live-check a bounded sample (quota-safe): target + up to 40 others,
  // prioritising non-US-marketplace and high-value rows.
  const sample = [...auctions]
    .filter((a) => String(a.id) !== String(TARGET))
    .sort((x, y) => {
      const nx = x.marketplace !== "EBAY_US" ? 0 : 1;
      const ny = y.marketplace !== "EBAY_US" ? 0 : 1;
      return nx - ny || Number(y.market_price) - Number(x.market_price);
    })
    .slice(0, 40);

  const rows = [];
  for (const a of sample) {
    try {
      rows.push(await trace(a, rates));
    } catch (e) {
      rows.push({ deal_id: a.id, error: e.message });
    }
  }

  let ended = 0,
    soldOut = 0,
    bidRose = 0,
    dropOut = 0,
    curMismatch = 0,
    landedFarFromStored = 0,
    ok = 0;
  const flagged = [];
  for (const r of rows) {
    if (r.error || !r.LIVE) continue;
    if (r.LIVE.status === "ENDED") {
      ended++;
      flagged.push({ id: r.deal_id, why: "ENDED live but is_active" });
      continue;
    }
    if (r.LIVE.status !== "OK") continue;
    if (r.LIVE.sold_out) soldOut++;
    if (r.LIVE.bid_currency && r.STORED.currency && r.LIVE.bid_currency !== r.STORED.currency) {
      curMismatch++;
      flagged.push({
        id: r.deal_id,
        why: `currency mismatch stored=${r.STORED.currency} live=${r.LIVE.bid_currency}`,
      });
    }
    if (r.LIVE.current_bid != null && r.STORED.price_field != null && r.LIVE.current_bid > r.STORED.price_field + 0.01) {
      bidRose++;
    }
    if (r.DELTA && r.DELTA.still_qualifies_10pct === false) {
      dropOut++;
      flagged.push({
        id: r.deal_id,
        why: `no longer >=10% under: stored ${r.DELTA.stored_discount_pct} -> live ${r.DELTA.live_recomputed_discount_pct}`,
      });
    }
    const rel =
      r.LIVE.landed_total_usd && r.STORED.total_price_usd
        ? Math.abs(r.LIVE.landed_total_usd - r.STORED.total_price_usd) / r.LIVE.landed_total_usd
        : 0;
    if (rel > 0.15) {
      landedFarFromStored++;
      flagged.push({
        id: r.deal_id,
        why: `stored total_usd ${r.STORED.total_price_usd} vs live landed ${r.LIVE.landed_total_usd} (${r.DELTA.stored_total_usd_vs_live_landed_usd})`,
      });
    }
    if (rel <= 0.02) ok++;
  }

  console.log("\n---- SAMPLE RESULTS ----");
  console.log(
    JSON.stringify(
      { checked: rows.length, ended, soldOut, bidRose, dropOut, curMismatch, landedFarFromStored, closeMatch: ok },
      null,
      2
    )
  );
  console.log("\n---- FLAGGED ROWS ----");
  console.log(JSON.stringify(flagged, null, 2));

  console.log("\n---- FULL SAMPLE DETAIL ----");
  console.log(JSON.stringify(rows, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
