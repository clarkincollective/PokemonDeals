# Google Search Console — submission & monitoring

## 1. Verification — already done

`app/layout.js` emits the HTML-tag verification meta
(`verification.google`), so the property is verifiable as-is. If the
Search Console property is set up as a **Domain property**
(`pokemondealfinder.com`) instead, add the DNS TXT record it gives you —
Domain properties aggregate http/https and all subdomains and are the
better choice here.

Impact.com (TCGPlayer affiliate) verification is also already in
`app/layout.js` `<head>` — leave it.

## 2. Submit the sitemap

Sitemaps → Add a new sitemap → `sitemap.xml`.

`/sitemap.xml` is a **sitemap index**. GSC will pick up the six child
sitemaps automatically; you do **not** submit them individually:

| child | rough size | notes |
| --- | --- | --- |
| `/sitemaps/pages.xml` | ~20 | home, listing indexes, trust pages, guides |
| `/sitemaps/sets.xml` | ~175 | one per set with an active deal |
| `/sitemaps/pokemon.xml` | ~220 | one per Pokémon with 5+ active listings |
| `/sitemaps/cards.xml` | ~1,000 | one per exact print with 2+ active listings |
| `/sitemaps/deals.xml` | 5,000 (capped) | individual listings, high churn |
| `/sitemaps/sealed-deals.xml` | ~60 | individual sealed listings |

`robots.txt` already declares `Sitemap: https://pokemondealfinder.com/sitemap.xml`.

Every URL in every child sitemap is a 200, canonical, indexable page (no
redirects, no `noindex`) — enforced by `tests/seo/sitemap.test.mjs`.

## 3. URL inspection — priority order

Run **URL Inspection → Request indexing** on a handful per type, highest
value first. Don't bulk-request; seed the important templates and let the
sitemap carry the rest.

1. `/` , `/best-finds`, `/sets`, `/pokemon`, `/market-data`
2. 3–5 top `/cards/[slug]` hubs (most-listed cards — see
   `/market-data/most-listed-cards`)
3. 3–5 top `/pokemon/[slug]` (Charizard, Pikachu, Umbreon, …)
4. 3–5 `/sets/[slug]` for well-known sets
5. `/methodology`, `/guides` and each guide (these establish
   topical/authority context for the money pages)
6. A couple of `/deals/[id]` — but these churn, so don't over-invest

## 4. Reports to watch (first 2–8 weeks)

- **Pages (Indexing)** — expect a lag, then steady growth. Normal
  "not indexed" buckets for this site:
  - *Crawled – currently not indexed* / *Discovered – currently not
    indexed*: common for deep `/deals/[id]` and thinner long-tail
    `/cards`/`/pokemon`. Fine as long as the **priority** templates
    (home, indexes, top hubs, species, guides) are indexed.
  - *Alternate page with proper canonical tag*: expected on filtered/
    paginated URLs (`?type=`, `?page=2`, `?country=`) — they canonicalise
    to the base. **Not a problem.**
  - *Page with redirect* / *Soft 404*: should be near zero. A rising
    soft-404 count means expired `/deals/[id]` pages (they return a
    `noindex` 200 "expired" state by design — see
    `docs/indexability.md`); acceptable in small numbers, investigate if
    large.
- **Sitemaps** — each child should show "Success" with a discovered-URL
  count close to its size above. A large gap = a data or route problem.
- **Core Web Vitals** — should stay green (the app already measures TTFB
  p75 ~50–90 ms, LCP p75 ~1.2–1.6 s, CLS 0 via Speed Insights). Watch
  for regressions after deploys.
- **Enhancements → Breadcrumbs / Merchant listings / FAQ** — validate
  that GSC picks up the JSON-LD:
  - `BreadcrumbList` on every dynamic + trust + guide page
  - `Product`/`Offer` on `/deals/[id]`, `/sealed-deals/[id]`,
    `/cards/[slug]` only
  - `FAQPage` on `/`
  - `Article` on `/guides/*`
  Run a few URLs through the **Rich Results Test** before relying on the
  GSC enhancement report (it lags).
- **Manual actions / Security** — should be empty. This site has real
  affiliate disclosure on every page and a `/affiliate-disclosure` page,
  which is the relevant policy surface.

## 5. Known gotchas for this property

- **Faceted URLs are intentionally not in the sitemap and canonicalise
  home.** If GSC flags them as duplicates, that's the design working —
  don't add canonicals pointing elsewhere or `noindex` them (that would
  also drop the `?page=N` series, which *should* stay crawlable).
- **`/search?q=` is `noindex,follow`** on purpose. Don't "fix" it.
- **`/deals/[id]` for an expired listing returns 200 + `noindex`**, not
  404, so a shared link still lands somewhere sensible. Expect some
  "Excluded by noindex tag" — that's correct.
- **Deal/card inventory churns.** The `deals` sitemap is capped at 5,000
  most-recent and regenerates continuously; don't expect a stable
  indexed count there.
- **International:** the site serves five eBay marketplaces but from one
  set of URLs (English, `?country=` filter). No `hreflang` — it's one
  language. Leave it unless a country-specific subsite is ever built.

## 6. After a rate-limit-clear / data backfill

If the eBay scan was down (see `docs/ebay-rate-limits.md`) the sitemaps
shrink and grow with real inventory — that's expected and self-heals on
the next successful scan cycle. No GSC action needed.
