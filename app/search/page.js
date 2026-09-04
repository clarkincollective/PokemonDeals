import SearchClient from "./SearchClient";
import JsonLd from "@/components/JsonLd";
import { breadcrumbList } from "@/lib/jsonLd";
import { fetchSetSlugs } from "@/lib/deals";
import { runCardSearch } from "@/lib/searchEngine";
import { readSearchFilters, searchStateKey } from "@/lib/searchFacets";

const SITE_URL = "https://pokemondealfinder.com";

// SearchClient is "use client" (stateful search UI), which can't export
// metadata itself - this thin server wrapper is what gives the page a
// real, indexable title/description instead of silently falling back to
// the root layout's generic metadata.
//
// A bare /search stays indexable (a real, useful tool page). A
// ?q=<term> variant does not - the canonical was already pinned to the
// bare /search, but a hint isn't a guarantee, and there's no reason to
// let Google index and rank thousands of near-duplicate
// /search?q=<card name> pages that would only compete with the real,
// better-optimized /deals/[id] page for that exact card. follow: true
// keeps link equity flowing from any indexed results page through to
// the real deal/card pages it links to.
export async function generateMetadata({ searchParams }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  return {
    title: "Pokemon Card Price Checker & Value Lookup",
    description:
      "Search any Pokemon card by name, set or collector number to find the exact printing and check its market-reference price, per-condition values, graded prices and price history.",
    alternates: { canonical: "/search" },
    // The bare tool page is indexable; every ?q= / filter state is not,
    // so Google never indexes thousands of near-duplicate result URLs.
    // follow: true still passes equity through to the /cards/[slug] pages
    // a results page links to.
    robots: query ? { index: false, follow: true } : undefined,
    openGraph: {
      title: "Pokemon Card Price Checker & Value Lookup",
      description:
        "Find the exact printing of any Pokemon card and check its market-reference price, condition values, graded prices and price history.",
      url: `${SITE_URL}/search`,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: "Pokemon Card Price Checker & Value Lookup",
      description:
        "Find the exact printing of any Pokemon card and check its market-reference price and history.",
    },
  };
}

// SearchClient reads its URL state from window.location AFTER mount
// (13B.6.1), not from useSearchParams(), so this route needs no Suspense
// boundary. It is `dynamic` because it reads request-time search params:
// 13B.6.2 - for a deep link with a real `q`, the initial search runs
// HERE (runCardSearch, the same engine /api/card-search uses) and its
// result is handed to SearchClient, so the browser makes zero
// /api/card-search calls for the unchanged initial state. Typing / facet
// / sort / country changes and Back/Forward stay client-driven.
export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const first = (v) => (Array.isArray(v) ? v[0] : v);
  const q = (typeof first(sp.q) === "string" ? first(sp.q) : "").trim();
  const country = typeof first(sp.country) === "string" ? first(sp.country) : null;
  const sort = typeof first(sp.sort) === "string" ? first(sp.sort) : null;
  const filters = readSearchFilters(sp);

  // 13B.6.3 - one fetchSetSlugs pass shared by the SearchClient prop AND
  // the engine's set-link resolution (passed as a promise so the two run
  // in parallel).
  const validSetSlugsPromise = fetchSetSlugs("english");
  const [validSetSlugs, searchResult] = await Promise.all([
    validSetSlugsPromise,
    q.length >= 2
      ? runCardSearch({ q, page: 1, country, sort, filters, validSetSlugs: validSetSlugsPromise }).catch(() => null)
      : Promise.resolve(null),
  ]);

  const initialSearchState = searchResult?.ok ? searchResult.body : null;
  const initialSearchKey =
    q.length >= 2
      ? searchStateKey({
          q,
          type: filters.type,
          grader: filters.grader,
          grade: filters.grade,
          minPrice: filters.minPrice,
          maxPrice: filters.maxPrice,
          listing: filters.listing,
          country,
          sort,
        })
      : null;

  return (
    <>
      <JsonLd
        data={[
          breadcrumbList([
            { name: "Deals", href: "/" },
            { name: "Price Checker" },
          ]),
          {
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: "Pokemon Card Price Checker",
            url: `${SITE_URL}/search`,
            description:
              "Search any Pokemon card by name, set or collector number to find the exact printing and check its market-reference price, condition values, graded prices and price history.",
            isPartOf: { "@id": `${SITE_URL}/#website` },
          },
        ]}
      />
      <SearchClient
        validSetSlugs={validSetSlugs}
        initialQuery={q}
        initialSearchState={initialSearchState}
        initialSearchKey={initialSearchState ? initialSearchKey : null}
      />
    </>
  );
}
