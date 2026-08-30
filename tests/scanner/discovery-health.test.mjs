// Phase 2.5 monitoring - pure-function contracts for lib/discoveryHealth.js.
// (The DB-touching discoveryHealthReport() is exercised against real
// production data, not here.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyRejection, groupCycles, detectAnomalies, HEALTH_THRESHOLDS } from "../../lib/discoveryHealth.js";

test("classifyRejection: became_deal -> null", () => {
  assert.equal(classifyRejection({ became_deal: true, card_tcgplayer_id: "1", discount_pct: 0.5 }), null);
});

test("classifyRejection: card + discount but not a deal -> not_a_deal", () => {
  assert.equal(classifyRejection({ became_deal: false, card_tcgplayer_id: "123", discount_pct: 0.04 }), "not_a_deal");
});

test("classifyRejection: card, no discount -> no_price", () => {
  assert.equal(classifyRejection({ became_deal: false, card_tcgplayer_id: "123", discount_pct: null }), "no_price");
});

test("classifyRejection: no card -> collapsed trust/graded/no-match bucket", () => {
  assert.equal(
    classifyRejection({ became_deal: false, card_tcgplayer_id: null, discount_pct: null }),
    "trust_or_graded_or_no_match"
  );
});

test("groupCycles: clusters events by time gap", () => {
  const mk = (min) => ({ occurred_at: new Date(Date.UTC(2026, 7, 30, 12, min, 0)).toISOString() });
  // 0,1,2 = one cycle; 40,41 = a second cycle (>5min gap)
  const cycles = groupCycles([mk(0), mk(1), mk(2), mk(40), mk(41)]);
  assert.equal(cycles.length, 2);
  assert.equal(cycles[0].events.length, 3);
  assert.equal(cycles[1].events.length, 2);
});

test("detectAnomalies: healthy state -> no alerts", () => {
  const now = Date.UTC(2026, 7, 30, 12, 0, 0);
  const state = {
    lastExternalEventAt: new Date(now - 30 * 60000).toISOString(), // 30m ago
    lastScanEventAt: new Date(now - 10 * 60000).toISOString(),
    liveQuotaRemaining: 1500,
    lastCycleBrowseCalls: 40,
    affiliate: { externalDeals: 4, missingCampaign: 0, nonEbayHost: 0, pokedealfinderInDeals: 0 },
    externalDealsMissingCatalogId: 0,
    duplicateListingRows: 0,
    redundantReverifications: 0,
  };
  assert.deepEqual(detectAnomalies(state, now), []);
});

test("detectAnomalies: flags stale feed, low quota, leaked URL, dupes, missing campaign", () => {
  const now = Date.UTC(2026, 7, 30, 12, 0, 0);
  const state = {
    lastExternalEventAt: new Date(now - 3 * 3600000).toISOString(), // 3h ago > 2h
    lastScanEventAt: new Date(now - 10 * 60000).toISOString(),
    liveQuotaRemaining: 500, // < 800 floor
    lastCycleBrowseCalls: 40,
    affiliate: { externalDeals: 5, missingCampaign: 1, nonEbayHost: 0, pokedealfinderInDeals: 2 },
    externalDealsMissingCatalogId: 3,
    duplicateListingRows: 1,
    redundantReverifications: 4,
  };
  const codes = detectAnomalies(state, now).map((x) => x.code).sort();
  assert.deepEqual(codes, [
    "affiliate_missing_campaign",
    "duplicate_listing_rows",
    "external_deal_missing_catalog_id",
    "feed_stale",
    "pokedealfinder_url_leaked",
    "quota_below_feed_floor",
    "redundant_reverification",
  ]);
  assert.ok(detectAnomalies(state, now).every((x) => x.level === "operational_alert"));
});

test("detectAnomalies: cap_exceeded only when a cycle exceeds the cap", () => {
  const now = Date.UTC(2026, 7, 30, 12, 0, 0);
  const base = {
    lastExternalEventAt: new Date(now - 60000).toISOString(),
    lastScanEventAt: new Date(now - 60000).toISOString(),
    liveQuotaRemaining: 2000,
    affiliate: { externalDeals: 0, missingCampaign: 0, nonEbayHost: 0, pokedealfinderInDeals: 0 },
    externalDealsMissingCatalogId: 0,
    duplicateListingRows: 0,
    redundantReverifications: 0,
  };
  assert.equal(detectAnomalies({ ...base, lastCycleBrowseCalls: HEALTH_THRESHOLDS.perCycleCap }, now).length, 0);
  assert.equal(
    detectAnomalies({ ...base, lastCycleBrowseCalls: HEALTH_THRESHOLDS.perCycleCap + 1 }, now)[0].code,
    "cap_exceeded"
  );
});
