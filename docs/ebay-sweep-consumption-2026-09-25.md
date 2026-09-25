# Sweep consumption — read-only investigation, 2026-09-25

Scope: where the eBay Browse daily allowance actually goes, and whether any of
it is avoidable. **Read-only.** No forced scans, no provider probes, no polling
loop. Retry behaviour, budgets, enforcement, schedules and provider settings
unchanged. The sealed priority lane is OFF (`lib/sealedPriorityLane.js` is
opt-in: it needs a flag of `1`/`true`/`on` *and* explicit search params; no
such variable is set, and no run in the window shows lane activity).

Sources: the `ebay_job_runs` telemetry table and the two `catalog_snapshot`
budget ledger rows. Both are our own tables.

---

## Window reconciled

**2026-09-24T07:00Z → 2026-09-25T07:00Z**, the most recent *completed* window,
265 invocations. (The current window closes 2026-09-26T07:00Z / 17:00 Brisbane
and is deliberately not reconciled here.)

Per-job measured external Browse attempts:

| job | runs | skipped | browse_calls | ok | 4xx | graded detail |
|---|---|---|---|---|---|---|
| refresh-deals:allocated | 12 | 7 | 2,347 | 2,346 | 1 | 494 |
| refresh-deals:sweep | 156 | 48 | 1,655 | 1,655 | 0 | 305 |
| verify-deals | 48 | 25 | 460 | 422 | 38 | — |
| refresh-sealed-deals | 1 | 0 | 196 | 196 | 0 | — |
| ingest-feed | 24 | 20 | 119 | 119 | 0 | — |
| screen-deal-images | 24 | 0 | 6 | 6 | 0 | — |
| **total** | **265** | **100** | **4,783** | **4,744** | **39** | **799** |

The sum of `browse_calls` is **4,783**, which equals the observe ledger's `used`
total for the same window **exactly**. That establishes something the report
previously assumed rather than checked: ledger `used` is **settled measured
attempts**, not reserved capacity.

### The five requested quantities

1. **Initial external attempts — 4,783.**

2. **Actual retry attempts — 0.** This is provable, not inferred.
   `fetchWithRetry` (`lib/ebay.js:32`) retries on exactly two conditions: a
   transport failure (the `catch` branch, counted as
   `browse_transport_failures`) or a 5xx while `attempt < retries` (counted as
   `browse_5xx`). A 429 is never retried; no 4xx is ever retried. Window
   totals for both gating counters are **0**, so the maximum possible number of
   retries is 0, and all 4,783 attempts were initial.

   This **refutes the earlier hypothesis** that `retries = 1` was "the root of
   the sweep's ~2× cost". The sweep made 1,655 calls and got 1,655 OK
   responses, with every failure bucket at zero.

   Response/error reasons for the 39 non-OK calls: **39 × 4xx**, zero
   401/403/429/5xx/other-status/transport. 38 sit on verify-deals, spread 1–3
   per 20-call run across almost every run; 1 on a single allocated run.

3. **Open reservations and settlements.** `grants` 176, `settled` 176,
   `lateSettles` 0, `denials` 0, and `open` `{}` at window close — every lease
   granted was settled, and none was left outstanding. `trims` 139 (leases
   granted for less than the caller requested).

4. **Expired leases charged in full — 0.** `counters.expired` is 0.

5. **Other ledger adjustments.** `reserveAbsorbed` 0 for this window. Final
   drift record `{kind: "provider_lag", drift: -23}` — eBay's counter reporting
   **23 fewer** consumed than we measured, i.e. trailing our own count.

### Requested units are not external attempts

| | units |
|---|---|
| requested across all leases | 6,203 |
| measured external attempts | 4,783 |
| **requested minus attempted** | **1,420 (23%)** |

Worst cases: `sweep:EBAY_US` requested 1,496 against 1,011 used; `ingest`
requested 407 against 119 used.

**This 1,420 is "requested minus attempted", not proven over-reservation
reclaimed at settlement.** The two are different quantities and the telemetry
does not yet separate them: `requested` is what callers asked for, but the
ledger records only aggregate `trims` (139) and `grants` (176) — not the granted
unit count per lease (see limitation 4). So how much of the 1,420 was never
granted in the first place (trimmed at request time) versus granted and then
released at settlement is **unreconciled**. What *is* established is that
`expired` is 0 and every grant settled, so no lease was charged in full for
unused units. The 1,420 must not be read as consumption, and equally must not
be claimed as recoverable headroom until actual grants are reconciled.

---

## The 10-unit opening drift — plausibly explained, not fully reconciled

The enforce ledger recorded `lastDrift {at: 07:20:28.758Z, kind: "unexplained",
drift: 10}` with `reserveAbsorbed: 10`.

**Mechanism, established by an exact numeric match rather than inference.** Two
ledgers run in parallel over one provider counter:

| ledger | `used` | `reserveAbsorbed` |
|---|---|---|
| `browse_budget:2026-09-26T07:00Z` (enforce) | `{sealed: 196}` | **10** |
| `browse_budget_observe:2026-09-26T07:00Z` | every non-sealed key | **196** |

Each ledger compares eBay's **global** remaining-quota reading against **its
own** `used` total, so consumption booked to the sibling ledger surfaces as
unexplained drift and is charged against the reserve. The observe ledger's
`reserveAbsorbed` is **196 — precisely the sealed job's `browse_calls`.** The
two figures are mirror images of each other.

For the enforce ledger's 10, the runs between the 07:00 reset and the sealed
job's 07:20:26 observation were:

```
07:15:11  refresh-deals:sweep    browse 8   quota_remaining_start 5000
07:15:49  screen-deal-images     browse 4   quota_remaining_start 5000
07:20:26  refresh-sealed-deals   browse 196 quota_remaining_start 4990
```

12 measured calls, both runs booked to the observe ledger. eBay reported 10
consumed; the enforce ledger's own `used` was 0, so it saw drift 10 and called
it unexplained.

**What this establishes, and what it does not.** The separate-ledger structure
explains *why each ledger misses the other's usage*, and the mirror-image
`reserveAbsorbed` pair (196 / 10) is direct evidence of that mechanism. It is
not retries: both retry-gating counters were 0 on those two runs.

But the arithmetic does not close. **12 measured calls against 10
provider-counted calls leaves 2 units unresolved.** Provider lag is a possible
explanation, not an established one — the `provider_lag drift -23` from the
previous window is a *different* reading of a different window and does not
evidence a 2-unit lag here. Candidates not distinguished by the available
telemetry include provider counter lag, a boundary-rounding difference in which
window eBay attributes a call made near the reset, and eBay not counting some
call we count. The 2 units remain open.

---

## Is there evidence of avoidable consumption?

**No confirmed avoidable consumption.** Ruled out by measurement:

- retries — 0
- rate-limit rejections (429) — 0
- auth failures (401/403) — 0
- expired leases charged in full — 0
- double-charging via the drift — no. The reserve absorbs it in *accounting*,
  but each call was made once and counted once in `used`; no extra provider
  request results.

**One candidate worth resolving, but 39 failed calls are NOT 39 avoidable
calls.** 39 calls in this window returned 4xx (0.8%), 38 of them on
verify-deals. Two reasons this is not a saving:

- **Checking an ended listing is necessary work.** verify-deals exists to find
  out whether a stored listing is still live; a 404 answering "no" is a correct
  and useful result, not waste. The distribution — 1–3 per 20-call run, on
  nearly every run, never all 20 — is consistent with exactly that. The
  telemetry stores only the status *class* (limitation 2), so the reasons are
  unconfirmed in either direction.
- **This is one window's failure count, not a recurring daily saving
  opportunity.** A single window establishes neither a rate nor a trend, and
  nothing here should be projected as 39 calls/day recoverable.

The value of resolving it is diagnostic — knowing whether these are expected
404s or malformed requests — not a quota recovery.

---

## Limitations of the telemetry

1. **No attempt is labelled "initial" or "retry".** For this window the retry
   count is still exactly determinable (0), because retry is gated solely on
   `browse_5xx` and `browse_transport_failures` and both are 0. In any window
   where either is non-zero, the telemetry yields only an **upper bound**
   (`5xx + transport_failures`), not the actual retry count.
2. **Failed calls are bucketed by status class only.** No status code, no
   error body. "38 4xx on verify-deals" cannot be resolved into reasons.
3. **Provider quota readings lag.** `quota_remaining_start/end` come from
   eBay's Analytics rate-limit endpoint; recorded lag was −23 in one window and
   −2 at the boundary examined here. Provider readings cannot audit small
   differences.
4. **Neither per-run reservation requests nor granted unit counts are stored.**
   `ebay_job_runs` holds no reservation data, and the ledger keeps only
   aggregate `trims` / `grants` counts, not the units granted per lease.
   Requested-vs-used is therefore reconstructable only from the ledger's
   `hypothetical` aggregate, per key per window, never per invocation — and
   "requested minus granted" cannot be separated from "granted minus settled"
   at all. This is why the 1,420 above is stated as requested-minus-attempted.
5. **Drift `kind` is self-assigned by the ledger.** "unexplained" means
   unexplained *to that ledger*, and as shown above is routinely explainable
   from the sibling ledger. It must not be read as anomalous consumption.
6. **`analytics_calls` (1 per invocation, 265/day) are documented as a separate
   quota pool** and are never counted toward `browse_calls`. I did not
   independently verify that eBay excludes them from the Browse pool. The
   boundary arithmetic is *consistent* with their exclusion (14 calls made
   including 2 analytics, 10 reported) but the provider lag makes it
   inconclusive.

## Correction to the earlier report

**"265 calls/day recovered" is a historical comparison between an earlier and
the current configuration, not an established recurring saving.** It should not
be carried forward as an ongoing benefit.

---

## Proposed changes — NOT applied, listed separately from the findings above

**No budget or retry change is justified by this report.** Retries were zero in
the reconciled window, so reducing them would have recovered nothing there. The
four items below are telemetry and accounting improvements that would let the
open questions be answered; none alters retry behaviour, budgets, enforcement,
schedules or provider settings.

1. **Record the status code and a short reason for non-OK Browse responses**,
   so the 39/day 4xx can be resolved into expected 404s versus malformed
   requests. Telemetry-only.
2. **Reconcile drift against the sum of both ledgers** (or make each aware of
   the sibling's `used`), so "unexplained" stops absorbing the other ledger's
   real work into the reserve. Accounting-only; no change to what is spent.
3. **Count retries directly** (`browse_retries`, or a per-attempt flag) so the
   quantity is measured rather than bounded.
4. **Persist per-invocation requested / granted / settled** on `ebay_job_runs`,
   making over-reservation visible per run instead of per key per window.

No traffic, ranking, conversion or revenue improvement is claimed.
