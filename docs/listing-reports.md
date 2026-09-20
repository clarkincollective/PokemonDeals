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
| 2026-09-20 | 41196 (CA, active; single row) | Pikachu & Zekrom GX SM168, SM Promos | `authenticity:owner_reported` | Owner reported the listing as a fake card. Shape: market reference $215 USD, listing 63 % below it; seller trust signals not enriched (feedback count, returns and photo count all null). The visual screen returned MATCH and its own rationale reads "the entirely gold metallic finish is consistent with an official gold/metal card variant" - SM168 is a paper promo; an all-gold metallic card is the gold-metal counterfeit shape the code already names. The screener rationalised the tell away rather than flagging it. | `.local/hold-41196-prior.json` |
| 2026-09-21 | 41914 (GB, active; single row) | Espeon & Deoxys GX SM240, SM Promos | `authenticity:owner_reported` | Owner reported the listing as a fake card. Shape: market reference $125.28 USD (Near Mint, Holofoil), listing 52 % below it, seller feedback count 147, **no returns**, 4 photos. Two tells the shipped checks do not read: the title ends **"(see description)"** — a hedge whose disclosure lives in the description body, which the scanner never fetches — and the Stage 2 vision rationale again explained away an unusual finish ("the overall rainbow sheen is consistent with a holo/reverse-holo foil pattern reflecting light, not evidence…"). | `.local/hold-41914-prior.json` |

Verified 2026-09-21: `/deals/41914` serves the unavailable state with
`noindex, follow`; the card hub `/cards/espeon-deoxys-gx-sm240-sm-promos`
no longer references the listing once the queued tags were expired by the
sweep. This case is also what prompted the hold script to queue cache
invalidation (`65950e0`) — before that the hub kept showing a held
listing until its own ISR window lapsed.

## Observation for the screening rules (not changed - rule changes are held)

Second case (41196) adds a specific failure: the Stage 2 vision prompt
accepted an "entirely gold metallic" finish as a plausible official
variant for a card that has no metal printing. When screening changes are
unheld, the vision step should treat a metallic/gold finish on a printing
the catalogue records as paper as a counterfeit signal
(`COUNTERFEIT_MISMATCH`), not as a variant, and the premium high-risk band
should not clear a row whose trust signals are all null.

### The pattern after three cases (2026-09-21)

All three reported listings share a shape the shipped checks pass:

| | 40200 | 41196 | 41914 |
|---|---|---|---|
| Reference (USD) | 764.12 | 215.12 | 125.28 |
| Below reference | 57 % | 63 % | 52 % |
| Visual verdict | MATCH | MATCH | MATCH |
| Seller feedback count | 33 | not enriched | 147 |
| Returns accepted | no | not enriched | no |

Three observations, none of them acted on (screening rules are held):

1. **The visual screen is the wrong instrument for this.** It answers
   "is this the printing we matched?", and in all three cases the answer
   was yes. Twice it went further and argued an unusual finish was
   legitimate. A screen that can only confirm identity should not be the
   last gate before a high-value, steep-discount listing is shown.
2. **Trust signals are present and unused at display time.** A feedback
   count in the low hundreds with returns refused is the profile in two
   of three cases; the third had no signals at all. In the premium
   high-risk band (`PREMIUM_HIGH_RISK_MARKET_USD` 100 /
   `PREMIUM_HIGH_RISK_DISCOUNT` 0.4) those could gate display rather than
   only ranking.
3. **"(see description)" in a title is an unread disclosure.** The
   scanner reads titles, never description bodies, so a seller who
   discloses a proxy or custom card only in the body passes every
   wording check. This is NOT a phrase to block on its own - genuine
   listings use it constantly - but combined with the band above it marks
   a listing whose disclosure we cannot see.

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
