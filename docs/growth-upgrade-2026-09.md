# Growth, conversion and UI/UX upgrade — 2026-09-19

Durable progress record for the end-to-end implementation request. One line
per item; status is one of **WORKING** (already present, verified),
**IMPROVE** (present, extended here), **MISSING** (built here),
**BLOCKED** (external dependency named). Updated as commits land.

Baseline inspected: `main` at `d153064`, production aliased to it. 238
scanner tests, ratchet at 36 failing / 36 quarantined (pre-existing).

Commits (in order): `c540d7e` §1 integrity gates · `37c0763` §2/§3 cards,
CTAs, references, freshness · `ac0525a` §4/§7 Top-N, empty states, ending
windows, AuctionEnd · `1fb0436` §5 mobile filter sheet · `a83a638` §6 saved
view, saved searches, alert criteria · (this commit) §8–§11 labelling,
checklist offers, distribution kit, paid-test brief, affiliate_click
dimensions, growth report. Ratchet unchanged at 36 / 36 throughout.

**Owner action required (the one blocker):** run
`supabase/price_alerts_criteria_migration.sql` in the Supabase SQL Editor
(no `exec_sql` RPC exists, so it cannot be applied from code), then
`npm run alerts:migration-check`. Until then `/api/alerts` stores default
alerts exactly as before and answers `503 criteria_unavailable` for any
narrowed alert (marketplace / condition / non-USD currency / item scope /
digest / set alerts) — the form shows a plain message; nothing is widened.

## 1. Deal integrity

| Item | Status | Notes |
|---|---|---|
| Deal 38959 Shaymin (Roaring Skies 77 vs XY Promos) | IMPROVE → fixed | Title names a different mainline set; 2-letter promo set tokens ("xy") matched the era word. New gate: a title that positively names a different known set is rejected. |
| Deal 19552 Mewtwo & Mew "World Championship" | IMPROVE → fixed | WC reprints are a distinct product. New gate: title-asserted product form not carried by the catalogue card. 3 active rows in this class. |
| Deal 39405 M Garchomp "JUMBO" | IMPROVE → fixed | Same gate (jumbo/oversized). **35 active rows**, all with 54–70% claimed discounts against standard-size references. |
| Deal 40228 Charizard "Recolored" | IMPROVE → fixed | Altered card; `recolou?red / altered / repainted / extended art` added to the authenticity pattern. 1 active row. |
| Auction bids shown as savings | IMPROVE → fixed | 167/171 active auctions carried the green "−N%" image badge. Auctions now carry an amber "bid N% under ref" badge; green is BIN-only. `AuctionPrice` already said "bids can raise the final price". |
| Consistency across surfaces | WORKING | All gates live in `listingMatchesCard` / `authenticityRisk`, which `displayGate` runs at read time on every surface (home, categories, hubs, alerts, sitemaps). No backfill needed; `disqualificationReason` names the cause. |
| Same-currency comparisons, unknown shipping | WORKING | `lib/offerPresentation` + `lib/money`; verified. |
| No invented confidence / authenticity badges | WORKING | `DealScoreBadge` is threshold labels only; `ListingChecks` is system-level. |

## 2. Deal cards and CTAs

| Item | Status | Notes |
|---|---|---|
| Hierarchy image → identity → condition → price → shipping → reference → CTA | WORKING | `DealCard` already follows it. |
| CTA wording (deal / listing / auction) | WORKING | Present on DealCard; SealedDealCard aligned to brand red. |
| 48px control, 8px radius, hover/pressed/focus | IMPROVE | min-h-11 → min-h-12, `active:` state added, shared `CTA_PRIMARY` class. |
| Flag paired with marketplace text | IMPROVE | Badge now "🇬🇧 eBay UK". |
| Condition / grade pill; NM ≠ numeric grade | IMPROVE | Pill styling; wording unchanged (never equates). |
| Reference shown as labelled reference, not strikethrough | IMPROVE | Detail page `line-through` removed; "Market reference" label. |
| Green only for supported savings | WORKING | `savingsSupported` gate. |

## 3. Shipping, currency, freshness

| Item | Status | Notes |
|---|---|---|
| Item / shipping / total / unknown / approx conversion | WORKING | `offerShipping`, `<Price>`; copy standardised to "Shipping unknown — check on eBay." |
| First found vs last checked | IMPROVE | Cards show "found …" and, when `exact_verified_at` exists, "checked …". |
| Sold/ended refresh system | WORKING | verify-deals priority queue + allocator + sweep; audited, no demonstrated gap. |
| Expired page | WORKING / IMPROVE | Inactive → 308 to same card page (exact card first). Gated-active state gains save + alert actions. |

## 4. Empty states and filters

| Item | Status | Notes |
|---|---|---|
| Explain criteria, next action, relax one filter, keep marketplace | WORKING | `FilteredEmptyState` + `relaxationSteps`. Copy aligned to brief; icon added. |
| Truthful Top 10 heading/count | IMPROVE | `/best-finds` heading says "Top N" when fewer than 10 qualify; never padded. |
| Result counts vs global count | WORKING | `ResultsSummary` exact/estimated distinction. |
| Filter persistence / shareable URLs | WORKING | URL-state filters, `?from=` return context, nofollow on param links. |

## 5. Mobile and accessibility

| Item | Status | Notes |
|---|---|---|
| Compact filter bar with count + sort | WORKING | `FilterToggle` badge count. |
| Removable chips | WORKING | `AppliedFilters`. |
| Filter sheet, reset/close, focus management | IMPROVE → done | `FilterToggle` below `lg` is a bottom sheet: dialog role while open, focus to Close, Tab trap, Escape/backdrop/"Show results" close, focus returns to opener, Reset (href on server grids, handler on card page + search), never self-opens, rows stay in DOM. |
| Sticky purchase control | WORKING | `StickyDealCta`; CTA label now matches deal/listing/auction. |
| Touch targets, contrast, focus, reduced motion, alt text | WORKING / IMPROVE | `prefers-reduced-motion` rule added globally. |

## 6. Saved cards, searches, alerts

| Item | Status | Notes |
|---|---|---|
| Saved nav + count | MISSING → built | Header/mobile "Saved (N)" entry, client-rendered count. |
| Saved view with current offers | MISSING → built | `/saved` (noindex): device-local list, live offers fetched per card hub. |
| Save vs alert distinction | IMPROVE | Copy on button and /saved. |
| Saved searches | MISSING → built | `lib/savedSearches.js` (localStorage, same pattern), save/reopen/remove from filter bar and /saved. |
| Alert: marketplace, condition/grade, target currency, item vs all-in | MISSING → built (**migration pending**) | Additive columns (`supabase/price_alerts_criteria_migration.sql`); `lib/alertMatch` evaluator; threshold converted at check time with server rates, never at entry; unknown/unstated shipping never satisfies an all-in threshold. |
| Set / min-discount alerts | MISSING → built (**migration pending**) | `alert_kind=set` (`card_slug` = `set:<slug>`) over Buy It Now offers with a supported saving ≥ floor; untargeted card alerts carry their own `min_discount`. Saved-search alerts: not built — a saved search is device-local URL state with no server subject; the set alert + card alert cover the buyer-intent cases. |
| Dedupe, cooldown, freshness recheck, digest option | IMPROVE → done | Matching runs over the same displayable, cheapest-first offers the card page shows; `last_notified_deal_id` + 20 h cooldown unchanged; `digest=true` → one email per check run per subscriber. |
| Consent | WORKING | Double opt-in preserved; general subscribers never converted. |
| Delivery | WORKING | Resend configured in production (`resend_configured: true`). |

## 7. Auctions

| Item | Status | Notes |
|---|---|---|
| Ending-soon 1h / 6h / today | MISSING → built | `?ending=1h|6h|24h` (hours, not a calendar day — six marketplaces, nine time zones) on every auction-capable grid via the shared filter plan; bounds the stored `auction_end_at`. |
| Countdown beside bid + exact end time with TZ | IMPROVE | `<AuctionEnd>` shows relative + `<time>` title; detail shows absolute with zone. |
| Bid count, freshness, bid/shipping/total separation, "bids can increase" | WORKING | `AuctionPrice`. |
| Restrained amber, no restarting timers | WORKING / IMPROVE | Hydration-safe clock; amber under 1h. |

## 8. Detail pages, comparisons, charts

| Item | Status | Notes |
|---|---|---|
| Purchase panel grouping | WORKING | |
| Concise affiliate disclosure near CTA | MISSING → built | One line under the primary action; full footer disclosure retained. |
| TCGPlayer destination clarity | IMPROVE | Label: "Check TCGPlayer (raw NM price, not this grade)" when graded. |
| Grade grid: highlight, sample, date, offers | WORKING / IMPROVE | Header states currency + condition + provenance. |
| Chart labelling, gaps, provenance | WORKING / IMPROVE | Caption names currency, condition, range, source. |

## 9. Buyer-intent SEO

| Item | Status | Notes |
|---|---|---|
| URLs, canonicals, sitemaps, indexability | WORKING | Preserved (SEO phases 1–26). |
| Card page eBay link marketplace-correct + surface | WORKING (verified) | Server builds the crawler-visible default with the `card` surface; `EbaySearchLink` re-points it at the viewer's marketplace on the client (`localizeEbaySearchUrl`). No change needed. |
| Checklist → "Find offers for cards I'm missing" | MISSING → built | `ChecklistTable` missing-only view: a CTA opening the missing entries, each linking to its card page's `#card-offers` section (truthful "no live offers" when none). Nothing fetched or invented. |
| Contextual links, printing identity, comparisons | WORKING | Card/species/set/guide interlinks present. |
| Schema | WORKING | Product+Offer only where an offer exists; no merchant-listing assumption. |

## 10. Distribution and research

| Item | Status | Notes |
|---|---|---|
| Reusable manual social layouts + copy | MISSING → built | `docs/distribution-kit.md` (three templates, tagging). Automation stays paused. |
| Share metadata/controls | WORKING | OG/Twitter + `ShareButton`. |
| Community pack | MISSING → built | In the kit, with ownership disclosure. |
| On-site research piece | WORKING / IMPROVE | `/market-data/pokemon-reference-price-changes` exists (dated, sample, limits). Linked from guides. |
| Paid-test brief (disabled) | MISSING → built | `docs/paid-test-brief.md`, cap + break-even, not launched. |

## 11. Measurement

| Item | Status | Notes |
|---|---|---|
| Affiliate clicks by source/page type/placement | IMPROVE → done | `affiliate_click` gains `page_type`, `placement`, `network` (structural only; EPN and TCGPlayer never summed). Pre-2026-09-19 rows are labelled, not back-filled. |
| Deduplicated impressions | WORKING | Once-gate on homepage lanes. |
| Empty-state recovery, save/reopen, alerts | IMPROVE | New events: `saved_view_opened`, `saved_search_saved`, `alert_created`. |
| Reporting view | MISSING → built | `npm run report:growth` (`scripts/reporting/growthReport.mjs`, read-only HogQL): clicks per 1k views by network × page type, placement table, saved/alert loop. Documented in `docs/ebay-affiliate-attribution.md`. |
| EPN / TCGPlayer separate; IDs preserved | WORKING | Surface enum unchanged; documented mapping extended. |
| Performance | WORKING | CWV good per Speed Insights; no lab-only claims. |

## Blockers

- **`price_alerts` criteria migration** must be run by the owner in the
  Supabase SQL Editor (see top). Code is schema-tolerant either way.
- `TCGPLAYER_AFFILIATE_LINK` presence not verified from code (env-gated;
  link works either way).

## Not done, and why

- Saved-search alerts (server-side subscription to a filter combination):
  not built — no server-side subject exists for a device-local URL; set
  alerts and card alerts with criteria cover the same buyer intent.
- Live-offer check on `/saved` for a card saved from a single listing
  without a card hub: the row links to the listing instead of claiming a
  count.
