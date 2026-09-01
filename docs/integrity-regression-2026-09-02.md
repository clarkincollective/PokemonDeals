# Integrity regression forensic record — 2026-09-02

Two P0 data-trust failures found by manual browsing. Forensic state captured
BEFORE any remediation (per task §20). Not published.

---

## PART A — Deal 24195 (fake Charizard listing shown as a live deal)

### A1. Frozen database state (`deals` row id 24195)

| field | value |
|---|---|
| id | 24195 |
| watchlist_id | 17109 |
| source | ebay |
| listing_id | `v1|158024137581|0`  (eBay legacy item id **158024137581**) |
| title | `Charizard VMAX SWSH261 SWSH: Sword & Shield Promo Cards Holo` |
| image_url | `https://i.ebayimg.com/images/g/rLAAAeSwFONqPFLB/s-l1600.jpg` |
| listing_url | `https://www.ebay.com.au/itm/158024137581?_skw=Charizard+VMAX...` |
| affiliate_url | `https://www.ebay.com.au/itm/158024137581?...&mkevt=1&mkcid=1&mkrid=705-53470-19255-0&campid=5339197414&customid=&toolid=10049` |
| marketplace | EBAY_AU |
| listing_type | FIXED_PRICE |
| price | 30.58 (AUD) |
| shipping | 24.63 (AUD) |
| total_price | 55.21 (AUD) |
| total_price_usd | 39.6966 |
| market_price | 47.35 (USD) |
| discount_pct | 0.16164  (~16 %) |
| condition | Near Mint |
| is_graded | false · grader/grade null |
| currency | AUD |
| seller_username | nicoletuscani1694 · seller_feedback_pct 97.7 · seller_feedback_score null |
| item_location_country | US · is_local false |
| first_seen_at / last_seen_at | 2026-08-28T13:10:09Z / 2026-08-28T13:10:08Z |
| is_active | **true** |
| discovery_source | scan |
| card_name / card_set | `Charizard VMAX - SWSH261` / `SWSH: Sword & Shield Promo Cards` |
| card_tcgplayer_id | **285378** |
| card_catalog_id | null |
| card_language | english |
| disqualified_reason | **null** |
| image_count / returns_accepted | null / null  (row never getItem-enriched) |
| visual_authenticity_status | **null** |
| visual_authenticity_reason | null |
| visual_authenticity_checked_at | **null**  (never sent for visual screening) |

`watchlist` 17109: name `Charizard VMAX - SWSH261`, set `SWSH: Sword & Shield Promo Cards`,
justtcg_tcgplayer_id 285378, tier `extended`, last_known_price 45.81, source `auto`.

`card_catalog` tcgplayer_id 285378 (1 row): `Charizard VMAX - SWSH261`,
set `SWSH: Sword & Shield Promo Cards` (set_id 2545), card_number `SWSH261`,
rarity `Promo`, card_type null, species `Charizard`, market_price 46.13,
image `https://tcgplayer-cdn.tcgplayer.com/product/285378_in_1000x1000.jpg`,
synced 2026-09-01. **The catalogue identity + reference are correct.**

### A2. Actual listing classification — **COUNTERFEIT / NOVELTY (gold-metal "Custom Cards")**

The listing photo (`rLAAAeSwFONqPFLB/s-l1600.jpg`, inspected) shows a **gold metal
plate card**, not the genuine Charizard VMAX SWSH261. Physical-construction
evidence, in COMBINATION (per the `COUNTERFEIT_MISMATCH` bar):

- entire card is a warm-gold metallic surface — non-paper medium
- card name **"Venusaur, Charizard & Blastoise VMAX · TAG TEAM · Gigantamax"** —
  a card that **does not exist** (TAG TEAM was Sun&Moon, VMAX was Sword&Shield;
  a 3-Pokemon VMAX TAG TEAM was never printed)
- **HP 400** — impossible on any real card
- bottom-left set / copyright line reads **"Custom Cards"** with a fabricated
  "185/391"-style number
- fabricated attacks ("Smack Down 200", "G-Max Starter Blast 300"), "VMAX rule"
  box mixed with a "TAG TEAM" banner — mechanically incoherent
- checkered-fabric background typical of the bootleg "gold/silver metal Pokemon
  card" seller family

This is the same failure family as deals 12750 / 12766 / 4220 / 4247 / 12286
(gold/metal-plate reproductions) — a clean listing title, a real card id, only
the PHOTO gives it away.

### A3. Why it survived every gate

**Deterministic title gate (`admitsProxyOrCounterfeit`):** PASS — the title
("Charizard VMAX SWSH261 ... Holo") contains no proxy / replica / custom /
metal-card wording. The "Custom Cards" admission is only IN THE IMAGE.

**Visual screening (`isVisualScreeningCandidate`):** **NEVER RAN.** The function
`return false`s immediately when `market_price < CANDIDATE_MIN_MARKET_USD` (100).
This card's reference is $47.35, so **no signal is ever evaluated** — steep
discount, high-value-discounted, premium-risk, price-ref-flag, trust-flag,
thin-listing are all short-circuited by the $100 floor. `visual_authenticity_status`
stays null.

**`visualAuthenticityReason`:** null status → returns null → no effect.

**`isDisplayableDeal`:** TRUE. Every check passes — authentic title, trading
card, exact `/itm/158024137581` destination matches listing_id, catalogue
match, not an ended auction, `last_seen_at` ~120 h old vs the `low` freshness
TTL of 168 h (**AGING, not STALE**), stored condition "Near Mint" promotable,
not enriched so `storedListingIsHighRisk` is inert, language compatible.

**`isPremiumDealEligible`:** TRUE. `premiumNeedsVisualMatch` requires
`market_price >= 100`; at $47 the visual-MATCH requirement is skipped, so the
row is eligible for Best Finds / Top 10 / homepage promo too.

### A4. Surfaces it was eligible for

`isDisplayableDeal` = true → `/deals`, `/deals/[id]`, `/pokemon/charizard`,
`/sets/[...]`, `/cards/charizard-vmax-swsh261-...` deal section, `/search`,
`/deals/graded`? no (raw), category pages. `isPremiumDealEligible` = true →
homepage "Best deals right now", `/best-finds`, "Just added", digest.
`/deals/24195` renders as an indexable Product page. **Shared display-gate
failure, not a single bad page.**

### A5. Root-cause summary (Part A)

1. **Class:** a physical counterfeit / novelty of a *real* card, listed with a
   clean title, whose market reference is **below the $100 visual-screening
   floor** → structurally un-screenable today.
2. Counterfeiters produce cheap bootlegs of chase Pokemon (Charizard above
   all) at every price point; the screening heuristics assume the
   "worth-faking" band is `market_price >= 100`.
3. Shipping camouflage: the *item* price alone ($30.58 AUD ≈ $22 USD) is ~54 %
   below the $47.35 reference, but ~81 % of that is padded back on as
   "shipping", so the *total* discount is only 16 % — below every discount
   trigger.

---

## PART B — /cards/here-comes-team-rocket-15-team-rocket (wrong displayed pricing)

### B1. Frozen state — the page resolves to `card_catalog` tcgplayer_id **86073**

`Here Comes Team Rocket! (15)` · set **Team Rocket** (WOTC 2000, set_id 1373) ·
card_number `15/82` · rarity **Holo Rare** · card_type null · species null ·
market_price **27.09** · image `.../product/86073_in_1000x1000.jpg` ·
synced 2026-09-01.

### B2. All catalogue rows that collide on this identity

| tcgplayer_id | name | set | # | rarity | market_price |
|---|---|---|---|---|---|
| **86073** | Here Comes Team Rocket! (15) | **Team Rocket** (2000) | 15/82 | Holo Rare | **27.09** ← the page |
| 86074 | Here Comes Team Rocket! (71) | Team Rocket (2000) | 71/82 | Rare (non-holo) | 9.75 |
| 250323 | Here Comes Team Rocket! | Celebrations: Classic Collection | 15/82 | Classic Collection | **0.90** |
| 86075 | Here Comes Team Rocket! | EX Team Rocket Returns | 111/109 | Secret Rare | **400** |
| 124126 | Here Comes Team Rocket! | XY - Evolutions | 113/108 | Secret Rare | 1.08 |

### B3. Displayed on the live page (2026-09-02)

- **Market value · raw, Near Mint: $27.17** — correct for the Team Rocket #15 Holo.
- **By condition · raw:** NM $27.17 → LP $21.84 → MP $18.48 → HP $14.73 →
  Damaged $10.89 — clean monotonic ladder, correct.
- **Graded — from real recent sold sales (all four flagged "Price outlier"):**
  BGS 9 **$181.25** (7) · BGS 9.5 $150.00 (2) · TAG 8.5 $107.00 (3) ·
  CGC 9 $89.47 (28). **← WRONG.**
- **Recent RAW eBay sales** included two graded slabs:
  "…TAG Graded 8.5 …" ($26.29) and "…Ace Graded 3 Good…" ($40.24) — a raw/graded
  leak (`GRADER_MENTION_PATTERN` misses "Ace Graded").

### B4. Price-source trace — the graded block

`CardPriceSummary` shows `analysis.graded`, built in
`getFullPriceAnalysis(86073)` **directly from `d.ebay.salesByGrade`** (no
printing filter). The raw provider payload for tcgPlayerId 86073:

| grade | price | min | max | n | low-conf |
|---|---|---|---|---|---|
| BGS 9 | 181.25 | 59.99 | **250.00** | 7 | true |
| BGS 9.5 | 150.00 | **15.00** | 150.00 | 2 | true |
| TAG 8.5 | 107.00 | 100 | 129 | 3 | true |
| CGC 9 | 89.47 | **8.99** | 140.74 | 28 | true |
| **PSA 9** | 85.00 | **0.99** | **226.55** | **157** | true |
| PSA 8.5 | 79.00 | 14 | 79 | 2 | true |
| PSA 8 | 62.34 | 9.16 | 142.27 | 92 | false |
| **PSA 10** | 59.50 | 19.00 | **533.63** | **225** | false |

### B5. Root causes (Part B)

1. **Cross-printing contamination of `salesByGrade`.** A single grade of a
   single ~$27 card cannot span $0.99–$533. The provider is aggregating graded
   "Here Comes Team Rocket 15/82" sales across the WOTC Unlimited #15, the WOTC
   **1st Edition** #15, the **EX Team Rocket Returns SR #111/109** ($400) and the
   **Celebrations Classic Collection #15** ($0.90). BGS 9.5 ($150) < BGS 9 ($181)
   is a grade inversion — a hard tell. `CardPriceSummary` only guards the LOW
   side (`g.currentPrice >= rawNm`); a contaminated HIGH figure or an
   impossible-spread tier is shown with a small "outlier" caption.
2. **`listingMatchesCard` set-disambiguation fails when the card NAME contains
   its SET's tokens.** `setTokensFor("Team Rocket")` = `["team","rocket"]`; a
   Celebrations Classic Collection listing ("Here Comes **Team Rocket**! 15/82
   Holo Celebrations: Classic Collection") satisfies the set check purely from
   the card-name words. Confirmed live: deals **27155, 31182, 31243** (a $0.90
   Celebrations card) are matched to the $27.09 WOTC row and shown as
   **43–51 % "deals"** — `isDisplayableDeal` = true for all three.
3. **`GRADER_MENTION_PATTERN` misses "Ace Graded" / "TAG Graded"** (grader
   name + "grad(e/ed/ing)"), so those slabs leak into the raw-sales list.

`card_catalog.market_price` (86073 = 27.09) and `analysis.raw.currentPrice`
($27.17) are **correct**. Only the graded panel + the fake cross-printing
deals are wrong. **No repricing of the reference is required.**
