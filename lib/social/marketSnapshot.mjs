// Phase 13E.1 - MARKET SNAPSHOT: an aggregate "state of the under-market
// opportunity set right now" post. Deliberately the safest possible
// market-intelligence framing:
//   - it reads ONLY fields already on verified `deals` rows
//     (market_price, discount_pct, total_price_usd) - the SAME on-site
//     market reference every other social family already uses
//   - it never touches PPT price-history, movers, biggest-losers, or
//     grade-comparison data (those stay behind their own rights gates
//     even though ppt_social_data is now cleared - see
//     lib/social/rights.mjs and docs/social-daily-workflow.md SS7)
//   - everything it states is a plain aggregate of TODAY'S
//     socially-eligible BIN pool, framed editorially, never as a
//     forecast or a proprietary dataset dump.
//
// No eBay call and no PPT API call happen here - the pool is the
// already-fetched database read shared by the whole daily run.

import { rankFlagshipDeals } from "../flagshipRanking.js";
import { dealFreshness, hoursSinceExactVerification } from "../dealQuality.js";
import { cardDisplayName } from "../cardName.js";
import { RIGHTS_STATE } from "./rights.mjs";
import { buildUtmPreview } from "./utm.mjs";
import { disclosureBlock } from "./payload.mjs";
import { socialBinPool } from "./candidates.mjs";
import { socialFreshnessLine } from "./eligibility.mjs";

// A snapshot post needs a real spread to be "intelligence" rather than
// "one deal restated" - fewer than this and the daily mix simply skips
// this content type for the day (fail closed, SS25).
export const MARKET_SNAPSHOT_MIN_DEALS = 6;

const median = (arr) => (arr.length ? arr[Math.floor((arr.length - 1) / 2)] : null);

// PURE (fixtures-testable, no I/O). `excludeCardNames` is the set of
// display names already headlining another post in today's batch - the
// snapshot names the widest-gap card that ISN'T already featured, so the
// daily batch doesn't show the same card twice.
export function pickMarketSnapshot(rows, now = Date.now(), { excludeCardNames = new Set() } = {}) {
  const pool = socialBinPool(rows, now);
  if (pool.length < MARKET_SNAPSHOT_MIN_DEALS) return { candidate: null, poolSize: pool.length };

  const gaps = pool
    .map((r) => Number(r.discount_pct))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  const listed = pool
    .map((r) => Number(r.total_price_usd ?? r.total_price))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  // The named-in-copy card is the highest flagship-ranked one that isn't
  // already featured elsewhere in today's batch - the AGGREGATE stats
  // (count / median gap / median listed) still cover the WHOLE pool
  // regardless, so nothing is hidden, just the headline example varies.
  const ranked = rankFlagshipDeals(pool, { freshnessOf: (r) => dealFreshness(r), limit: pool.length });
  const top =
    ranked.find((r) => !excludeCardNames.has(cardDisplayName({ name: r.card_name ?? "" }))) ?? ranked[0];
  // The least-fresh member governs the collective freshness claim - never
  // overstate the freshness of the whole snapshot.
  const oldest = pool.reduce(
    (worst, r) => (hoursSinceExactVerification(r, now) > hoursSinceExactVerification(worst, now) ? r : worst),
    pool[0]
  );

  return {
    candidate: {
      deal_count: pool.length,
      biggest_gap_pct: top ? Number(top.discount_pct) : gaps[gaps.length - 1] ?? null,
      biggest_gap_card: top ? cardDisplayName({ name: top.card_name ?? "" }) : null,
      biggest_gap_set: top?.card_set ?? null,
      median_gap_pct: median(gaps),
      median_listed_usd: median(listed),
      oldest_row: oldest,
    },
    poolSize: pool.length,
  };
}

export function buildMarketSnapshotPayload({ candidate, now = Date.now() }) {
  const line = socialFreshnessLine(candidate.oldest_row, { at: new Date(now) });
  return {
    content_type: "market_snapshot",
    template_family: "market_snapshot",
    generated_at: new Date(now).toISOString(),
    candidate_version: "13e1-v1",
    freshness: {
      exactVerifiedAt: candidate.oldest_row.exact_verified_at,
      hoursSinceExactVerification: hoursSinceExactVerification(candidate.oldest_row, now),
      label: line.label,
      checkedAt: line.checkedAt,
    },
    subject: { display_name: "Today's under-market snapshot" },
    market_snapshot: {
      deal_count: candidate.deal_count,
      biggest_gap_pct: candidate.biggest_gap_pct,
      biggest_gap_card: candidate.biggest_gap_card,
      biggest_gap_set: candidate.biggest_gap_set,
      median_gap_pct: candidate.median_gap_pct,
      median_listed_usd: candidate.median_listed_usd,
    },
    market_data: {
      currency: "USD",
      basis: "aggregate of today's socially-eligible Buy-It-Now deals vs. the existing on-site market reference",
    },
    destination: {
      route: "/deals",
      utm: buildUtmPreview({ source: "instagram", campaign: "deal_daily", content: "slide_hook" }),
    },
    disclosure: disclosureBlock(),
    rights_state: RIGHTS_STATE,
    review_state: "pending",
  };
}
