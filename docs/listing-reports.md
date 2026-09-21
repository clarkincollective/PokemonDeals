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

Re-verified 2026-09-21 (after five production deploys that day): every
row of all three reports still holds. `/deals/40200` and its sibling rows
`39415` (AU) and `40885` (CA) all serve the unavailable state, as does
`/deals/41914`. `/deals/41196` now 308s to
`/cards/pikachu-zekrom-gx-sm-promos`, and that hub links only deals
`38636` and `38751` - the held listing appears nowhere on it. The
unavailable copy still reads "doesn't currently pass our listing checks"
and "This does not confirm whether it has sold or ended on eBay", which
makes no claim about the seller.

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


### What the candidate rules would actually cost - measured 2026-09-21

The rule changes stayed held because nobody had the one number the
decision turns on: how many GOOD listings each would withhold.
`node scripts/seo/screeningRuleImpact.mjs` answers that. It is READ-ONLY:
no screening, no eBay call, no write to `disqualified_reason`.

It uses the site's own `isDisplayableDeal` gate, not an approximation.
That matters - 24,374 rows are "not disqualified", but only **1,342 are
actually displayable** (the site's own integrity page reported 1,385 a
few hours earlier). Measuring against the larger number overstates the
shown set roughly seventeenfold and made rule A look catastrophic when
it is not.

Premium high-risk band (market >= $100 USD and discount >= 40 %):
**91 of 1,342 displayable listings, 6.8 %.**

| Candidate | Withholds, in band | Share of band | Share of all displayed |
|---|---|---|---|
| A - no trust signals at all (feedback null) | 19 | 20.9 % | **1.4 %** |
| B - feedback < 50 and returns refused | 13 | 14.3 % | 1.0 % |
| B - feedback < 100 and returns refused | 16 | 17.6 % | 1.2 % |
| B - feedback < 200 and returns refused | 21 | 23.1 % | **1.6 %** |
| B - feedback < 500 and returns refused | 25 | 27.5 % | 1.9 % |
| C - title carries "(see description)" | 0 | 0 % | 0 % |
| **A or B (< 200) combined** | **40** | **44.0 %** | **3.0 %** |

Against the five held rows (three reported listings; 40200 carries
sibling AU and CA rows for the same eBay listing):

| Row | In band | A catches | B (<200) catches | C catches |
|---|---|---|---|---|
| 40200 / 39415 / 40885 | yes | no | **yes** | no |
| 41196 | yes | **yes** | no | no |
| 41914 | yes | no | **yes** | **yes** |

A and B are disjoint by construction - A needs a null feedback score, B
needs a non-null one - so the combination is the sum, and **A or B
covers all three reported listings at a cost of 3.0 % of displayed
inventory.**

Three things this changes, none of them applied:

1. **The recorded observation "trust signals are present and unused" is
   wrong as a general statement.** Among displayable band rows, 19 of 91
   (21 %) have no feedback score at all. They are usually present, not
   always, and a rule has to say what it does when they are missing.
2. **Rule C costs nothing today and catches nothing today.** No
   displayable listing currently carries "(see description)"; 41914 did,
   and is held. It is worth adding as a combined condition precisely
   because it is rare - but it can never gate on its own, and on this
   evidence it should not be counted on to catch anything by itself.
3. **The cheapest defensible option is B alone at feedback < 200**: 1.6 %
   of displayed inventory, and it catches two of the three reported
   listings. Adding A covers the third and doubles the cost to 3.0 %.

Still held. This is the evidence for the decision, not the decision.
