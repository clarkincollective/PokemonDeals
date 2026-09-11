// Phase 17C.0 - fetch the WHOLE grouped report, prove it is complete.
//
// The original tool made one grouped query with no LIMIT; HogQL's default
// 100-row limit truncated it and the report read 0 for most events. This
// module:
//   1. pages through the grouped query (explicit ORDER BY group_key +
//      LIMIT, keyset pagination - PostHog rejects OFFSET for personal-API-
//      key queries; scripts/reporting/query.mjs) until a short page -
//      bounded by maxPages, and it THROWS rather than return a partial
//      result;
//   2. runs ONE independent per-event count over the same window;
//   3. compares the two event by event (checkCompleteness). A report is
//      only "complete" when every grouped sum equals its independent count.
//
// Read-only: every call goes through the injected runner (default:
// query.runPostHogQuery, the tool's single network call site), which only
// ever POSTs to the HogQL Query API.

import { buildHomepageQuery, buildEventTotalsQuery, rowsFromResponse, runPostHogQuery, lastGroupKey, REPORT_PAGE_SIZE } from "./query.mjs";
import { REPORT_EVENTS } from "./homepageEvents.mjs";

export class IncompleteReportError extends Error {
  constructor(message, detail = {}) {
    super(message);
    this.name = "IncompleteReportError";
    this.detail = detail;
  }
}

// Pure - independent totals response -> { event: n }.
export function eventTotalsFromResponse(response) {
  const columns = response?.columns;
  const results = response?.results;
  if (!Array.isArray(columns) || !Array.isArray(results)) {
    throw new Error("Unexpected PostHog totals response shape (expected {columns, results})");
  }
  if (response.hasMore === true) throw new IncompleteReportError("The per-event totals query itself was truncated");
  const ei = columns.indexOf("event");
  const ni = columns.indexOf("n");
  const out = {};
  for (const r of results) out[r[ei]] = Number(r[ni]) || 0;
  return out;
}

// Pure - grouped rows vs independent totals, event by event.
// `totals` covers EVERY event in the window. Completeness is judged on
// the report's own events (plus anything the grouped pages returned that
// is not one of them - that would be a query bug); everything else in the
// window is reported as OUT OF SCOPE, never silently ignored.
export function checkCompleteness(rows, totals, eventNames = REPORT_EVENTS) {
  const t = totals ?? {};
  const grouped = {};
  for (const r of rows ?? []) grouped[r.event] = (grouped[r.event] || 0) + (Number(r.n) || 0);
  const inScope = new Set(eventNames);
  const events = [...new Set([...eventNames, ...Object.keys(grouped)])].sort();
  const perEvent = events.map((event) => ({ event, grouped: grouped[event] || 0, independent: t[event] || 0 }));
  const mismatches = perEvent.filter((e) => e.grouped !== e.independent || !inScope.has(e.event));
  const outOfScope = Object.entries(t)
    .filter(([event]) => !inScope.has(event))
    .map(([event, n]) => ({ event, n }))
    .sort((a, b) => b.n - a.n || (a.event < b.event ? -1 : 1));
  const groupedTotal = perEvent.reduce((a, e) => a + e.grouped, 0);
  const independentTotal = perEvent.reduce((a, e) => a + e.independent, 0);
  const allEventsTotal = Object.values(t).reduce((a, n) => a + n, 0);
  return {
    complete: mismatches.length === 0,
    groupedTotal,
    independentTotal,
    perEvent,
    mismatches,
    // scope: the report covers REPORT_EVENTS only
    scope: {
      reportEventNames: eventNames.length,
      inScopeTotal: independentTotal,
      allEventsTotal,
      outOfScopeTotal: allEventsTotal - independentTotal,
      outOfScope,
    },
  };
}

// Fetch every page of the grouped query + the independent totals.
// -> { rows, totals, completeness, pages }
export async function fetchCompleteReport({ creds, from, to, pageSize = REPORT_PAGE_SIZE, maxPages = 40 }, run = runPostHogQuery) {
  const rows = [];
  let pages = 0;
  let afterKey = null;
  for (;;) {
    if (pages >= maxPages) {
      throw new IncompleteReportError(`Grouped report still had more rows after ${maxPages} pages of ${pageSize} - refusing to report a partial result`, { pages, rows: rows.length });
    }
    const response = await run({ ...creds, query: buildHomepageQuery(from, to, REPORT_EVENTS, { limit: pageSize, afterKey }) });
    pages += 1;
    const page = rowsFromResponse(response);
    rows.push(...page);
    // A full page (or the API saying so) means there may be more.
    const more = response?.hasMore === true || page.length >= pageSize;
    if (!more) break;
    const next = lastGroupKey(response);
    if (next == null || next === afterKey) throw new IncompleteReportError("Keyset pagination did not advance - refusing to report a partial result", { pages, rows: rows.length });
    afterKey = next;
  }
  const totals = eventTotalsFromResponse(await run({ ...creds, query: buildEventTotalsQuery(from, to) }));
  return { rows, totals, completeness: checkCompleteness(rows, totals), pages };
}

// Pure - split rows for the sensitivity comparison. The MAIN figures are
// always built from ALL rows; this only produces the "without suspected
// test days" view shown alongside them.
export function withoutSuspectedTestDays(rows) {
  return (rows ?? []).filter((r) => r.day_flag !== "suspected_test");
}
