# Indexability rule (brief Phase 20)

**A page qualifies for indexing only if all three hold:**

1. **Verified identity** — it resolves to a real record, not a guessed or
   reversed slug.
2. **Category / context** — it belongs to a real set or category (or it
   *is* the category).
3. **Meaningful data** — it has genuine listing or pricing data right now,
   above a minimum that depends on the page type, so it is neither thin
   nor a near-duplicate of another page.

Enforcement is **distributed**: each page type checks at its own data
layer, because that is where the data is. There is no single gate
function. The tunable parts — the per-type minimums and the
live-listing check — are centralised in **`lib/indexability.js`**, and
this table is the reference.

| Page type | Route | Identity check | Minimum data | Enforced in | On failure |
| --- | --- | --- | --- | --- |
| Homepage / listing indexes | `/`, `/best-finds`, `/sets`, `/pokemon`, `/japanese-cards`, `/sealed-deals`, `/market-data*`, `/search` | static route | always has content (or an honest empty state) | — | always indexable (`/search?q=` is `noindex,follow`) |
| Trust / editorial | `/about`, `/how-it-works`, `/methodology`, `/affiliate-disclosure`, `/contact`, `/guides`, `/guides/*` | static route | hand-written evergreen content | — | always indexable |
| **Card hub** | `/cards/[slug]` | `resolveCardSlug` matches the computed hub list | **`CARD_HUB_MIN_LISTINGS` (2)** simultaneous active listings of the exact printing | `fetchCardHubsUncached` (`lib/deals.js`) drops sub-threshold entries → the slug won't resolve | `notFound()` → **404** |
| **Set page** | `/sets/[slug]` | `resolveSetSlug` matches the computed set list | **`SET_MIN_LISTINGS` (1)** active deal in the set (implicit — a set only appears in the list once it has produced a row) | `fetchSetsUncached` (`lib/deals.js`) | `notFound()` → **404** |
| **Species page** | `/pokemon/[slug]` | `resolveSpeciesSlug` matches the computed species list | **`SPECIES_MIN_LISTINGS` (5)** active listings for the Pokémon across all its printings | `fetchSpeciesHubsUncached` (`lib/deals.js`) drops sub-threshold entries | `notFound()` → **404** |
| **Listing detail** | `/deals/[id]`, `/sealed-deals/[id]` | row loads by primary key | `shouldIndexDeal(row)` — the row exists **and** `is_active` | `generateMetadata` + the page body, via `shouldIndexDeal` (`lib/indexability.js`) | `robots: noindex` + a plain "expired" body (**not** a hard 404 — a link shared before expiry still lands somewhere sensible) |

## Never index

- **Empty pages** — every dynamic page type above either 404s or renders a
  `noindex` "gone" state when its data disappears; none serve a
  silently-empty 200. (Verified by `tests/seo/negative.test.mjs`.)
- **Near-duplicates** — the card-hub threshold of 2 exists specifically so
  a 1-listing hub isn't a near-copy of that single `/deals/[id]` page.
  Filtered and paginated URLs canonicalise back to their base
  (`?page=N` is self-referencing; other facets point home), so a filter
  combination never competes as its own indexable URL.
- **Faceted-URL bloat** — no crawlable links are generated for arbitrary
  filter permutations; the only paginated links exposed are the real
  `?page=N` series, capped at `MAX_LIST_PAGES`.

## Tuning

Change a threshold in `lib/indexability.js` and update the value in this
table. `SPECIES_MIN_LISTINGS` can be sized from real data with
`node scripts/auditSpeciesExtraction.js` (prints the species-count
distribution).
