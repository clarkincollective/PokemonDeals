// Phase 13E.10A - EXPERIMENT EVALUATOR (READ-ONLY) (§13, §14).
//
// Joins the existing 13E.7A metrics + attribution layer to experiment
// identity. NO new analytics system. Pure aggregation - the caller reads
// ledger.json + the owner attribution export and passes them in.

import { EXPERIMENTS, findExperiment } from "./experiments.mjs";
import { conversionScore } from "./score.mjs";
import { evaluateExperiment } from "./learning.mjs";

const num = (v) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const addN = (a, b) => (a == null && b == null ? null : (a ?? 0) + (b ?? 0));

// pick the impressions-ish figure from a ledger row's newest metrics.
function impressionsOf(m = {}) {
  return num(m.impressions) ?? num(m.reach) ?? num(m.views) ?? null;
}

// Build the per-variant aggregate for ONE experiment.
//   rows       - PUBLISHED ledger rows carrying experiment_id + variant_id
//   attrByCid  - { [content_id]: { attributed_visits, affiliate_outbound, deal_page_views } }
function aggregateVariant(rows, attrByCid) {
  let n = 0;
  let impressions = null;
  let siteVisits = null;
  let affiliateOutbound = null;
  let dealPageViews = null;
  let platformCtrNum = null;
  let platformCtrDen = 0;

  for (const r of rows) {
    n += 1;
    impressions = addN(impressions, impressionsOf(r.metrics ?? {}));
    if (num(r.metrics?.engagement_rate) != null) {
      platformCtrNum = (platformCtrNum ?? 0) + Number(r.metrics.engagement_rate);
      platformCtrDen += 1;
    }
    const a = attrByCid[r.content_id];
    if (a) {
      siteVisits = addN(siteVisits, num(a.attributed_visits));
      affiliateOutbound = addN(affiliateOutbound, num(a.affiliate_outbound));
      dealPageViews = addN(dealPageViews, num(a.deal_page_views));
    }
  }

  const funnel = {
    impressions,
    siteVisits,
    dealPageViews,
    affiliateOutbound,
    platformCtr: platformCtrDen > 0 ? platformCtrNum / platformCtrDen : null,
  };
  const scored = conversionScore(funnel);
  return { n, funnel, score: scored.score, components: scored.components, missing: scored.missing };
}

// Full report for one experiment.
export function reportExperiment(experimentId, ledgerRows = [], attrByCid = {}) {
  const exp = findExperiment(experimentId);
  if (!exp) return { experiment_id: experimentId, error: "unknown experiment" };

  const published = ledgerRows.filter(
    (r) => r.status === "PUBLISHED" && (r.experiment_id ?? null) === experimentId && (r.variant_id ?? r.experiment_variant) != null
  );
  const vid = (r) => r.variant_id ?? r.experiment_variant;
  const A = aggregateVariant(published.filter((r) => vid(r) === "A"), attrByCid);
  const B = aggregateVariant(published.filter((r) => vid(r) === "B"), attrByCid);

  const anyData = A.n > 0 || B.n > 0;
  if (!anyData) {
    return {
      experiment_id: experimentId,
      hypothesis: exp.hypothesis,
      dimension: exp.dimension,
      variants: {
        A: { label: exp.variants.A.label, ...A, state: "NOT_AVAILABLE_YET" },
        B: { label: exp.variants.B.label, ...B, state: "NOT_AVAILABLE_YET" },
      },
      state: "NOT_AVAILABLE_YET",
      leader: "n/a",
      note: "nothing published for this experiment yet",
    };
  }

  const evalRes = evaluateExperiment({ A: { n: A.n, score: A.score }, B: { n: B.n, score: B.score } });
  return {
    experiment_id: experimentId,
    hypothesis: exp.hypothesis,
    dimension: exp.dimension,
    variants: {
      A: { label: exp.variants.A.label, ...A },
      B: { label: exp.variants.B.label, ...B },
    },
    state: evalRes.state,
    leader: evalRes.leader,
    cmp: evalRes.cmp,
    note: evalRes.cmp?.reason || "",
  };
}

export function reportAll(ledgerRows = [], attrByCid = {}) {
  return EXPERIMENTS.map((e) => reportExperiment(e.experiment_id, ledgerRows, attrByCid));
}

// Compact per-experiment row for the operator dashboard (§21).
export function dashboardExperimentRow(rep) {
  return {
    experiment_id: rep.experiment_id,
    dimension: rep.dimension,
    a_n: rep.variants?.A?.n ?? 0,
    b_n: rep.variants?.B?.n ?? 0,
    a_score: rep.variants?.A?.score ?? null,
    b_score: rep.variants?.B?.score ?? null,
    state: rep.state,
    leader: rep.leader,
  };
}
