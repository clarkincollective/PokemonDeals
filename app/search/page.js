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
// (13B.6.1), not from useSearchParams(), so this route no longer needs a
// Suspense boundary and no longer depends on request-time search params.
// It is still marked dynamic: the server render calls fetchSetSlugs()
// and the page must ship real, indexable content (H1 + intro + JSON-LD)
// in the initial HTML rather than a client-only blank.
export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const validSetSlugs = await fetchSetSlugs("english");
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
      <SearchClient validSetSlugs={validSetSlugs} />
    </>
  );
}
