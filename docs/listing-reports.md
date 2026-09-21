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

### Decision taken 2026-09-21: rule B shipped, A and C not

Owner authorised acting on this. **Rule B is live**; A and C are not.

`premiumBandLacksSellerTrust` in `lib/dealQuality.js`: inside the premium
high-risk band, an **explicit** returns refusal AND a **present** seller
feedback score below 200 hides the listing. It runs in `displayGate`
before the graded early-return - a slab from a low-feedback seller
refusing returns at a steep discount is the counterfeit-slab shape, not a
reason to relax - and `disqualificationReason` mirrors the same placement
so the two can never disagree, naming it
`trust:premium_band_seller_unproven`.

Why it is a separate rule rather than a tweak to the existing scorer:
`isHighRiskBelowMarket` needs discount >= 0.55 **and** a composite score.
41914 sat at 52 % and never reached the floor. This is two explicit
adverse signals, no scoring, covering the 40-55 % range the scorer leaves
open.

**Rule A not adopted.** It withholds on the *absence* of a feedback
score, which 21 % of band rows have - that is a gap in our enrichment,
not evidence about the seller, and punishing a listing for it is not
defensible. It is the only rule that would have caught 41196, and that
case stays uncaught by design.

**Rule C not adopted.** No displayable listing carries "(see
description)" today, so it would gate nothing; it stays recorded as a
condition to combine if the phrase ever appears in band.

Verified against production data after the change:

| | Before | After |
|---|---|---|
| Displayable listings | 1,342 | **1,320** |
| In the premium high-risk band | 91 | **70** |
| Rule B still matching in band | 21 | **0** |

22 listings withheld against 21 predicted; the one-row difference is
freshness moving on a live set between runs. Rule B now matches nothing
because the rows it targets are already gone, which is the confirmation
that it fires on exactly the predicted set. The `< 500` variant still
shows 4, the 200-499 band deliberately left in.

`tests/scanner/premium-trust-gate-2026-09-21.test.mjs` pins both
directions, including that a missing score never fires it, that returns
must be explicitly refused rather than unknown, that the band bounds are
inclusive, and that an established seller's listing still displays. Suite
after the change: 3,916 tests, 33 failing - the unchanged baseline, all
quarantined. The two display-gate tests among them fail identically with
the change stashed, so they are pre-existing.

**This hides listings; it disqualifies nothing.** No row's
`disqualified_reason` was written, so reverting the gate restores them.

## The vision-rationale rule: measured, and NOT viable - 2026-09-21

The other half of the 41196 observation proposed treating a metallic
finish on a paper printing as `COUNTERFEIT_MISMATCH`. Before writing that,
`node scripts/seo/visionRationaleAudit.mjs` (READ-ONLY, no model call)
measured whether the stored rationales support any text rule. **They do
not.** Recording this so it is not attempted again from scratch.

2,236 rows carry a stored vision rationale: 1,699 MATCH, 417
IDENTITY_MISMATCH, 80 COUNTERFEIT_MISMATCH, 40 UNKNOWN.

| Attempted signal | Hits | Why it fails |
|---|---|---|
| rationale mentions metal / metallic | 65 | Dominated by legitimate uses: the Pokemon **Melmetal** and its "Metal Eater" ability, "metallic sheen typical of promo foil", and "entombed in metallic gold slab case" - the grading slab, not the card |
| rationale mentions gold decoration | 66 | Gold Secret Rares and Gold Stars are ordinary paper rarities; gating them would hide genuine cards |
| verdict MATCH while rationale names a counterfeit tell | 66 | Almost all are **negated**: "not counterfeit construction", "no counterfeit construction evidence", "not evidence of counterfeit" |

A regex tight enough to separate "consistent with a novelty gold-plated"
from "not evidence of counterfeit" would be tuned to two examples and
would not generalise. **The fix belongs in the vision prompt**, which is
what the original observation said: a model that describes a novelty or
gold-plated construction must return `COUNTERFEIT_MISMATCH` rather than
reconciling the tell with MATCH. That change cannot be validated here
without paid model calls against listing images, and an unvalidated
prompt change to a safety-critical screener is not worth shipping blind.

### One concrete case found, for the owner

The audit did surface a second instance of the 41196 failure mode.

**Deal 33673** - market reference **$4,500.00, 73 % below it**. Title:
"Pokémon 30th Anniversary Lugia 149/147 Aquapolis Secret Rare Holo Gold
just Won". Vision verdict **MATCH**, `disqualified_reason` null. Its own
stored rationale reads:

> vision: Same Lugia Aquapolis card (149/147, same text/attacks/HP), gold
> overlay is entire card is gold-foiled but text, layout, and Pikachu
> stamp are consistent with a novelty gold-plated

The screener named the tell - a novelty gold-plated card - and returned
MATCH anyway. Two further incoherences the checks do not read: an
Aquapolis card is from 2003 and cannot be "30th Anniversary", and a
**Lugia** card does not carry a **Pikachu** stamp.

**Not currently displayed** - `/deals/33673` redirects to
`/cards/lugia-aquapolis`, so it fails another gate (it reads as ended:
the title says "just Won"). There is no live exposure and no action was
taken. It is recorded because it is the same shape as the three reported
listings, found in our own stored data rather than reported, and because
it is the evidence that the prompt fix is worth doing when it can be
validated.

### Page/sitemap parity for rule B - checked 2026-09-21

`lib/sitemap.js` warns that the deals sitemap must select **every column
the display gate reads**, or a row that renders `noindex` on its own page
can still be advertised in the sitemap. Rule B reads
`seller_feedback_score` and `returns_accepted`, so it could have
introduced exactly that split.

It did not: both columns were already selected for the older high-risk
scorer. That is a coincidence of history rather than a guarantee, so
`tests/scanner/sitemap-parity.test.mjs` now carries two rule-B cases - a
premium-band row with a returns refusal and low-but-present feedback
(expected hidden), and the same row with an established seller (expected
displayable). Both are asserted on the full row *and* on the row
projected to sitemap columns only, so dropping either column from the
select fails the test. The deliberately chosen 50 % discount sits below
the 0.55 floor the old scorer needs, so the case isolates the new rule
instead of re-testing the old one.

**On the sitemap URL count**, which looked alarming at first: the deals
sitemap read 1,395 before the change, 1,302 shortly after, and 1,277
twenty minutes later **with no code change in between**. Deal rows are
ephemeral and the segment caches for 300 s, so churn dominates. The gate
can remove at most the 22 rows it hides, and did; the rest is ordinary
listing turnover. Do not read a falling deals-sitemap count as a
regression without comparing two readings taken minutes apart.

## Reprint sets that reuse the original's card number - 2026-09-21

**Owner report:** "A lot of the 30th anniversary cards are being tagged
on their pre-existing sets ... which then will affect the price / price
comparison." Confirmed, and the mechanism is worse than a miscategorised
listing.

**A reprint set can carry the original card's number.** From our own
catalogue:

| Reprint | Number | Same number in | Reprint worth |
|---|---|---|---|
| ME: 30th Celebration Classic Collection - Metagross | 11/113 | EX Delta Species (2005) | original $107.27 |
| ME: 30th Celebration Classic Collection - Pikachu & Zekrom GX | 33/181 | SM Team Up | |
| Celebrations: Classic Collection - Blastoise | 2/102 | **Base Set** | **$15.18** |
| Celebrations: Classic Collection - Mewtwo EX | 54/99 | Next Destinies | $12.30 |
| Celebrations: Classic Collection - Umbreon Star | 17/17 | POP Series 5 | $91.29 |

The collector number is normally the strongest identity signal we hold,
and for these cards it cannot separate the original from the reprint.
`expansionIdentityConflict` passes them because the reprint carries the
original set's NAME too, so "Delta Species 11/113" is genuinely in the
title of a reprint listing.

**Measured before the fix**, on displayable listings: 8 with a 30th token
and a non-30th matched set, and 3 with a Celebrations/25th token and a
non-Celebrations match. **All 11 were claiming savings against the
vintage reference.** The worst 30th case was 74 % off a $107 reference.
The clearest Celebrations case was deal 41861, "Mewtwo-EX 54/99 Next
Destinies Holo Rare English **Celebrations**" - its own title names the
reprint set while it was priced against Next Destinies at 51 % off, with
an asking price close to the reprint's $12.30 value.

**The rule** (`titleClaimsAnniversaryReprint`, gating
`savingsClaimTrusted`): when a title carries a reprint-family marker and
the matched set is not that family, the savings claim is withdrawn. The
listing still shows, as a plain listing that states why it carries no
claim - displayable count unchanged at 1,314.

Decided from the title alone, with no catalogue lookup, because
`lib/dealQuality.js` is pure, client-safe and runs on every render. The
cost: a genuine vintage card with a reprint marker stuffed into its title
for search traffic also loses its badge - 3 of the 8 in the 30th family
on the day it shipped, including the owner's own example (deal 41596,
Lugia 9/111 Neo Genesis; the 30th Lugias are 121/128 and 149/147, so that
one is vintage with "30th!!!" added). Losing a badge on a real deal is a
smaller harm than advertising a discount that may be fiction.

**Adding a family** requires the catalogue rows that prove the number is
shared. The rule rests on that, not on a set merely being a reprint.

Verified in production 2026-09-21: deals 41596, 41719, 42205, 41520,
41861, 38588 and 40686 all serve "No savings claimed for this listing".
Both families now report zero listings claiming savings against a vintage
reference (`node scripts/seo/anniversaryMismatchAudit.mjs`).

**Two errors made while investigating**, recorded because both produced
confident wrong answers: the first audit swallowed a failed
`card_catalog` query and reported "not in a 30th set" for a card already
seen in one; and the number comparison compared "33/181" against "33",
reporting every shared number as unique to the vintage printing - the
exact opposite of the finding.
