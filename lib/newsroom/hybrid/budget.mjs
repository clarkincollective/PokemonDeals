// Phase SOCIAL-CREATIVE-4B - CREATIVE GENERATION BUDGET + COST LEDGER
// (§22 bounded iteration, §29 cost).
//
// One artifact gets AT MOST: 1 creative-director call, 1 background
// generation, 1 revision (only for a concrete defect), and the
// sanctioned multi-sample visual review. Nothing regenerates in a loop -
// if it is still weak after the one revision the pipeline returns HELD.
//
// Pure. No I/O, no network. The ledger is an in-memory accumulator the
// pipeline threads through and the proof script prints.

export const BUDGET_LIMITS = Object.freeze({
  creative_director_calls: 1,
  background_generations: 1,
  revisions: 1,
  visual_review_calls: 5, // reviewRenderedCreativeMulti worst-case samples
});

// Rough public list prices (USD), for the §29 "cost per 10 posts"
// estimate only. Overridable so the estimate tracks real pricing without
// a code change. These are order-of-magnitude, not billing truth.
export const UNIT_COST_USD = Object.freeze({
  creative_director_call: 0.02, // ~1 structured gpt-4o-class chat call
  background_generation: 0.19, // one gpt-image portrait, standard quality
  visual_review_call: 0.01, // one low-detail vision call
});

export function newBudget(limits = BUDGET_LIMITS) {
  return {
    limits: { ...limits },
    used: { creative_director_calls: 0, background_generations: 0, revisions: 0, visual_review_calls: 0 },
    calls: [], // { kind, at, ok, cost_usd, detail }
    latencies_ms: [],
  };
}

export function canSpend(budget, kind) {
  const key = `${kind}s`;
  const cap = budget.limits[key];
  if (cap == null) return true;
  return budget.used[key] < cap;
}

// Record one call. `kind` in {creative_director_call, background_generation,
// revision, visual_review_call}. Returns the budget (mutated).
export function recordCall(budget, kind, { ok = true, latencyMs = null, detail = null, costUsd = null } = {}) {
  const key = `${kind}s`;
  if (budget.used[key] == null) budget.used[key] = 0;
  budget.used[key] += 1;
  const cost = costUsd != null ? costUsd : (UNIT_COST_USD[kind] ?? 0);
  budget.calls.push({ kind, at: new Date().toISOString(), ok, cost_usd: cost, detail });
  if (Number.isFinite(latencyMs)) budget.latencies_ms.push(latencyMs);
  return budget;
}

export function totalCostUsd(budget) {
  return Math.round(budget.calls.reduce((a, c) => a + (c.cost_usd || 0), 0) * 1000) / 1000;
}

export function avgLatencyMs(budget) {
  const l = budget.latencies_ms.filter(Number.isFinite);
  return l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length) : null;
}

// Aggregate several per-artifact budgets into a §29 report.
export function costReport(budgets = []) {
  const agg = { artifacts: budgets.length, creative_director_calls: 0, background_generations: 0, revisions: 0, visual_review_calls: 0, failed_calls: 0, total_cost_usd: 0 };
  const lat = [];
  for (const b of budgets) {
    for (const k of Object.keys(agg)) if (b.used[k] != null) agg[k] += b.used[k];
    agg.failed_calls += b.calls.filter((c) => !c.ok).length;
    agg.total_cost_usd += totalCostUsd(b);
    lat.push(...b.latencies_ms.filter(Number.isFinite));
  }
  agg.total_cost_usd = Math.round(agg.total_cost_usd * 1000) / 1000;
  agg.avg_latency_ms = lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null;
  const perArtifact = budgets.length ? agg.total_cost_usd / budgets.length : 0;
  agg.estimated_cost_per_10_posts_usd = Math.round(perArtifact * 10 * 100) / 100;
  return agg;
}

export const BUDGET_VERSION = "4b.1";
