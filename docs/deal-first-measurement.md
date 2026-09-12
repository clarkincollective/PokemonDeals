# Deal-first homepage: what the R2 restructure changes in measurement

Written 2026-09-13 with the R2 homepage pilot (built locally, not deployed).
Reconciles the existing analytics contracts (`lib/analytics/events.js`,
`components/analytics/HomepageAnalytics.js`, `lib/affiliateSurfaces.js`,
`scripts/reportHomepageConversion.mjs`) with the page as it is now. No event
was added, renamed or re-purposed; nothing here changes the closed EPN
surface enum.

## 1. What stopped firing (and why)

The pre-R2 homepage rendered four deal grids. R2 renders ONE feed - the
flagship row (`best_deals`) and the diverse preview grid (`all_deals`) - and
reaches the other inventories through a mode row of existing routes.

| Signal | Before R2 | After R2 | Reason |
| --- | --- | --- | --- |
| `homepage_section_impression` `{section: ending_soon}` | fired when the "Auctions ending soon" lane scrolled into view | **does not fire** (section not rendered) | lane folded into the "Auctions" mode chip → `/deals/auctions` |
| `homepage_section_impression` `{section: just_added}` | fired for the "Just added" lane | **does not fire** | folded into the "Newest" chip → `/?sort=newest` |
| `homepage_section_impression` `{section: under_25}` | fired for the "Under $25" lane | **does not fire** | folded into the "Under $25" chip → `/deals/under-25` |
| `deal_card_impression` for `ending_soon` / `just_added` cards | per-card viewport exposure in those two lanes (`CARD_IMPRESSION_SECTIONS`) | **does not fire** | cards not rendered; `best_deals` card impressions continue unchanged |
| `ending_soon_clicked`, `just_added_clicked` | lane card clicks | **do not fire** | no lane; `best_deal_clicked` continues |
| `affiliate_click` with `origin_section` `ending_soon` / `just_added` / `under_25` | outbound clicks from the three lanes (a lane passes `analytics={{ section }}` to DealCard, and AffiliateLink copies that section into `origin_section`) | **do not fire** | the lanes are not rendered; `origin_section` `best_deals` (flagship row) and `home_all_deals` (the grid, which carries no lane section and therefore reports its `pageName`) continue |
| Vercel Web Analytics "eBay Click" `page` = `home_ending` / `home_fresh` / `home_under25` | the DealCard `pageName` forwarded as `page` on the separate Vercel event | **do not fire** | `home_best` and `home_all_deals` continue. This is a different stream from PostHog - never summed with it |
| EPN `customid` `home_auction`, `home_just_added` | sub-IDs on outbound links from the auction / just-added lanes (`lib/affiliateSurfaces.js` maps `home_ending` → `home_auction`, `home_fresh` → `home_just_added`) | **no new clicks carry them** | surfaces stay in the closed enum, reserved and unused - not renamed. The under-$25 lane's `home_under25` was never mapped, so its clicks carried `customid=other`; that `other` share shrinks accordingly |
| `discover_deals_clicked` | hero "Browse today's deals ↓" (scrolled to the first lane) | **does not fire** | CTA removed: the first offers are already in the first screen. Event name stays declared so historical dashboards resolve |
| `start_here_clicked` `{section: "hero", chip}` | six hero chips (under_25, under_50, over_100, sealed, graded, japanese) | fires with **`{section: "feed_modes", chip}`** for nine chips (featured, buy_it_now, auctions, graded, under_25, under_50, sealed, japanese, newest) | same event, same `chip` prop family; the `section` value changed, four chips were added (`featured` = the default mixed feed at `/`, `buy_it_now` = the existing `?listing=FIXED_PRICE` filter, `auctions`, `newest`) and one (`over_100`) dropped. The `graded` chip keeps `graded_entry: true` + `source: "start_here"` |
| `graded_clicked` | header inline link only (desktop; the mobile menu never emitted it) | fires from **every** renderer of the nav model, once per click: desktop "Deals" submenu and mobile menu with `{section: "nav", source: "nav", graded_entry: true}`, footer "Deals" column with `source: "footer"` | R1 had dropped the desktop event when the entry moved into the submenu (review fix P4). The mobile-menu and footer populations are **new** - split by `source` before comparing with the pre-R1 desktop-only series |
| `latest_releases_clicked` | header inline link + mobile menu (17C.8 declared it on `NAV_PRIMARY`, which the base `NavMenu` already rendered with its marker) | desktop submenu + mobile menu `{section: "nav", source: "nav"}`, footer "Deals" column `source: "footer"` | same model entry; ONLY the footer population is new - the mobile series existed before and carries the same props as desktop |
| `guides_research_clicked` | header inline link + mobile menu | unchanged (header inline + mobile menu, `{section: "nav", source: "nav"}`); the footer "Learn" column carries no marker | - |

Everything else on the homepage is unchanged: `homepage_view`, `page_view`,
`homepage_section_impression` for `best_deals`, `all_deals`, `browse`,
`guides`, `how_it_works` and (when populated) `recently_viewed`;
`deal_card_impression` for `best_deals`; `best_deal_clicked`,
`most_active_clicked`, `browse_*_clicked`, `guides_research_clicked`,
`hero_search_focus` / `search_*`, `hero_example_clicked`,
`price_checker_entry_clicked`, `browse_all_deals_clicked`, `filter_*`,
`sort_changed`, `country_changed`, `affiliate_click` (`origin_section`
`best_deals` and `home_all_deals`), and the EPN sub-IDs `home_best` /
`home_all`.

Three attribution fields, three vocabularies - do not mix them:

| Field | Stream | Values on the R2 homepage | Values that stopped |
| --- | --- | --- | --- |
| `origin_section` | PostHog `affiliate_click` | `best_deals`, `home_all_deals` | `ending_soon`, `just_added`, `under_25` |
| `page` | Vercel Web Analytics "eBay Click" | `home_best`, `home_all_deals` | `home_ending`, `home_fresh`, `home_under25` |
| EPN `customid` | eBay Partner Network reports | `home_best`, `home_all` | `home_auction`, `home_just_added` (and part of `other`) |

`HOMEPAGE_SECTIONS` in `lib/analytics/events.js` is intentionally NOT edited:
section ids are never renamed, and the ones that stopped firing simply
report zero from the deploy date onward.

## 2. How the revised feed is measured

Per the brief's metric definitions (§7), read with the existing scripts:

- **Offer reach** - `homepage_section_impression {section: best_deals}` and
  `{section: all_deals}`. **What a section impression means** (from
  `components/analytics/HomepageAnalytics.js`): the section's wrapper
  element was intersecting the viewport with a visible height of at least
  half of min(section height, viewport height), once per page view. It
  does NOT mean a visitor saw an offer's price or its eBay button, and it is
  not "homepage views": on the saved 1280×900 desktop capture the first
  screen ends at the top of the four flagship artworks (prices and CTAs are
  below the fold), and on the saved 390-wide capture no offer is in the
  first screen at all. Treat `best_deals` reach as "scrolled far enough for
  the flagship section to count as seen", nothing stronger; the only
  offer-level exposure signal is `deal_card_impression` (≥ 40 % of the card
  visible), which is instrumented for the flagship row only. **R2
  owner-review limitation:** whether the first screen should show a
  complete offer (artwork + price + action) at 1280×900 and at 390 is a
  design decision still open for the owner; nothing in this document infers
  that it does.
- **Offer selection rate** - `deal_card_impression` → `best_deal_clicked` /
  `affiliate_click {origin_section: best_deals}` for the flagship row (card
  impressions are only instrumented there, by design); grid-level for
  `all_deals` (section impression → `affiliate_click {origin_section:
  home_all_deals}`), since the grid has no per-card impressions.
- **Historical → current mapping** (page level only): pre-R2 homepage
  outbound = `affiliate_click` with `origin_section` in {`best_deals`,
  `ending_soon`, `just_added`, `under_25`, `home_all_deals`}; post-R2 =
  {`best_deals`, `home_all_deals`}. On the EPN side the pre-R2 homepage
  surfaces are {`home_best`, `home_auction`, `home_just_added`, `home_all`}
  (+ the under-$25 lane inside `other`); post-R2 {`home_best`, `home_all`}.
  Sum each side per window and compare the SUMS, never a lane against a
  lane.
- **Outbound rate** - `affiliate_click` on `/` divided by `page_view
  {page_type: home}` (pageview-based, labelled as such: the daily-salted
  session model does not support reliable cross-day sessions).
- **Mode usage** - `start_here_clicked {section: feed_modes}` by `chip`
  (nine chips; `featured` is the current mode, `buy_it_now` the
  FIXED_PRICE filter); `filter_opened {context: all_deals}` for "More
  filters".
- **EPN** - surface-level earnings for `home_best` and `home_all` from the
  EPN transaction detail report (date basis, status and currency stated;
  pending vs reversed kept distinct). A click is not a transaction.

`scripts/reportHomepageConversion.mjs` already groups these events; it needs
no change for the feed, and its `CURRENT_PRODUCT_MEASUREMENT_START` must be
set to the deploy date of the R2 slice before any post-change read.

## 3. Comparability - what NOT to do

- The four pre-R2 lanes and the single R2 feed expose different inventories
  to different visitors at different scroll depths. Lane-level rates before
  (e.g. `ending_soon` selection rate) have **no post-change counterpart**;
  do not compare them to `all_deals` or to the mode-chip clicks.
- `start_here_clicked` before (`section: hero`, six chips) and after
  (`section: feed_modes`, nine chips) are different populations of chips in
  a different position; compare per-chip only where the chip existed in both
  (`under_25`, `under_50`, `sealed`, `graded`, `japanese`) and label the
  position change. `featured` is the current mode's own chip (a click on it
  reloads `/`), so its count is not a navigation choice like the others.
- `graded_clicked` gained two new emitting surfaces (mobile menu AND
  footer): its `nav` series now includes mobile-menu clicks it never
  carried, so split by `source` (`nav` vs `footer`) and by device before
  comparing with the pre-R1 desktop-header-only series.
  `latest_releases_clicked` was already emitted by the base mobile menu
  (base `NAV_PRIMARY` + `NavMenu`); only its `footer` population is new,
  and its `nav` series stays comparable once `source: "footer"` is split
  out.
- Compare **page-level** measures only, on equivalent date windows, split by
  device, landing family and marketplace: homepage outbound rate per
  `page_view`, `best_deals` reach and selection, and surface-level EPN
  earnings for `home_best` + `home_all` versus the pre-change sum of
  `home_best` + `home_all` + `home_auction` + `home_just_added`. Even then
  the comparison is observational: offer supply, promotions and timing
  confound it.
- Never sum PostHog and Vercel click streams, never join EPN transactions to
  organic visitors by inference, and never read a captured click as a sale.

## 4. Baseline still owed

No pre-change baseline was read in this slice (no PostHog personal key in
the session; EPN reports not opened). Before deploying R2, run
`scripts/reportHomepageConversion.mjs` over the last complete pre-change
window and file the numbers with the deploy SHA, so the post-change read has
a like-for-like page-level baseline.

## 5. Subsequent R2 first-screen refinement (local, not deployed)

The shortened-hero revision changes exposure again. The following supersedes
the unchanged-population assumptions above where they conflict:

- The hero Most listed row is removed. Its hero_suggestion_clicked markers
  stop firing. The same popular card destinations remain in the existing
  six-card explore row, emitting most_active_clicked; these are different
  placements/events, not a renamed equivalent series.
- Search-example links remain server-rendered but are hidden below the sm
  breakpoint. hero_example_clicked now has no phone-sized example-link
  population. The hero search and price_checker_entry_clicked remain.
- The nine mode destinations and start_here_clicked props are unchanged,
  but the mobile row scrolls horizontally. Later modes require scrolling
  or keyboard focus; do not assume equal exposure across chips.
- More filters moves below the flagship row and above the diverse grid.
  filter_bar_impression and filter_opened keep their handlers/props but
  represent a deeper placement on the default homepage. Filtered pages
  without a flagship row still show the filter controls before results.
- Live count and freshness move from the hero to the feed. Disclosure and
  methodology remain visible beside offers. No new impressions, events,
  EPN values or user identifiers have been introduced.
- A no-savings DealCard now passes discount_band=no_savings_claim to the
  affiliate handler for both opted-in lanes and the ordinary grid; the
  handler must not infer a claimed discount from a suppressed figure.
  This changes that affected analytical classification, not EPN attribution.

First-screen card geometry is a layout check, not a new measurement event.
Saved captures and their viewport-specific limitations are recorded in the
phase ledger. Production ingestion, buyer comprehension and revenue effects
are still unverified; no release date or post-change evaluation window exists.
