// Phase 2.5 - read-only operational health report for the external
// discovery system. Distinct from lib/discoveryAnalytics.js (that's the
// Phase 3 gap-analysis, gated on data sufficiency). This one answers
// "is the pipeline still running correctly right now" and flags
// operational anomalies - it never modifies anything.
//
// Data sources: `discovery_events` (append-only log) + `deals` +
// getBrowseRateLimit() (live). The `ingest-feed` HTTP response carries a
// few counters that are NOT persisted anywhere (duration, errors[],
// rateLimitRemaining at run time, expiredFeedOnly, exact
// untrusted/graded/noMatch split, quota-skip count). Those are reported
// as `notPersisted` rather than guessed - adding an ingest_runs table
// would capture them but that's a schema change, out of scope here.

// Relative (not "@/lib/...") so `node --test` can import this module
// directly for the pure-function unit tests; Next resolves it the same.
import { legacyIdFromListingId } from "./discoveryLog.js";

// One ingest cycle writes all its external events within a few seconds.
// Group events into "cycles" by clustering on occurred_at with this gap.
const CYCLE_GAP_MS = 5 * 60 * 1000;

// Operational alert thresholds. These are OPS alerts, not business
// thresholds - they say "something looks wrong with the plumbing", never
// "change the scanner".
export const HEALTH_THRESHOLDS = {
  feedStaleHours: 2, // ingest-feed cron is hourly; >2h silent = alert
  scanStaleHours: 2, // US sweep is every 15m; >2h with no scan deal event is unusual
  quotaFloor: 800, // must match RATE_LIMIT_FLOOR in app/api/ingest-feed
  perCycleCap: 40, // must match MAX_NEW_PER_CYCLE in app/api/ingest-feed
  recentVerifyHours: 20, // must match RECENT_VERIFY_HOURS in app/api/ingest-feed
  feedOnlyGraceDays: 2, // must match FEED_ONLY_GRACE_DAYS in app/api/ingest-feed
};

// Classify a became_deal=false external event by what we CAN infer from
// its stored shape. untrusted / graded / no-catalogue-match all look
// identical in the log (no card, no discount) so they collapse into one
// bucket; no_price and not_a_deal are distinguishable.
export function classifyRejection(ev) {
  if (ev.became_deal) return null;
  const hasCard = ev.card_tcgplayer_id != null;
  const hasDiscount = ev.discount_pct != null;
  if (hasCard && hasDiscount) return "not_a_deal";
  if (hasCard && !hasDiscount) return "no_price";
  return "trust_or_graded_or_no_match"; // collapsed - see note above
}

// Cluster events (already time-sorted ascending) into cycles.
export function groupCycles(events) {
  const cycles = [];
  let cur = null;
  for (const e of events) {
    const t = Date.parse(e.occurred_at);
    if (!cur || t - cur.lastT > CYCLE_GAP_MS) {
      cur = { startT: t, lastT: t, events: [] };
      cycles.push(cur);
    }
    cur.lastT = t;
    cur.events.push(e);
  }
  return cycles;
}

// Given the assembled state, produce operational alerts. Pure function
// so it's unit-testable. Every alert is level "operational_alert".
export function detectAnomalies(state, now = Date.now()) {
  const a = [];
  const push = (code, detail) => a.push({ level: "operational_alert", code, detail });

  if (state.lastExternalEventAt == null) {
    push("feed_never_ran", "no source='external' discovery_events exist yet");
  } else {
    const hrs = (now - Date.parse(state.lastExternalEventAt)) / 3600000;
    if (hrs > HEALTH_THRESHOLDS.feedStaleHours) {
      push("feed_stale", `last external event ${hrs.toFixed(1)}h ago (> ${HEALTH_THRESHOLDS.feedStaleHours}h)`);
    }
  }

  if (state.lastScanEventAt != null) {
    const hrs = (now - Date.parse(state.lastScanEventAt)) / 3600000;
    if (hrs > HEALTH_THRESHOLDS.scanStaleHours) {
      push("scan_events_stale", `last scan discovery event ${hrs.toFixed(1)}h ago (> ${HEALTH_THRESHOLDS.scanStaleHours}h)`);
    }
  }

  if (state.liveQuotaRemaining != null && state.liveQuotaRemaining < HEALTH_THRESHOLDS.quotaFloor) {
    push(
      "quota_below_feed_floor",
      `Browse remaining ${state.liveQuotaRemaining} < feed floor ${HEALTH_THRESHOLDS.quotaFloor} - ingest-feed will skip until this recovers (by design)`
    );
  }

  if (state.lastCycleBrowseCalls != null && state.lastCycleBrowseCalls > HEALTH_THRESHOLDS.perCycleCap) {
    push(
      "cap_exceeded",
      `last cycle verified ${state.lastCycleBrowseCalls} items > cap ${HEALTH_THRESHOLDS.perCycleCap} - should be impossible`
    );
  }

  if (state.affiliate.externalDeals > 0) {
    if (state.affiliate.missingCampaign > 0) {
      push("affiliate_missing_campaign", `${state.affiliate.missingCampaign} external deal(s) with an affiliate_url not carrying campid=5339197414`);
    }
    if (state.affiliate.nonEbayHost > 0) {
      push("affiliate_non_ebay_host", `${state.affiliate.nonEbayHost} external deal(s) whose affiliate_url host is not an ebay.* domain`);
    }
    if (state.affiliate.pokedealfinderInDeals > 0) {
      push("pokedealfinder_url_leaked", `${state.affiliate.pokedealfinderInDeals} deal row(s) contain a pokedealfinder URL in affiliate_url/listing_url`);
    }
  }

  if (state.externalDealsMissingCatalogId > 0) {
    push(
      "external_deal_missing_catalog_id",
      `${state.externalDealsMissingCatalogId} external deal(s) with card_catalog_id NULL (feed always sets it - investigate)`
    );
  }

  if (state.duplicateListingRows > 0) {
    push("duplicate_listing_rows", `${state.duplicateListingRows} eBay listing(s) resolve to >1 active deal row (marketplace + legacy id)`);
  }

  if (state.redundantReverifications > 0) {
    push(
      "redundant_reverification",
      `${state.redundantReverifications} listing(s) re-verified within ${HEALTH_THRESHOLDS.recentVerifyHours}h of a prior verification (recent-verify skip may not be working)`
    );
  }

  return a;
}

async function pageAll(db, table, cols, filter) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(cols).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) return { rows: null, error: error.message };
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return { rows, error: null };
}

export async function discoveryHealthReport(db, { getBrowseRateLimit } = {}) {
  const now = Date.now();

  // --- discovery_events ---
  const { rows: events, error: evErr } = await pageAll(
    db,
    "discovery_events",
    "listing_key, marketplace, source, search_type, became_deal, card_tcgplayer_id, discount_pct, occurred_at"
  );
  if (evErr) return { error: `discovery_events: ${evErr}` };
  events.sort((x, y) => Date.parse(x.occurred_at) - Date.parse(y.occurred_at));

  const ext = events.filter((e) => e.source === "external");
  const scan = events.filter((e) => e.source === "scan");
  const extCycles = groupCycles(ext);
  const lastCycle = extCycles[extCycles.length - 1] ?? null;

  // rejection breakdown across all external events
  const rej = { not_a_deal: 0, no_price: 0, trust_or_graded_or_no_match: 0 };
  for (const e of ext) {
    const c = classifyRejection(e);
    if (c) rej[c]++;
  }

  // per-marketplace external
  const mkt = {};
  for (const e of ext) {
    const m = (mkt[e.marketplace] ??= { verified: 0, accepted: 0 });
    m.verified++;
    if (e.became_deal) m.accepted++;
  }

  // recent-verify audit: same listing_key verified twice within the window
  let redundant = 0;
  const lastSeen = new Map();
  for (const e of ext) {
    const t = Date.parse(e.occurred_at);
    const prev = lastSeen.get(e.listing_key);
    if (prev != null && t - prev < HEALTH_THRESHOLDS.recentVerifyHours * 3600000) redundant++;
    lastSeen.set(e.listing_key, t);
  }
  const reverifiedKeys = [...lastSeen.keys()].filter(
    (k) => ext.filter((e) => e.listing_key === k).length > 1
  ).length;

  // --- deals ---
  const { rows: dealRows, error: dErr } = await pageAll(
    db,
    "deals",
    "id, marketplace, discovery_source, card_catalog_id, listing_id, is_active, affiliate_url, listing_url, first_seen_at, last_seen_at",
    (q) => q.in("discovery_source", ["external", "scan+external"])
  );
  if (dErr) return { error: `deals: ${dErr}` };

  const bySource = { scan: 0, external: 0, "scan+external": 0 };
  for (const kind of ["scan", "external", "scan+external"]) {
    const { count } = await db.from("deals").select("*", { count: "exact", head: true }).eq("discovery_source", kind);
    bySource[kind] = count ?? 0;
  }
  const externalActive = dealRows.filter((d) => d.is_active).length;
  const externalOnly = dealRows.filter((d) => d.discovery_source === "external").length;
  const externalDealsMissingCatalogId = dealRows.filter((d) => d.card_catalog_id == null).length;

  // affiliate integrity
  const aff = { externalDeals: dealRows.length, missingCampaign: 0, nonEbayHost: 0, pokedealfinderInDeals: 0 };
  for (const d of dealRows) {
    const u = d.affiliate_url ?? "";
    if (!/campid=5339197414/.test(u) || !/mkcid=1/.test(u)) aff.missingCampaign++;
    try {
      if (!/(^|\.)ebay\./.test(new URL(u).host)) aff.nonEbayHost++;
    } catch {
      aff.nonEbayHost++;
    }
    if (/pokedealfinder/i.test(u) || /pokedealfinder/i.test(d.listing_url ?? "")) aff.pokedealfinderInDeals++;
  }

  // dedup audit. The real guarantee is the deals_unique_listing constraint
  // on (source, marketplace, listing_id) - eBay's RESTful id, which for a
  // multi-variation listing includes the variation component. So one eBay
  // item NUMBER can legitimately back several rows (different cards sold as
  // variations of one listing). A TRUE duplicate is two rows with the same
  // bare legacy id AND the same matched card; different cards under one
  // legacy id is an expected multi-variation listing, not an anomaly.
  const { rows: allActive } = await pageAll(
    db,
    "deals",
    "id, marketplace, listing_id, discovery_source, card_tcgplayer_id",
    (q) => q.eq("source", "ebay").eq("is_active", true)
  );
  const byLegacy = new Map();
  for (const d of allActive ?? []) {
    const k = `${d.marketplace}:${legacyIdFromListingId(d.listing_id) ?? d.listing_id}`;
    if (!byLegacy.has(k)) byLegacy.set(k, []);
    byLegacy.get(k).push(d);
  }
  const trueDuplicates = [];
  let multiVariationListings = 0;
  for (const [k, rows] of byLegacy) {
    if (rows.length < 2) continue;
    const byCard = new Map();
    for (const r of rows) {
      const c = r.card_tcgplayer_id ?? `id:${r.id}`;
      byCard.set(c, (byCard.get(c) ?? 0) + 1);
    }
    const sameCardDupes = [...byCard.values()].filter((n) => n > 1).length;
    if (sameCardDupes > 0) trueDuplicates.push({ listingKey: k, rows: rows.length, sameCardCollisions: sameCardDupes });
    else multiVariationListings++;
  }
  const dupKeys = trueDuplicates;

  // expiry audit
  const feedOnly = dealRows.filter((d) => d.discovery_source === "external");
  const oldestFeedOnlyHours = feedOnly.length
    ? (now - Math.min(...feedOnly.map((d) => Date.parse(d.first_seen_at)))) / 3600000
    : 0;
  const expiryVerifiable = oldestFeedOnlyHours > HEALTH_THRESHOLDS.feedOnlyGraceDays * 24 + 24;

  // live quota
  let liveQuota = null;
  if (getBrowseRateLimit) {
    try {
      const rl = await getBrowseRateLimit();
      liveQuota = rl?.remaining ?? null;
    } catch {
      liveQuota = null;
    }
  }

  const lastCycleAccepted = lastCycle ? lastCycle.events.filter((e) => e.became_deal).length : null;
  const state = {
    lastExternalEventAt: ext.length ? ext[ext.length - 1].occurred_at : null,
    lastScanEventAt: scan.length ? scan[scan.length - 1].occurred_at : null,
    liveQuotaRemaining: liveQuota,
    lastCycleBrowseCalls: lastCycle ? lastCycle.events.length : null,
    affiliate: aff,
    externalDealsMissingCatalogId,
    duplicateListingRows: dupKeys.length,
    redundantReverifications: redundant,
  };

  return {
    generatedAt: new Date(now).toISOString(),
    feedHealth: {
      lastExternalEventAt: state.lastExternalEventAt,
      cyclesObserved: extCycles.length,
      lastCycle: lastCycle
        ? {
            at: new Date(lastCycle.startT).toISOString(),
            verified: lastCycle.events.length,
            accepted: lastCycleAccepted,
            rejected: lastCycle.events.length - lastCycleAccepted,
            browseCallsApprox: lastCycle.events.length, // 1 Browse call per verified item (no batch)
            capReached: lastCycle.events.length >= HEALTH_THRESHOLDS.perCycleCap,
          }
        : null,
      notPersisted: [
        "ingest duration",
        "errors[]",
        "rateLimitRemaining at run time",
        "expiredFeedOnly per run",
        "feedItems / alreadyFresh / newDiscovered totals",
        "exact untrusted vs graded vs no-match split (collapsed in the log)",
        "count of runs skipped by the quota floor",
      ],
    },
    discoverySource: {
      scanDeals: bySource.scan,
      externalDeals: bySource.external,
      scanPlusExternalDeals: bySource["scan+external"],
      externalTotal: bySource.external + bySource["scan+external"],
      externalActive,
      externalOnly,
    },
    marketplaceBreakdown: Object.entries(mkt).map(([m, v]) => ({
      marketplace: m,
      verified: v.verified,
      accepted: v.accepted,
      rejected: v.verified - v.accepted,
      acceptanceRatePct: v.verified ? +((v.accepted / v.verified) * 100).toFixed(1) : null,
      browseCallsApprox: v.verified,
      externalOnlyDeals: dealRows.filter((d) => d.marketplace === m && d.discovery_source === "external").length,
    })),
    rejectionBreakdown: {
      total_external_verified: ext.length,
      accepted: ext.filter((e) => e.became_deal).length,
      not_a_deal: rej.not_a_deal,
      no_price: rej.no_price,
      trust_or_graded_or_no_match: rej.trust_or_graded_or_no_match,
      note: "untrusted / graded / no-catalogue-match are not separable in discovery_events - see the ingest-feed HTTP response for the exact split per run",
    },
    affiliateIntegrity: {
      externalDealsChecked: aff.externalDeals,
      allCarryOurCampaign: aff.missingCampaign === 0,
      allEbayHost: aff.nonEbayHost === 0,
      zeroPokeDealFinderUrls: aff.pokedealfinderInDeals === 0,
      missingCampaignCount: aff.missingCampaign,
      nonEbayHostCount: aff.nonEbayHost,
      pokedealfinderInDealsCount: aff.pokedealfinderInDeals,
      tcgplayerNote: "built at render via buildTcgplayerLink - not stored on deals, verified functionally at deploy smoke test",
    },
    quotaHealth: {
      liveBrowseRemaining: liveQuota,
      feedFloor: HEALTH_THRESHOLDS.quotaFloor,
      externalBrowseCallsLast24h: ext.filter((e) => now - Date.parse(e.occurred_at) < 86400000).length,
      scannerBrowseCallsLast24h: "not instrumented (scanner logs deals found, not calls made) - see docs/ebay-rate-limits.md (~3,900-4,700/day budget)",
      scannerDealEventsLast24h: scan.filter((e) => now - Date.parse(e.occurred_at) < 86400000).length,
      cyclesAtCap: extCycles.filter((c) => c.events.length >= HEALTH_THRESHOLDS.perCycleCap).length,
      quotaSkipCount: "not persisted",
    },
    deduplication: {
      activeEbayDealRows: (allActive ?? []).length,
      distinctListingNumbers: byLegacy.size,
      trueDuplicates: dupKeys.length,
      trueDuplicateDetail: dupKeys.slice(0, 20),
      multiVariationListings, // one eBay item number, several cards as variations - expected, NOT a dupe
    },
    recentVerify: {
      windowHours: HEALTH_THRESHOLDS.recentVerifyHours,
      listingsReVerified: reverifiedKeys,
      reVerifiedWithinWindow: redundant,
      verdict:
        extCycles.length < 2
          ? "insufficient cycles (need >=2 ingest runs to observe the skip)"
          : redundant === 0
            ? "PASS - no listing re-verified within the window"
            : "CHECK - some listings re-verified within the window",
    },
    expiry: {
      feedOnlyActiveDeals: feedOnly.filter((d) => d.is_active).length,
      oldestFeedOnlyAgeHours: +oldestFeedOnlyHours.toFixed(1),
      graceDays: HEALTH_THRESHOLDS.feedOnlyGraceDays,
      verdict: expiryVerifiable
        ? "verifiable - check that feed-only deals absent from the board for >2d are is_active=false"
        : "Insufficient production history to verify expiry behaviour",
    },
    anomalies: detectAnomalies(state, now),
  };
}
