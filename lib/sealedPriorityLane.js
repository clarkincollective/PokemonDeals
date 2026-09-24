// SEALED PRIORITY LANE - planning only. Pure, dependency-free, CommonJS.
//
// WHY THIS EXISTS. The scheduled sealed scan is one daily EBAY_US pass over
// the whole ~196-product watchlist (app/api/refresh-sealed-deals, cron
// `20 7 * * * ?country=EBAY_US`). Remediation work sometimes needs a FEW
// products looked at in a FEW specific non-US marketplaces - the 84
// booster-bundle rows of the 2026-09-23 audit sit in AU/CA/IT/GB and the
// US pass can never see them. Widening the normal sweep to four
// marketplaces would cost (196+8) x 4 = 816 calls/day; scanning only the
// pairs that are actually needed costs 16.
//
// WHAT THIS MODULE IS. The planner only: it turns a requested list of
// (tcgplayerId, marketplace) pairs into an exact, deduplicated, bounded
// plan and reports the Browse-call count BEFORE anything is executed. It
// contains NO identity logic, NO matching, NO remediation special cases and
// no I/O. Execution reuses the normal sealed ingestion path verbatim, so
// the matcher, the ownership rules and the guarded write are exactly the
// ones the scheduled sweep uses.
//
// DEFAULT OFF. planLane() is pure and safe to call anywhere; the route only
// acts on a plan when the lane is explicitly enabled (see laneEnabled).
// There is no cron for it.

// The marketplace the scheduled sweep already covers. A pair naming it is
// refused rather than silently deduplicated, so a caller cannot quietly
// double-scan what the daily pass already does.
const SWEEP_COVERED_MARKETPLACE = "EBAY_US";

// Hard ceiling per run, and per day. Deliberately small: this lane exists
// for bounded remediation, not as a second scanner. A request above the cap
// is TRUNCATED and the plan says so - it never silently spends more.
const MAX_PAIRS_PER_RUN = 40;

// One Browse call per (product, marketplace), the same unit the scheduled
// sweep spends (refresh-sealed-deals calls scanProductInMarketplace once
// per marketplace per product).
const CALLS_PER_PAIR = 1;

const norm = (v) => (v == null ? "" : String(v).trim());

// pairs: [{ tcgplayerId, marketplace }]. Returns a plan that names every
// accepted pair, every refusal with its reason, and the exact planned call
// count. Never throws on bad input - a malformed pair is refused, not
// guessed.
function planLane(pairs, { maxPairs = MAX_PAIRS_PER_RUN, allowedMarketplaces = null } = {}) {
  const accepted = [];
  const refused = [];
  const seen = new Set();
  for (const raw of Array.isArray(pairs) ? pairs : []) {
    const tcgplayerId = norm(raw?.tcgplayerId ?? raw?.tcgplayer_id);
    const marketplace = norm(raw?.marketplace).toUpperCase();
    const at = { tcgplayerId, marketplace };
    if (!tcgplayerId || !marketplace) {
      refused.push({ ...at, reason: "incomplete_pair" });
      continue;
    }
    if (marketplace === SWEEP_COVERED_MARKETPLACE) {
      // Not an error in the caller - a deliberate guard. The daily sweep
      // already scans every watched product in EBAY_US, so re-scanning one
      // here would be a duplicate call for no new coverage.
      refused.push({ ...at, reason: "covered_by_the_scheduled_sweep" });
      continue;
    }
    if (allowedMarketplaces && !allowedMarketplaces.includes(marketplace)) {
      refused.push({ ...at, reason: "unknown_marketplace" });
      continue;
    }
    const key = `${tcgplayerId}|${marketplace}`;
    if (seen.has(key)) {
      refused.push({ ...at, reason: "duplicate_pair" });
      continue;
    }
    seen.add(key);
    accepted.push(at);
  }
  const truncated = accepted.slice(maxPairs);
  const run = accepted.slice(0, maxPairs);
  for (const t of truncated) refused.push({ ...t, reason: `over_max_pairs_per_run:${maxPairs}` });
  return {
    pairs: run,
    refused,
    plannedBrowseCalls: run.length * CALLS_PER_PAIR,
    maxPairs,
    truncated: truncated.length,
    // Everything a reviewer needs to sanity-check the spend before it happens.
    byMarketplace: run.reduce((a, p) => ((a[p.marketplace] = (a[p.marketplace] ?? 0) + 1), a), {}),
    products: [...new Set(run.map((p) => p.tcgplayerId))].length,
  };
}

// The lane is OFF unless explicitly switched on, and there is no cron for
// it. Both must be true: the env flag, and an explicit ?lane=priority.
function laneEnabled(env = {}, searchParams = null) {
  const flag = norm(env.SEALED_PRIORITY_LANE).toLowerCase();
  if (flag !== "1" && flag !== "true" && flag !== "on") return false;
  if (!searchParams) return false;
  return norm(searchParams.get ? searchParams.get("lane") : searchParams.lane) === "priority";
}

module.exports = {
  planLane,
  laneEnabled,
  SWEEP_COVERED_MARKETPLACE,
  MAX_PAIRS_PER_RUN,
  CALLS_PER_PAIR,
};
