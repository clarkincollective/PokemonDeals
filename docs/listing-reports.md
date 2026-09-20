# Owner-reported listings — log

Listings the owner has judged unfit to show (typically a suspected
counterfeit) and the action taken. The mechanism is the existing per-row
hold, `deals.disqualified_reason`, applied with
`scripts/remediation/holdReportedListing.mjs` to every row carrying the
same eBay listing id. A held row stays hidden across re-scans. This log
records deal ids, dates and reasons only. It never records the seller,
and nothing on the site names a seller or calls a listing counterfeit:
the public integrity report counts the hold under the authenticity
family, and the listing's own page renders the honest "cannot currently
be shown" state with no price or saving.

Rollback for any entry: the prior-state file named in the row
(`.local/`, not committed) with `--rollback=<file> --confirm=1`.

| Date (UTC) | Deal ids (one eBay item) | Card | Reason set | Why | Prior-state file |
|---|---|---|---|---|---|
| 2026-09-20 | 40200 (GB, active), 39415 (AU), 40885 (CA) | Charizard GX SV49/SV94, Hidden Fates: Shiny Vault | `authenticity:owner_reported` | Owner reported the listing as a fake card. Shape: market reference $764 USD, listing 57 % below it, seller feedback count 33, no returns; the visual screen had returned MATCH (printing identity confirmed, which is what that screen tests - it does not establish physical authenticity). | `.local/hold-40200-prior.json` |

## Observation for the screening rules (not changed - rule changes are held)

This listing sat exactly in the premium high-risk band the code already
names (`PREMIUM_HIGH_RISK_MARKET_USD` 100 / `PREMIUM_HIGH_RISK_DISCOUNT`
0.4) and cleared it because that band requires only a visual MATCH. The
visual screen confirms the printing, not the card. A seller with a
feedback count in the low tens, no returns, and a valuable card at more
than half off is the profile a counterfeit is worth making for. A
candidate rule for the owner to consider when screening changes are
unheld: in that band, require either a returns policy or a seller
feedback count above a floor before a listing is shown, otherwise hold it
as `authenticity:visual_unverified` pending review. Not implemented here.
