// Phase SOCIAL-NEWSROOM-1 - CONTENT FATIGUE METRICS (§38).
//
// Over a rolling 7-day window (published + queued), how repetitive is the
// account becoming? Warns; never hard-blocks (the sequence gate and
// cooldowns do the blocking). Read-only analytics over a placement/story
// history.
//
// Pure. No I/O.

import { originalityKeys } from "./originalityScore.mjs";
import { bucketFor } from "./pillars.mjs";

const DAY = 86_400_000;

export const FATIGUE_CEILINGS = Object.freeze({
  series_share_7d: 0.35,
  pillar_share_7d: 0.45,
  species_freq_7d: 0.3,
  layout_share_7d: 0.45,
  hook_share_7d: 0.35,
  commercial_share_7d: 0.6, // DEALS+BUDGET buckets = CONVERSION
});

// entries: [{ story|keys, postedAt|plannedFor|time_utc, pillar?, series?,
//   cta_intensity? }]
export function fatigueReport(entries = [], { now = Date.now(), windowDays = 7 } = {}) {
  const cutoff = now - windowDays * DAY;
  const recent = entries.filter((e) => {
    const t = Date.parse(e.postedAt ?? e.plannedFor ?? e.time_utc ?? e.planned_for ?? "");
    return Number.isFinite(t) && t >= cutoff && t <= now + windowDays * DAY;
  });
  const n = recent.length;
  const tally = (fn) => {
    const c = {};
    for (const e of recent) {
      const k = fn(e);
      if (k != null) c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  };
  const topShare = (counts) => {
    const vals = Object.values(counts);
    return n ? Number((Math.max(0, ...vals) / n).toFixed(3)) : 0;
  };

  const seriesCounts = tally((e) => e.series ?? e.story?.series ?? null);
  const pillarCounts = tally((e) => e.pillar ?? e.story?.pillar ?? null);
  const speciesCounts = tally((e) => originalityKeys(e.story ?? e).pokemon);
  const layoutCounts = tally((e) => originalityKeys(e.story ?? e).layout_family);
  const hookCounts = tally((e) => originalityKeys(e.story ?? e).hook_grammar);
  const commercial = recent.filter((e) => {
    const p = e.pillar ?? e.story?.pillar ?? null;
    return bucketFor(p) === "CONVERSION";
  }).length;

  const metrics = {
    window_days: windowDays,
    sample: n,
    series_share_7d: topShare(seriesCounts),
    pillar_share_7d: topShare(pillarCounts),
    species_freq_7d: topShare(speciesCounts),
    layout_share_7d: topShare(layoutCounts),
    hook_share_7d: topShare(hookCounts),
    commercial_share_7d: n ? Number((commercial / n).toFixed(3)) : 0,
  };

  const warnings = [];
  for (const [k, ceil] of Object.entries(FATIGUE_CEILINGS)) {
    if (metrics[k] > ceil + 1e-9) warnings.push(`${k} = ${(metrics[k] * 100).toFixed(0)}% > ${ceil * 100}% ceiling`);
  }
  return { metrics, warnings, breakdown: { seriesCounts, pillarCounts, speciesCounts, layoutCounts, hookCounts } };
}
