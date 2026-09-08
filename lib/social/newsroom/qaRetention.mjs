// Phase SOCIAL-NEWSROOM-3 - social_qa_runs GROWTH MONITOR (SS35).
//
// INFRA-DB-1 flagged social_qa_runs as the only unbounded newsroom table.
// This is the NON-DESTRUCTIVE first version: it classifies existing rows,
// reports growth, and warns past a threshold. It NEVER deletes anything
// this phase - a real archive/prune job is a later, explicitly-safe step.
//
// Classification:
//   RETAIN_FOREVER  - the row gated a real BUFFER_QUEUED / PUBLISHED
//                     decision (placement is/was queued or published), OR
//                     it is a consensus decision under the current policy.
//   DEV_RETRY       - a WATCH/FAIL row whose placement never reached a
//                     provider state; a candidate for a FUTURE archive.
//
// Read-only. Takes already-loaded rows so it is trivially testable.

export const QA_ROW_WARN_THRESHOLD = 5000;   // start paying attention
export const QA_ROW_ALERT_THRESHOLD = 20000; // design the archive job now

const PROVIDER_STATES = new Set(["BUFFER_READY", "BUFFER_QUEUED", "PUBLISHED"]);

// qaRows: [{ qa_id, placement_id, qa_type, result, checked_at, detail }]
// placementState: { [placement_id]: status }  (current status)
export function classifyQaRows(qaRows = [], placementState = {}) {
  let retainForever = 0;
  let devRetry = 0;
  const byType = {};
  let consensusRows = 0;
  let oldest = null;
  for (const r of qaRows) {
    byType[r.qa_type] = (byType[r.qa_type] ?? 0) + 1;
    if (r.detail?.consensus_result) consensusRows += 1;
    const t = r.checked_at ? Date.parse(r.checked_at) : NaN;
    if (Number.isFinite(t) && (oldest == null || t < oldest)) oldest = t;
    const st = placementState[r.placement_id];
    const gatedProviderDecision = PROVIDER_STATES.has(st) || Boolean(r.detail?.consensus_result);
    if (gatedProviderDecision || r.result === "PASS") retainForever += 1;
    else devRetry += 1;
  }
  return {
    total: qaRows.length,
    retain_forever: retainForever,
    dev_retry_archivable_later: devRetry,
    by_type: byType,
    consensus_rows: consensusRows,
    oldest_iso: oldest != null ? new Date(oldest).toISOString() : null,
  };
}

// classify + a severity verdict + a projected weeks-to-alert from a
// supplied per-refill row estimate (SS9/SS35).
export function qaRetentionReport(qaRows = [], placementState = {}, { rowsPerRefill = 25, refillsPerWeek = 2 } = {}) {
  const c = classifyQaRows(qaRows, placementState);
  const perWeek = rowsPerRefill * refillsPerWeek;
  const headroom = QA_ROW_ALERT_THRESHOLD - c.total;
  const weeks_to_alert = perWeek > 0 ? Math.max(0, Math.round(headroom / perWeek)) : null;
  const severity =
    c.total >= QA_ROW_ALERT_THRESHOLD ? "ALERT" :
    c.total >= QA_ROW_WARN_THRESHOLD ? "WATCH" : "OK";
  return {
    ...c,
    severity,
    warn_threshold: QA_ROW_WARN_THRESHOLD,
    alert_threshold: QA_ROW_ALERT_THRESHOLD,
    est_rows_per_week: perWeek,
    est_weeks_to_alert: weeks_to_alert,
    action:
      severity === "ALERT" ? "build the social_qa_runs archive/prune job now (retain RETAIN_FOREVER, archive DEV_RETRY older than 180d)" :
      severity === "WATCH" ? "design the archive job; still non-urgent" :
      "monitor only - table is tiny",
    destructive_action_taken: false,
  };
}
