// PRINTING-REPAIR COHORT: membership and current state. Pure, no IO.
//
// WHY THIS EXISTS AS ITS OWN MODULE. The first repair monitor identified
// the cohort by asking the live table which rows still carry an
// unevidenced parallel reference - i.e. it read `reference_printing`.
// That is the very column the repair CLEARS, so once invalidation ran,
// the monitor reported "0 refused by the containment gate" while 207
// references were still unresolved. It measured a set that the fix had
// emptied by construction and presented that as progress.
//
// The rule this module exists to enforce: COHORT MEMBERSHIP IS A LIST OF
// STABLE DEAL IDS, captured before the change, and nothing else. A row
// stays in the cohort no matter what any mutable field is set to. State
// is then asked of each member individually.
//
// The four states are mutually exclusive and total: every id in the
// cohort lands in exactly one, so the counts reconcile against the
// original cohort size. An id we cannot assess is reported as
// unassessable rather than quietly dropped or folded into "unresolved" -
// a row we cannot see is not evidence of anything.

const { savingsClaimTrusted, storedReferenceEvidence } = require("./dealQuality.js");
const { CARD_REFERENCE_COLUMNS } = require("./referenceProvenance.js");

const STATES = Object.freeze(["active_unresolved", "active_resolved", "inactive_ended", "unassessable"]);

// Stable ids, from one or more invalidation snapshots. The canary and
// apply runs each wrote their own file, so the cohort is their union.
// Ids only - no snapshot field is consulted when deciding state later,
// because the snapshot records what the row looked like BEFORE the
// change and would be stale evidence about now.
function cohortIdsFromSnapshots(snapshots) {
  const ids = new Set();
  for (const snap of snapshots ?? []) {
    for (const row of snap?.rows ?? []) {
      if (row?.id == null) continue;
      ids.add(row.id);
    }
  }
  return [...ids].sort((a, b) => Number(a) - Number(b));
}

// Does this row carry a reference that is SUPPORTED under the identity
// and provenance rules?
//
// This is savingsClaimTrusted, deliberately, and not something looser:
//   * a legacy `market_price` left behind by invalidation is NOT proof of
//     repair - it is NOT NULL on `deals` so it survived the clear, and
//     without reference_product_id / reference_amount reconciling against
//     it there is nothing to trust. storedReferenceEvidence requires that
//     reconciliation, so a residual figure alone can never read as
//     resolved;
//   * a POSITIVE DISCOUNT IS NOT REQUIRED. A correctly matched reference
//     that happens to price the listing at or above market is fully
//     repaired - it is hasPositiveComparison, a different question, that
//     decides whether a saving may be stated. Requiring a discount here
//     would report correct repairs as failures and quietly reward the old
//     wrong anchors, which were wrong precisely because they were high.
function referenceIsResolved(row) {
  return savingsClaimTrusted(row) === true;
}

// Exactly one of STATES, for one cohort member.
//   row === null/undefined -> the id no longer resolves to a row.
//   is_active === false    -> ended naturally; not a repair outcome.
//   is_active !== true     -> we cannot tell; explicitly unassessable
//                             rather than assumed either way.
function classifyCohortRow(row) {
  if (row == null) return "unassessable";
  if (row.is_active === false) return "inactive_ended";
  if (row.is_active !== true) return "unassessable";
  return referenceIsResolved(row) ? "active_resolved" : "active_unresolved";
}

// Why an active member is still unresolved. A BREAKDOWN of
// active_unresolved, not a fifth state - these sum to that one count.
function unresolvedDetail(row) {
  const cleared = CARD_REFERENCE_COLUMNS.every((c) => row?.[c] == null);
  if (cleared) return "cleared_never_rewritten";
  if (!storedReferenceEvidence(row)) return "reference_does_not_reconcile";
  return "reconciles_but_gate_refuses";
}

// Full reconciliation. `rowsById` is any Map-like with .get(id); an id
// absent from it is unassessable, which is what makes a failed or
// partial read visible instead of silently shrinking the cohort.
function reconcileCohort(cohortIds, rowsById) {
  const counts = Object.fromEntries(STATES.map((s) => [s, 0]));
  const unresolvedBreakdown = {
    cleared_never_rewritten: 0,
    reference_does_not_reconcile: 0,
    reconciles_but_gate_refuses: 0,
  };
  const members = [];
  for (const id of cohortIds) {
    const row = rowsById.get(id) ?? null;
    const state = classifyCohortRow(row);
    counts[state] += 1;
    let detail = null;
    if (state === "active_unresolved") {
      detail = unresolvedDetail(row);
      unresolvedBreakdown[detail] += 1;
    }
    members.push({ id, state, detail });
  }
  const total = cohortIds.length;
  const accounted = STATES.reduce((n, s) => n + counts[s], 0);
  return { total, counts, unresolvedBreakdown, members, accounted, reconciles: accounted === total };
}

module.exports = {
  STATES,
  cohortIdsFromSnapshots,
  referenceIsResolved,
  classifyCohortRow,
  unresolvedDetail,
  reconcileCohort,
};
