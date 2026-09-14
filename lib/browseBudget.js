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
// Group totals: verify 720 + allocated 2,000 + sweep 1,700 + ingest 150 +
// images 10 = 4,580 = LIMIT - RESERVE. Sealed discovery and manual scans are
// explicitly unfunded (0).
const CONSUMER_GROUP_CAPS = Object.freeze({ verify: 720, allocated: 2000, sweep: 1700, ingest: 150, images: 10, sealed: 0, manual: 0 });
// Per-country allocated caps: measured first-pass calls (11-13 Sep: US ~644,
// GB ~428, AU ~377, CA ~447, DE ~218, IT ~311 when it ran) scaled by
// 2,000 / 2,425.
const ALLOCATED_COUNTRY_CAPS = Object.freeze({ EBAY_US: 530, EBAY_GB: 355, EBAY_CA: 370, EBAY_AU: 310, EBAY_DE: 180, EBAY_IT: 255 });
// Per-country sweep caps: measured US ~973/day, others 137-165/day.
const SWEEP_COUNTRY_CAPS = Object.freeze({ EBAY_US: 900, EBAY_GB: 160, EBAY_CA: 160, EBAY_AU: 160, EBAY_DE: 160, EBAY_IT: 160 });
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
// most this share of its cap; the rest waits for the second pass. DE/IT's
// second passes land 20-22 h after reset, where the retained 1,200 allocated
// floor is expected to block them, so their first pass may use the full cap.
const ALLOCATED_FIRST_PASS_SHARE = Object.freeze({ EBAY_US: 0.6, EBAY_GB: 0.6, EBAY_CA: 0.6, EBAY_AU: 0.6, EBAY_DE: 1, EBAY_IT: 1 });

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

// The provider window from eBay's reported reset (Analytics getRateLimits).
// Rounded to 5 minutes so jittered reads name the same row.
function windowFromObservation(observation, now = Date.now()) {
  const end = Date.parse(observation?.reset ?? "");
  if (!Number.isFinite(end)) return null;
  const rounded = Math.round(end / (5 * 60_000)) * 5 * 60_000;
  if (rounded <= now || rounded > now + 25 * H) return null;
  return { id: iso(rounded), windowEnd: rounded, windowStart: rounded - 24 * H };
}

function emptyLedger(win) {
  return {
    v: 1,
    windowStart: iso(win.windowStart),
    windowEnd: iso(win.windowEnd),
    limit: BROWSE_DAILY_LIMIT,
    reserve: BROWSE_RESERVE,
    used: {},
    open: {},
    reserveAbsorbed: 0,
    lastObservation: null,
    counters: { grants: 0, denials: 0, trims: 0, expired: 0, settled: 0, lateSettles: 0 },
  };
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

// eBay's consumption vs the ledger. More observed than accounted (even
// counting every open lease as fully spent) is unaccounted consumption that
// the reserve absorbs; it only ever ratchets up within a window.
function reconcile(ledger, observation, now = Date.now()) {
  const remaining = Number(observation?.remaining);
  if (!Number.isFinite(remaining)) return ledger;
  const limit = Number(observation?.limit) || ledger.limit;
  const drift = limit - remaining - (sumUsed(ledger) + sumOpen(ledger));
  if (drift > ledger.reserveAbsorbed) ledger.reserveAbsorbed = drift;
  ledger.lastObservation = { remaining, limit, at: iso(now) };
  return ledger;
}

function elapsedFraction(ledger, now = Date.now()) {
  const s = Date.parse(ledger.windowStart);
  const e = Date.parse(ledger.windowEnd);
  if (!(e > s)) return 1;
  return Math.min(1, Math.max(0, (now - s) / (e - s)));
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
  const providerLeft = remaining - sumOpen(ledger) - BROWSE_RESERVE - verifyCommitment;

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

async function loadOrCreate(db, kind, win, now) {
  const read = await readRow(db, kind);
  if (read.error) return { error: read.error };
  if (read.row) return { ledger: structuredClone(read.row.data), version: read.row.updated_at };
  const version = iso(now);
  const created = emptyLedger(win);
  const { error } = await db.from(LEDGER_TABLE).insert({ kind, data: created, updated_at: version });
  if (!error) return { ledger: structuredClone(created), version };
  if (error.code === "23505") return { retry: true }; // another worker created it first
  return { error };
}

// Acquire a lease before any Browse attempt. Returns
//   { mode, granted, lease, decision }
// off      -> granted = requested, no lease, no I/O (today's behaviour)
// observe  -> granted = requested (never blocks); the lease records what
//             enforce would have granted and settles the real attempts
// enforce  -> granted <= the decision; granted 0 = do not call eBay
async function acquireBrowseLease(db, { key, requested, minGrant = 1, observation, now = Date.now(), ttlMs, mode = browseBudgetMode() }) {
  const want = Math.max(0, Math.floor(Number(requested) || 0));
  if (mode === "off") return { mode, granted: want, lease: null, decision: { granted: want, binding: "off" } };
  const deny = (denied) => (mode === "enforce" ? { mode, granted: 0, lease: null, decision: { granted: 0, denied } } : { mode, granted: want, lease: null, decision: { granted: 0, denied } });
  const win = windowFromObservation(observation, now);
  if (!win) return deny("window_unknown");
  if (now >= win.windowEnd - WINDOW_GUARD_MS) return deny("window_boundary");
  const kind = `${LEDGER_KIND_PREFIX[mode]}${win.id}`;

  for (let i = 0; i < CAS_ATTEMPTS; i++) {
    await casBackoff(i);
    const loaded = await loadOrCreate(db, kind, win, now);
    if (loaded.retry) continue;
    if (loaded.error) return deny("ledger_unavailable");
    const ledger = reconcile(expireLeases(loaded.ledger, now), observation, now);
    const decision = evaluateGrant(ledger, { key, requested: want, minGrant, observation, now });
    const granted = mode === "enforce" ? decision.granted : want;
    if (granted <= 0) {
      ledger.counters.denials++;
      await casWrite(db, kind, loaded.version, ledger, now); // best effort: keeps expiries / reconciliation
      return { mode, granted: 0, lease: null, decision };
    }
    if (decision.granted < want) ledger.counters.trims++;
    const id = randomUUID();
    const expiresAt = Math.min(now + Math.max(60_000, Number(ttlMs) || 0), win.windowEnd - WINDOW_GUARD_MS);
    ledger.open[id] = { key, granted, wouldGrant: decision.granted, at: iso(now), expiresAt: iso(expiresAt) };
    ledger.counters.grants++;
    if (await casWrite(db, kind, loaded.version, ledger, now)) {
      return {
        mode,
        granted,
        decision,
        lease: { id, kind, key, mode, granted, attempts: 0, windowEnd: win.windowEnd, guardAt: win.windowEnd - WINDOW_GUARD_MS, expiresAt },
      };
    }
  }
  return deny("ledger_contention");
}

// Settle: charge the attempts this lease actually started (success, failure
// or uncertain alike) and release only calls that were provably never sent.
// A lease that already expired was charged in full and is not restored.
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

module.exports = {
  BROWSE_DAILY_LIMIT,
  BROWSE_RESERVE,
  WINDOW_GUARD_MS,
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
  evaluateGrant,
  acquireBrowseLease,
  settleBrowseLease,
};
