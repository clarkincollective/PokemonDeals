import { Suspense } from "react";
import SearchClient from "./SearchClient";

// SearchClient is "use client" (stateful search UI), which can't export
// metadata itself - this thin server wrapper is what gives the page a
// real, indexable title/description instead of silently falling back to
// the root layout's generic metadata.
export const metadata = {
  title: "Search Any Card",
  description:
    "Search any Pokémon card for instant market pricing, real sales history, and any below-market deals we've already found for it.",
  alternates: { canonical: "/search" },
};

// Reading useSearchParams() in SearchClient (for the homepage hero
// search box's ?q= handoff) makes this route depend on request-time
// data, which forces Next to bail out to blank client-side-only
// rendering if it tries to statically prerender the page. Marking it
// dynamic instead makes it render fully on the server per request, so
// the page still ships real, indexable content in the initial HTML.
export const dynamic = "force-dynamic";

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchClient />
    </Suspense>
  );
}
