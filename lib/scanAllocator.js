// P0.4.2 - evidence-based scan-target allocation.
//
// The P0.4 audit found the scanner spent its budget on a static 26-card
// "priority" tier (4x/day x 6 marketplaces, ~1,363 events/week on only 17
// real printings) while the ~8,383-card "extended" tier was re-scanned
// only about once per 30 days per country - so 7-day watchlist coverage
// was ~16.5% and the long tail effectively went unsearched.
//
// This module replaces BOTH of those static shapes with one deterministic
// per-target priority queue that runs inside the SAME Browse-call
// envelope. Each `?tier=allocated&country=X` run asks this module which
// cards to scan in that one marketplace, given:
//   * the active watchlist (priority + extended merged; the `tier` column
//     is now advisory, not the schedule)
//   * per-(card, marketplace) state from `scan_target_state`
//     (last_searched_at, last_deal_at, searches_since_deal,
//      consecutive_no_new, last_unique_listings, expired_deal_boost_until)
//   * the live Browse-quota headroom
//
// It does NOT touch deal qualification, matching, reference confidence,
// P0.3.1 multi-card / language / grade guards, pricing, availability, or
// the homepage. It only decides WHICH already-qualified cards get scanned
// and HOW OFTEN. A card is never scanned to a lower quality bar because it
// was picked by the allocator.
//
// Pure module: no I/O, no next/cache, client-safe, synthetic-fixture
// testable. Deterministic - the same inputs always select the same
// targets in the same order.

const DAY = 86_400_000;

// --- state thresholds -------------------------------------------------
// Chosen from the P0.4 audit + scripts/_p042sim.mjs. Every one is a plain
// number so the behaviour is inspectable and tunable.
const STATE = Object.freeze({ HOT: "hot", WARM: "warm", NORMAL: "normal", LONG_TAIL: "long_tail" });

const HOT_DEAL_DAYS = 5; //   a real deal found for this (card,market) in the last N days
const HOT_UNIQUE_MIN = 8; //  >= N distinct listings returned on the last search
const WARM_DEAL_DAYS = 21;
const WARM_UNIQUE_MIN = 3;
// not searched (in this market) for >= this many days, OR never searched
// -> LONG_TAIL, regardless of past yield. Checked FIRST so an overdue
// card always surfaces (no permanent starvation).
const LONG_TAIL_DAYS = 18;

// DECAY: a card that keeps coming back empty cannot stay HOT/WARM.
const DECAY_NO_NEW = 4; //   consecutive searches that returned 0 NEW distinct listings
const DECAY_NO_DEAL = 6; //  searches since the last real deal

// How often a card of each state "wants" to be re-scanned in one market.
// overdue = daysSinceSearch / REVISIT_DAYS[state]  (>1 == overdue).
const REVISIT_DAYS = Object.freeze({ hot: 1.5, warm: 4, normal: 12, long_tail: 21 });

// §7 - after a genuinely strong deal on a printing expires, that exact
// printing gets a score boost for this many days to look for NEW listings
// (never the dead listing). Expires naturally; capped upstream.
const EXPIRED_BOOST_DAYS = 10;

// --- score weights --------------------------------------------------
const W_OVERDUE = 0.5; //  time-since-search pressure (long-tail fairness)
const W_YIELD = 0.32; //   recent productive-discovery pressure (exploit)
const W_STATE = 0.18; //   state prior
const OVERDUE_CAP = 6; //  clamp so one ancient target can't dominate everything
const EXPIRED_BOOST_SCORE = 0.6; // additive, on top of the weighted score
const STATE_PRIOR = Object.freeze({ hot: 1, warm: 0.6, normal: 0.25, long_tail: 0.15 });

// --- run sizing / marketplace allocation --------------------------
// One allocated run scans ONE marketplace. Target count per run scales by
// a marketplace weight derived from measured listing supply + deal yield
// (US highest); every market keeps a hard exploration floor so none is
// silently starved. Each selected target costs ~1 Browse call.
// Base targets per run before the marketplace weight + quota cap. Sized
// (scripts/_p042sim) so 12 allocated runs/day (every marketplace twice)
// sum to roughly the CURRENT tiered Browse spend (~1,700/day) - this is a
// re-shape, not a scale-up. The priority tier's ~600 wasted calls/day
// (26 cards x 6 markets x 4 runs, on cards sweep already covers) are
// reclaimed for long-tail breadth INSIDE that same total.
const TARGET_BUDGET_BASE = 125;
// Weights derived from measured listing supply + deal yield (P0.4 audit:
// US ~62% of deals, GB carries the external board, the rest <7% each).
// The SPREAD is deliberately modest: every marketplace still rotates its
// whole eligible pool well inside the CURRENT ~30-day cadence.
const MARKETPLACE_WEIGHT = Object.freeze({
  EBAY_US: 1.6,
  EBAY_GB: 1.2,
  EBAY_AU: 1.05,
  EBAY_CA: 1.05,
  EBAY_DE: 0.95,
  EBAY_IT: 0.9,
});
const RUN_HARD_CAP = 380; //   absolute ceiling on targets (Browse calls) per run
const MIN_TARGETS_PER_RUN = 40; // the exploration floor - a run does at least this many when quota allows

// §11 - every run is split three ways so all three goals are guaranteed
// regardless of backlog:
//   HOT_RESERVE   proven producers (HOT / expired-boost) that are DUE on
//                 their fast cadence - so a productive card keeps its
//                 quick revisit even while a big long-tail backlog clears.
//   EXPLORE       pure least-recently-searched rotation - the long-tail
//                 fairness guarantee (never-searched first). No yield input.
//   EXPLOIT       the remainder, ranked by the blended priority score.
const HOT_RESERVE_RATIO = 0.16;
const EXPLORE_RATIO = 0.62;
const MIN_EXPLORE = 40;
const HOT_DUE_OVERDUE = 0.85; // overdueScore threshold to count as "due"

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const finiteOr = (v, d) => (Number.isFinite(v) ? v : d);

function daysSince(iso, now) {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? Math.max(0, (now - t) / DAY) : Infinity;
}

// Deterministic state for one (card, marketplace) target.
function classifyState(t, now = Date.now()) {
  const sinceSearch = daysSince(t.last_searched_at, now);
  const sinceDeal = daysSince(t.last_deal_at, now);
  const lastUnique = finiteOr(Number(t.last_unique_listings), 0);
  const decayed =
    finiteOr(Number(t.consecutive_no_new), 0) >= DECAY_NO_NEW &&
    finiteOr(Number(t.searches_since_deal), 0) >= DECAY_NO_DEAL;

  if (sinceSearch >= LONG_TAIL_DAYS) return STATE.LONG_TAIL; // overdue / never searched wins
  if (!decayed && (sinceDeal <= HOT_DEAL_DAYS || lastUnique >= HOT_UNIQUE_MIN)) return STATE.HOT;
  if (!decayed && (sinceDeal <= WARM_DEAL_DAYS || lastUnique >= WARM_UNIQUE_MIN)) return STATE.WARM;
  return STATE.NORMAL;
}

// overdue relative to the target's own state cadence. >1 means "due".
function overdueScore(t, state, now = Date.now()) {
  const sinceSearch = daysSince(t.last_searched_at, now);
  if (!Number.isFinite(sinceSearch)) return OVERDUE_CAP; // never searched - maximally overdue
  return clamp(sinceSearch / (REVISIT_DAYS[state] || 12), 0, OVERDUE_CAP);
}

// 0..1 - how strongly recent evidence says "this card produces deals".
function yieldScore(t, now = Date.now()) {
  const sinceDeal = daysSince(t.last_deal_at, now);
  const recency = Number.isFinite(sinceDeal) ? clamp(1 - sinceDeal / 30, 0, 1) : 0;
  const turnover = clamp(finiteOr(Number(t.last_unique_listings), 0) / 12, 0, 1);
  return clamp(0.6 * recency + 0.4 * turnover, 0, 1);
}

function boosted(t, now = Date.now()) {
  const until = t.expired_deal_boost_until ? Date.parse(t.expired_deal_boost_until) : NaN;
  return Number.isFinite(until) && until > now;
}

function priorityScore(t, state, now = Date.now()) {
  const overdue = overdueScore(t, state, now) / OVERDUE_CAP; // 0..1
  const y = yieldScore(t, now);
  const s = STATE_PRIOR[state] ?? 0.25;
  let score = W_OVERDUE * overdue + W_YIELD * y + W_STATE * s;
  if (boosted(t, now)) score += EXPIRED_BOOST_SCORE;
  return score;
}

// How many targets (== Browse calls) this run may spend, quota-safe.
//   rateLimitRemaining / floor : live Browse-quota headroom (null -> trust base)
//   requested                  : ?targets= manual override (still capped)
// Never spends past (remaining - floor); never grows because more targets
// exist; 0 when there is no headroom (the run then does nothing and the
// next cron resumes).
function budgetForRun({ marketplace, rateLimitRemaining = null, floor = 0, requested = null } = {}) {
  const weight = MARKETPLACE_WEIGHT[marketplace] ?? 1;
  const base = requested != null ? Math.trunc(requested) : Math.round(TARGET_BUDGET_BASE * weight);
  const capped = clamp(base, 0, RUN_HARD_CAP);
  if (rateLimitRemaining == null) return capped;
  const headroom = Math.max(0, Math.trunc(rateLimitRemaining) - Math.trunc(floor));
  return Math.min(capped, headroom);
}

// THE ALLOCATOR.
//   targets   [{ card_tcgplayer_id, language, last_known_price, tier, ...
//               scan_target_state fields for THIS marketplace }]
//   marketplace, now, budget, exploreRatio
// returns { selected:[{ ...target, reason }], summary }
// `selected` is ordered explore-first then exploit, each with a `reason`
// ({ state, overdueDays, score, explore, boosted }). Deterministic:
// stable sorts with card_tcgplayer_id as the final tiebreak.
function allocateScanTargets({
  targets = [],
  marketplace = null,
  now = Date.now(),
  budget = null,
  exploreRatio = EXPLORE_RATIO,
} = {}) {
  const B = budget == null ? budgetForRun({ marketplace }) : Math.max(0, Math.trunc(budget));

  // one row per card (guard against a duplicate target list)
  const byId = new Map();
  for (const t of targets) {
    const id = t && t.card_tcgplayer_id != null ? String(t.card_tcgplayer_id) : null;
    if (!id || byId.has(id)) continue;
    byId.set(id, t);
  }
  const enriched = [...byId.values()].map((t) => {
    const state = classifyState(t, now);
    const od = overdueScore(t, state, now); // 0..OVERDUE_CAP relative to state cadence
    return {
      t,
      id: String(t.card_tcgplayer_id),
      state,
      overdueDays: Number.isFinite(daysSince(t.last_searched_at, now))
        ? +daysSince(t.last_searched_at, now).toFixed(1)
        : null, // null == never searched
      overdueRaw: Number.isFinite(daysSince(t.last_searched_at, now)) ? daysSince(t.last_searched_at, now) : 1e9,
      overdueScore: od,
      score: priorityScore(t, state, now),
      boosted: boosted(t, now),
    };
  });

  if (B <= 0 || enriched.length === 0) {
    return { selected: [], summary: emptySummary(marketplace, B, enriched) };
  }

  const chosen = new Set();
  const selected = [];
  const take = (e, kind) => {
    if (chosen.has(e.id) || selected.length >= B) return;
    chosen.add(e.id);
    selected.push(mk(e, kind));
  };

  // 1. HOT RESERVE: proven producers (or an expired-deal boost) that are
  //    DUE on their fast cadence. Score-ranked. Guarantees fast revisit of
  //    what works, independent of the long-tail backlog.
  const hotN = Math.min(B, Math.round(B * HOT_RESERVE_RATIO));
  const hotDue = enriched
    .filter((e) => (e.state === STATE.HOT || e.boosted) && e.overdueScore >= HOT_DUE_OVERDUE)
    .sort((a, b) => b.score - a.score || b.overdueRaw - a.overdueRaw || a.id.localeCompare(b.id));
  for (const e of hotDue) {
    if (selected.length >= hotN) break;
    take(e, "hot");
  }

  // 2. EXPLORE: pure least-recently-searched (never-searched first). No
  //    yield input at all - the long-tail fairness guarantee.
  const exploreN = Math.min(B, Math.max(MIN_EXPLORE, Math.ceil(B * clamp(exploreRatio, 0, 1))));
  const byOverdue = [...enriched].sort((a, b) => b.overdueRaw - a.overdueRaw || a.id.localeCompare(b.id));
  for (const e of byOverdue) {
    if (selected.length >= hotN + exploreN) break;
    take(e, "explore");
  }

  // 3. EXPLOIT: the remainder, ranked by the blended priority score.
  const byScore = [...enriched].sort(
    (a, b) => b.score - a.score || b.overdueRaw - a.overdueRaw || a.id.localeCompare(b.id)
  );
  for (const e of byScore) {
    if (selected.length >= B) break;
    take(e, "exploit");
  }

  return { selected, summary: summarise(marketplace, B, enriched, selected) };
}

function mk(e, kind) {
  return {
    ...e.t,
    card_tcgplayer_id: e.id,
    reason: {
      state: e.state,
      overdueDays: e.overdueDays,
      score: +e.score.toFixed(4),
      lane: kind, // "hot" | "explore" | "exploit"
      explore: kind === "explore",
      boosted: e.boosted,
    },
  };
}

function p95(nums) {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  return +a[Math.min(a.length - 1, Math.floor(0.95 * a.length))].toFixed(1);
}

function countStates(list) {
  const c = { hot: 0, warm: 0, normal: 0, long_tail: 0 };
  for (const e of list) c[e.state ?? e.reason?.state] = (c[e.state ?? e.reason?.state] || 0) + 1;
  return c;
}

function summarise(marketplace, budget, enriched, selected) {
  return {
    marketplace,
    budget,
    eligible_targets: enriched.length,
    targets_selected: selected.length,
    by_state: countStates(selected.map((s) => ({ state: s.reason.state }))),
    by_lane: {
      hot: selected.filter((s) => s.reason.lane === "hot").length,
      explore: selected.filter((s) => s.reason.lane === "explore").length,
      exploit: selected.filter((s) => s.reason.lane === "exploit").length,
    },
    explore_count: selected.filter((s) => s.reason.explore).length,
    exploit_count: selected.filter((s) => !s.reason.explore).length,
    boosted_count: selected.filter((s) => s.reason.boosted).length,
    p95_days_since_search_pool: p95(enriched.map((e) => (e.overdueRaw >= 1e9 ? null : e.overdueRaw))),
    never_searched_in_pool: enriched.filter((e) => e.overdueRaw >= 1e9).length,
  };
}
function emptySummary(marketplace, budget, enriched) {
  return {
    marketplace,
    budget,
    eligible_targets: enriched.length,
    targets_selected: 0,
    by_state: { hot: 0, warm: 0, normal: 0, long_tail: 0 },
    explore_count: 0,
    exploit_count: 0,
    boosted_count: 0,
    p95_days_since_search_pool: p95(enriched.map((e) => (e.overdueRaw >= 1e9 ? null : e.overdueRaw))),
    never_searched_in_pool: enriched.filter((e) => e.overdueRaw >= 1e9).length,
  };
}

// Given a per-card scan result, compute the next scan_target_state row.
// Pure - the route persists it. `prev` may be null (first ever scan of
// this card in this marketplace).
function nextTargetState(prev, { cardTcgplayerId, marketplace, uniqueListings = 0, dealsFound = 0, now = Date.now() }) {
  const p = prev ?? {};
  const prevUnique = finiteOr(Number(p.last_unique_listings), 0);
  const sawNew = uniqueListings > prevUnique || (prevUnique === 0 && uniqueListings > 0);
  const dealNow = dealsFound > 0;
  return {
    card_tcgplayer_id: String(cardTcgplayerId),
    marketplace,
    last_searched_at: new Date(now).toISOString(),
    last_deal_at: dealNow ? new Date(now).toISOString() : (p.last_deal_at ?? null),
    searches_total: finiteOr(Number(p.searches_total), 0) + 1,
    searches_since_deal: dealNow ? 0 : finiteOr(Number(p.searches_since_deal), 0) + 1,
    consecutive_no_new: sawNew ? 0 : finiteOr(Number(p.consecutive_no_new), 0) + 1,
    last_unique_listings: uniqueListings,
    state: classifyState(
      {
        last_searched_at: new Date(now).toISOString(),
        last_deal_at: dealNow ? new Date(now).toISOString() : (p.last_deal_at ?? null),
        last_unique_listings: uniqueListings,
        consecutive_no_new: sawNew ? 0 : finiteOr(Number(p.consecutive_no_new), 0) + 1,
        searches_since_deal: dealNow ? 0 : finiteOr(Number(p.searches_since_deal), 0) + 1,
      },
      now
    ),
    // keep an existing (still-live) boost; the route sets it on expiry.
    expired_deal_boost_until: p.expired_deal_boost_until ?? null,
    updated_at: new Date(now).toISOString(),
  };
}

module.exports = {
  STATE,
  REVISIT_DAYS,
  MARKETPLACE_WEIGHT,
  MIN_TARGETS_PER_RUN,
  EXPLORE_RATIO,
  HOT_RESERVE_RATIO,
  EXPIRED_BOOST_DAYS,
  LONG_TAIL_DAYS,
  DECAY_NO_NEW,
  DECAY_NO_DEAL,
  TARGET_BUDGET_BASE,
  RUN_HARD_CAP,
  classifyState,
  overdueScore,
  yieldScore,
  priorityScore,
  budgetForRun,
  allocateScanTargets,
  nextTargetState,
};
