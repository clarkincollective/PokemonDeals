# Unresolved data work: 207 invalidated references awaiting re-pricing

**Recorded 22 September 2026. This is a DATA backlog, not a code defect.**
Every code change for the printing-integrity closeout is shipped and
verified. Nothing here is waiting on a deploy.

## What the number is

The parallel-printing invalidation cleared the `reference_*` provenance
set on **213 distinct rows** (canary 3 + apply 210; snapshots in
`.local/printing-invalidation/`, which is git-ignored and is the rollback
source). Measured today against the live table:

| state | rows |
| --- | --- |
| awaiting re-pricing — still active, still no reference | **207** |
| of those, currently displayable | 207 |
| re-priced by the pipeline since invalidation | 0 |
| no longer active (sold / ended naturally) | 6 |

## Why 0 have been re-priced

Not a stall and not a bug. The scanner re-prices a card only when it
next *encounters* it in a search cycle, and it writes a reference only
when printing resolution succeeds for that listing's condition. Neither
has happened yet for these rows. Recovery is therefore a function of
normal scan cadence, and no extra work was scheduled to accelerate it.

## What these 207 pages currently show

A plain merchant listing: card identity, condition, its own price and
shipping state, its own recorded price history, and a working outbound
link. No percentage, no reference figure, no Deal Score, and — since
`da5a5ef` — a price-history chart that says in so many words that it is
not the basis for a saving because the listing has no supported market
comparison.

This is the correct end state for a row with no trustworthy reference.
The listings are not hidden, and `isDisplayableDeal` is unchanged.

They remain `noindex, follow` under rule 17C.7.

## Constraints on resolving it

Set by the owner and still in force:

- **Do not restore the old discounts to replenish the feed.** The
  invalidated figures are the defect. A row's comparison comes back only
  when the pipeline resolves its printing and writes a fresh reference
  that reconciles; a bulk restore would put the original wrong anchors
  back on 207 live pages.
- **Do not pause the provider.** The subscription stays active and
  normal authorised syncs keep running at their existing schedule and
  limits. No extra catalogue sweep, no expanded retrieval, no additional
  spend to force these rows through sooner.
- The rollback path exists (`invalidateParallelReferences.mjs
  --rollback=<snapshot.json>`) and is for an operational mistake, not
  for feed volume.

Out of scope for this record, and still open as owner decisions in their
own right: the `$100` / 40% image-screening threshold, and the Japanese
lane (3,466 active targets with no catalogue row).

## Monitoring

`scripts/integrity/printingRepairProgress.mjs` reports this backlog
directly. Read-only, one pass, no provider call:

```
node scripts/integrity/printingRepairProgress.mjs
```

Cohort membership is the **stable deal ids** in the invalidation
snapshots, so no mutable field can remove a row from the tracked set.
The four states are mutually exclusive and reconcile to the original
cohort total; the script exits non-zero if they do not. An id it cannot
read is reported as *Missing or unassessable*, never dropped — a partial
read must not look like progress. With no snapshot present it refuses to
report at all rather than print a zero.

"Resolved" means a reference supported under the identity and provenance
rules (`savingsClaimTrusted`). A residual `market_price` is not proof of
repair, and a positive discount is not required.

**The earlier version of this monitor was misleading and has been
rewritten.** It identified its cohort by querying the live table for rows
still carrying an unevidenced parallel reference — i.e. by reading
`reference_printing`, the column invalidation NULLs. Its population
therefore emptied the moment the repair ran, and it printed "0 refused by
the containment gate" while all 207 references were still unresolved.

The containment-gate figure is still printed, in its own section, because
it catches *new* bad references arriving from the pipeline. It is not the
backlog, and the script now says so on the same line as the number.

## Definition of done

`reference_product_id` and `reference_amount` populated again on each
row, reconciling against `market_price`, with `reference_printing` set to
a printing the listing actually evidences — or the row ending naturally
as sold/inactive. Both outcomes are acceptable; a restored old figure is
not.
