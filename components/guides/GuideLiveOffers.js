import Link from "next/link";
import DealCard from "@/components/DealCard";
import { fetchSetDealsPage } from "@/lib/deals";
import { slugifySet } from "@/lib/slugify";
import { setDisplayName } from "@/lib/pokemonSets";

// Growth batch 2026-09-20 - up to three CURRENT below-reference Buy It Now
// listings from the set a guide is about, rendered once per guide by
// GuideLayout (lib/guides guideOffersSet decides which guides qualify).
//
// Same data and the same card as the set page: fetchSetDealsPage with the
// "discount" sort keeps only listings with a SUPPORTED saving
// (savingsClaimTrusted inside), so nothing here can show a green badge
// the set page would not show. Renders nothing at all when the set has no
// such listing - never a placeholder, never a padded tile.
//
// Why: guides carry most of the site's organic clicks and produced zero
// affiliate clicks; readers of a set guide are the readers most likely to
// want that set's live offers, and the set page was one click away with no
// hint that offers existed.
const MAX_OFFERS = 3;

export default async function GuideLiveOffers({ setName }) {
  if (!setName) return null;
  const { deals } = await fetchSetDealsPage({ setName, language: "english", sort: "discount", listingType: "FIXED_PRICE", page: 1, pageSize: MAX_OFFERS });
  if (!deals?.length) return null;
  const slug = slugifySet(setName);
  const label = setDisplayName(setName);
  return (
    <section aria-labelledby="guide-live-offers" className="mt-10 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950" data-guide-live-offers>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Live now</p>
          <h2 id="guide-live-offers" className="mt-1 text-base font-semibold text-black dark:text-zinc-50">
            {label} listings below their market reference
          </h2>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Buy It Now listings on eBay, each checked against a recent-sold reference for the exact card and condition. Prices and availability change; the reference is shown beside each.
          </p>
        </div>
        <Link href={`/sets/${slug}`} className="text-sm font-semibold text-red-600 hover:underline dark:text-red-500">
          All {label} deals →
        </Link>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {deals.slice(0, MAX_OFFERS).map((deal) => (
          <DealCard key={deal.id} deal={deal} pageName="guide_offers" validSetSlugs={[slug]} from={`/sets/${slug}`} />
        ))}
      </div>
    </section>
  );
}
