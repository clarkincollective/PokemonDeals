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

// P0.4.2 §9 - ADAPTIVE re-verify cooldown. The P0.3.2 fix used one flat
// RECENT_VERIFY_HOURS (20h) for every candidate; the P0.4 audit found
// ~972 listings/week re-verified >=2x - stable rejects sitting on the
// (near-static) board longer than 20h. A rejected listing that has failed
// twice, has no `deals` row and shows no price change is very unlikely to
// suddenly qualify, so it earns a much longer cooldown; a listing that
// once WAS a deal, or whose board price just moved, stays on the short
// window so a real state change is never missed.
//
//   hist: { lastMs, count, becameDeal }  (from discovery_events, source='external')
const BASE_RECENT_VERIFY_HOURS = 20; // == RECENT_VERIFY_HOURS in the route
const STABLE_REJECT_COOLDOWN_HOURS = 84; // a twice-failed, no-deal, unchanged listing
function cooldownHoursFor(hist) {
  if (!hist) return 0;
  const count = Number(hist.count) || 1;
  if (hist.becameDeal) return BASE_RECENT_VERIFY_HOURS; // a real state change here matters - keep it short
  if (count >= 2) return STABLE_REJECT_COOLDOWN_HOURS; // stable rejection - back off hard
  return BASE_RECENT_VERIFY_HOURS;
}

// P0.4.2 §10 - deterministic CHEAP prefilter, applied BEFORE the expensive
// Browse verify. Uses only board-row hints (never trusted for pricing /
// display - our own eBay lookup provides the real values). The external
// lane's measured yield is ~1.1%; lot / bundle / multi-quantity listings
// are effectively never a single-card deal, so skipping them spends the
// verify budget on candidates with a materially higher chance of being
// useful. Backed by the P0.4 audit's rejection breakdown.
const LOT_TITLE_RE =
  /\b(lot|lots|bundle|bulk|joblot|job lot|wholesale|collection|binder|\d{2,}\s*cards?|\d+\s*card\s*lot|x\s?\d{2,}|\d{2,}\s?x\b|set of \d+|complete set|near complete|reseller|repack|mystery|grab bag)\b/i;
function prefilterBoardCandidate(it) {
  const title = (it && (it.feedTitle || it.title)) || "";
  if (title && LOT_TITLE_RE.test(String(title))) return { skip: true, reason: "lot_or_bundle_title" };
  return { skip: false, reason: null };
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
// `externalHistory` values may be a bare number (legacy = last occurred_at
// ms) or `{ lastMs, count, becameDeal }` (P0.4.2, enables the adaptive
// cooldown). `now` is required for the adaptive path; falls back to the
// flat `recentCutoffMs` when only a number is available.
function histOf(v) {
  if (v == null) return null;
  if (typeof v === "number") return { lastMs: v, count: 1, becameDeal: false };
  return { lastMs: Number(v.lastMs) || 0, count: Number(v.count) || 1, becameDeal: Boolean(v.becameDeal) };
}

function partitionCandidates({
  feedItems = [],
  externalHistory = new Map(),
  freshDealKeys = new Set(),
  recentCutoffMs = 0,
  now = Date.now(),
} = {}) {
  const seen = new Set();
  const neverSeen = [];
  const dueRecheck = [];
  let dedupedInBatch = 0;
  let skippedFreshDeal = 0;
  let skippedRecentlyVerified = 0;
  let skippedPrefilter = 0;
  let skippedStableReject = 0;

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

    // §10 - cheap prefilter before any cooldown / Browse consideration.
    const pf = prefilterBoardCandidate(it);
    if (pf.skip) {
      skippedPrefilter++;
      continue;
    }

    const hist = histOf(externalHistory.get(key));
    if (hist) {
      // §9 - adaptive cooldown: a stable twice-failed reject backs off far
      // longer than the flat 20h window.
      const cooldownMs = cooldownHoursFor(hist) * 3600 * 1000;
      const ageMs = now - hist.lastMs;
      if (ageMs < cooldownMs) {
        if (cooldownHoursFor(hist) > BASE_RECENT_VERIFY_HOURS) skippedStableReject++;
        else skippedRecentlyVerified++;
        continue;
      }
      dueRecheck.push({ ...it, _key: key, _lastMs: hist.lastMs });
    } else {
      neverSeen.push({ ...it, _key: key, _lastMs: 0 });
    }
  }

  // rechecks: oldest verification first (fairest use of the freed slots)
  dueRecheck.sort((a, b) => a._lastMs - b._lastMs);
  return {
    neverSeen,
    dueRecheck,
    dedupedInBatch,
    skippedFreshDeal,
    skippedRecentlyVerified,
    skippedPrefilter,
    skippedStableReject,
  };
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

module.exports = {
  candidateKey,
  partitionCandidates,
  allocateVerifyBudget,
  cooldownHoursFor,
  prefilterBoardCandidate,
  BASE_RECENT_VERIFY_HOURS,
  STABLE_REJECT_COOLDOWN_HOURS,
};
