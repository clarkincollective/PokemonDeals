// Production log discipline (VERCEL-COST-2, 27 Sep 2026).
//
// Every console line a function emits is one billed Observability event.
// The measured split (27 Sep, 24 h): ~345,000 events, of which the
// application's own console output was ~1,200 - the rest are request logs.
// So this module is not about the bill's bulk; it is about the two shapes
// that CAN explode it: a log inside a per-item loop (one job run = hundreds
// or thousands of lines) and a log on a traffic-driven path (one per
// request, unbounded). Rules:
//
//   * a job logs ONE structured completion line per run (counts only);
//   * a per-item error is logged ONCE per function instance and counted;
//     the count travels in the run's completion line and response;
//   * anything chattier is a debug line, printed only with LOG_DEBUG=1.
//
// Never throws: a logging failure must never affect the work being logged.

const DEBUG = process.env.LOG_DEBUG === "1" || process.env.LOG_DEBUG === "true";

export const debugEnabled = () => DEBUG;

// Verbose / per-item lines. Silent in production unless LOG_DEBUG is set.
export function debugLog(...args) {
  if (!DEBUG) return;
  try {
    console.log(...args);
  } catch {
    /* never */
  }
}

// A counter for a repeating condition: logs the first `cap` occurrences per
// function instance (so the failure is still visible with its real message),
// counts every one, and lets the caller report the total.
export function cappedLogger(label, { cap = 1, level = "error" } = {}) {
  let seen = 0;
  const fn = console[level] ?? console.error;
  return {
    log(...args) {
      seen++;
      if (seen > cap) return;
      try {
        fn(`[${label}]`, ...args, seen === cap && cap > 0 ? `(further ${label} lines suppressed; count in the run summary)` : "");
      } catch {
        /* never */
      }
    },
    count: () => seen,
    reset() {
      seen = 0;
    },
  };
}

// ONE structured completion line per job run. Counts and outcomes only -
// no ids, titles, URLs or secrets. `event` names the job.
export function logRunSummary(event, fields = {}) {
  try {
    console.log(JSON.stringify({ event, sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null, ...fields }));
  } catch {
    /* never */
  }
}
