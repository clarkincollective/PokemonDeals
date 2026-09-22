// COHORT MEMBERSHIP SURVIVES THE REPAIR. Offline; no DB, no network.
//
// The defect being pinned here is a REPORTING one, and it was live: the
// repair monitor identified its cohort by querying the live table for
// rows that still carry an unevidenced parallel reference - that is, by
// reading `reference_printing`. Invalidation NULLs that column, so the
// moment the repair ran the monitor's own population emptied and it
// printed "0 refused by the containment gate" while 207 references were
// still unresolved. A zero that means "the field I keyed on is gone"
// rendered identically to a zero that means "the work is done".
//
// So the contract under test is: membership is a fixed list of deal ids
// captured before the change, and NO mutable field may remove a row from
// it. The states are then mutually exclusive and must reconcile to the
// original cohort size, with anything unreadable explicitly unassessable
// rather than dropped.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STATES,
  cohortIdsFromSnapshots,
  referenceIsResolved,
  classifyCohortRow,
  unresolvedDetail,
  reconcileCohort,
} from "../../lib/printingCohortProgress.js";
import { savingsClaimTrusted, hasPositiveComparison, referenceIsUnevidencedParallelPrinting } from "../../lib/dealQuality.js";
import { CARD_REFERENCE_COLUMNS, clearedReference } from "../../lib/referenceProvenance.js";

// Availability stamps are relative: isDisplayableDeal and the freshness
// rules carry a TTL, and a literal date makes a test expire by wall
// clock (it already happened to two sibling files).
const HOURS = 3600 * 1000;
const agoISO = (h) => new Date(Date.now() - h * HOURS).toISOString();

// A cohort member as it looked BEFORE the repair: a real reference, for
// a parallel printing the listing does not evidence.
function preRepairRow(over = {}) {
  return {
    id: 33800,
    title: "Psyduck 104/147 Aquapolis Regular Pokemon Card LP",
    card_name: "Psyduck",
    card_set: "Aquapolis",
    card_language: "english",
    card_tcgplayer_id: "1111",
    listing_id: "v1|33800|0",
    listing_url: "https://www.ebay.com/itm/33800",
    listing_type: "FIXED_PRICE",
    condition: "Lightly Played",
    is_graded: false,
    price: 250,
    shipping: 50,
    total_price: 300,
    total_price_usd: 300,
    market_price: 700,
    discount_pct: 0.5714,
    reference_source: "ppt_live",
    reference_product_id: "1111",
    reference_amount: 700,
    reference_currency: "USD",
    reference_condition: "Lightly Played",
    reference_printing: "Reverse Holofoil",
    reference_observed_at: "2026-09-20T12:00:00.000Z",
    reference_synced_at: "2026-09-20T12:00:00.000Z",
    is_active: true,
    first_seen_at: agoISO(6),
    last_seen_at: agoISO(1),
    exact_verified_at: agoISO(1),
    image_verdict: "SELLER_FRONT",
    disqualified_reason: null,
    ...over,
  };
}

const invalidated = (row) => ({ ...row, ...clearedReference(CARD_REFERENCE_COLUMNS) });

// A correctly repaired row: the plain printing, priced for this
// listing's condition, reconciling against market_price.
const repaired = (row, { marketPrice = 320, discountPct = 0.0625 } = {}) => ({
  ...invalidated(row),
  market_price: marketPrice,
  discount_pct: discountPct,
  reference_source: "ppt_live",
  reference_product_id: row.card_tcgplayer_id,
  reference_amount: marketPrice,
  reference_currency: "USD",
  reference_condition: row.condition,
  reference_printing: "Normal",
  reference_observed_at: agoISO(2),
  reference_synced_at: agoISO(2),
});

const snapshotOf = (rows, capturedAt = "2026-09-22T01:41:14.061Z") => ({
  capturedAt,
  rows: rows.map((r) => ({ id: r.id, listing_id: r.listing_id, title: r.title, before: {} })),
});

// ---- THE CENTRAL CASE ------------------------------------------------

test("clearing reference_printing does NOT remove a row from the tracked cohort", () => {
  const before = preRepairRow();
  const after = invalidated(before);

  // The old membership test - the one the monitor used - flips to false
  // the instant the repair runs. This is the bug, pinned.
  assert.equal(referenceIsUnevidencedParallelPrinting(before), true, "the old test found it before the repair");
  assert.equal(referenceIsUnevidencedParallelPrinting(after), false, "...and loses it the moment the column is cleared");
  assert.equal(after.reference_printing, null);

  // Membership by stable id is unaffected.
  const ids = cohortIdsFromSnapshots([snapshotOf([before])]);
  assert.deepEqual(ids, [33800]);

  const report = reconcileCohort(ids, new Map([[33800, after]]));
  assert.equal(report.total, 1);
  assert.equal(report.counts.active_unresolved, 1, "still tracked, and still counted as unresolved");
  assert.equal(report.counts.active_resolved, 0);
  assert.ok(report.reconciles);
});

test("every cleared reference column is cleared, and none of them is consulted for membership", () => {
  const after = invalidated(preRepairRow());
  for (const col of CARD_REFERENCE_COLUMNS) assert.equal(after[col], null, `${col} cleared`);
  // Membership derives only from the snapshot, so a row with EVERY
  // mutable field wiped is still tracked.
  const ids = cohortIdsFromSnapshots([snapshotOf([preRepairRow()])]);
  const report = reconcileCohort(ids, new Map([[33800, after]]));
  assert.equal(report.counts.active_unresolved, 1);
});

// ---- the four states are exclusive and total -------------------------

test("the four states are mutually exclusive and reconcile to the cohort total", () => {
  const rows = [
    preRepairRow({ id: 1 }),
    preRepairRow({ id: 2 }),
    preRepairRow({ id: 3 }),
    preRepairRow({ id: 4 }),
    preRepairRow({ id: 5 }),
  ];
  const ids = cohortIdsFromSnapshots([snapshotOf(rows)]);
  assert.equal(ids.length, 5);

  const live = new Map([
    [1, invalidated(rows[0])], //                      active, unresolved
    [2, repaired(rows[1])], //                         active, resolved
    [3, { ...invalidated(rows[2]), is_active: false }], // ended
    // 4 deliberately absent from the read ->          unassessable
    [5, { ...invalidated(rows[4]), is_active: null }], // unknown ->    unassessable
  ]);

  const report = reconcileCohort(ids, live);
  assert.deepEqual(report.counts, {
    active_unresolved: 1,
    active_resolved: 1,
    inactive_ended: 1,
    unassessable: 2,
  });
  assert.equal(report.accounted, report.total, "no id is dropped and none is double-counted");
  assert.equal(report.reconciles, true);

  // Exclusivity, stated directly: each member has exactly one state, and
  // it is one of the declared four.
  for (const m of report.members) assert.ok(STATES.includes(m.state), `${m.id}: ${m.state}`);
  assert.equal(new Set(report.members.map((m) => m.id)).size, report.total);
});

test("a missing row is unassessable, never silently dropped and never 'resolved'", () => {
  const ids = cohortIdsFromSnapshots([snapshotOf([preRepairRow({ id: 77 })])]);
  const report = reconcileCohort(ids, new Map());
  assert.equal(report.counts.unassessable, 1);
  assert.equal(report.counts.active_resolved, 0, "absence is not repair");
  assert.equal(report.counts.active_unresolved, 0, "nor is it evidence of a backlog");
  assert.equal(report.accounted, 1, "but it IS still accounted for");
  assert.equal(classifyCohortRow(null), "unassessable");
  assert.equal(classifyCohortRow(undefined), "unassessable");
});

// ---- what "resolved" requires ---------------------------------------

test("a residual market_price is NOT proof of repair", () => {
  // Exactly the post-invalidation shape: provenance gone, market_price
  // and discount_pct left behind because both are NOT NULL on `deals`.
  const row = invalidated(preRepairRow());
  assert.equal(row.market_price, 700, "the legacy figure survived the clear");
  assert.equal(row.discount_pct, 0.5714, "and so did the legacy discount");
  assert.equal(referenceIsResolved(row), false, "but neither makes it resolved");
  assert.equal(classifyCohortRow(row), "active_unresolved");
  assert.equal(unresolvedDetail(row), "cleared_never_rewritten");
});

test("a positive discount is NOT required: a correct reference may price at or above market", () => {
  const base = preRepairRow();
  // Reference $280 against a $300 total - correctly matched, no saving.
  const atOrAbove = repaired(base, { marketPrice: 280, discountPct: 0 });
  assert.equal(hasPositiveComparison(atOrAbove), false, "there is no saving to state");
  assert.equal(savingsClaimTrusted(atOrAbove), true, "but the reference is supported");
  assert.equal(referenceIsResolved(atOrAbove), true, "so the repair IS resolved");
  assert.equal(classifyCohortRow(atOrAbove), "active_resolved");
});

test("a reference rewritten to a parallel printing again is unresolved, not resolved", () => {
  const row = {
    ...repaired(preRepairRow()),
    reference_printing: "Reverse Holofoil", // the same mistake, re-made
  };
  assert.equal(referenceIsUnevidencedParallelPrinting(row), true);
  assert.equal(referenceIsResolved(row), false);
  assert.equal(classifyCohortRow(row), "active_unresolved");
  assert.equal(unresolvedDetail(row), "reconciles_but_gate_refuses");
});

test("a reference that does not reconcile against market_price is unresolved", () => {
  const row = { ...repaired(preRepairRow()), reference_amount: 999 };
  assert.equal(referenceIsResolved(row), false);
  assert.equal(classifyCohortRow(row), "active_unresolved");
  assert.equal(unresolvedDetail(row), "reference_does_not_reconcile");
});

test("the unresolved breakdown sums to the unresolved count", () => {
  const rows = [1, 2, 3, 4].map((id) => preRepairRow({ id }));
  const ids = cohortIdsFromSnapshots([snapshotOf(rows)]);
  const live = new Map([
    [1, invalidated(rows[0])],
    [2, { ...repaired(rows[1]), reference_amount: 999 }],
    [3, { ...repaired(rows[2]), reference_printing: "1st Edition" }],
    [4, repaired(rows[3])],
  ]);
  const report = reconcileCohort(ids, live);
  const sum = Object.values(report.unresolvedBreakdown).reduce((a, b) => a + b, 0);
  assert.equal(sum, report.counts.active_unresolved, "the breakdown is a partition of the count, not a fifth state");
  assert.equal(report.counts.active_unresolved, 3);
  assert.equal(report.counts.active_resolved, 1);
});

// ---- snapshot union --------------------------------------------------

test("the cohort is the union of the canary and apply snapshots, deduplicated", () => {
  const canary = snapshotOf([preRepairRow({ id: 1 }), preRepairRow({ id: 2 })], "2026-09-22T01:38:16.610Z");
  const apply = snapshotOf([preRepairRow({ id: 2 }), preRepairRow({ id: 3 })], "2026-09-22T01:41:14.061Z");
  assert.deepEqual(cohortIdsFromSnapshots([canary, apply]), [1, 2, 3], "id 2 appears in both and is counted once");
});

test("a snapshot row without an id is skipped rather than counted as a phantom member", () => {
  const snap = { capturedAt: "x", rows: [{ id: 5 }, { listing_id: "no-id" }, { id: null }] };
  assert.deepEqual(cohortIdsFromSnapshots([snap]), [5]);
  assert.deepEqual(cohortIdsFromSnapshots([]), []);
  assert.deepEqual(cohortIdsFromSnapshots(undefined), []);
});

// ---- the headline guarantee -----------------------------------------

test("zero containment-gate refusals does not imply zero unresolved references", () => {
  // The exact production situation after invalidation: every cohort
  // member has a cleared printing, so the containment gate finds nothing
  // at all, while every one of them is still unresolved.
  const rows = [1, 2, 3].map((id) => preRepairRow({ id }));
  const live = rows.map(invalidated);
  const gateRefusals = live.filter(referenceIsUnevidencedParallelPrinting).length;
  assert.equal(gateRefusals, 0, "the gate sees nothing - the column it reads was cleared");

  const report = reconcileCohort(
    cohortIdsFromSnapshots([snapshotOf(rows)]),
    new Map(live.map((r) => [r.id, r]))
  );
  assert.equal(report.counts.active_unresolved, 3, "and yet every member is unresolved");
  assert.notEqual(gateRefusals, report.counts.active_unresolved, "the two numbers are not the same measure");
});
