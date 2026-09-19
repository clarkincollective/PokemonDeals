# Paid acquisition test — brief (DISABLED, not launched)

**Status (2026-09-19):** this is a brief only. No campaign exists, no account
was created, no budget was committed, and nothing in the codebase enables
paid traffic. The execution brief forbade spending on advertising; this
document records what a bounded test would look like so the decision can be
made later with numbers, not guesses.

## Why a test would be considered

Organic search is the primary channel and is growing slowly (GSC baseline
18 Aug–14 Sep 2026: 848 impressions, 5 clicks; single-digit clicks on any
one query). A small paid test would answer one question only: **does
buyer-intent traffic to a card or set page produce affiliate clicks at a
rate that could ever cover its cost?** It is not a growth channel proposal.

## Break-even arithmetic (the gate)

Inputs the owner must fill in from EPN / Impact reporting before any spend:

| Symbol | Meaning | Source |
|---|---|---|
| `c` | average commission per affiliate **purchase** (USD) | EPN "earnings ÷ transactions", last 90 days |
| `p` | purchases per affiliate **click** | EPN "transactions ÷ clicks", last 90 days |
| `k` | affiliate clicks per 1k page views, by page type | `npm run report:growth` (`per_1k_views`) |
| `CPC` | cost per landed visit on the target page | the platform's estimate for the exact keyword |

Expected commission per landed visit = `(k ÷ 1000) × p × c`.
Break-even CPC = that figure. **Do not run the test unless the platform's
estimated CPC is below one third of break-even** (a 3× margin for the
estimate being wrong and for EPN attribution being coarser than the click).

Worked shape (illustrative placeholders, not measured): `k` = 40 clicks per
1k views, `p` = 0.03, `c` = $1.20 → $0.0014 expected commission per visit
→ break-even CPC ≈ $0.001. That is far below any search CPC, which is why
this brief expects the answer to be "no" and exists to prove it cheaply
rather than to argue for spend.

## If the gate is ever passed: the bounded test

- **Cap:** USD 50 total, hard budget cap on the platform, 14-day window,
  then stop regardless of result.
- **Target:** one landing page family only — `/cards/[slug]` pages for cards
  with a live supported-saving offer at launch (the page's canonical URL,
  no new page, no redirect, no UTM in the path). Append `utm_source=paid_test`
  and `utm_campaign=cardpage-2026-q4` so PostHog's structural `utm_*`
  context separates the cohort; Vercel Web Analytics UTM breakdown is
  paywalled and is not required.
- **Creative:** the card name, set, condition and "listing total vs market
  reference" — the same facts as the page, no savings claim unless the page
  shows a green supported saving at the time the ad is written.
- **Exclusions:** no auction pages (bids change), no sealed pages, no
  retargeting, no lookalike audiences, no conversion pixels (the site runs
  cookieless analytics and adds none).
- **Measurement:** `npm run report:growth --from --to` for affiliate clicks
  per 1k views on `page_type = card` in the window versus the 28 days
  before; EPN transactions for the same window. Success = the measured
  `(k ÷ 1000) × p × c` at or above the realised CPC. Anything else = stop.

## Decision record

- 2026-09-19: brief written; **not launched**. Owner decision required;
  the execution brief's "no advertising spend" rule remains in force.
