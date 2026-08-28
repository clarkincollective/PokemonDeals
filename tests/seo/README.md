# SEO test suite

Automated checks for the SEO architecture (brief Phase 23). Zero
dependencies — `node:test` + `fetch`.

## Running

```bash
# against an already-running server (fastest — e.g. the dev server)
SEO_TEST_BASE_URL=http://localhost:3000 npm run test:seo

# against a fresh production build (what CI does): builds nothing itself,
# but needs `.next/` present, then boots `next start` on :3100
npm run build
npm run test:seo
```

`npm test` is an alias for `npm run test:seo`.

## What it checks

| File | Checks |
| --- | --- |
| `pages.test.mjs` | Per page (20 static routes + 3 sampled URLs of each dynamic type from the sitemap): exactly one canonical, absolute https, self-referencing; exactly one non-empty `<title>` (distinctive part ≤ 65 chars, whole thing ≤ 100); a meta description present (20–320 chars); exactly one non-empty `<h1>`; not `noindex`; every JSON-LD block parses and has `@context` + `@type`. Cross-page: titles unique, canonicals unique + one consistent host. Priority pages (`/pokemon`, `/sets`, homepage) actually link out to their detail pages. |
| `sitemap.test.mjs` | `robots.txt` returns 200, declares the sitemap, disallows `/api/`. `/sitemap.xml` is a well-formed `<sitemapindex>` or `<urlset>` served as XML; if an index, each child sitemap resolves to a `<urlset>`. Across all (flattened) `<loc>`s: absolute, one host, no duplicates; a sample per type returns 200, is not a redirect, is not `noindex`. |
| `links.test.mjs` | Crawls internal links one hop from `/`, `/sets`, `/pokemon`, `/market-data`, `/methodology`, `/about` (capped at 120) — none 404 or redirect. |
| `negative.test.mjs` | Bogus `/sets/…`, `/cards/…`, `/pokemon/…` and unknown routes return 404. Bogus `/deals/…`, `/sealed-deals/…` return 404 **or** a `noindex` 200 (their deliberate "expired" state). |

## CI

`.github/workflows/seo-tests.yml` runs this on every PR to `main`. It
needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as
repo secrets (build + run both hit Supabase for the statically-rendered
pages).
