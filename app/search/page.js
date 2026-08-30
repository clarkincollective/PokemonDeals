import { Suspense } from "react";
import SearchClient from "./SearchClient";
import JsonLd from "@/components/JsonLd";
import { breadcrumbList } from "@/lib/jsonLd";
import { fetchSetSlugs } from "@/lib/deals";

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
    title: "Search Any Card",
    description:
      "Search any Pokemon card for instant market pricing, real sales history, and any below-market deals we've already found for it.",
    alternates: { canonical: "/search" },
    robots: query ? { index: false, follow: true } : undefined,
  };
}

// Reading useSearchParams() in SearchClient (for the homepage hero
// search box's ?q= handoff) makes this route depend on request-time
// data, which forces Next to bail out to blank client-side-only
// rendering if it tries to statically prerender the page. Marking it
// dynamic instead makes it render fully on the server per request, so
// the page still ships real, indexable content in the initial HTML.
export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const validSetSlugs = await fetchSetSlugs("english");
  return (
    <>
      <JsonLd
        data={[
          breadcrumbList([
            { name: "Deals", href: "/" },
            { name: "Search" },
          ]),
          {
            "@context": "https://schema.org",
            "@type": "SearchResultsPage",
            name: "Search Any Pokemon Card",
            url: `${SITE_URL}/search`,
            isPartOf: { "@type": "WebSite", name: "Pokemon Deal Finder", url: SITE_URL },
          },
        ]}
      />
      <Suspense fallback={null}>
        <SearchClient validSetSlugs={validSetSlugs} />
      </Suspense>
    </>
  );
}
