// EBAY-14R - pure aggregation for the daily eBay Browse quota report.
// Takes the ebay_job_runs rows for one UTC day (already fetched by the
// caller - see scripts/reportEbayQuota.mjs) and returns a summary. No I/O,
// no eBay/DB call, deterministic - synthetic-fixture testable.

function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function utcHour(iso) {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.getUTCHours() : null;
}

// rows: ebay_job_runs-shaped objects. dayStart/now: Date instances (UTC
// calendar day boundaries - eBay's own quota resets around 07:00 UTC, but
// this report deliberately summarizes a plain UTC calendar day per Phase
// 14R Part 7, not the eBay reset window, to keep the math simple and the
// "estimated end of day" projection meaningful against wall-clock hours
// actually elapsed).
function summarizeEbayQuotaDay(rows, { dayStart, now = new Date() } = {}) {
  const list = Array.isArray(rows) ? rows : [];

  const totalBrowseCalls = list.reduce((s, r) => s + num(r.browse_calls), 0);
  const totalAnalyticsCalls = list.reduce((s, r) => s + num(r.analytics_calls), 0);
  const totalGradedDetailCalls = list.reduce((s, r) => s + num(r.graded_detail_calls), 0);
  const totalCallsSkipped = list.reduce((s, r) => s + num(r.calls_skipped), 0);
  const dedupeSavedImage = list.reduce((s, r) => s + num(r.dedupe_saved_image), 0);
  const dedupeSavedGrading = list.reduce((s, r) => s + num(r.dedupe_saved_grading), 0);

  const byJob = {};
  for (const r of list) {
    const job = r.job ?? "unknown";
    byJob[job] = byJob[job] ?? { browseCalls: 0, invocations: 0, skipped: 0, errors: 0 };
    byJob[job].browseCalls += num(r.browse_calls);
    byJob[job].invocations += 1;
    if (r.status === "skipped") byJob[job].skipped += 1;
    if (r.status === "error") byJob[job].errors += 1;
  }

  const byHour = Array.from({ length: 24 }, () => 0);
  for (const r of list) {
    const h = utcHour(r.started_at);
    if (h != null) byHour[h] += num(r.browse_calls);
  }

  const skippedByReserve = list.filter((r) => r.status === "skipped" && r.skip_reason === "quota_reserve").length;
  const skippedByRateLimit = list.filter(
    (r) => r.status === "skipped" && (r.skip_reason === "ebay_rate_limited" || r.skip_reason === "quota_reserve" || r.skip_reason === "rate_limit_unknown")
  ).length;

  let largestConsumer = null;
  let largestConsumerCalls = -1;
  for (const [job, agg] of Object.entries(byJob)) {
    if (agg.browseCalls > largestConsumerCalls) {
      largestConsumer = job;
      largestConsumerCalls = agg.browseCalls;
    }
  }

  let peakHour = null;
  let peakHourCalls = -1;
  byHour.forEach((calls, hour) => {
    if (calls > peakHourCalls) {
      peakHour = hour;
      peakHourCalls = calls;
    }
  });

  // Quota remaining: the most recent observed snapshot, start or end,
  // ordered by completed_at (falls back to started_at when a run never
  // finished cleanly).
  let quotaRemaining = null;
  let quotaLimit = null;
  let latestTs = -Infinity;
  for (const r of list) {
    const ts = Date.parse(r.completed_at ?? r.started_at ?? 0) || -Infinity;
    const end = r.quota_remaining_end;
    const start = r.quota_remaining_start;
    const val = end ?? start;
    if (val != null && ts >= latestTs) {
      latestTs = ts;
      quotaRemaining = val;
      quotaLimit = r.quota_limit ?? quotaLimit;
    }
  }

  // Burn rate / end-of-day projection - a plain linear extrapolation off
  // hours actually elapsed in the UTC day so far. Meaningless (and
  // omitted) with less than 15 minutes of elapsed time to avoid a wild
  // early-morning extrapolation.
  let estimatedEndOfDay = null;
  let burnRatePerHour = null;
  if (dayStart instanceof Date && now instanceof Date) {
    const elapsedHours = (now.getTime() - dayStart.getTime()) / 3_600_000;
    if (elapsedHours >= 0.25) {
      burnRatePerHour = totalBrowseCalls / elapsedHours;
      const remainingHours = Math.max(0, 24 - elapsedHours);
      estimatedEndOfDay = Math.round(totalBrowseCalls + burnRatePerHour * remainingHours);
    }
  }

  return {
    totalBrowseCalls,
    totalAnalyticsCalls,
    totalGradedDetailCalls,
    totalCallsSkipped,
    dedupeSavedImage,
    dedupeSavedGrading,
    dedupeSavedTotal: dedupeSavedImage + dedupeSavedGrading,
    byJob,
    byHour,
    skippedByReserve,
    skippedByRateLimit,
    largestConsumer,
    largestConsumerCalls: largestConsumerCalls < 0 ? 0 : largestConsumerCalls,
    peakHour,
    peakHourCalls: peakHourCalls < 0 ? 0 : peakHourCalls,
    quotaRemaining,
    quotaLimit,
    burnRatePerHour,
    estimatedEndOfDay,
    invocationCount: list.length,
  };
}

module.exports = { summarizeEbayQuotaDay };
