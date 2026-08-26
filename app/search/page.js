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

export default function SearchPage() {
  return <SearchClient />;
}
