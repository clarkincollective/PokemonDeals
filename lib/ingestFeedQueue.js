// P0.3.2 - pure queue logic for app/api/ingest-feed.
//
// THE BUG this fixes: ingest-feed only skipped a board candidate before
// its expensive Browse item lookup if that candidate already had a FRESH
// row in `deals`. ~99% of external candidates are REJECTED (untrusted /
// graded / no catalogue match / wrong condition / wrong language / not a
// deal) and never write a `deals` row, so the RECENT_VERIFY_HOURS
// protection never applied to them - the same rejected GB/US listings on
// the (near-static) board were re-Browsed every hour, hit the per-cycle
// cap of 40, and starved genuinely-new candidates. Production over 20h:
// 678 verifications / 463 distinct keys / 215 redundant, and every one of
// the 161 re-verified keys was a rejection with no `deals` row.
//
// THE FIX: also consult `discovery_events` (source='external', which logs
// EVERY verified candidate whatever the outcome). A candidate any
// external verification touched inside RECENT_VERIFY_HOURS is dropped
// BEFORE the Browse call. After the window it becomes eligible again -
// no permanent blacklist. Then the survivors are ordered never-seen
// first, round-robin across marketplaces, and only THEN capped.
//
// Canonical listing identity is ALWAYS
// lib/discoveryLog.discoveryListingKey  ("<MARKETPLACE>:<legacyId>") -
// the exact key discovery_events stores and the scanner's
// "v1|<legacy>|0" resolves to - so no id-format difference
// (EBAY_GB:<id> / raw <id> / v1|<id>|0 / marketplace+listing_id) can
// bypass the dedupe.

const { discoveryListingKey } = require("./discoveryLog");

function candidateKey(it) {
  return it && it.marketplace != null && it.ebayItemId != null
    ? discoveryListingKey(it.marketplace, it.ebayItemId)
    : null;
}

// Split the board's candidates into the two verification tiers and the
// three skip buckets.
//
//   feedItems         [{ marketplace, ebayItemId, ... }]  (pokeFeed order)
//   externalHistory   Map<listingKey, lastOccurredMs>     (from discovery_events, source='external')
//   freshDealKeys     Set<listingKey>                      (deals row, last_seen_at inside the window)
//   recentCutoffMs    Date.now() - RECENT_VERIFY_HOURS*3600e3
//
// returns { neverSeen, dueRecheck, dedupedInBatch, skippedFreshDeal,
//           skippedRecentlyVerified }
function partitionCandidates({ feedItems = [], externalHistory = new Map(), freshDealKeys = new Set(), recentCutoffMs = 0 } = {}) {
  const seen = new Set();
  const neverSeen = [];
  const dueRecheck = [];
  let dedupedInBatch = 0;
  let skippedFreshDeal = 0;
  let skippedRecentlyVerified = 0;

  for (const it of feedItems) {
    const key = candidateKey(it);
    if (!key) continue;
    if (seen.has(key)) {
      dedupedInBatch++;
      continue;
    }
    seen.add(key);

    if (freshDealKeys.has(key)) {
      skippedFreshDeal++;
      continue;
    }

    const lastMs = externalHistory.get(key);
    if (lastMs != null && lastMs > recentCutoffMs) {
      skippedRecentlyVerified++;
      continue;
    }

    if (lastMs != null) dueRecheck.push({ ...it, _key: key, _lastMs: lastMs });
    else neverSeen.push({ ...it, _key: key, _lastMs: 0 });
  }

  // rechecks: oldest verification first (fairest use of the freed slots)
  dueRecheck.sort((a, b) => a._lastMs - b._lastMs);
  return { neverSeen, dueRecheck, dedupedInBatch, skippedFreshDeal, skippedRecentlyVerified };
}

// Allocate up to `budget` Browse lookups: the whole never-seen tier is
// offered before any due-recheck, and within a tier the marketplaces are
// served round-robin so one board region can't monopolise the cap.
// Returns Map<marketplace, item[]>.
function allocateVerifyBudget({ neverSeen = [], dueRecheck = [], budget = 0 } = {}) {
  const out = new Map();
  let left = Math.max(0, Math.trunc(budget));
  const take = (it) => {
    if (!out.has(it.marketplace)) out.set(it.marketplace, []);
    out.get(it.marketplace).push(it);
  };

  for (const tier of [neverSeen, dueRecheck]) {
    if (left <= 0) break;
    const byMkt = new Map();
    for (const it of tier) {
      if (!byMkt.has(it.marketplace)) byMkt.set(it.marketplace, []);
      byMkt.get(it.marketplace).push(it);
    }
    const queues = [...byMkt.values()];
    let progressed = true;
    while (left > 0 && progressed) {
      progressed = false;
      for (const q of queues) {
        if (left <= 0) break;
        const it = q.shift();
        if (it === undefined) continue;
        take(it);
        left--;
        progressed = true;
      }
    }
  }
  return out;
}

module.exports = { candidateKey, partitionCandidates, allocateVerifyBudget };
