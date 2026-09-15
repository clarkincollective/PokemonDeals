// BROWSE BUDGET LEDGER (browse-budget-r1) - one durable, atomic reservation
// ledger for every eBay Browse consumer inside the fixed 5,000-call window.
//
// WHY: every scheduled job used to compare eBay's *remaining* count with its
// own absolute floor (sweep 250, allocated 1,200, ingest 800, verify 800,
// optional verifier lanes 1,070). Remaining-count floors are time-blind and
// are not a concurrency control: measured 11-13 Sep, ~90% of the window was
// spent in its first 12 h and every job then skipped for ~10 h. The remaining
// count stays a RECONCILIATION signal here - never the lock.
//
// MODEL (per eBay quota window, keyed by the provider-reported reset):
//   caps      hard per-consumer call caps that sum to LIMIT - RESERVE
//   used      calls charged to a consumer: attempts a settled lease started
//             (every attempt that left the process, whatever its outcome),
//             or the FULL grant of a lease that expired unsettled
//   open      in-flight leases { key, granted, expiresAt } - counted as fully
//             spent in every check until settled
// A lease is granted only if ALL hold (evaluateGrant):
//   granted <= cap - used - open                         (hard consumer cap)
//   granted <= pace(cap, elapsed) + burst - used - open  (pacing; the burst
//             is borrowed from the SAME cap, clamped to it - never above it)
//   granted <= remaining - openAll - RESERVE - verifyCommitment
//             (provider balance; verifyCommitment = the verifier's unspent
//             cap, protected from every other consumer)
// Every Browse attempt then draws one unit from the lease in-process
// (lib/ebayTelemetry.consumeBrowseAttempt, called by lib/ebay.fetchWithRetry
// BEFORE the request, retries included). In enforce mode an attempt beyond
// the lease, without a lease, or inside the reset guard band is refused. So
// the calls participating code can make in a window are bounded by the sum of
// the caps, however many workers overlap.
//
// ATOMICITY: the ledger is one row of the existing catalog_snapshot table
// (kind = "browse_budget:<window reset>"); every change is a compare-and-set
// UPDATE ... WHERE kind = k AND updated_at = <the version read>, with a
// strictly increasing updated_at. Two workers can read the same version; only
// one UPDATE matches, the other re-reads and re-evaluates. No migration.
//
// CONSERVATIVE RECONCILIATION: capacity charged is never restored because a
// worker timed out or crashed (its lease is charged in full when it expires,
// and a late settle is ignored). If eBay reports MORE consumption than the
// ledger accounts for, the provider-balance check sees it directly and the
// drift is recorded as reserve absorption; if eBay reports LESS, nothing is
// given back.
//
// RESET BOUNDARY: a lease belongs to one window row and carries its
// windowEnd; attempts are refused from windowEnd - WINDOW_GUARD_MS, so an old
// worker cannot spend calls that eBay would count against the next window,
// and a new window's row starts empty.

const { randomUUID } = require("node:crypto");

const BROWSE_DAILY_LIMIT = 5000;
const BROWSE_RESERVE = 420; // never grantable to a consumer lease (see reserve semantics above)
const H = 3_600_000;
const WINDOW_GUARD_MS = 2 * 60_000;
const LEDGER_TABLE = "catalog_snapshot";
const LEDGER_KIND_PREFIX = Object.freeze({ enforce: "browse_budget:", observe: "browse_budget_observe:" });
const CAS_ATTEMPTS = 12;
// Randomised, growing pause between compare-and-set retries so overlapping
// workers converge instead of colliding again (a retry re-reads and
// re-evaluates; running out of attempts fails closed in enforce mode).
const casBackoff = (i) => (i === 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, Math.floor(Math.random() * 15 * i) + 2)));

// --- the envelope -----------------------------------------------------
// alloc-rev2 (observe trial, 16 Sep 2026) - group totals: verify 450 +
// allocated 2,350 + sweep 1,730 + ingest 40 + images 10 = 4,580 = LIMIT -
// RESERVE. Sealed discovery and manual scans are explicitly unfunded (0).
// Measured basis (11-14 Sep windows): verify spent ~450/day, all before
// ~18:30 UTC; competitor-board ingest ~382/day for ~4.5 first-time eligible
// pairs. These caps decide grants ONLY in enforce mode; in observe they only
// shape the ledger's recorded hypothetical decisions.
const CONSUMER_GROUP_CAPS = Object.freeze({ verify: 450, allocated: 2350, sweep: 1730, ingest: 40, images: 10, sealed: 0, manual: 0 });
// Per-country allocated caps: measured first passes (11-14 Sep: US 609-706,
// GB 418-495, CA 391-488, AU 346-401, DE 209-232, IT 311 on its one full
// day), DE reduced as the lowest measured yield. Under enforce a first pass
// is also bounded by its own request (targets x calls per target), so a
// pass larger than min(cap, request) would be truncated - e.g. the 773-call
// US pass of 15 Sep would stop at 642.
const ALLOCATED_COUNTRY_CAPS = Object.freeze({ EBAY_US: 650, EBAY_GB: 445, EBAY_CA: 435, EBAY_AU: 370, EBAY_DE: 150, EBAY_IT: 300 });
// Per-country sweep caps: measured US ~990/day, others 135-169/day.
const SWEEP_COUNTRY_CAPS = Object.freeze({ EBAY_US: 990, EBAY_GB: 160, EBAY_CA: 160, EBAY_AU: 150, EBAY_DE: 130, EBAY_IT: 140 });
const CONSUMER_CAPS = Object.freeze({
  verify: CONSUMER_GROUP_CAPS.verify,
  ...Object.fromEntries(Object.entries(ALLOCATED_COUNTRY_CAPS).map(([c, n]) => [`allocated:${c}`, n])),
  ...Object.fromEntries(Object.entries(SWEEP_COUNTRY_CAPS).map(([c, n]) => [`sweep:${c}`, n])),
  ingest: CONSUMER_GROUP_CAPS.ingest,
  images: CONSUMER_GROUP_CAPS.images,
  sealed: 0,
  manual: 0,
});
// Pacing bursts, borrowed from each consumer's own cap.
const PACE_BURST = Object.freeze({ verify: 40, sweep: 30, ingest: 40 });
// Allocated scans are paced by their existing twice-daily schedule instead of
// elapsed time: a country's first pass (first half of the window) may use at
// most this share of its cap; the rest waits for the second pass.
// alloc-rev2: every share is 1. No second pass ran in the measured windows,
// and under pacing the retained 1,200 allocated floor blocks allocated runs
// more than ~16 h after reset (CA 01:30, DE 03:00, IT 05:00 second passes), so
// a split share strands funded capacity. Second passes get only what the first
// pass left unused.
const ALLOCATED_FIRST_PASS_SHARE = Object.freeze({ EBAY_US: 1, EBAY_GB: 1, EBAY_CA: 1, EBAY_AU: 1, EBAY_DE: 1, EBAY_IT: 1 });

{
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  if (sum(CONSUMER_GROUP_CAPS) + BROWSE_RESERVE !== BROWSE_DAILY_LIMIT) throw new Error("browseBudget: group caps + reserve must equal the limit");
  if (sum(ALLOCATED_COUNTRY_CAPS) !== CONSUMER_GROUP_CAPS.allocated) throw new Error("browseBudget: allocated country caps must sum to the allocated cap");
  if (sum(SWEEP_COUNTRY_CAPS) !== CONSUMER_GROUP_CAPS.sweep) throw new Error("browseBudget: sweep country caps must sum to the sweep cap");
  if (sum(CONSUMER_CAPS) + BROWSE_RESERVE !== BROWSE_DAILY_LIMIT) throw new Error("browseBudget: consumer caps + reserve must equal the limit");
}

function browseBudgetMode(env = process.env) {
  const m = String(env?.BROWSE_BUDGET_MODE ?? "off").trim().toLowerCase();
  return m === "observe" || m === "enforce" ? m : "off";
}
const groupOf = (key) => String(key ?? "").split(":")[0];
const iso = (ms) => new Date(ms).toISOString();

// --- the provider window --------------------------------------------------
// ACTUAL INPUT. A retained real reading taken through the existing metadata
// path (getBrowseRateLimit -> Developer Analytics getRateLimits, not a Browse
// call), .social-preview/operator-dashboard/dashboard.json, read
// 2026-09-08T03:48:04.560Z:
//   { "limit": 5000, "remaining": 240, "reset": "2026-09-08T07:00:00.000Z" }
// `reset` is eBay's rates[].reset STRING: ISO 8601, UTC ("Z"), milliseconds.
// The same machine's quota-wait log shows 230 at 07:00Z and 5000 at 07:15Z.
// eBay's rate object also carries `timeWindow` (seconds; 86,400 recorded in
// docs/ebay-rate-limits.md); getBrowseRateLimit passes it through with the
// read time. The ledger window is [reset - timeWindow, reset]; 07:00 UTC is
// never assumed (it moves with US daylight saving) and no local calendar
// date is used.
const RESET_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const DEFAULT_WINDOW_SECONDS = 86_400;

// null for anything that cannot name the CURRENT provider window: a
// non-string (e.g. epoch number), a string without an explicit zone (which
// Date.parse would read as local time), an unparseable value, a reset that
// has already passed (stale), or one outside the current window's horizon.
function windowFromObservation(observation, now = Date.now()) {
  const reset = observation?.reset;
  if (typeof reset !== "string" || !RESET_ISO_RE.test(reset)) return null;
  const end = Date.parse(reset);
  if (!Number.isFinite(end)) return null;
  const rounded = Math.round(end / (5 * 60_000)) * 5 * 60_000;
  const tw = Number(observation?.timeWindow);
  const seconds = Number.isFinite(tw) && tw >= 3_600 && tw <= 90_000 ? tw : DEFAULT_WINDOW_SECONDS;
  const windowStart = rounded - seconds * 1000;
  if (rounded <= now || windowStart > now || rounded > now + 25 * H) return null;
  return { id: iso(rounded), windowEnd: rounded, windowStart, windowSource: seconds === tw ? "provider_timeWindow" : "default_86400s" };
}

function emptyLedger(win) {
  return {
    v: 2,
    windowStart: iso(win.windowStart),
    windowEnd: iso(win.windowEnd),
    windowSource: win.windowSource ?? null,
    limit: BROWSE_DAILY_LIMIT,
    reserve: BROWSE_RESERVE,
    // enforce rows only: "active" (enforcing from this window's birth) or
    // "pending" (enforce configured, but this window is not enforceable)
    state: null,
    stateReason: null,
    enforceSeenAt: null,
    used: {},
    open: {},
    reserveAbsorbed: 0,
    lastObservation: null,
    // observe / pending rows: what enforce WOULD have decided, per consumer
    hypothetical: {},
    counters: { grants: 0, denials: 0, trims: 0, expired: 0, settled: 0, lateSettles: 0 },
    // pacing-reset-r1: whether the provider's balance for THIS window has been
    // confirmed (see RESET CONFIRMATION below). null on rows written before it.
    reset: null,
    // the most recent reconciliation: negative drift = eBay has not yet counted
    // attempts the ledger already charged (provider lag), positive = unexplained
    lastDrift: null,
  };
}

// --- reset confirmation (pacing-reset-r1) --------------------------------
// ACTUAL SEQUENCE, 2026-09-15: at 07:00:00Z getRateLimits already reported the
// NEW reset (2026-09-16T07:00Z) but still the previous window's balance (230,
// its 06:30 closing reading); 07:15 read 5,000; 07:45 read 4,990 after 37
// attempts (eBay's count lags). The row born from the 07:00 reading charged
// 4,770 as reserve drift for the whole window and would have kept an enforce
// window pending ("prior_consumption_unaccounted") forever.
//
// A birth reading is UNCONFIRMED when it arrives early in the window
// (< RESET_EARLY_MS after its start), shows more than BIRTH_MAX_CONSUMED used,
// and is no higher than the previous window's last reading (+ tolerance) -
// the signature of the old counter. Nothing else changes at birth: grants and
// hypothetical decisions still use that low reading (no fresh balance is
// assumed), attempts and open leases are recorded as usual, and an enforce
// row stays effective observe (today's protections). The reading is kept as
// evidence. A later valid reading of the SAME window then decides, once:
//   stale_counter      remaining jumped above the anomalous reading by more
//                      than BIRTH_MAX_CONSUMED - impossible within one window,
//                      so the anomalous reading was the old counter. Its drift
//                      is not charged; enforce activation is judged on the
//                      confirming reading net of SETTLED attempts only - an
//                      open grant is protected capacity, never evidence of
//                      consumption (decideActivation).
//   consumption        no such jump by RESET_CONFIRM_MS after the anomalous
//                      reading - the consumption was real: drift is charged
//                      (and, as always, never given back) and an enforce row
//                      goes pending exactly as it would have at birth.
// After stale_counter, a reading that repeats the stale balance is counted as
// evidence, not drift. Readings older than the last applied one are ignored.
const RESET_EARLY_MS = 60 * 60_000;
const RESET_CONFIRM_MS = 30 * 60_000;
const RESET_STALE_TOLERANCE = 25;

const readingOf = (o) => ({ remaining: Number(o?.remaining), limit: Number(o?.limit) || BROWSE_DAILY_LIMIT, reset: o?.reset ?? null, readAt: o?.readAt ?? null });

function unconfirmedResetAtBirth(win, observation, previousClose, now = Date.now()) {
  const r = readingOf(observation);
  if (!Number.isFinite(r.remaining)) return null;
  const readAt = Date.parse(r.readAt ?? "") || now;
  if (readAt - win.windowStart >= RESET_EARLY_MS) return null;
  if (r.limit - r.remaining <= BIRTH_MAX_CONSUMED) return null;
  const prev = Number(previousClose?.remaining);
  if (Number.isFinite(prev) && r.remaining > prev + RESET_STALE_TOLERANCE) return null; // a genuinely new counter
  return { state: "unconfirmed", anomaly: r, previousClose: previousClose ?? null, pendingReadings: 0, staleRepeats: 0 };
}

const sumOpen = (ledger, key = null) =>
  Object.values(ledger.open ?? {}).reduce((a, l) => a + (key == null || l.key === key ? Number(l.granted) || 0 : 0), 0);
const sumUsed = (ledger) => Object.values(ledger.used ?? {}).reduce((a, b) => a + (Number(b) || 0), 0);

// Unsettled leases past their expiry are charged IN FULL (crash / timeout /
// kill): the calls may have been made, so the capacity is never restored.
function expireLeases(ledger, now = Date.now()) {
  for (const [id, l] of Object.entries(ledger.open ?? {})) {
    if (Date.parse(l.expiresAt) <= now) {
      ledger.used[l.key] = (ledger.used[l.key] ?? 0) + (Number(l.granted) || 0);
      delete ledger.open[id];
      ledger.counters.expired++;
    }
  }
  return ledger;
}

// eBay's consumption vs the ledger. More observed than accounted (counting
// every open lease as fully spent) is unaccounted consumption that the
// reserve absorbs; it only ever ratchets up within a window.
function reconcile(ledger, observation, now = Date.now()) {
  const remaining = Number(observation?.remaining);
  if (!Number.isFinite(remaining)) return ledger;
  const limit = Number(observation?.limit) || ledger.limit;
  const readAt = Date.parse(observation?.readAt ?? "");
  // pacing-reset-r1: an older reading than the one already applied (an
  // overlapping invocation's) carries no new information
  const lastAt = Date.parse(ledger.lastObservation?.at ?? "");
  if (Number.isFinite(readAt) && Number.isFinite(lastAt) && readAt < lastAt) return ledger;
  const drift = limit - remaining - (sumUsed(ledger) + sumOpen(ledger));

  const reset = ledger.reset;
  if (reset?.state === "unconfirmed") {
    const anomalyAt = Date.parse(reset.anomaly?.readAt ?? "");
    const later = Number.isFinite(readAt) && (!Number.isFinite(anomalyAt) || readAt > anomalyAt);
    if (later && remaining > Number(reset.anomaly.remaining) + BIRTH_MAX_CONSUMED) {
      confirmReset(ledger, "stale_counter", { remaining, limit, readAt: iso(readAt) });
    } else if (later && Number.isFinite(anomalyAt) && readAt - anomalyAt >= RESET_CONFIRM_MS) {
      confirmReset(ledger, "consumption", { remaining, limit, readAt: iso(readAt) });
    } else {
      reset.pendingReadings++;
      reset.lastReading = { remaining, limit, readAt: observation?.readAt ?? iso(now) };
      return ledger; // no drift, no lastObservation: the balance is not confirmed yet
    }
  } else if (reset?.state === "confirmed" && reset.outcome === "stale_counter" && reset.anomaly) {
    if (remaining <= Number(reset.anomaly.remaining) + RESET_STALE_TOLERANCE && drift > BIRTH_MAX_CONSUMED) {
      reset.staleRepeats = (reset.staleRepeats ?? 0) + 1;
      return ledger; // the old counter again, not consumption
    }
    // an enforce row whose activation waited for open leases to settle
    if (ledger.state === "unconfirmed" && Number.isFinite(readAt)) {
      decideActivation(ledger, { remaining, limit, readAt: iso(readAt) });
    }
  }

  if (drift > ledger.reserveAbsorbed) ledger.reserveAbsorbed = drift;
  ledger.lastDrift = { drift, kind: drift < 0 ? "provider_lag" : drift > 0 ? "unexplained" : "none", at: observation?.readAt ?? iso(now) };
  ledger.lastObservation = { remaining, limit, at: observation?.readAt ?? iso(now) };
  return ledger;
}

// One-time decision for an unconfirmed reset. An enforce row still in the
// "unconfirmed" state becomes active or pending here, never again after.
function confirmReset(ledger, outcome, reading) {
  const reset = ledger.reset;
  reset.state = "confirmed";
  reset.outcome = outcome;
  reset.confirmedBy = reading;
  if (ledger.state !== "unconfirmed") return;
  if (outcome === "consumption") {
    ledger.state = "pending";
    ledger.stateReason = "prior_consumption_unaccounted";
    return;
  }
  decideActivation(ledger, reading);
}

// Activation after a stale-counter reset. An OPEN grant is protected capacity,
// not evidence of consumption: its unused part must not explain away provider
// spend. With `settled` = attempts the ledger has charged and `open` = the
// grants still in flight (their attempts unknown until they settle), eBay's
// consumption the ledger cannot attribute lies between
//   upper = consumed - settled          (every open lease spent nothing)
//   lower = upper - open                (every open lease spent its whole grant)
// Activate only when even the upper bound is within BIRTH_MAX_CONSUMED; go
// pending when even the lower bound exceeds it; otherwise wait for a later
// reading (the leases settle) and fail closed if that has not happened within
// RESET_CONFIRM_MS of the confirmation. The capacity charge on activation is
// the lower bound only, so attempts an open lease later settles are never
// charged twice; any remainder surfaces in later reconciliation drift.
function decideActivation(ledger, reading) {
  const consumed = reading.limit - reading.remaining;
  const upper = consumed - sumUsed(ledger);
  const lower = upper - sumOpen(ledger);
  if (upper <= BIRTH_MAX_CONSUMED) {
    ledger.state = "active";
    ledger.stateReason = "confirmed_after_stale_reset_reading";
    if (lower > 0) ledger.used.unattributed_at_birth = (ledger.used.unattributed_at_birth ?? 0) + lower;
    return;
  }
  if (lower > BIRTH_MAX_CONSUMED) {
    ledger.state = "pending";
    ledger.stateReason = "prior_consumption_unaccounted";
    return;
  }
  const confirmedAt = Date.parse(ledger.reset?.confirmedBy?.readAt ?? "");
  if (Number.isFinite(confirmedAt) && Date.parse(reading.readAt ?? "") - confirmedAt >= RESET_CONFIRM_MS) {
    ledger.state = "pending";
    ledger.stateReason = "activation_unresolved_open_leases";
    return;
  }
  ledger.state = "unconfirmed";
  ledger.stateReason = "activation_awaiting_open_leases";
}

function elapsedFraction(ledger, now = Date.now()) {
  const s = Date.parse(ledger.windowStart);
  const e = Date.parse(ledger.windowEnd);
  if (!(e > s)) return 1;
  return Math.min(1, Math.max(0, (now - s) / (e - s)));
}

// Open-lease units that eBay's reading cannot yet include. A lease opened
// AFTER the reading was taken is counted in full. For leases opened before
// it, eBay's consumption beyond the settled ledger is attributed to them
// first, so calls eBay has already counted are not subtracted a second time.
// If part of that consumption was really unaccounted (outside the ledger),
// this undercounts open work by at most that amount - which is exactly what
// the reserve absorbs.
function unspentOpen(ledger, observation) {
  const remaining = Number(observation?.remaining);
  const limit = Number(observation?.limit) || ledger.limit;
  const readAt = Date.parse(observation?.readAt ?? "");
  let before = 0;
  let after = 0;
  for (const l of Object.values(ledger.open ?? {})) {
    if (Number.isFinite(readAt) && Date.parse(l.at) <= readAt) before += Number(l.granted) || 0;
    else after += Number(l.granted) || 0;
  }
  const observedBeyondSettled = Math.max(0, limit - remaining - sumUsed(ledger));
  return after + Math.max(0, before - observedBeyondSettled);
}

// The grant decision for `requested` calls. Pure. Returns
// { granted, binding, capLeft, paceLeft, providerLeft } or { granted: 0, denied }.
function evaluateGrant(ledger, { key, requested, minGrant = 1, observation, now = Date.now() }) {
  const cap = CONSUMER_CAPS[key] ?? 0;
  if (!(cap > 0)) return { granted: 0, denied: "unfunded" };
  const want = Math.max(0, Math.floor(Number(requested) || 0));
  if (want <= 0) return { granted: 0, denied: "nothing_requested" };
  const used = ledger.used[key] ?? 0;
  const openKey = sumOpen(ledger, key);
  const capLeft = cap - used - openKey;

  const group = groupOf(key);
  const elapsed = elapsedFraction(ledger, now);
  let paceLimit;
  if (group === "allocated") {
    const country = String(key).split(":")[1];
    const share = elapsed < 0.5 ? ALLOCATED_FIRST_PASS_SHARE[country] ?? 0.6 : 1;
    paceLimit = Math.ceil(cap * share);
  } else if (group === "images") {
    paceLimit = cap;
  } else {
    paceLimit = Math.min(cap, Math.ceil(cap * elapsed) + (PACE_BURST[group] ?? 0));
  }
  const paceLeft = paceLimit - used - openKey;

  const remaining = Number(observation?.remaining);
  if (!Number.isFinite(remaining)) return { granted: 0, denied: "provider_balance_unknown", capLeft, paceLeft };
  const verifyCommitment = key === "verify" ? 0 : Math.max(0, CONSUMER_CAPS.verify - (ledger.used.verify ?? 0) - sumOpen(ledger, "verify"));
  // pacing-reset-r1: eBay's count lags the attempts it has received (07:45 read
  // 4,990 after 37 attempts), and an overlapping invocation may hold an older
  // reading. The balance is the LOWER of eBay's reading and the ledger's own
  // account (settled + open in full + unexplained consumption already
  // absorbed), so neither a lagging nor a freshly confirmed counter can grant
  // calls the ledger knows are spent.
  const limit = Number(observation?.limit) || ledger.limit;
  const ledgerBalance = limit - sumUsed(ledger) - sumOpen(ledger) - (Number(ledger.reserveAbsorbed) || 0);
  const providerLeft = Math.min(remaining - unspentOpen(ledger, observation), ledgerBalance) - BROWSE_RESERVE - verifyCommitment;

  const limits = { requested: want, cap: capLeft, pace: paceLeft, provider: providerLeft };
  const binding = Object.entries(limits).reduce((a, b) => (b[1] < a[1] ? b : a))[0];
  const granted = Math.max(0, Math.min(want, capLeft, paceLeft, providerLeft));
  if (granted < Math.max(1, minGrant)) return { granted: 0, denied: binding, capLeft, paceLeft, providerLeft };
  return { granted, binding, capLeft, paceLeft, providerLeft };
}

// --- durable I/O (compare-and-set on catalog_snapshot) ------------------

async function readRow(db, kind) {
  const { data, error } = await db.from(LEDGER_TABLE).select("data, updated_at").eq("kind", kind).maybeSingle();
  if (error) return { error };
  return { row: data ?? null };
}

// A strictly newer version token than `prev`, so two consecutive writes can
// never carry the same updated_at.
function nextVersion(prev, now) {
  const p = Date.parse(prev ?? "");
  return iso(Number.isFinite(p) ? Math.max(now, p + 1) : now);
}

async function casWrite(db, kind, prevVersion, ledger, now) {
  const { data, error } = await db
    .from(LEDGER_TABLE)
    .update({ data: ledger, updated_at: nextVersion(prevVersion, now) })
    .eq("kind", kind)
    .eq("updated_at", prevVersion)
    .select("kind");
  return !error && (data ?? []).length === 1;
}

// --- enforce activation ---------------------------------------------------
// An enforce ledger can only be trusted if it has seen every Browse call of
// its window. That is established once, when the window's row is born, and
// never changes afterwards:
//   active  the previous window's enforce row shows enforce was configured
//           at least ACTIVATION_LEAD_MS before that window ended (so every
//           invocation of an older deployment has finished - the longest
//           route runs 800 s), AND eBay reports at most BIRTH_MAX_CONSUMED
//           calls consumed when the row is created. Those calls are recorded
//           as `used.unattributed_at_birth`, not as reserve drift.
//   pending anything else (enforce switched on mid-window, a gap, missing
//           history, too much prior consumption). The window keeps today's
//           protections (legacy floors, no refusals); leases are recorded
//           with enforce's hypothetical decisions; the NEXT window can be
//           born active.
// So no fresh 4,580-call allowance is ever laid over usage the ledger did not
// see, and an observe ledger is never promoted into an enforce ledger.
const ACTIVATION_LEAD_MS = 15 * 60_000;
const BIRTH_MAX_CONSUMED = 150;

async function enforceBirthState(db, win, observation) {
  const consumed = (Number(observation?.limit) || BROWSE_DAILY_LIMIT) - Number(observation?.remaining);
  if (!Number.isFinite(consumed)) return { state: "pending", reason: "provider_balance_unknown", consumed: null };
  const prev = await readRow(db, `${LEDGER_KIND_PREFIX.enforce}${iso(win.windowStart)}`);
  if (prev.error) return { state: "pending", reason: "ledger_unavailable", consumed };
  const seen = Date.parse(prev.row?.data?.enforceSeenAt ?? "");
  if (!prev.row || !Number.isFinite(seen)) return { state: "pending", reason: "enforce_not_configured_in_previous_window", consumed };
  if (seen > win.windowStart - ACTIVATION_LEAD_MS) return { state: "pending", reason: "enforce_configured_too_close_to_reset", consumed };
  if (consumed > BIRTH_MAX_CONSUMED) return { state: "pending", reason: "prior_consumption_unaccounted", consumed };
  return { state: "active", reason: "confirmed_new_window", consumed };
}

async function loadOrCreate(db, kind, win, now, { mode, observation }) {
  const read = await readRow(db, kind);
  if (read.error) return { error: read.error };
  if (read.row) return { ledger: structuredClone(read.row.data), version: read.row.updated_at };
  const version = iso(now);
  const created = emptyLedger(win);
  // pacing-reset-r1: the previous window's last reading of the same mode is the
  // evidence for a stale counter at birth (one extra read, at birth only)
  const previous = await readRow(db, `${LEDGER_KIND_PREFIX[mode]}${iso(win.windowStart)}`);
  const unconfirmed = unconfirmedResetAtBirth(win, observation, previous.row?.data?.lastObservation ?? null, now);
  created.reset = unconfirmed ?? { state: "confirmed", outcome: "birth_reading" };
  if (mode === "enforce") {
    const birth = await enforceBirthState(db, win, observation);
    created.state = birth.state;
    created.stateReason = birth.reason;
    created.enforceSeenAt = iso(now);
    if (birth.state === "active" && birth.consumed > 0) created.used.unattributed_at_birth = birth.consumed;
    // the history checks passed and only the (possibly stale) balance failed:
    // decide activation when the balance is confirmed, not now
    if (unconfirmed && birth.reason === "prior_consumption_unaccounted") {
      created.state = "unconfirmed";
      created.stateReason = "reset_unconfirmed";
    }
  }
  const { error } = await db.from(LEDGER_TABLE).insert({ kind, data: created, updated_at: version });
  if (!error) return { ledger: structuredClone(created), version };
  if (error.code === "23505") return { retry: true }; // another worker created it first
  return { error };
}

function recordHypothetical(ledger, key, want, decision) {
  const h = (ledger.hypothetical[key] ??= { requests: 0, requested: 0, wouldGrant: 0, denied: {} });
  h.requests++;
  h.requested += want;
  h.wouldGrant += decision.granted;
  if (!(decision.granted > 0)) h.denied[decision.denied] = (h.denied[decision.denied] ?? 0) + 1;
}

// Acquire a lease before any Browse attempt. Returns
//   { mode, effective, granted, lease, decision }
// off      -> granted = requested, no lease, no I/O (today's behaviour)
// observe  -> granted = requested (never blocks); the lease records what
//             enforce would have granted and settles the real attempts
// enforce  -> in an ACTIVE window: granted <= the decision (0 = do not call
//             eBay). In a PENDING window: effective "observe" (today's
//             protections), recorded in the enforce row. Unknown / malformed
//             / stale window metadata or an unreadable ledger: granted 0 -
//             never a fresh budget.
async function acquireBrowseLease(db, args) {
  try {
    return await acquireBrowseLeaseInner(db, args);
  } catch {
    // an unexpected ledger failure never blocks work outside enforce, and
    // never creates capacity inside it
    const mode = args?.mode ?? browseBudgetMode();
    const want = Math.max(0, Math.floor(Number(args?.requested) || 0));
    if (mode === "enforce") return { mode, effective: "enforce", granted: 0, lease: null, decision: { granted: 0, denied: "ledger_error" } };
    return { mode, effective: mode === "off" ? "off" : "observe", granted: want, lease: null, decision: { granted: 0, denied: "ledger_error" } };
  }
}

async function acquireBrowseLeaseInner(db, { key, requested, minGrant = 1, observation, now = Date.now(), ttlMs, mode = browseBudgetMode() }) {
  const want = Math.max(0, Math.floor(Number(requested) || 0));
  if (mode === "off") return { mode, effective: "off", granted: want, lease: null, decision: { granted: want, binding: "off" } };
  const deny = (denied) =>
    mode === "enforce"
      ? { mode, effective: "enforce", granted: 0, lease: null, decision: { granted: 0, denied } }
      : { mode, effective: "observe", granted: want, lease: null, decision: { granted: 0, denied } };
  const win = windowFromObservation(observation, now);
  if (!win) return deny("window_unknown");
  if (now >= win.windowEnd - WINDOW_GUARD_MS) return deny("window_boundary");
  const kind = `${LEDGER_KIND_PREFIX[mode]}${win.id}`;

  for (let i = 0; i < CAS_ATTEMPTS; i++) {
    await casBackoff(i);
    const loaded = await loadOrCreate(db, kind, win, now, { mode, observation });
    if (loaded.retry) continue;
    if (loaded.error) return deny("ledger_unavailable");
    const ledger = reconcile(expireLeases(loaded.ledger, now), observation, now);
    const effective = mode === "enforce" && ledger.state === "active" ? "enforce" : "observe";
    const decision = evaluateGrant(ledger, { key, requested: want, minGrant, observation, now });
    if (effective !== "enforce") recordHypothetical(ledger, key, want, decision);
    const granted = effective === "enforce" ? decision.granted : want;
    if (granted <= 0) {
      ledger.counters.denials++;
      await casWrite(db, kind, loaded.version, ledger, now); // best effort: keeps expiries / reconciliation
      return { mode, effective, granted: 0, lease: null, decision };
    }
    if (decision.granted < want) ledger.counters.trims++;
    const id = randomUUID();
    const expiresAt = Math.min(now + Math.max(60_000, Number(ttlMs) || 0), win.windowEnd - WINDOW_GUARD_MS);
    ledger.open[id] = { key, granted, wouldGrant: decision.granted, at: iso(now), expiresAt: iso(expiresAt) };
    ledger.counters.grants++;
    if (await casWrite(db, kind, loaded.version, ledger, now)) {
      return {
        mode,
        effective,
        granted,
        decision,
        lease: { id, kind, key, mode: effective, granted, attempts: 0, windowEnd: win.windowEnd, guardAt: win.windowEnd - WINDOW_GUARD_MS, expiresAt },
      };
    }
  }
  return deny("ledger_contention");
}

// Settle: charge the attempts this lease actually started (success, failure
// or uncertain alike) and release only calls that were provably never sent.
// A lease that already expired was charged in full and is not restored. A
// lease only ever touches its own window's row (lease.kind).
async function settleBrowseLease(db, lease, { now = Date.now() } = {}) {
  if (!lease?.kind) return { settled: false, reason: "no_lease" };
  for (let i = 0; i < CAS_ATTEMPTS; i++) {
    await casBackoff(i);
    const read = await readRow(db, lease.kind);
    if (read.error || !read.row) return { settled: false, reason: read.error ? "ledger_unavailable" : "window_gone" };
    const ledger = expireLeases(structuredClone(read.row.data), now);
    const open = ledger.open[lease.id];
    if (!open) {
      ledger.counters.lateSettles++;
      if (await casWrite(db, lease.kind, read.row.updated_at, ledger, now)) return { settled: false, reason: "expired_charged_in_full" };
      continue;
    }
    const attempts = Math.max(0, Math.floor(Number(lease.attempts) || 0));
    ledger.used[open.key] = (ledger.used[open.key] ?? 0) + attempts;
    delete ledger.open[lease.id];
    ledger.counters.settled++;
    if (await casWrite(db, lease.kind, read.row.updated_at, ledger, now)) return { settled: true, charged: attempts, released: Math.max(0, open.granted - attempts) };
  }
  return { settled: false, reason: "ledger_contention" };
}

// pacing-reset-r1 - OBSERVE ACCOUNTING ONLY. An observe invocation whose lease
// request was refused (e.g. getRateLimits failed: no window to key a row by)
// still runs - observe never blocks - and its Browse attempts used to reach no
// ledger (2026-09-15 07:30Z sweep: 17 calls). lib/ebayTelemetry counts those
// attempts on the invocation and calls this ONCE when the invocation finishes:
// they are charged to the observe row whose window contains the invocation's
// start, as used["unleased:<job>"]. Nothing re-reads job records later, so
// they cannot be counted twice. No row for that time -> not recorded, and the
// caller reports the gap. Enforce is unaffected: there, an attempt without a
// lease is refused before it is sent (lib/ebayTelemetry.consumeBrowseAttempt).
async function recordUnleasedAttempts(db, { attempts, job, startedAt, now = Date.now() } = {}) {
  const n = Math.max(0, Math.floor(Number(attempts) || 0));
  if (!db || n === 0) return { recorded: false, reason: "nothing_to_record" };
  const at = Date.parse(startedAt ?? "");
  if (!Number.isFinite(at)) return { recorded: false, reason: "start_unknown" };
  const prefix = LEDGER_KIND_PREFIX.observe;
  let rows;
  try {
    const { data, error } = await db.from(LEDGER_TABLE).select("kind, data, updated_at").like("kind", `${prefix}%`).gt("kind", `${prefix}${iso(at)}`);
    if (error) return { recorded: false, reason: "ledger_unavailable" };
    rows = (data ?? []).filter((r) => Date.parse(r.data?.windowStart) <= at && at < Date.parse(r.data?.windowEnd));
  } catch {
    return { recorded: false, reason: "ledger_unavailable" };
  }
  if (!rows.length) return { recorded: false, reason: "no_ledger_row_for_time" };
  const kind = rows[0].kind;
  const key = `unleased:${job ?? "unknown"}`;
  for (let i = 0; i < CAS_ATTEMPTS; i++) {
    await casBackoff(i);
    const read = await readRow(db, kind);
    if (read.error || !read.row) return { recorded: false, reason: "ledger_unavailable" };
    const ledger = structuredClone(read.row.data);
    ledger.used[key] = (ledger.used[key] ?? 0) + n;
    ledger.counters.unleasedAttempts = (ledger.counters.unleasedAttempts ?? 0) + n;
    ledger.counters.unleasedRuns = (ledger.counters.unleasedRuns ?? 0) + 1;
    if (await casWrite(db, kind, read.row.updated_at, ledger, now)) return { recorded: true, kind, key, attempts: n };
  }
  return { recorded: false, reason: "ledger_contention" };
}

// --- manual scripts -------------------------------------------------------
// Scripts run outside Vercel, often without the production environment. The
// decision therefore comes from DURABLE state, not a local flag: a script may
// send Browse requests only if neither the current nor the previous provider
// window has an enforce row (production enforce configured - the manual
// budget is 0), the process itself is not in enforce mode, and the window and
// ledger can be read. Otherwise this throws BEFORE any Browse request, and
// lib/ebay.fetchWithRetry refuses every request made outside a route job
// without this clearance.
async function ensureManualBrowseAllowed({ db, getRateLimit, now = Date.now(), env = process.env } = {}) {
  const refuse = (reason) => {
    // later Browse attempts in this process are refused too (lib/ebayTelemetry)
    require("./ebayTelemetry").setManualBrowseClearance({ refused: reason });
    const e = new Error(`manual Browse use refused: ${reason}`);
    e.name = "BrowseBudgetExhaustedError";
    e.reason = reason;
    throw e;
  };
  if (browseBudgetMode(env) === "enforce") refuse("enforce_mode_manual_budget_is_zero");
  if (!db || typeof getRateLimit !== "function") refuse("clearance_inputs_missing");
  let observation = null;
  try {
    observation = await getRateLimit();
  } catch {
    observation = null;
  }
  const win = windowFromObservation(observation, now);
  if (!win) refuse("window_unknown");
  if (now >= win.windowEnd - WINDOW_GUARD_MS) refuse("window_boundary");
  const kinds = [`${LEDGER_KIND_PREFIX.enforce}${win.id}`, `${LEDGER_KIND_PREFIX.enforce}${iso(win.windowStart)}`];
  let rows = null;
  try {
    const { data, error } = await db.from(LEDGER_TABLE).select("kind").in("kind", kinds);
    if (!error) rows = data ?? [];
  } catch {
    rows = null;
  }
  if (rows == null) refuse("ledger_unavailable");
  if (rows.length) refuse("production_enforce_configured");
  const clearance = { windowEnd: win.windowEnd, guardAt: win.windowEnd - WINDOW_GUARD_MS, checkedAt: iso(now) };
  require("./ebayTelemetry").setManualBrowseClearance(clearance);
  return clearance;
}

module.exports = {
  BROWSE_DAILY_LIMIT,
  BROWSE_RESERVE,
  WINDOW_GUARD_MS,
  ACTIVATION_LEAD_MS,
  BIRTH_MAX_CONSUMED,
  LEDGER_TABLE,
  LEDGER_KIND_PREFIX,
  CONSUMER_GROUP_CAPS,
  ALLOCATED_COUNTRY_CAPS,
  SWEEP_COUNTRY_CAPS,
  CONSUMER_CAPS,
  PACE_BURST,
  ALLOCATED_FIRST_PASS_SHARE,
  browseBudgetMode,
  groupOf,
  windowFromObservation,
  emptyLedger,
  expireLeases,
  reconcile,
  elapsedFraction,
  unspentOpen,
  evaluateGrant,
  enforceBirthState,
  acquireBrowseLease,
  settleBrowseLease,
  ensureManualBrowseAllowed,
  RESET_EARLY_MS,
  RESET_CONFIRM_MS,
  RESET_STALE_TOLERANCE,
  unconfirmedResetAtBirth,
  recordUnleasedAttempts,
};
