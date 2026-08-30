# Head-term SEO strategy & limits

Target terms: **"Pokemon deals"**, **"Pokemon card deals"**, **"Pokemon TCG deals"**.

## What these terms actually are

Head terms — high volume, high competition, dominated by sites with
years of domain authority and backlink profiles (PriceCharting,
TCGplayer, large retailers, established affiliate sites). For queries
this broad, **off-site authority (backlinks, brand search volume, PR /
community mentions) is the dominant ranking factor**, not on-page
optimisation.

On-page work is still necessary — it's the price of entry and the only
lever available from this codebase — but on-page execution being correct
will **not, on its own, outrank established authority sites** for these
terms. If positions don't move despite the on-page work below being done
correctly, that is the expected outcome, not a sign the work was wrong.

## On-page work done (2026-08-30) — the part this codebase controls

The homepage is the primary candidate (it *is* the deal finder; root
authority, most internal links). Before this pass its `<title>` was the
bare brand "Pokemon Deal Finder" and its `<h1>` was "Find underpriced
Pokemon cards on eBay" — **neither contained the target phrase**.

| Element | Before | After |
| --- | --- | --- |
| `/` `<title>` | "Pokemon Deal Finder" (layout default) | "Pokemon Card Deals — Cards Priced Below Market on eBay \| Pokemon Deal Finder" |
| `/` `<meta description>` | generic layout default | "Live Pokemon card deals updated continuously: every eBay listing priced below its real market value… Covers the US, UK, Australia, Canada and Germany." |
| `/` `<h1>` | "Find underpriced Pokemon cards on eBay" | "Pokemon Card Deals — Underpriced Cards on eBay" |
| `/` crawler summary `<p>` | "…for Pokemon cards across the US…meaningfully below market." | "…for Pokemon **TCG** cards across the US…surfacing only the **genuine deals** — the listings meaningfully below market." |
| `/` "start here" chips | `/?maxPrice=25`, `/?type=graded` (renderer-nofollowed) | `/deals/under-25`, `/deals/graded` (real crawlable routes, descriptive anchors) |
| `/deals` `<title>`/`<h1>` | "Pokemon Card Deals by Price & Category" | "Browse Pokemon Card Deals by Price, Grade & Era" (reframed so `/` is the unambiguous primary for the head term; `/deals` owns the long-tail) |

Cannibalisation resolved: `/deals` had the exact phrase in title + H1
while `/` had it nowhere, so Google would have preferred `/deals`. Now
`/` carries the phrase in title + H1 + early body + has root authority
and the most inbound internal links → clearly the strongest signal;
`/deals` is reframed as the "browse by category" sub-index for
long-tail ("pokemon cards under $50", "graded pokemon card deals",
"vintage pokemon card deals").

No keyword stuffing: the phrase appears once each in title, H1 and the
summary paragraph, all reading naturally. The established below-market /
value framing is preserved.

## What would meaningfully move these rankings — and cannot be done from this codebase

This is an inventory for the record, not a task list.

### 1. Backlink acquisition / off-site authority
- Editorial links from Pokemon / TCG / collecting sites, price-guide
  round-ups, "best tools for X" listicles.
- Data-journalism angle: the `/market-data/*` pages produce real
  aggregate figures (most-listed, most-expensive) that a blogger or
  journalist could cite — but someone has to pitch/seed them.
- Requires outreach, relationship-building, or a linkable data asset
  that gets shared. None of it is a code change.

### 2. Brand search volume
- People searching **"pokemondealfinder"** by name is one of the
  strongest trust signals Google uses for a domain. It grows from
  real-world recognition: word of mouth, social presence, being
  mentioned in videos/streams, repeat direct visits.
- The site can make itself *memorable* (it already has a clear name,
  identity schema, consistent branding) but cannot manufacture the
  search demand.

### 3. PR / community engagement
- r/PokemonTCG, r/pkmntcgdeals and similar, Discord/Facebook collector
  groups, YouTube/TikTok collector channels, Twitch TCG streamers.
- A genuinely useful free tool tends to get shared in these spaces
  organically once it's in front of the right people — but it has to be
  put in front of them. That's a marketing activity, not a build task.

### 4. Age & sustained crawl history
- Domain/page age and a long record of Google successfully crawling
  fresh, non-spam content is itself a ranking input for competitive
  terms. This only accrues with time; the freshness signals
  (`dateModified`, continuous new deal pages, `price_history`
  collection) are in place to make that time count.

## How to read future ranking data honestly

- **Impressions rising, position deep (30–100), clicks near zero** for
  the head terms = normal for a young site with correct on-page work and
  no backlink profile yet. This is progress, not failure.
- **Long-tail terms** ("charizard base set price", "pokemon cards under
  $50", "<set> card prices") are where this site can realistically win
  first — the entity/set/species/deal-category page architecture is
  built for exactly those, and they convert as well or better.
- Judge the on-page work by whether the *right page* is the one Google
  associates with each term (homepage for the head term, entity pages
  for entity terms), not by absolute position against
  domain-authority-15-year incumbents.
