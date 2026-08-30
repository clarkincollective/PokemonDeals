// Phase 2 discovery-gap analytics engine. Read-only, service-role only
// (called by app/api/admin/discovery-report). Computes the overlap /
// marketplace / latency / deal-quality numbers the brief's Steps 3, 7, 8,
// 9 ask for, straight from `deals.discovery_source` and the append-only
// `discovery_events` log - and honestly reports when there isn't enough
// data yet to draw conclusions.
//
// It does NOT attempt Steps 4/5/6/11/12/15 (title-pattern gap analysis,
// query-pattern mining, scanner-change recommendations). Those are an
// interpretive pass over accumulated external-only listings and must not
// be synthesised before that data exists.

// Enough-data thresholds. Below these, the report returns numbers but
// marks them non-actionable - a week of feed data with 40 external-only
// listings can't tell you where your scanner is weak.
const SUFFICIENCY = {
  minDays: 14,
  minExternalOnlyListings: 300,
  minExternalAcceptedDeals: 30,
};

const MARKETPLACES = ["EBAY_US", "EBAY_GB", "EBAY_AU", "EBAY_CA", "EBAY_DE", "EBAY_IT"];

function sinceIso(days) {
  return new Date(Date.now() - days * 86400 * 1000).toISOString();
}

async function pagedCount(db, table, applyFilters) {
  // count:"exact", head:true - a COUNT(*) with no rows transferred.
  const q = applyFilters(db.from(table).select("*", { count: "exact", head: true }));
  const { count, error } = await q;
  return error ? null : count ?? 0;
}

// --- Step 3: discovery overlap over a window --------------------------------
async function overlap(db, days) {
  const since = sinceIso(days);
  const base = (q) => q.gte("first_seen_at", since);

  const [scanOnly, externalOnly, both, total] = await Promise.all([
    pagedCount(db, "deals", (q) => base(q).eq("discovery_source", "scan")),
    pagedCount(db, "deals", (q) => base(q).eq("discovery_source", "external")),
    pagedCount(db, "deals", (q) => base(q).eq("discovery_source", "scan+external")),
    pagedCount(db, "deals", (q) => base(q)),
  ]);

  return {
    windowDays: days,
    totalDeals: total,
    scanOnly,
    externalOnly,
    foundByBoth: both,
    externalContribution:
      total && externalOnly != null ? +(((externalOnly + (both ?? 0)) / total) * 100).toFixed(1) : null,
    externalUniqueContribution: total && externalOnly != null ? +((externalOnly / total) * 100).toFixed(1) : null,
  };
}

// --- Step 7: per-marketplace external-only rate ----------------------------
async function marketplaceBreakdown(db, days) {
  const since = sinceIso(days);
  const rows = [];
  for (const m of MARKETPLACES) {
    const base = (q) => q.gte("first_seen_at", since).eq("marketplace", m);
    const [ext, both, scan] = await Promise.all([
      pagedCount(db, "deals", (q) => base(q).eq("discovery_source", "external")),
      pagedCount(db, "deals", (q) => base(q).eq("discovery_source", "scan+external")),
      pagedCount(db, "deals", (q) => base(q).eq("discovery_source", "scan")),
    ]);
    const totalExternal = (ext ?? 0) + (both ?? 0);
    rows.push({
      marketplace: m,
      scanTotal: (scan ?? 0) + (both ?? 0),
      externalTotal: totalExternal,
      externalOnly: ext ?? 0,
      externalOnlyPctOfExternal: totalExternal ? +(((ext ?? 0) / totalExternal) * 100).toFixed(1) : null,
    });
  }
  return rows;
}

// --- Step 8: scan-vs-feed discovery latency -------------------------------
// From discovery_events: for each listing_key the external feed logged,
// when (if ever) did the scanner independently log the same key?
async function latency(db, days) {
  const since = sinceIso(days);
  const { data: events, error } = await db
    .from("discovery_events")
    .select("listing_key, source, occurred_at")
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: true });
  if (error) return { error: error.message };

  const firstExternal = new Map();
  const firstScan = new Map();
  for (const e of events ?? []) {
    const map = e.source === "external" ? firstExternal : e.source === "scan" ? firstScan : null;
    if (map && !map.has(e.listing_key)) map.set(e.listing_key, Date.parse(e.occurred_at));
  }

  const latencies = [];
  let neverFoundByScan = 0;
  for (const [key, extAt] of firstExternal) {
    const scanAt = firstScan.get(key);
    if (scanAt == null) {
      neverFoundByScan++;
      continue;
    }
    if (scanAt >= extAt) latencies.push((scanAt - extAt) / 60000); // minutes
  }
  latencies.sort((a, b) => a - b);
  const pct = (p) => (latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(p * latencies.length))] : null);

  return {
    externalListingsSeen: firstExternal.size,
    alsoFoundByScanner: latencies.length,
    neverFoundByScanner: neverFoundByScan,
    neverFoundPct: firstExternal.size ? +((neverFoundByScan / firstExternal.size) * 100).toFixed(1) : null,
    latencyMinutes: {
      median: pct(0.5) != null ? Math.round(pct(0.5)) : null,
      p90: pct(0.9) != null ? Math.round(pct(0.9)) : null,
      mean: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
    },
  };
}

// --- Step 9: feed acceptance rate + value ---------------------------------
// The scanner only logs events for listings that BECAME deals, so a
// scan-side acceptance rate isn't computable from this table - only the
// feed side (which logs every verified listing) is. Stated plainly.
async function dealQuality(db, days) {
  const since = sinceIso(days);
  const { data, error } = await db
    .from("discovery_events")
    .select("source, became_deal, discount_pct")
    .eq("source", "external")
    .gte("occurred_at", since);
  if (error) return { error: error.message };

  const verified = data.length;
  const accepted = data.filter((d) => d.became_deal);
  const discounts = accepted.map((d) => Number(d.discount_pct)).filter((n) => Number.isFinite(n));

  return {
    feedVerifiedListings: verified,
    feedAcceptedDeals: accepted.length,
    feedAcceptanceRatePct: verified ? +((accepted.length / verified) * 100).toFixed(1) : null,
    feedAcceptedMedianDiscountPct:
      discounts.length ? +((discounts.sort((a, b) => a - b)[Math.floor(discounts.length / 2)]) * 100).toFixed(1) : null,
    note: "Scanner-side acceptance rate is not in discovery_events (scan logs only became_deal=true). Compare against refresh-deals run stats.",
  };
}

async function dataSufficiency(db, days) {
  const { data: earliest } = await db
    .from("discovery_events")
    .select("occurred_at")
    .eq("source", "external")
    .order("occurred_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const daysOfData = earliest ? (Date.now() - Date.parse(earliest.occurred_at)) / 86400000 : 0;

  const externalOnly = await pagedCount(db, "deals", (q) =>
    q.gte("first_seen_at", sinceIso(days)).eq("discovery_source", "external")
  );
  const acceptedExternal = await pagedCount(db, "discovery_events", (q) =>
    q.eq("source", "external").eq("became_deal", true).gte("occurred_at", sinceIso(days))
  );

  const have = {
    daysOfExternalData: +daysOfData.toFixed(1),
    externalOnlyListings: externalOnly ?? 0,
    externalAcceptedDeals: acceptedExternal ?? 0,
  };
  const sufficient =
    have.daysOfExternalData >= SUFFICIENCY.minDays &&
    have.externalOnlyListings >= SUFFICIENCY.minExternalOnlyListings &&
    have.externalAcceptedDeals >= SUFFICIENCY.minExternalAcceptedDeals;

  return { sufficient, have, need: SUFFICIENCY };
}

export async function discoveryReport(db, { days = 7 } = {}) {
  const [suff, ov, mkt, lat, dq] = await Promise.all([
    dataSufficiency(db, days),
    overlap(db, days),
    marketplaceBreakdown(db, days),
    latency(db, days),
    dealQuality(db, days),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    windowDays: days,
    dataSufficiency: suff,
    // When not sufficient, these are shown but must be treated as
    // directional-only - not a basis for changing the scanner (brief Step
    // 10: "measure first"). Steps 4/5/6/11/12/15 are deliberately absent:
    // they require an analyst pass over accumulated external-only listings.
    actionable: suff.sufficient,
    overlap: ov,
    marketplaceGaps: mkt,
    discoveryLatency: lat,
    dealQuality: dq,
    notComputedYet: [
      "Step 4-6: title/query-pattern gap mining over external-only listings",
      "Step 11: candidate prioritisation score (needs observed acceptance-by-signal data)",
      "Step 12-13: concrete scanner changes + accepted-deals-per-Browse-call ranking",
      "Step 15: top-5 scanner changes to replace the feed",
    ],
  };
}

export { SUFFICIENCY };
