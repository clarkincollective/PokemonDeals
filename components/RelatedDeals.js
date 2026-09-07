import DealCard from "@/components/DealCard";

// UX-CVR-1 §12 - a small "more live deals" module for /deals/[id] (live
// and expired). Real active DB rows only (see lib/deals.fetchRelatedActiveDeals) -
// never an eBay call at render time. Rendered below the primary CTA on a
// live page, and as a real path forward on an expired one, so a visitor
// who arrived from a social post and bounced off the main listing still
// has somewhere relevant to go.
//
//   deals      : rows from fetchRelatedActiveDeals (already quality-gated)
//   pokemonName: the species label, when the module is species-scoped
//   heading    : optional override
export default function RelatedDeals({ deals, pokemonName, heading, className = "" }) {
  if (!Array.isArray(deals) || deals.length === 0) return null;
  const title = heading || (pokemonName ? `More live ${pokemonName} deals` : "More live deals right now");

  return (
    <section
      className={`rounded-xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-950 ${className}`}
      aria-label={title}
    >
      <h2 className="text-sm font-semibold text-black dark:text-zinc-50">{title}</h2>
      <p className="text-xs text-zinc-400">Other listings we&apos;re tracking below market right now — real, active deals.</p>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {deals.map((d) => (
          <DealCard
            key={d.id}
            deal={d}
            pageName="deal_related"
            analytics={{ section: "deal_related" }}
          />
        ))}
      </div>
    </section>
  );
}
