# Distribution kit — manual social layouts, community pack, research link

**Status (2026-09-19):** documentation only. Social automation stays paused
(`MANUAL_PLATFORMS_DEFAULT` = all four platforms in
`lib/social/autopilot/slots.mjs`). Nothing here posts, schedules or
generates content; it is the kit the owner uses when posting by hand.

Every template below is built only from facts a page already states. The
rule from `lib/dealQuality` applies verbatim: a saving is quoted only when
the page shows a green, supported saving (stored reference for the exact
product and condition); an auction shows a **bid**, never a saving; shipping
is quoted only when recorded, otherwise "shipping not confirmed — check on
eBay"; nothing is described as verified authentic. Prices are quoted in the
listing's own currency with the marketplace named.

## 1. Three reusable layouts

### A. "One deal, one card" (Instagram feed / X image post)

Use for: a single Buy It Now offer with a supported saving ≥ 20 %.

Visual (1080×1350): card image on the left 45 %, right column top-to-bottom:
card name · set · collector number · printing · condition pill (NM / LP or
`PSA 10`), then **Listing total** (or item price + "shipping not confirmed"),
then a labelled line "Market reference: $X (Near Mint)", then the saving as
"−N% vs reference". Footer: `pokemondealfinder.com/deals/<id>` and the
marketplace flag + "eBay UK". No strikethrough prices; green only on the
saving line.

Caption skeleton:

```
<Card name> (<Set> <number>, <printing>, <condition>)
<Listing total> on eBay <market> · market reference <ref> (<condition>)
→ pokemondealfinder.com/deals/<id>
Listing checked <relative time>; auctions and shipping can change. Affiliate link.
```

### B. "Ending soon" (Stories / TikTok text-over-image / X thread head)

Use for: live auctions ending within 6 hours (from `/deals/auctions?ending=6h`).

Visual: card image full-bleed, amber pill "Ends <exact local time, zone>"
(copy it from the deal page, which prints the zone), current **bid** with
bid count, then "bids can rise before the end". No "−N%" figure anywhere,
even when the page shows the amber "Bid −N%" badge — a bid is not a price.

Caption skeleton:

```
Auction: <Card name> (<Set> <number>)
Current bid <amount> · <n> bids · ends <exact time + zone>
→ pokemondealfinder.com/deals/<id>
Bids can rise before the end. Affiliate link.
```

### C. "Set watch" (carousel, 3–5 slides)

Use for: a set page with ≥ 3 cards carrying supported savings, or a
checklist-eligible set.

Slide 1: set logo + "<Set>: what's below market this week". Slides 2–4: one
card each in layout A's right-column format. Last slide: "Track the set:
checklist + alerts" → `pokemondealfinder.com/sets/<slug>` (the page mounts
the set-level alert form and the checklist's "Find offers for cards I'm
missing").

## 2. Tagging and captions

- Hashtags: at most five, all from this list — `#pokemoncards #pokemontcg
  #<setname-no-spaces> #<pokemonname> #pokemoncollector`. No `#deal`,
  `#cheap`, `#investment`.
- Never tag or name the seller. Never imply a counterfeit.
- Always include "Affiliate link." in the caption when the post links to eBay
  or TCGPlayer directly; a link to a pokemondealfinder.com page carries the
  site's own disclosure.
- Prices in the caption must match the page at posting time; screenshot the
  page for the record.

## 3. Community pack (forums, Discord, subreddit wikis)

For communities that allow tool recommendations. Post only where the
community's rules allow self-promotion, and say so plainly:

> I run pokemondealfinder.com (disclosure: my site, eBay Partner Network
> affiliate links). It lists live eBay Pokemon card listings priced below a
> stored market reference for the exact card and condition, with the
> reference shown next to each listing. Auctions show bids, not savings.
> There are no accounts; saved cards live in your browser. Happy to answer
> how the matching works — methodology is at /methodology.

Include at most one deep link per post (a card, set or the auctions list),
never a batch of deal links. Do not post the same text to more than one
community per day. Do not run giveaways or ask for upvotes.

## 4. The research piece to share

`/market-data/pokemon-reference-price-changes` — dated, states its sample
and its limits, and is linked from the Guides hub. Share it as "what changed
in reference prices over the period", quoting the page's own headline figure
and date range. Do not extrapolate a trend the page does not state.

## 5. What this kit does not do

No scheduling, no auto-generation, no paid promotion, no outreach lists. The
paid test is documented separately and is **not** enabled
(`docs/paid-test-brief.md`).
