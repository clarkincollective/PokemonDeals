import { unstable_cache } from "next/cache";
import { getFullPriceAnalysis } from "@/lib/pokemonPriceTracker";
import { withPptConsumer } from "@/lib/pptTelemetry";

// audit-r1 (card-page-cold-render) - the card hub's reference market data
// (condition ladder, graded tiers, recent sales), moved OFF the page render.
//
// Until 15 Sep 2026 every cold /cards/[slug] render made this billed
// PokemonPriceTracker call inline: a crawler walking the 23,718 card URLs
// produced 4,235 "page:cards" provider calls in one day and 9-10 s cold
// responses. The page now renders from the catalogue reference alone and a
// client panel fetches this through /api/card-analysis, which robots.txt
// disallows - so a crawler's render never triggers it. Same cache key and
// window as before, so nothing is fetched twice for a human visitor.
const loadUncached = async (tcgplayerId) => {
  if (!tcgplayerId) return null;
  try {
    // Phase 11C: the raw Near Mint history series comes from the canonical
    // price_history spine, so no includeHistory credit is spent here.
    return await withPptConsumer("page:cards", () => getFullPriceAnalysis(tcgplayerId, { includeHistory: false }));
  } catch (err) {
    console.error("Price analysis lookup failed:", err.message);
    return null;
  }
};

export const loadCardPriceAnalysis = unstable_cache(loadUncached, ["card-hub-price-analysis"], {
  revalidate: 300,
});
